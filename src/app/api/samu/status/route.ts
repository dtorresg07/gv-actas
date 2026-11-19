import { requireUser, errorResponse } from "@/lib/auth";
import { samuMode } from "@/lib/integrations/samu";
import { readConnection } from "@/lib/samu/connection";

export const dynamic = "force-dynamic";

/** Estado de la conexión con Samu para la persona que inició sesión. */
export async function GET() {
  try {
    const user = await requireUser();
    const mode = samuMode();
    const conn = mode === "user" ? readConnection(user.email) : null;
    return Response.json({ mode, connected: mode !== "user" || !!conn, connectedAt: conn?.connectedAt ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
