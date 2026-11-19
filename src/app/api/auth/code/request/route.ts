import { cookies } from "next/headers";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/config";
import { OTP_COOKIE, createChallenge, readChallenge, sendCode, tooSoon } from "@/lib/otp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(120).optional() });

/** Paso 1 del inicio de sesión: envía un código de 6 dígitos al correo corporativo. */
export async function POST(req: Request) {
  if ((process.env.LOGIN_MODE ?? "email").toLowerCase() !== "code") return Response.json({ error: "El ingreso con código no está activado." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Escribe un correo válido." }, { status: 400 });
  const { email, name } = parsed.data;
  if (!isAllowedEmail(email)) {
    return Response.json({ error: "Este generador es solo para el equipo de GeoVictoria. Usa tu correo @geovictoria.com." }, { status: 403 });
  }

  const jar = cookies();
  if (tooSoon(readChallenge(jar.get(OTP_COOKIE)?.value), email)) {
    return Response.json({ error: "Ya te enviamos un código. Espera 30 segundos para pedir otro." }, { status: 429 });
  }

  const { code, cookie } = createChallenge(email);
  try {
    await sendCode(email, code, name);
  } catch (e) {
    console.error("Envío de código:", e);
    return Response.json({ error: "No pudimos enviar el correo. Intenta de nuevo en un minuto; si sigue fallando, avisa a quien administra la herramienta." }, { status: 502 });
  }
  jar.set(OTP_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.json({ ok: true });
}
