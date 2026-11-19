import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { getMeeting, getTranscript } from "@/lib/integrations/samu";
import { generateActa } from "@/lib/acta/generate";
import { SamuNotConnected } from "@/lib/samu/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ meetingId: z.string().regex(/^[a-f0-9]{24}$/) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Reunión inválida");

    // getMeeting confirma que la reunión es del usuario antes de leer la transcripción.
    const meeting = await getMeeting(user.email, parsed.data.meetingId, user.name).catch((e) => {
      if (e instanceof SamuNotConnected) throw e;
      throw new HttpError(404, "No encontramos esa reunión entre las tuyas.");
    });
    const lines = await getTranscript(meeting.id, user.name, user.email).catch((e) => {
      if (e instanceof SamuNotConnected) throw e;
      throw new HttpError(502, "No pudimos leer la transcripción en Samu.ai. Intenta de nuevo en un minuto.");
    });
    const acta = await generateActa(meeting, lines, user);
    return Response.json({ acta, meeting });
  } catch (e) {
    if (e instanceof SamuNotConnected) return Response.json({ error: e.message, code: "samu_not_connected" }, { status: 409 });
    return errorResponse(e);
  }
}
