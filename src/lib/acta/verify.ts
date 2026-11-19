import type { Acta, Acuerdo, Asistente, MeetingSummary, Person, Tema, TranscriptLine } from "../types.ts";
import {
  POR_DEFINIR, checkEvidence, dateSupported, kam, matchPerson, normalize, parseDMY, wordsMentioned,
} from "./validate.ts";

export const TIPOS = ["Acta de capacitación", "Acta de reunión", "Acta de seguimiento", "Acta de implementación", "Acta de kickoff"];

/** Lo que devuelve la IA (validado con zod en schema.ts). */
export type ActaDraft = {
  tipo: string; tema: string; cliente: string; objetivo: string;
  asistentesCliente: { nombre: string; rol?: string | null }[];
  asistentesGeoVictoria: { nombre: string; rol?: string | null }[];
  temas: { texto: string; evidencia: string }[];
  acuerdos: { compromiso: string; responsable: string; fecha?: string | null; evidencia: string }[];
  advertencias: string[];
};

/**
 * Verificación anti-alucinación. Se ejecuta SIEMPRE sobre la salida del modelo:
 *  - asistentes: solo personas de la reunión; roles solo si se mencionaron;
 *  - temas y acuerdos: la cita de respaldo debe existir en la transcripción;
 *  - responsables: persona de la reunión, área mencionada o la empresa; si no, "Por definir";
 *  - fechas: dichas explícitamente o resolubles desde un día dicho ("el martes"); si no, "Por definir".
 * Lo dudoso se marca para revisión humana (y no se puede enviar al CRM sin revisarlo).
 */
export function verifyDraft(
  draft: ActaDraft,
  m: MeetingSummary,
  lines: TranscriptLine[],
  meetingDmy: string,
  user: { name: string; email: string },
): Acta {
  const texts = lines.map((l) => l.text);
  const transcript = texts.join("\n");
  const hay = normalize(transcript + " " + m.title);
  const adv = draft.advertencias.map(String);
  const cliente = (draft.cliente || m.client || "Cliente").trim();

  // Personas reales: las de Samu + quienes hablan en la transcripción.
  const people: Person[] = m.people.map((p) => ({ ...p }));
  for (const s of new Set(lines.map((l) => l.speaker))) {
    if (!people.some((p) => normalize(p.name) === normalize(s))) people.push({ name: s, gv: null });
  }

  type Placed = Asistente & { ref: Person };
  const placed: { cliente: Placed[]; gv: Placed[] } = { cliente: [], gv: [] };
  const place = (a: { nombre: string; rol?: string | null }, side: "cliente" | "gv") => {
    const hit = matchPerson(a.nombre, people);
    if (!hit) { adv.push(`Se quitó a "${a.nombre}" de los asistentes porque no aparece en la reunión.`); return; }
    if ([...placed.cliente, ...placed.gv].some((x) => x.ref === hit)) return;
    let rol = kam(String(a.rol ?? "").trim());
    if (rol && !wordsMentioned(rol, hay) && !/^KAM\b/.test(rol)) { adv.push(`Se quitó el rol "${rol}" de ${a.nombre} porque no se mencionó en la reunión.`); rol = ""; }
    const real = hit.gv === true ? "gv" : hit.gv === false ? "cliente" : side;
    placed[real].push({ nombre: a.nombre.trim() || hit.name, rol, ref: hit });
  };
  draft.asistentesCliente.forEach((a) => place(a, "cliente"));
  draft.asistentesGeoVictoria.forEach((a) => place(a, "gv"));
  for (const p of m.people) {
    const ref = people.find((x) => x.name === p.name)!;
    if (![...placed.cliente, ...placed.gv].some((x) => x.ref === ref)) placed[p.gv ? "gv" : "cliente"].push({ nombre: p.name, rol: "", ref });
  }

  const temas: Tema[] = draft.temas.filter((t) => t.texto?.trim()).map((t) => ({
    texto: kam(t.texto.trim()), evidencia: t.evidencia, verificada: checkEvidence(t.evidencia, texts),
  }));

  const asistentes = [...placed.cliente, ...placed.gv];
  const acuerdos: Acuerdo[] = draft.acuerdos.filter((a) => a.compromiso?.trim()).map((a, i) => {
    const warn: string[] = [];
    if (!checkEvidence(a.evidencia, texts)) warn.push("La cita de respaldo no aparece en la transcripción.");

    let responsable = kam(String(a.responsable ?? POR_DEFINIR).replace(/^@/, "").trim()) || POR_DEFINIR;
    let responsableEmail: string | undefined;
    const rn = normalize(responsable);
    if (rn && rn !== normalize(POR_DEFINIR)) {
      const asis = matchPerson(responsable, asistentes.map((x) => ({ name: x.nombre, ref: x.ref })));
      const person = asis?.ref ?? matchPerson(responsable, people);
      const isOrg = rn.includes("geovictoria") || rn.includes(normalize(cliente)) || rn.includes("+") || (rn.length > 3 && hay.includes(rn));
      if (person) responsableEmail = person.email;
      else if (!isOrg) { warn.push(`"${responsable}" no aparece en la reunión; quedó como ${POR_DEFINIR}.`); responsable = POR_DEFINIR; }
    } else responsable = POR_DEFINIR;

    let fecha = String(a.fecha ?? POR_DEFINIR).trim() || POR_DEFINIR;
    if (parseDMY(fecha)) {
      if (!dateSupported(fecha, a.evidencia, transcript, meetingDmy)) { warn.push(`Se quitó la fecha ${fecha} porque no se mencionó en la reunión.`); fecha = POR_DEFINIR; }
    } else if (normalize(fecha) !== normalize(POR_DEFINIR) && !wordsMentioned(fecha, hay)) {
      warn.push(`Se quitó la fecha "${fecha}" porque no se mencionó en la reunión.`); fecha = POR_DEFINIR;
    }

    return {
      id: `A${i + 1}`, compromiso: kam(a.compromiso.trim()), responsable, responsableEmail, fecha: kam(fecha),
      evidencia: a.evidencia, verificada: warn.length === 0, advertencias: warn,
    };
  });

  const tipo = TIPOS.includes(draft.tipo) ? draft.tipo : "Acta de reunión";
  const tema = kam((draft.tema || m.title).trim());
  return {
    meetingId: m.id, link: m.link, tipo, cliente,
    titulo: `${tema} – ${cliente}`,
    pais: m.country,
    fecha: meetingDmy,
    objetivo: kam(draft.objetivo.trim()),
    asistentesCliente: placed.cliente.map(({ nombre, rol }) => ({ nombre, rol })),
    asistentesGV: placed.gv.map(({ nombre, rol }) => ({ nombre, rol })),
    temas,
    cierre: m.platformShort ? `El detalle completo de lo explicado queda condensado en la grabación de la sesión en ${m.platformShort}.` : "",
    acuerdos,
    generadoPor: { nombre: user.name, email: user.email },
    advertencias: adv,
  };
}

/** Aplica KAM (nunca CAM) a todo lo editable del acta. Se usa también antes de exportar lo que el usuario editó. */
export function applyTerms(a: Acta): Acta {
  return {
    ...a,
    titulo: kam(a.titulo), objetivo: kam(a.objetivo), cierre: kam(a.cierre),
    asistentesCliente: a.asistentesCliente.map((p) => ({ ...p, rol: kam(p.rol) })),
    asistentesGV: a.asistentesGV.map((p) => ({ ...p, rol: kam(p.rol) })),
    temas: a.temas.map((t) => ({ ...t, texto: kam(t.texto) })),
    acuerdos: a.acuerdos.map((t) => ({ ...t, compromiso: kam(t.compromiso), responsable: kam(t.responsable), fecha: kam(t.fecha) })),
  };
}
