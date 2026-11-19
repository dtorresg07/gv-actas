import crypto from "node:crypto";

/**
 * OAuth 2.1 contra el servidor MCP de Samu, igual que lo hace el conector SAMU de Claude:
 *  1. Descubrimiento: el servidor MCP indica su servidor de autorización
 *     (/.well-known/oauth-protected-resource) y este publica sus URLs (/.well-known/oauth-authorization-server).
 *  2. Registro dinámico de la app como cliente (o SAMU_OAUTH_CLIENT_ID si Samu entrega uno fijo).
 *  3. Autorización con PKCE: la persona inicia sesión en Samu y aprueba.
 *  4. Intercambio del código por tokens de acceso y renovación.
 */

export type AuthServer = {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
};

export type ClientInfo = { client_id: string; client_secret?: string };

export type Tokens = { access_token: string; refresh_token?: string; expires_at?: number; token_type?: string; scope?: string };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function wellKnown(base: string, suffix: string): string[] {
  const u = new URL(base);
  const path = u.pathname.replace(/\/$/, "");
  const urls = [`${u.origin}/.well-known/${suffix}${path}`, `${u.origin}/.well-known/${suffix}`];
  return [...new Set(urls)];
}

/** Descubre el servidor de autorización a partir de la URL del servidor MCP. */
export async function discover(mcpUrl: string): Promise<AuthServer> {
  let authBase = new URL(mcpUrl).origin;

  // 1. Protected Resource Metadata (RFC 9728), desde la cabecera WWW-Authenticate o la ruta conocida.
  try {
    const probe = await fetch(mcpUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}", cache: "no-store" });
    const m = /resource_metadata="([^"]+)"/.exec(probe.headers.get("www-authenticate") ?? "");
    const prm = m ? await getJson<{ authorization_servers?: string[] }>(m[1]) : null;
    if (prm?.authorization_servers?.[0]) authBase = prm.authorization_servers[0];
  } catch { /* se intenta la ruta conocida */ }
  if (authBase === new URL(mcpUrl).origin) {
    for (const u of wellKnown(mcpUrl, "oauth-protected-resource")) {
      const prm = await getJson<{ authorization_servers?: string[] }>(u);
      if (prm?.authorization_servers?.[0]) { authBase = prm.authorization_servers[0]; break; }
    }
  }

  // 2. Authorization Server Metadata (RFC 8414) u OpenID Connect.
  for (const u of [...wellKnown(authBase, "oauth-authorization-server"), ...wellKnown(authBase, "openid-configuration")]) {
    const meta = await getJson<AuthServer>(u);
    if (meta?.authorization_endpoint && meta.token_endpoint) return meta;
  }
  // 3. Respaldo de la especificación MCP: rutas por defecto en el origen.
  const o = new URL(authBase).origin;
  return { authorization_endpoint: `${o}/authorize`, token_endpoint: `${o}/token`, registration_endpoint: `${o}/register` };
}

/** Registra la app como cliente OAuth (RFC 7591), salvo que Samu haya entregado un client_id fijo. */
export async function registerClient(as: AuthServer, redirectUri: string): Promise<ClientInfo> {
  if (process.env.SAMU_OAUTH_CLIENT_ID) {
    return { client_id: process.env.SAMU_OAUTH_CLIENT_ID, client_secret: process.env.SAMU_OAUTH_CLIENT_SECRET || undefined };
  }
  if (!as.registration_endpoint) throw new Error("Samu no permite registro automático de la app: hace falta SAMU_OAUTH_CLIENT_ID.");
  const res = await fetch(as.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Generador de actas GeoVictoria",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) throw new Error(`Registro en Samu rechazado (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as ClientInfo;
  if (!data.client_id) throw new Error("Samu no devolvió client_id");
  return { client_id: data.client_id, client_secret: data.client_secret };
}

export function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: crypto.randomBytes(16).toString("base64url") };
}

export function authorizeUrl(as: AuthServer, client: ClientInfo, redirectUri: string, challenge: string, state: string, resource: string, loginHint?: string): string {
  const u = new URL(as.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", client.client_id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", resource);
  const scope = process.env.SAMU_OAUTH_SCOPE ?? as.scopes_supported?.join(" ");
  if (scope) u.searchParams.set("scope", scope);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return u.toString();
}

async function tokenRequest(as: AuthServer, client: ClientInfo, params: Record<string, string>): Promise<Tokens> {
  const body = new URLSearchParams({ ...params, client_id: client.client_id });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (client.client_secret) headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString("base64")}`;
  const res = await fetch(as.token_endpoint, { method: "POST", headers, body });
  const data = (await res.json().catch(() => ({}))) as Tokens & { expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Samu rechazó el token: ${data.error_description ?? data.error ?? res.status}`);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export const exchangeCode = (as: AuthServer, client: ClientInfo, code: string, verifier: string, redirectUri: string, resource: string) =>
  tokenRequest(as, client, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, resource });

export const refreshTokens = (as: AuthServer, client: ClientInfo, refreshToken: string, resource: string) =>
  tokenRequest(as, client, { grant_type: "refresh_token", refresh_token: refreshToken, resource });
