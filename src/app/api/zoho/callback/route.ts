import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { FLOW_COOKIE, finishFlow } from "@/lib/zoho/connection";
import { unseal } from "@/lib/samu/seal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Página mínima que avisa a la pestaña del acta y se cierra (así no se pierde lo editado). */
function page(ok: boolean, msg: string) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zoho</title>
<style>body{font-family:Nunito,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#F5F7FA;color:#4E4E4E}div{background:#fff;padding:28px 32px;border-radius:12px;max-width:380px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}b{color:${ok ? "#0A8F5A" : "#B54708"}}</style></head>
<body><div><b>${ok ? "Zoho conectado" : "No se pudo conectar"}</b><p>${msg}</p></div>
<script>try{window.opener&&window.opener.postMessage({gvZoho:${ok ? "true" : "false"}},location.origin)}catch(e){}${ok ? "setTimeout(function(){window.close()},1200)" : ""}</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); } catch { return Response.redirect(new URL("/login", req.url), 302); }
  const p = new URL(req.url).searchParams;
  const flow = unseal<{ state: string; email: string }>(cookies().get(FLOW_COOKIE)?.value, "zoho-flow");
  cookies().delete(FLOW_COOKIE);

  if (p.get("error") === "no-configurado") return page(false, "La conexión con Zoho aún no está habilitada en la app.");
  if (p.get("error")) return page(false, p.get("error") === "access_denied" ? "Cancelaste la autorización. Puedes cerrar esta pestaña." : "Zoho no autorizó el acceso. Cierra esta pestaña e inténtalo de nuevo.");
  if (!flow || flow.state !== p.get("state") || flow.email !== user.email || !p.get("code")) return page(false, "El enlace venció. Cierra esta pestaña e inténtalo de nuevo.");
  try {
    await finishFlow(req, user.email, p.get("code")!, p.get("accounts-server"));
    return page(true, "Ya puedes volver al acta y crear las tareas. Esta pestaña se cerrará sola.");
  } catch (e) {
    console.error("Callback Zoho:", e);
    return page(false, "No pudimos completar la conexión. Cierra esta pestaña e inténtalo de nuevo.");
  }
}
