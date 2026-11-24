import { requireUser, errorResponse } from "@/lib/auth";
import { clearZoho } from "@/lib/zoho/connection";

export const dynamic = "force-dynamic";

export async function POST() {
  try { await requireUser(); clearZoho(); return Response.json({ ok: true }); } catch (e) { return errorResponse(e); }
}
