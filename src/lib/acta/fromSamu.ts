import type { MeetingSummary } from "../types.ts";
import type { ActaDraft } from "./verify.ts";
import { matchPerson, normalize } from "./validate.ts";

/**
 * Arma el borrador del acta con el resumen que Samu ya generó para la reunión, sin usar IA propia.
 *
 * Samu escribe el resumen en secciones con títulos en negrita, por ejemplo:
 *   **Participantes y roles (participants_and_roles)**   - **Felipe:** representante de GeoVictoria; …
 *   **Objetivo declarado de la reunión (objective)**     párrafo
 *   **Contenido de la conversación (conversation_content)**   1. **Marcaje web:** …
 *   **Acciones acordadas (agreed_actions)**              - **Felipe:** canalizar con Soporte …
 * y entrega aparte sus tareas con fecha (tasks[].dueAt). Si una sección no está, se usa la siguiente mejor fuente.
 */

type Section = { key: string; title: string; body: string };

export function splitSections(summary: string): Section[] {
  const out: Section[] = [];
  const re = /^\s*\*\*([^*\n]+?)\*\*\s*$/gm;
  const marks: { title: string; key: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary))) {
    const title = m[1].trim();
    const key = (/\(([a-z_]+)\)\s*$/.exec(title)?.[1] ?? normalize(title)).toLowerCase();
    marks.push({ title, key, start: m.index, end: m.index + m[0].length });
  }
  marks.forEach((mk, i) => out.push({ key: mk.key, title: mk.title, body: summary.slice(mk.end, marks[i + 1]?.start ?? summary.length).trim() }));
  return out;
}

const find = (secs: Section[], keys: string[], words: string[]) =>
  secs.find((s) => keys.includes(s.key)) ?? secs.find((s) => words.some((w) => normalize(s.title).includes(w)));

/** "- **Nombre:** texto" o "1. **Nombre:** texto" → [{label, text}] */
function labeledItems(body: string): { label: string; text: string }[] {
  const items: { label: string; text: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
    if (m) items.push({ label: m[1].replace(/:$/, "").trim(), text: m[2].trim() });
  }
  return items;
}

function bullets(body: string): string[] {
  return body.split("\n").map((l) => /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l)?.[1]?.replace(/\*\*/g, "").trim() ?? "").filter(Boolean);
}

const firstSentence = (t: string) => (/^(.+?[.!?])(\s|$)/.exec(t.trim())?.[1] ?? t.trim());

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t.replace(/[.;:,]\s*$/, "");
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : max).replace(/[,;:]$/, "");
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Rol corto: lo que va antes del primer ";" o ".", sin muletillas como "representante del cliente". */
function shortRole(text: string): string {
  let r = text.split(/[;.,]/)[0].trim();
  r = r.replace(/^(es |fue |actúa como |participa como )/i, "");
  return cap(clip(r, 60));
}

const NOT_PRESENT = /no consta|mencionad[oa]|no se confirma|no se esperaba|no particip/i;

function tipoFrom(callType = "", title = ""): string {
  const t = normalize(`${callType} ${title}`);
  if (/capacitacion|masterclass|relatoria|entrenamiento|formacion/.test(t)) return "Acta de capacitación";
  if (/kick ?off|kickoff|inicio de proyecto/.test(t)) return "Acta de kickoff";
  if (/implementacion|implentacion|puesta en marcha/.test(t)) return "Acta de implementación";
  if (/seguimiento|revision|follow/.test(t)) return "Acta de seguimiento";
  return "Acta de reunión";
}

const titleCase = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : t);

/** Separa el título de Samu en tema y cliente: "CRUZ VERDE I Cierre implementación" / "Capacitación X - Bacoo Foods". */
function splitTitle(title: string, fallbackClient: string): { tema: string; cliente: string } {
  const parts = title.split(/\s+(?:[-–|I])\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.replace(/\bgeo\s*victoria\b/gi, "").replace(/\s{2,}/g, " ").trim()).filter(Boolean);
  if (parts.length >= 2) {
    // El cliente es la parte que no habla de la reunión (capacitación, seguimiento, cierre…); ante empate, la última.
    const MEETING = /capacitaci|seguimiento|reuni|kick|implement|implent|cierre|revisi|demo|onboarding|planificaci|presentaci|soporte|alternativa|marcaci|configuraci/i;
    const candidates = parts.filter((p) => !MEETING.test(p) && p.split(" ").length <= 4);
    const cliente = candidates[candidates.length - 1];
    if (cliente) return { tema: clip(parts.filter((p) => p !== cliente).join(" – "), 60), cliente: titleCase(cliente) };
  }
  return { tema: clip(parts[0] ?? title, 60), cliente: fallbackClient };
}

function dmyFromIso(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Fecha de una tarea de Samu que se parezca al compromiso (comparten ≥2 palabras significativas). */
function dueFor(compromiso: string, tasks: MeetingSummary["samuTasks"] = []): string | null {
  const words = new Set(normalize(compromiso).split(" ").filter((w) => w.length > 4));
  let best: { score: number; due: string | null } = { score: 1, due: null };
  for (const t of tasks) {
    const score = normalize(t.description).split(" ").filter((w) => words.has(w)).length;
    if (score > best.score) best = { score, due: dmyFromIso(t.dueAt) };
  }
  return best.due;
}

/** "Felipe / Soporte" → "Felipe"; "Cliente" → nombre del cliente; "Daniela/Geovictoria" → "Daniela". */
function normalizeResponsible(label: string, cliente: string, people: { name: string }[]): string {
  const parts = label.split(/\s*[/,]\s*|\s+y\s+/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const hit = matchPerson(p, people);
    if (hit) return p.split(" ")[0] === hit.name.split(" ")[0] ? p : hit.name;
  }
  if (parts.some((p) => /^(el |equipo )?cliente$/i.test(p) || /cliente/i.test(p))) return cliente;
  if (parts.some((p) => /geo\s*victoria|proveedor/i.test(p))) return "GeoVictoria";
  return parts[0] ?? "Por definir";
}

export function draftFromSamu(m: MeetingSummary): ActaDraft {
  const summary = m.samuSummary ?? "";
  const secs = splitSections(summary);
  let { tema, cliente } = splitTitle(m.title, m.client || "Cliente");
  const shortTitle = !/\s(?:[-–|I])\s|\|/.test(m.title) && m.title.trim().split(/\s+/).length <= 3;
  if (shortTitle) {
    cliente = titleCase(m.title.trim());
    const tipoSec = find(secs, ["meeting_type"], ["tipo de reunion"]);
    const contenido = find(secs, ["conversation_content"], ["contenido"]);
    tema = tipoSec?.body ? cap(clip(tipoSec.body.split(/[,.;]/)[0], 60)) : contenido ? cap(clip(labeledItems(contenido.body)[0]?.label ?? m.title, 60)) : m.title;
  }
  const people = m.people;

  // Objetivo
  const objSec = find(secs, ["objective"], ["objetivo"]);
  let objetivo = clip(firstSentence(objSec?.body ?? (secs.length ? "" : summary)), 360);
  // Objetivo largo con lista ("Alinear…: a, b, c y d") → solo la idea principal.
  if (objetivo.split(" ").length > 30 && objetivo.indexOf(": ") > 20) objetivo = objetivo.slice(0, objetivo.indexOf(": "));

  // Asistentes
  const asisCliente: { nombre: string; rol: string }[] = [];
  const asisGV: { nombre: string; rol: string }[] = [];
  const partSec = find(secs, ["participants_and_roles"], ["participantes"]);
  for (const it of partSec ? labeledItems(partSec.body) : []) {
    if (NOT_PRESENT.test(it.text)) continue;
    const name = it.label.replace(/\s*\(.*?\)\s*/g, " ").split("/")[0].trim();
    const hit = matchPerson(name, people);
    if (!hit) continue;
    const isGV = hit.gv ?? /geo\s*victoria|proveedor/i.test(it.text);
    (isGV ? asisGV : asisCliente).push({ nombre: hit.name, rol: shortRole(it.text) });
  }

  // Temas tratados: "Tema: resumen breve de lo conversado"
  const contentSec = find(secs, ["conversation_content"], ["contenido"]);
  let temas = (contentSec ? labeledItems(contentSec.body) : []).map((it) => {
    const label = cap(clip(it.label, 60));
    const resumen = summarizeText(it.text, 200);
    return resumen ? `${label}: ${resumen}` : label;
  });
  if (!temas.length) {
    const alt = find(secs, ["use_cases"], ["casos de uso"]);
    temas = (alt ? bullets(alt.body) : []).map((b) => cap(clip(firstSentence(b), 160)));
  }
  if (!temas.length && summary) {
    temas = summary.replace(/\*\*/g, "").split(/(?<=[.!?])\s+/).filter((x) => x.length > 20).slice(0, 4).map((x) => clip(x, 180));
  }

  // Acuerdos (lo que se decidió o quedó resuelto en la reunión)
  const advSec = find(secs, ["advancements_and_commitments"], ["avances"]);
  const decisiones = (advSec ? bullets(advSec.body) : [])
    .map((b) => cap(clip(firstSentence(b.replace(/^[^:]{1,40}:\s*/, "")), 180)))
    .filter((b) => b.length > 15)
    .slice(0, 6);
  // Sin sección de avances: frases del resumen que dicen qué se decidió o quedó resuelto.
  if (!decisiones.length) {
    const skip = new Set(["agreed_actions", "next_steps", "participants_and_roles", "objective"]);
    for (const sec of secs.filter((x) => !skip.has(x.key))) {
      for (const sentence of sec.body.replace(/\*\*[^*]{1,60}:\*\*/g, "").replace(/\*\*/g, "").replace(/^\s*(?:\d+\.|-)\s*/gm, "").split(/(?<=[.!?])\s+|\n+/)) {
        const x = sentence.trim();
        if (x.length > 20 && DECISION.test(x) && !decisiones.some((d) => overlap(d, x) >= 3)) decisiones.push(cap(clip(x, 180)).replace(/[.;:,]\s*$/, ""));
      }
    }
    decisiones.splice(6);
  }

  // Compromisos (quién hace qué y para cuándo)
  const actSec = find(secs, ["agreed_actions"], ["acciones acordadas"]) ?? find(secs, ["next_steps"], ["proximos pasos"]);
  const nextSec = find(secs, ["next_steps"], ["proximos pasos"]);
  const host = m.host ? m.host.split(" ")[0] : "Por definir";
  // Una fila por acción: "consultar X y preparar Y" son dos compromisos.
  const acuerdos = (actSec ? labeledItems(actSec.body) : []).flatMap((it) =>
    splitCommitment(cleanCommitment(it.text)).map((compromiso) => ({
      compromiso,
      responsable: normalizeResponsible(it.label, cliente, people),
      fecha: dueFor(compromiso, m.samuTasks) ?? dueFor(it.text, m.samuTasks) ?? dateNear(compromiso, nextSec?.body) ?? "Por definir",
      evidencia: it.text,
    })));
  // Tareas que Samu detectó y que no quedaron en las acciones acordadas (son de quien dirigió la reunión).
  for (const t of m.samuTasks ?? []) {
    if (acuerdos.some((a) => overlap(a.compromiso, t.description) >= 2 || overlap(a.evidencia, t.description) >= 2)) continue;
    acuerdos.push({ compromiso: shorten(cleanCommitment(t.description)), responsable: host, fecha: dmyFromIso(t.dueAt) ?? "Por definir", evidencia: t.description });
  }

  return {
    tipo: tipoFrom(m.callType, m.title),
    tema,
    cliente,
    objetivo,
    asistentesCliente: asisCliente,
    asistentesGeoVictoria: asisGV,
    temas: temas.slice(0, 8).map((texto) => ({ texto, evidencia: "Resumen de Samu.ai" })),
    decisiones: decisiones.map((texto) => ({ texto, evidencia: "Resumen de Samu.ai" })),
    acuerdos,
    advertencias: [
      summary
        ? "Acta armada con el resumen que Samu.ai generó de la reunión. Revísala antes de enviarla al cliente."
        : "Samu.ai no tiene resumen de esta reunión todavía. Completa el acta a mano o inténtalo más tarde.",
    ],
  };
}

/** Resumen breve de un párrafo: la primera oración y, si cabe, la que dice qué quedó hecho o resuelto. */
function summarizeText(text: string, max: number): string {
  const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) return "";
  let out = sentences[0];
  const outcome = sentences.slice(1).find((x) => /se dej[oó]|qued[oó]|se habilit|se acord|se confirm|se defini|se resolvi|se aclar/i.test(x));
  if (outcome && (out + " " + outcome).length <= max) out += " " + outcome;
  return clip(out, max).replace(/[.;:,]\s*$/, "");
}

/** Compromiso claro: una acción completa, sin notas sobre fechas que no se fijaron. */
function cleanCommitment(text: string): string {
  const t = text
    .replace(/\s*(Sin fecha acordada|No se fij[oó] (una )?fecha[^.]*|No se indic[oó] un plazo[^.]*)\.?/gi, "")
    .replace(/\*\*/g, "");
  const first = firstSentence(t).split(/;\s+/)[0];
  return cap(clip(first, 400));
}

const DECISION = /\b(se acord[oó]|se decidi[oó]|se defini[oó]|se aprob[oó]|se confirm[oó]|se habilit[oó]|se resolvi[oó]|qued[oó] (habilitad|resuelt|configurad|definid|acordad|aprobad)\w*)/i;
const NOT_VERB = new Set(["lugar", "hogar", "collar", "pilar", "altar", "familiar", "similar", "particular", "regular", "titular", "auxiliar", "militar", "popular", "celular", "modular", "estelar", "mujer", "placer", "poder", "deber", "taller", "porvenir"]);

/** Separa "hacer X y preparar Y" en dos acciones (cuando tras la "y" viene otro verbo en infinitivo). */
function splitCommitment(text: string): string[] {
  const parts = text.split(/\s+y\s+(?=([a-záéíóúñ]{4,}(?:ar|er|ir))(?:\s|$))/i).filter((p, i) => i % 2 === 0);
  const out: string[] = [];
  for (const p of parts) {
    const w = /^[a-záéíóúñ]+/i.exec(p)?.[0].toLowerCase() ?? "";
    if (out.length && (NOT_VERB.has(w) || !/(ar|er|ir)$/.test(w))) out[out.length - 1] += " y " + p;
    else out.push(p);
  }
  return out.map((p) => shorten(cap(p.trim().replace(/[.;:,]\s*$/, ""))));
}

/** Máximo ~18 palabras: corta en la primera pausa natural después de la octava palabra. */
function shorten(text: string): string {
  const words = text.split(/\s+/);
  if (words.length <= 18) return text;
  const head = words.slice(0, 8).join(" ").length;
  const rest = text.slice(head);
  const m = /,\s|\s(y|para que|ya que|con el fin|incluyendo|además)\s/.exec(rest);
  if (m && head + m.index <= 150) return text.slice(0, head + m.index).trim();
  return clip(text, 140);
}

function overlap(a: string, b: string): number {
  const words = new Set(normalize(a).split(" ").filter((w) => w.length > 4));
  return normalize(b).split(" ").filter((w) => words.has(w)).length;
}

const MES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/** Fecha explícita ("20 de noviembre") en el próximo paso que se parece al compromiso. */
function dateNear(compromiso: string, body?: string): string | null {
  if (!body) return null;
  const step = bullets(body).find((b) => overlap(compromiso, b) >= 2);
  const m = step && /(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?/i.exec(step);
  if (!m) return null;
  const y = m[3] ?? String(new Date().getFullYear());
  return `${m[1].padStart(2, "0")}/${String(MES[m[2].toLowerCase()]).padStart(2, "0")}/${y}`;
}
