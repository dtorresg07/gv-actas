import { requireUser, errorResponse } from "@/lib/auth";
import { clearConnection } from "@/lib/samu/connection";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUser();
    clearConnection();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
