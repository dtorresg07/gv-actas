import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { listMeetings, SamuError } from "@/lib/integrations/samu";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Reuniones recientes del usuario conectado. El navegador consulta cada 90 s (sincronización en vivo). */
export async function GET() {
  try {
    const user = await requireUser();
    const meetings = await listMeetings(user.email, user.name).catch((e) => {
      if (e instanceof SamuError) {
        console.error(e.message);
        throw new HttpError(502, e.status === 401 || e.status === 403
          ? "Samu.ai rechazó la clave de la API. Avísale a TI para que revise SAMU_API_KEY."
          : "No pudimos conectar con Samu.ai. Reintentamos en un minuto.");
      }
      throw e;
    });
    return Response.json({ meetings, demo: config.samu.mock, syncedAt: new Date().toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
