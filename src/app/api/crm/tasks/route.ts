import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { ActaSchema, compact } from "@/lib/acta/actaSchema";
import { applyTerms } from "@/lib/acta/verify";
import { getMeeting } from "@/lib/integrations/samu";
import { toCrmTasks, pushTasksToZoho, teamAuth } from "@/lib/integrations/zoho";
import { perUserMode, userAuth } from "@/lib/zoho/connection";
import type { Acta } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  acta: ActaSchema,
  /** Ids de los acuerdos a enviar. Los no verificados se rechazan: el usuario debe revisarlos primero. */
  taskIds: z.array(z.string()).min(1),
  /** true = solo devuelve la matriz (para revisar o integrar con otro CRM). */
  preview: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Datos inválidos");
    const { taskIds, preview } = parsed.data;
    const acta = applyTerms(compact(parsed.data.acta) as Acta);

    await getMeeting(user.email, acta.meetingId, user.name).catch((e) => {
      if (e instanceof Error && e.name === "SamuNotConnected") throw e;
      throw new HttpError(403, "Solo puedes enviar tareas de tus propias reuniones.");
    });
    acta.generadoPor = { nombre: user.name, email: user.email }; // dueño por defecto = usuario autenticado

    const selected = acta.acuerdos.filter((t) => taskIds.includes(t.id));
    const blocked = selected.filter((t) => !t.verificada);
    if (blocked.length && !preview) throw new HttpError(422, `Revisa primero los acuerdos marcados: ${blocked.map((t) => t.id).join(", ")}.`);

    const matriz = toCrmTasks(acta, selected);
    if (preview) return Response.json({ matriz });
    const resultados = await pushTasksToZoho(matriz, { tipo: acta.tipo, generadoPor: user.name }, perUserMode() ? () => userAuth(user.email) : teamAuth);
    console.log("CSS Tareas:", user.email, JSON.stringify(resultados.map((r) => ({ id: r.externalId.split(":")[1], status: r.status, detalle: r.detalle }))));
    return Response.json({ matriz, resultados });
  } catch (e) {
    console.error("CSS Tareas: fallo general", (e as Error)?.message);
    if (e instanceof Error && e.name === "ZohoNotConnected") return Response.json({ error: e.message, code: "zoho_not_connected" }, { status: 409 });
    return errorResponse(e);
  }
}
