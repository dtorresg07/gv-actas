import { z } from "zod";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { ActaSchema, compact, safeFilename } from "@/lib/acta/actaSchema";
import { applyTerms } from "@/lib/acta/verify";
import { actaToDocx } from "@/lib/export/docx";
import { actaToPdf } from "@/lib/export/pdf";
import type { Acta } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ format: z.enum(["docx", "pdf"]), acta: ActaSchema });

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "El acta tiene datos inválidos. Revisa que la fecha esté como DD/MM/AAAA.");
    const acta = applyTerms(compact(parsed.data.acta) as Acta);
    const { format } = parsed.data;

    const buf = format === "docx" ? await actaToDocx(acta) : await actaToPdf(acta);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(acta, format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
