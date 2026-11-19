import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, discover, pkce, registerClient } from "@/lib/samu/oauth";
import { FLOW_COOKIE, mcpUrl } from "@/lib/samu/connection";
import { seal } from "@/lib/samu/seal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const back = (req: Request, error: string) => Response.redirect(new URL(`/?samu=${error}`, req.url), 302);

/** Paso 1: envía a la persona a Samu para que autorice el acceso a sus reuniones. */
export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); } catch { return Response.redirect(new URL("/login", req.url), 302); }
  const url = mcpUrl();
  if (!url) return back(req, "no-configurado");

  try {
    const redirectUri = new URL("/api/samu/callback", process.env.NEXTAUTH_URL ?? req.url).toString();
    const as = await discover(url);
    const client = await registerClient(as, redirectUri);
    const { verifier, challenge, state } = pkce();
    cookies().set(FLOW_COOKIE, seal({ verifier, state, as, client, redirectUri, email: user.email }, "samu-flow"), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600,
    });
    return Response.redirect(authorizeUrl(as, client, redirectUri, challenge, state, url, user.email), 302);
  } catch (e) {
    console.error("Conectar Samu:", e);
    return back(req, "error-inicio");
  }
}
