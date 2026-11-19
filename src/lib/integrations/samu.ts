import { config, emailVariants, isAllowedEmail } from "../config";
import type { MeetingSummary, Person, TranscriptLine } from "../types";
import { mockMeetings, mockTranscript } from "./samu.mock";
import { SamuNotConnected, mcpUrl, readConnection, samuSession } from "../samu/connection";
import { McpRateLimited } from "../samu/mcp";

/**
 * Cliente de la API REST de Samu.ai (plan Enterprise).
 *
 * Autenticación: encabezado `apiKey` con la clave de la cuenta de GeoVictoria.
 * Como la clave ve todas las reuniones de la empresa, ESTE servidor filtra por el correo
 * del usuario que inició sesión: cada persona solo ve reuniones donde participó.
 *
 * ⚠️ Rutas: la documentación está en https://api.samu.ai/docs. Las rutas y parámetros por defecto
 * siguen la forma de los datos de Samu (meetingId, speakers, participantEmails, transcripción en
 * bloques "[HH:MM:SS] nombre: texto"). Si la API usa otros nombres, se ajustan con SAMU_PATH_* y
 * SAMU_PARAM_* sin tocar el código.
 */
const PATH_MEETINGS = process.env.SAMU_PATH_MEETINGS ?? "/v1/meetings";
const PATH_TRANSCRIPT = process.env.SAMU_PATH_TRANSCRIPT ?? "/v1/meetings/{id}/transcription";
const PARAM_EMAIL = process.env.SAMU_PARAM_EMAIL ?? "attendeeEmails";
const PARAM_FROM = process.env.SAMU_PARAM_FROM ?? "from";
const PARAM_TO = process.env.SAMU_PARAM_TO ?? "to";
const PARAM_LIMIT = process.env.SAMU_PARAM_LIMIT ?? "limit";
const PARAM_OFFSET = process.env.SAMU_PARAM_OFFSET ?? "offset";

const MEETING_ID = /^[a-f0-9]{24}$/;

/**
 * De dónde salen las reuniones:
 *  - "user": cada persona conecta su propia cuenta de Samu (SAMU_MCP_URL). Recomendado.
 *  - "company": una clave de API de la empresa (SAMU_API_KEY) y filtro por correo en el servidor.
 *  - "mock": reuniones de ejemplo (SAMU_MOCK=true o sin configuración).
 */
export function samuMode(): "user" | "company" | "mock" {
  if (process.env.SAMU_MOCK === "true") return "mock";
  if (mcpUrl()) return "user";
  return process.env.SAMU_API_KEY ? "company" : "mock";
}

export class SamuError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function samuFetch<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const url = new URL(path, config.samu.baseUrl);
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, item);
  }
  const res = await fetch(url, {
    headers: { apiKey: config.samu.apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new SamuError(res.status, `Samu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/* ---------- Normalización ---------- */

type RawSpeaker = { name?: string; type?: string; email?: string };
type RawMeeting = {
  meetingId?: string; id?: string; _id?: string;
  name?: string; title?: string;
  date?: string; startTime?: string;
  duration?: number; host?: string | { name?: string }; callType?: string | { name?: string };
  platform?: string; link?: string;
  participantEmails?: string[]; attendees?: { email?: string; name?: string }[];
  speakers?: RawSpeaker[];
  summary?: string;
  tasks?: { description?: string; status?: string; dueAt?: string }[];
};

const COUNTRY: Record<string, string> = {
  co: "Colombia", cl: "Chile", pe: "Perú", mx: "México", ec: "Ecuador", gt: "Guatemala", ar: "Argentina", cr: "Costa Rica",
  pa: "Panamá", uy: "Uruguay", bo: "Bolivia", py: "Paraguay", do: "República Dominicana", sv: "El Salvador", hn: "Honduras", es: "España",
};

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function companyFromDomain(domain: string): string {
  const base = domain.split(".")[0] || domain;
  return base.length <= 4 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1);
}

function platformShort(p?: string): string {
  const s = (p ?? "").toLowerCase();
  return s.includes("teams") ? "Teams" : s.includes("meet") ? "Google Meet" : s.includes("zoom") ? "Zoom" : "";
}

/** Asocia un correo a cada persona cuando el correo contiene un nombre o apellido suyo (y solo uno coincide). */
function linkEmails(people: Person[], emails: string[]): void {
  for (const p of people) {
    if (p.email) continue;
    const toks = plain(p.name).split(/\s+/).filter((t) => t.length >= 4);
    const hits = emails.filter((e) => toks.some((t) => plain(e.split("@")[0]).includes(t)));
    if (hits.length === 1) p.email = hits[0];
  }
}

export function normalizeMeeting(m: RawMeeting): MeetingSummary {
  const emails = [
    ...(m.participantEmails ?? []),
    ...(m.attendees ?? []).map((a) => a.email ?? ""),
  ].map((e) => e.toLowerCase()).filter(Boolean);
  const external = emails.filter((e) => !isAllowedEmail(e));
  const domains = [...new Set(external.map((e) => e.split("@")[1]))];
  const host = typeof m.host === "string" ? m.host : m.host?.name;

  const people: Person[] = (m.speakers ?? [])
    .map((s) => ({ name: (s.name ?? "").trim(), email: s.email?.toLowerCase(), gv: s.type === "USER" ? true : s.type === "STAKEHOLDER" ? false : null }))
    .filter((p) => p.name);
  if (host && !people.some((p) => p.name === host)) people.unshift({ name: host, gv: true });
  linkEmails(people, emails);

  const tld = domains.map((d) => d.split(".").pop() ?? "").find((t) => COUNTRY[t]);
  return {
    id: m.meetingId ?? m.id ?? m._id ?? "",
    title: (m.name ?? m.title ?? "Reunión sin título").trim(),
    date: m.date ?? m.startTime ?? new Date(0).toISOString(),
    durationMin: m.duration ? Math.round(m.duration) : null,
    host,
    callType: typeof m.callType === "string" ? m.callType : m.callType?.name,
    link: m.link ?? (m.meetingId ? `https://dashboard.samu.ai/meetings/${m.meetingId}` : undefined),
    emails,
    people,
    client: domains.map(companyFromDomain).join(" · "),
    internal: domains.length === 0,
    country: tld ? COUNTRY[tld] : "",
    platformShort: platformShort(m.platform),
    samuSummary: typeof m.summary === "string" ? m.summary : undefined,
    samuTasks: (m.tasks ?? []).filter((t) => t.description).map((t) => ({ description: t.description!, status: t.status, dueAt: t.dueAt })),
  };
}

/* ---------- Reuniones ---------- */

const PAGE = 10;   // Samu devuelve resúmenes largos: páginas chicas
const MAX = 40;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; meetings: MeetingSummary[] }>();

/** Reuniones recientes donde participó el usuario (como anfitrión, invitado o asistente). */
export async function listMeetings(userEmail: string, userName?: string): Promise<MeetingSummary[]> {
  const mode = samuMode();
  if (mode === "mock") return mockMeetings(userEmail, userName);
  const variants = emailVariants(userEmail);
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() - config.samu.recentDays * 86_400_000).toISOString().slice(0, 10);

  // Sin conexión vigente no se usa la memoria (por ejemplo, justo después de desconectar).
  if (mode === "user" && !readConnection(userEmail)) { cache.delete(userEmail); throw new SamuNotConnected(); }
  const cached = cache.get(userEmail);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.meetings;

  const session = mode === "user" ? await samuSession(userEmail) : null;
  const found: MeetingSummary[] = [];
  // Samu puede devolver menos reuniones que las pedidas cuando los resúmenes son largos ("truncated"):
  // se avanza según lo que realmente llegó y se sigue hasta cubrir el total.
  let offset = 0;
  for (let call = 0; call < 20 && found.length < MAX; call++) {
    type Page = { meetings?: RawMeeting[]; data?: RawMeeting[]; total?: number };
    let data: Page;
    try {
      data = session
        ? await session.call<Page>("search_meetings", { attendeeEmails: variants, dateRange: { from, to }, limit: PAGE, offset })
        : await samuFetch<Page>(PATH_MEETINGS, {
            [PARAM_EMAIL]: variants, [PARAM_FROM]: from, [PARAM_TO]: to, [PARAM_LIMIT]: String(PAGE), [PARAM_OFFSET]: String(offset),
          });
    } catch (e) {
      // Si Samu pide esperar a mitad de camino, se muestran las reuniones ya leídas.
      if (e instanceof McpRateLimited && found.length) break;
      throw e;
    }
    const raw = data.meetings ?? data.data ?? [];
    for (const m of raw.map(normalizeMeeting).filter((x) => MEETING_ID.test(x.id))) {
      if (!found.some((f) => f.id === m.id)) found.push(m);
    }
    offset += raw.length;
    if (raw.length === 0 || (data.total !== undefined && offset >= data.total)) break;
  }
  // Con la cuenta propia, Samu ya limita lo que la persona puede ver.
  if (mode === "user") { cache.set(userEmail, { at: Date.now(), meetings: found }); return found; }
  // Con la clave de la empresa, defensa adicional: solo reuniones donde figura su correo o es anfitrión.
  return found.filter((m) => m.emails.some((e) => variants.includes(e)) || (userName && m.host === userName));
}

export async function getMeeting(userEmail: string, id: string, userName?: string): Promise<MeetingSummary> {
  if (!MEETING_ID.test(id)) throw new SamuError(400, "Id de reunión inválido");
  const m = (await listMeetings(userEmail, userName)).find((x) => x.id === id);
  if (!m) throw new SamuError(404, "Reunión no encontrada o sin acceso");
  return m;
}

/* ---------- Transcripción ---------- */

const LINE_RE = /^\[(\d{2}:\d{2}:\d{2})\]\s*([^:]{1,80}):\s*(.*)$/;
const FILLERS = /\b(eh+|em+|mmm+|ehm+)\b[,.]?/gi;

/** Une las líneas consecutivas del mismo hablante (Samu corta las frases cuando hay interrupciones) y quita muletillas. */
export function parseTranscript(raw: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of raw.split("\n")) {
    const m = LINE_RE.exec(line.trim());
    if (!m) { if (out.length && line.trim()) out[out.length - 1].text += " " + line.trim(); continue; }
    const text = m[3].replace(FILLERS, "").replace(/\s{2,}/g, " ").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === m[2].trim()) last.text += " " + text;
    else out.push({ t: m[1], speaker: m[2].trim(), text });
  }
  return out;
}

type RawTranscript = {
  chunks?: (string | { t?: string; speaker?: string; text?: string })[];
  transcripts?: { chunks?: string[]; hasMore?: boolean; nextCursor?: string }[];
  hasMore?: boolean; nextCursor?: string; text?: string;
};

/** Transcripción completa, recorriendo el cursor hasta que no queden bloques. */
export async function getTranscript(id: string, userName?: string, userEmail?: string): Promise<TranscriptLine[]> {
  if (!MEETING_ID.test(id)) throw new SamuError(400, "Id de reunión inválido");
  const mode = samuMode();
  if (mode === "mock") return parseTranscript(mockTranscript(userName));

  const session = mode === "user" ? await samuSession(userEmail ?? "") : null;
  const parts: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const data = mode === "user"
      ? await session!.call<RawTranscript>("get_transcript", cursor ? { meetingIds: [id], cursor } : { meetingIds: [id] })
      : await samuFetch<RawTranscript>(PATH_TRANSCRIPT.replace("{id}", id), cursor ? { cursor } : {});
    const t = data.transcripts?.[0] ?? data;
    if (data.text) parts.push(data.text);
    for (const c of t.chunks ?? []) {
      parts.push(typeof c === "string" ? c : `[${c.t ?? "00:00:00"}] ${c.speaker ?? "Sin nombre"}: ${c.text ?? ""}`);
    }
    const next = t.nextCursor ?? data.nextCursor;
    if (!(t.hasMore ?? data.hasMore) || !next) break;
    cursor = next;
  }
  return parseTranscript(parts.join("\n"));
}
