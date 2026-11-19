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
  const objetivo = clip(firstSentence(objSec?.body ?? (secs.length ? "" : summary)), 360);

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

  // Temas
  const contentSec = find(secs, ["conversation_content"], ["contenido"]);
  let temas = (contentSec ? labeledItems(contentSec.body) : []).map((it) => cap(clip(it.label, 70)));
  if (!temas.length) {
    const alt = find(secs, ["use_cases", "advancements_and_commitments"], ["casos de uso", "avances"]);
    temas = (alt ? bullets(alt.body) : []).map((b) => cap(clip(firstSentence(b), 70)));
  }
  if (!temas.length && summary) {
    temas = summary.replace(/\*\*/g, "").split(/(?<=[.!?])\s+/).filter((s) => s.length > 20).slice(0, 4).map((s) => clip(s, 90));
  }

  // Acuerdos
  const actSec = find(secs, ["agreed_actions"], ["acciones acordadas"]) ?? find(secs, ["next_steps"], ["proximos pasos"]);
  let acuerdos = (actSec ? labeledItems(actSec.body) : []).map((it) => {
    const compromiso = cap(clip(firstSentence(it.text.replace(/\s*Sin fecha acordada\.?|\s*No se fijó fecha[^.]*\.?/gi, "")).split(";")[0], 120));
    return { compromiso, responsable: normalizeResponsible(it.label, cliente, people), fecha: dueFor(compromiso, m.samuTasks) ?? "Por definir", evidencia: it.text };
  });
  if (!acuerdos.length) {
    acuerdos = (m.samuTasks ?? []).map((t) => ({
      compromiso: cap(clip(t.description, 120)), responsable: "Por definir", fecha: dmyFromIso(t.dueAt) ?? "Por definir", evidencia: t.description,
    }));
  }

  return {
    tipo: tipoFrom(m.callType, m.title),
    tema,
    cliente,
    objetivo,
    asistentesCliente: asisCliente,
    asistentesGeoVictoria: asisGV,
    temas: temas.slice(0, 8).map((texto) => ({ texto, evidencia: "Resumen de Samu.ai" })),
    acuerdos,
    advertencias: [
      summary
        ? "Acta armada con el resumen que Samu.ai generó de la reunión. Revísala antes de enviarla al cliente."
        : "Samu.ai no tiene resumen de esta reunión todavía. Completa el acta a mano o inténtalo más tarde.",
    ],
  };
}
