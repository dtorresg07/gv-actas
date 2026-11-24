import { requireUser, errorResponse } from "@/lib/auth";
import { config } from "@/lib/config";
import { perUserMode, readZoho } from "@/lib/zoho/connection";

export const dynamic = "force-dynamic";

/** mode: "user" (cada persona conecta su Zoho), "team" (token del equipo) o "off" (sin configurar: modo prueba). */
export async function GET() {
  try {
    const user = await requireUser();
    const mode = perUserMode() ? "user" : config.zoho.refreshToken ? "team" : "off";
    return Response.json({ mode, connected: mode === "team" || (mode === "user" && !!readZoho(user.email)) });
  } catch (e) {
    return errorResponse(e);
  }
}
