import { requireUser } from "@/lib/auth";
import { perUserMode, startFlow } from "@/lib/zoho/connection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Paso 1: envía a la persona a Zoho para que autorice crear tareas con su cuenta. */
export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); } catch { return Response.redirect(new URL("/login", req.url), 302); }
  if (!perUserMode()) return Response.redirect(new URL("/api/zoho/callback?error=no-configurado", req.url), 302);
  return Response.redirect(startFlow(req, user.email), 302);
}
