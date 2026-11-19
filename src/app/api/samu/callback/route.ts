import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { exchangeCode, type AuthServer, type ClientInfo } from "@/lib/samu/oauth";
import { FLOW_COOKIE, mcpUrl, saveConnection } from "@/lib/samu/connection";
import { unseal } from "@/lib/samu/seal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Flow = { verifier: string; state: string; as: AuthServer; client: ClientInfo; redirectUri: string; email: string };

/** Paso 2: Samu vuelve con un código; se cambia por el acceso y se guarda cifrado en el navegador de la persona. */
export async function GET(req: Request) {
  const back = (q: string) => Response.redirect(new URL(`/?samu=${q}`, req.url), 302);
  let user;
  try { user = await requireUser(); } catch { return Response.redirect(new URL("/login", req.url), 302); }

  const params = new URL(req.url).searchParams;
  const flow = unseal<Flow>(cookies().get(FLOW_COOKIE)?.value, "samu-flow");
  cookies().delete(FLOW_COOKIE);
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "cancelado" : "error-samu");
  if (!flow || flow.state !== params.get("state") || flow.email !== user.email || !params.get("code")) return back("vencido");

  try {
    const tokens = await exchangeCode(flow.as, flow.client, params.get("code")!, flow.verifier, flow.redirectUri, mcpUrl());
    saveConnection({ email: user.email, as: flow.as, client: flow.client, tokens, connectedAt: Date.now() });
    return back("conectado");
  } catch (e) {
    console.error("Callback Samu:", e);
    return back("error-token");
  }
}
