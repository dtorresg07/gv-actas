import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { listMeetings, SamuError, samuMode } from "@/lib/integrations/samu";
import { SamuNotConnected } from "@/lib/samu/connection";

export const dynamic = "force-dynamic";

/** Reuniones recientes del usuario conectado. El navegador consulta cada 90 s (sincronización en vivo). */
export async function GET() {
  try {
    const user = await requireUser();
    const meetings = await listMeetings(user.email, user.name).catch((e) => {
      if (e instanceof SamuNotConnected) throw e;
      if (e instanceof SamuError || samuMode() === "user") {
        console.error(e.message);
        throw new HttpError(502, e instanceof SamuError && (e.status === 401 || e.status === 403)
          ? "Samu.ai rechazó la clave de la API. Avísale a TI para que revise SAMU_API_KEY."
          : "No pudimos conectar con Samu.ai. Reintentamos en un minuto.");
      }
      throw e;
    });
    return Response.json({ meetings, demo: samuMode() === "mock", mode: samuMode(), syncedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof SamuNotConnected) return Response.json({ error: e.message, code: "samu_not_connected" }, { status: 409 });
    return errorResponse(e);
  }
}
