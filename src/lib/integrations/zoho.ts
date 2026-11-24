import { config, emailVariants, isAllowedEmail } from "../config";
import type { Acta, Acuerdo } from "../types";
import { POR_DEFINIR, longDate, parseDMY } from "../acta/validate";

/**
 * Compromisos del acta → Zoho CRM, módulo "CSS Tareas" (Tareas_Customer_Success).
 *
 * Reglas de asignación:
 *  - Responsable de GeoVictoria con usuario activo en Zoho → Owner = ese usuario.
 *  - Responsable del cliente o "Por definir" → Owner = quien generó el acta
 *    (es quien hace el seguimiento); el responsable real queda en la descripción.
 *  - Fecha Comprometida solo si la reunión fijó una fecha explícita. Nunca se inventa.
 */

const API_VERSION = process.env.ZOHO_API_VERSION ?? "v8";

/** Contrato estable de la matriz (lo que consume cualquier CRM). */
export type CrmTask = {
  externalId: string; // `${meetingId}:${taskId}` para trazabilidad / deduplicación
  subject: string;
  description: string;
  status: "Not Started";
  dueDate?: string; // YYYY-MM-DD
  ownerEmail: string;
  responsableNombre: string;
  responsableEsCliente: boolean;
  accountName: string;
};

export function toCrmTasks(acta: Acta, tasks: Acuerdo[] = acta.acuerdos): CrmTask[] {
  return tasks.map((t) => {
    const internal = !!t.responsableEmail && isAllowedEmail(t.responsableEmail);
    const d = parseDMY(t.fecha);
    return {
      externalId: `${acta.meetingId}:${t.id}`,
      subject: t.compromiso.slice(0, 255),
      description: [
        `${acta.tipo}: ${acta.titulo} (${longDate(acta.fecha)}).`,
        `Responsable acordado: ${t.responsable}${t.responsableEmail ? ` <${t.responsableEmail}>` : ""}.`,
        !d && t.fecha && t.fecha !== POR_DEFINIR ? `Plazo: ${t.fecha}` : "",
        `Respaldo en la reunión: "${t.evidencia}"`,
        acta.link ? `Reunión en Samu.ai: ${acta.link}` : "",
        `Ref: GV-ACTA ${acta.meetingId}:${t.id}`,
      ].filter(Boolean).join("\n"),
      status: "Not Started",
      dueDate: d ? d.toISOString().slice(0, 10) : undefined,
      ownerEmail: internal ? t.responsableEmail! : acta.generadoPor.email,
      responsableNombre: t.responsable,
      responsableEsCliente: !internal,
      accountName: acta.cliente,
    };
  });
}

// ---------- Cliente HTTP ----------

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    refresh_token: config.zoho.refreshToken,
    client_id: config.zoho.clientId,
    client_secret: config.zoho.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${config.zoho.accountsUrl}/oauth/v2/token`, { method: "POST", body });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error(`Zoho OAuth: ${data.error ?? res.status}`);
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

/** Acceso a Zoho: el de la persona (su propia cuenta) o el token del equipo. */
export type ZohoAuth = { token: string; apiDomain: string };
export async function teamAuth(): Promise<ZohoAuth> {
  return { token: await accessToken(), apiDomain: config.zoho.apiDomain };
}

async function zoho<T>(auth: ZohoAuth, pathname: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`${auth.apiDomain}/crm/${API_VERSION}${pathname}`, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${auth.token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function findUserId(auth: ZohoAuth, email: string): Promise<string | undefined> {
  const data = await zoho<{ users?: { id: string; email: string }[] }>(auth, `/users?type=ActiveUsers&per_page=200`);
  const variants = emailVariants(email);
  return data?.users?.find((u) => variants.includes(u.email.toLowerCase()))?.id;
}

/** Módulo destino: "CSS Tareas" (API Tareas_Customer_Success). Configurable con ZOHO_TASKS_MODULE. */
export const TASKS_MODULE = process.env.ZOHO_TASKS_MODULE ?? "Tareas_Customer_Success";

async function findAccountId(auth: ZohoAuth, name: string): Promise<string | undefined> {
  const clean = name.replace(/[(),\\]/g, " ").trim();
  if (!clean) return undefined;
  for (const op of ["equals", "starts_with"]) {
    const criteria = encodeURIComponent(`(Account_Name:${op}:${clean})`);
    const data = await zoho<{ data?: { id: string }[] }>(auth, `/Accounts/search?criteria=${criteria}`).catch(() => null);
    if (data?.data?.length) return data.data[0].id;
  }
  return undefined;
}

/** Valores permitidos de un campo de lista (p. ej. "CSS Responsable"), para no enviar uno que Zoho rechace. */
let picklistCache: Record<string, string[]> | null = null;
async function picklist(auth: ZohoAuth, field: string): Promise<string[]> {
  if (!picklistCache) {
    const data = await zoho<{ fields?: { api_name: string; pick_list_values?: { actual_value: string }[] }[] }>(auth, `/settings/fields?module=${TASKS_MODULE}`).catch(() => null);
    picklistCache = Object.fromEntries((data?.fields ?? []).map((f) => [f.api_name, (f.pick_list_values ?? []).map((v) => v.actual_value)]));
  }
  return picklistCache[field] ?? [];
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

async function alreadyCreated(auth: ZohoAuth, externalId: string): Promise<boolean> {
  const word = encodeURIComponent(`GV-ACTA ${externalId}`);
  const data = await zoho<{ data?: unknown[] }>(auth, `/${TASKS_MODULE}/search?word=${word}`).catch(() => null);
  return (data?.data?.length ?? 0) > 0;
}

/** "YYYY-MM-DD" → fecha y hora (9:00) con el desfase de la zona horaria configurada, como espera un campo de fecha y hora. */
function dueDateTime(day: string): string {
  const probe = new Date(`${day}T14:00:00Z`);
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: config.anthropic.timezone, timeZoneName: "longOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const off = tz.replace("GMT", "") || "+00:00";
  return `${day}T09:00:00${off}`;
}

export type CrmResult = { externalId: string; status: "creada" | "omitida" | "error" | "simulada"; id?: string; detalle?: string };

/** Crea cada compromiso como un registro de "CSS Tareas" (estado Pendiente). */
export async function pushTasksToZoho(tasks: CrmTask[], meta: { tipo: string; generadoPor: string }, getAuth: () => Promise<ZohoAuth> = teamAuth): Promise<CrmResult[]> {
  if (config.zoho.dryRun) {
    return tasks.map((t) => ({ externalId: t.externalId, status: "simulada", detalle: "Zoho no está configurado todavía: no se creó nada en CSS Tareas." }));
  }
  const auth = await getAuth();
  const userIds = new Map<string, string | undefined>();
  const accountId = tasks[0] ? await findAccountId(auth, tasks[0].accountName) : undefined;
  const cssNames = await picklist(auth, "CSS_Responsable");
  const tipos = await picklist(auth, "Tipo_de_gesti_n");
  const cssResp = cssNames.find((n) => fold(n) === fold(meta.generadoPor));
  const tipo = /capacit/i.test(meta.tipo) && tipos.includes("Capacitación") ? "Capacitación"
    : /diagn/i.test(meta.tipo) && tipos.includes("Diagnóstico") ? "Diagnóstico"
    : tipos.includes("Gestión de acompañamiento") ? "Gestión de acompañamiento" : undefined;
  const results: CrmResult[] = [];

  for (const t of tasks) {
    try {
      if (await alreadyCreated(auth, t.externalId)) {
        results.push({ externalId: t.externalId, status: "omitida", detalle: "Ya existía en CSS Tareas." });
        continue;
      }
      if (!userIds.has(t.ownerEmail)) userIds.set(t.ownerEmail, await findUserId(auth, t.ownerEmail).catch(() => undefined));
      const ownerId = userIds.get(t.ownerEmail);
      const record: Record<string, unknown> = {
        Name: t.subject.slice(0, 120),
        Estado_de_Reuni_n: "Pendiente",
        Comentarios: t.description,
        ...(tipo ? { Tipo_de_gesti_n: tipo } : {}),
        ...(cssResp ? { CSS_Responsable: cssResp } : {}),
        ...(t.dueDate ? { Fecha_Comprometida: dueDateTime(t.dueDate) } : {}),
        ...(ownerId ? { Owner: { id: ownerId } } : {}),
        ...(accountId ? { Nombre_Empresa: { id: accountId } } : {}),
      };
      const res = await zoho<{ data: { status: string; details?: { id?: string }; message?: string }[] }>(auth, `/${TASKS_MODULE}`, {
        method: "POST",
        body: JSON.stringify({ data: [record], trigger: ["workflow"] }),
      });
      const r = res?.data?.[0];
      results.push(
        r?.status === "success"
          ? { externalId: t.externalId, status: "creada", id: r.details?.id, detalle: accountId ? undefined : `No encontré la empresa "${t.accountName}" en Zoho; asígnala a mano.` }
          : { externalId: t.externalId, status: "error", detalle: r?.message ?? "Respuesta inesperada" },
      );
    } catch (e) {
      results.push({ externalId: t.externalId, status: "error", detalle: (e as Error).message });
    }
  }
  return results;
}
