import { cookies } from "next/headers";
import { seal, unseal } from "./seal";
import { refreshTokens, type AuthServer, type ClientInfo, type Tokens } from "./oauth";
import { McpAuthError, callTool } from "./mcp";

/** Conexión de Samu de una persona: vive cifrada en una cookie de su navegador. */
export type SamuConnection = { email: string; as: AuthServer; client: ClientInfo; tokens: Tokens; connectedAt: number };

export const CONN_COOKIE = "gv_samu";
export const FLOW_COOKIE = "gv_samu_flow";
const PURPOSE = "samu-connection";

export const mcpUrl = () => process.env.SAMU_MCP_URL ?? "";

export class SamuNotConnected extends Error {
  constructor() { super("Conecta tu cuenta de Samu para ver tus reuniones."); this.name = "SamuNotConnected"; }
}

export function readConnection(email: string): SamuConnection | null {
  const c = unseal<SamuConnection>(cookies().get(CONN_COOKIE)?.value, PURPOSE);
  return c && c.email === email.toLowerCase() ? c : null;
}

export function saveConnection(c: SamuConnection) {
  cookies().set(CONN_COOKIE, seal(c, PURPOSE), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
}

export function clearConnection() {
  cookies().delete(CONN_COOKIE);
}

/** Llama una herramienta de Samu con la conexión de la persona; renueva el acceso una vez si venció. */
export async function samuTool<T>(email: string, tool: string, args: Record<string, unknown>): Promise<T> {
  const conn = readConnection(email);
  if (!conn) throw new SamuNotConnected();
  const url = mcpUrl();

  const expired = conn.tokens.expires_at && conn.tokens.expires_at < Date.now() + 30_000;
  if (expired && conn.tokens.refresh_token) await renew(conn, url);
  try {
    return await callTool<T>(url, conn.tokens.access_token, tool, args);
  } catch (e) {
    if (!(e instanceof McpAuthError)) throw e;
    if (!conn.tokens.refresh_token) { clearConnection(); throw new SamuNotConnected(); }
    await renew(conn, url);
    return callTool<T>(url, conn.tokens.access_token, tool, args);
  }
}

async function renew(conn: SamuConnection, url: string) {
  try {
    const t = await refreshTokens(conn.as, conn.client, conn.tokens.refresh_token!, url);
    conn.tokens = { ...t, refresh_token: t.refresh_token ?? conn.tokens.refresh_token };
    saveConnection(conn);
  } catch {
    clearConnection();
    throw new SamuNotConnected();
  }
}
