import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "../config";
import { seal, unseal } from "../samu/seal";

/**
 * Conexión de Zoho de cada persona (OAuth con su propia cuenta).
 * El acceso vive cifrado en una cookie de su navegador; el servidor no guarda nada.
 * Así cada tarea queda creada por quien generó el acta y respeta sus permisos en Zoho.
 */
export type ZohoConnection = { email: string; refreshToken: string; accessToken: string; exp: number; apiDomain: string; accountsUrl: string };

const CONN_COOKIE = "gv_zoho";
export const FLOW_COOKIE = "gv_zoho_flow";
const PURPOSE = "zoho-connection";
export const SCOPES = "ZohoCRM.modules.ALL,ZohoCRM.users.READ,ZohoCRM.settings.fields.READ";

export class ZohoNotConnected extends Error {
  constructor() { super("Conecta tu cuenta de Zoho para crear tareas en CSS Tareas."); this.name = "ZohoNotConnected"; }
}

/** Modo por persona: hay app de Zoho (Client ID y Secret) pero no un token de equipo. */
export const perUserMode = () => !!(config.zoho.clientId && config.zoho.clientSecret && !config.zoho.refreshToken);

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

export function readZoho(email: string): ZohoConnection | null {
  const c = unseal<ZohoConnection>(cookies().get(CONN_COOKIE)?.value, PURPOSE);
  return c && c.email === email.toLowerCase() ? c : null;
}
export function saveZoho(c: ZohoConnection) { cookies().set(CONN_COOKIE, seal(c, PURPOSE), cookieOpts(60 * 60 * 24 * 180)); }
export function clearZoho() { cookies().delete(CONN_COOKIE); }

export function redirectUri(req: Request) {
  return new URL("/api/zoho/callback", process.env.NEXTAUTH_URL ?? req.url).toString();
}

export function startFlow(req: Request, email: string): string {
  const state = crypto.randomBytes(16).toString("base64url");
  cookies().set(FLOW_COOKIE, seal({ state, email }, "zoho-flow"), cookieOpts(600));
  const q = new URLSearchParams({
    scope: SCOPES, client_id: config.zoho.clientId, response_type: "code", access_type: "offline",
    prompt: "consent", redirect_uri: redirectUri(req), state,
  });
  return `${config.zoho.accountsUrl}/oauth/v2/auth?${q}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; api_domain?: string; error?: string };

async function tokenRequest(accountsUrl: string, params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: config.zoho.clientId, client_secret: config.zoho.clientSecret, ...params });
  const res = await fetch(`${accountsUrl}/oauth/v2/token`, { method: "POST", body });
  return (await res.json()) as TokenResponse;
}

/** Zoho indica en el regreso el servidor de cuentas de la persona (EE. UU., UE, etc.); solo se aceptan dominios de Zoho. */
function safeAccounts(server: string | null): string {
  if (server && /^https:\/\/accounts\.zoho\.[a-z.]+$/.test(server)) return server;
  return config.zoho.accountsUrl;
}

export async function finishFlow(req: Request, email: string, code: string, accountsServer: string | null) {
  const accountsUrl = safeAccounts(accountsServer);
  const t = await tokenRequest(accountsUrl, { grant_type: "authorization_code", code, redirect_uri: redirectUri(req) });
  if (!t.access_token || !t.refresh_token) throw new Error(`Zoho OAuth: ${t.error ?? "sin token"}`);
  saveZoho({
    email: email.toLowerCase(), refreshToken: t.refresh_token, accessToken: t.access_token,
    exp: Date.now() + (t.expires_in ?? 3600) * 1000, apiDomain: t.api_domain ?? config.zoho.apiDomain, accountsUrl,
  });
}

/** Acceso vigente de la persona; lo renueva si venció. */
export async function userAuth(email: string): Promise<{ token: string; apiDomain: string }> {
  const c = readZoho(email);
  if (!c) throw new ZohoNotConnected();
  if (c.exp < Date.now() + 60_000) {
    const t = await tokenRequest(c.accountsUrl, { grant_type: "refresh_token", refresh_token: c.refreshToken });
    if (!t.access_token) { clearZoho(); throw new ZohoNotConnected(); }
    c.accessToken = t.access_token;
    c.exp = Date.now() + (t.expires_in ?? 3600) * 1000;
    if (t.api_domain) c.apiDomain = t.api_domain;
    saveZoho(c);
  }
  return { token: c.accessToken, apiDomain: c.apiDomain };
}
