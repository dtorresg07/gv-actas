import { config, emailVariants, isAllowedEmail } from "../config";
import type { Acta, Acuerdo } from "../types";
import { POR_DEFINIR, longDate, parseDMY } from "../acta/validate";

/**
 * Matriz de Tareas → Zoho CRM (módulo Tasks).
 *
 * Reglas de asignación:
 *  - Responsable de GeoVictoria con usuario activo en Zoho → Owner = ese usuario.
 *  - Responsable del cliente o "Por definir" → Owner = quien generó el acta
 *    (es quien hace el seguimiento); el responsable real queda en la descripción.
 *  - Due_Date solo si la reunión fijó una fecha explícita. Nunca se inventa.
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

async function zoho<T>(pathname: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`${config.zoho.apiDomain}/crm/${API_VERSION}${pathname}`, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function findUserId(email: string): Promise<string | undefined> {
  const data = await zoho<{ users?: { id: string; email: string }[] }>(`/users?type=ActiveUsers&per_page=200`);
  const variants = emailVariants(email);
  return data?.users?.find((u) => variants.includes(u.email.toLowerCase()))?.id;
}

async function findAccountId(name: string): Promise<string | undefined> {
  const criteria = encodeURIComponent(`(Account_Name:equals:${name.replace(/[(),]/g, " ")})`);
  const data = await zoho<{ data?: { id: string }[] }>(`/Accounts/search?criteria=${criteria}`);
  return data?.data?.[0]?.id;
}

async function alreadyCreated(externalId: string): Promise<boolean> {
  const word = encodeURIComponent(`GV-ACTA ${externalId}`);
  const data = await zoho<{ data?: unknown[] }>(`/Tasks/search?word=${word}`);
  return (data?.data?.length ?? 0) > 0;
}

export type CrmResult = { externalId: string; status: "creada" | "omitida" | "error" | "simulada"; id?: string; detalle?: string };

export async function pushTasksToZoho(tasks: CrmTask[]): Promise<CrmResult[]> {
  if (config.zoho.dryRun) {
    return tasks.map((t) => ({ externalId: t.externalId, status: "simulada", detalle: "ZOHO_DRY_RUN activo: no se envió nada al CRM." }));
  }
  const userIds = new Map<string, string | undefined>();
  const accountId = tasks[0] ? await findAccountId(tasks[0].accountName).catch(() => undefined) : undefined;
  const results: CrmResult[] = [];

  for (const t of tasks) {
    try {
      if (await alreadyCreated(t.externalId)) {
        results.push({ externalId: t.externalId, status: "omitida", detalle: "Ya existía en Zoho." });
        continue;
      }
      if (!userIds.has(t.ownerEmail)) userIds.set(t.ownerEmail, await findUserId(t.ownerEmail));
      const ownerId = userIds.get(t.ownerEmail);
      const record: Record<string, unknown> = {
        Subject: t.subject,
        Description: t.description,
        Status: t.status,
        Priority: "Normal",
        ...(t.dueDate ? { Due_Date: t.dueDate } : {}),
        ...(ownerId ? { Owner: { id: ownerId } } : {}),
        ...(accountId ? { What_Id: { id: accountId }, $se_module: "Accounts" } : {}),
      };
      const res = await zoho<{ data: { status: string; details?: { id?: string }; message?: string }[] }>(`/Tasks`, {
        method: "POST",
        body: JSON.stringify({ data: [record], trigger: ["workflow"] }),
      });
      const r = res?.data?.[0];
      results.push(
        r?.status === "success"
          ? { externalId: t.externalId, status: "creada", id: r.details?.id }
          : { externalId: t.externalId, status: "error", detalle: r?.message ?? "Respuesta inesperada" },
      );
    } catch (e) {
      results.push({ externalId: t.externalId, status: "error", detalle: (e as Error).message });
    }
  }
  return results;
}
