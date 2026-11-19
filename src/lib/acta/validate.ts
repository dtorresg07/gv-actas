/**
 * Utilidades del verificador anti-alucinación (determinísticas, sin IA y sin dependencias,
 * para poder testearlas con `node --test`).
 */

export const POR_DEFINIR = "Por definir";
export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function normalize(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿La cita aparece en la transcripción? Exacta (normalizada) o con ≥85 % de sus palabras en orden dentro de un mismo turno. */
export function checkEvidence(evidence: string, lines: string[]): boolean {
  const ev = normalize(evidence);
  if (ev.length < 8) return false;
  const norm = lines.map(normalize);
  if (norm.some((l) => l.includes(ev))) return true;
  const toks = ev.split(" ");
  let best = 0;
  for (const line of norm) {
    let i = 0;
    for (const t of line.split(" ")) if (i < toks.length && t === toks[i]) i++;
    best = Math.max(best, i / toks.length);
  }
  return best >= 0.85;
}

export type NamedPerson = { name: string; email?: string };

/** Participante que corresponde a un nombre ("Daniela", "Daniela Torres", correo), o null si no existe o es ambiguo. */
export function matchPerson<T extends NamedPerson>(name: string, people: T[]): T | null {
  const r = normalize(String(name).replace(/^@/, ""));
  if (!r) return null;
  const exact = people.find((p) => normalize(p.name) === r || (p.email && normalize(p.email) === r));
  if (exact) return exact;
  const rt = r.split(" ");
  const contains = people.filter((p) => { const pt = normalize(p.name).split(" "); return rt.every((t) => pt.includes(t)); });
  if (contains.length === 1) return contains[0];
  const within = people.filter((p) => { const pt = normalize(p.name).split(" "); return pt.every((t) => rt.includes(t)); });
  return within.length === 1 ? within[0] : null;
}

export function parseDMY(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  return d.getUTCDate() === +m[1] ? d : null;
}

export function longDate(dmy: string): string {
  const d = parseDMY(dmy);
  return d ? `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}` : dmy;
}

/**
 * Una fecha de acuerdo es válida si se dijo explícitamente ("20 de noviembre", "20/11", "el 20"),
 * o si se dijo el día de la semana / "mañana" / "la próxima semana" y cae poco después de la reunión.
 */
export function dateSupported(dmy: string, evidence: string, transcript: string, meetingDmy: string): boolean {
  const d = parseDMY(dmy), base = parseDMY(meetingDmy);
  if (!d) return false;
  const dd = d.getUTCDate(), mm = d.getUTCMonth() + 1;
  const t = normalize(transcript), e = normalize(evidence);
  const mes = MESES[mm - 1];
  const explicit = [
    new RegExp(`\\b0?${dd} de ${mes}\\b`), new RegExp(`\\b0?${dd} ${mes}\\b`),
    new RegExp(`\\b0?${dd} 0?${mm}\\b`), new RegExp(`\\bel 0?${dd}\\b`),
  ];
  if (explicit.some((re) => re.test(t))) return true;
  if (!base) return false;
  const diff = Math.round((d.getTime() - base.getTime()) / 86_400_000);
  const said = (w: string) => new RegExp(`\\b${w}\\b`).test(e) || new RegExp(`\\b${w}\\b`).test(t);
  if (diff >= 0 && diff <= 14 && said(normalize(DIAS[d.getUTCDay()]))) return true;
  if (diff === 1 && said("manana")) return true;
  if (diff >= 1 && diff <= 14 && (said("proxima semana") || said("semana que viene") || said("esta semana"))) return true;
  return false;
}

/** Un rol o condición se acepta si alguna de sus palabras significativas aparece en la reunión. */
export function wordsMentioned(text: string, haystackNormalized: string): boolean {
  const ws = normalize(text).split(" ").filter((w) => w.length > 3);
  return ws.length === 0 || ws.some((w) => haystackNormalized.includes(w));
}

/** Terminología GeoVictoria: el rol es KAM, nunca CAM. No se aplica a las citas textuales. */
export function kam(text: string): string {
  return String(text ?? "").replace(/\bC\.?A\.?M\b\.?/g, (m) => (m.endsWith(".") && m.length > 3 ? "KAM." : "KAM")).replace(/\bcam\b(?= de la cuenta)/gi, "KAM");
}
