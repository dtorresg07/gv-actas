import crypto from "node:crypto";
import nodemailer from "nodemailer";

/**
 * Inicio de sesión con código por correo, sin base de datos.
 *
 * 1. /api/auth/code/request genera un código de 6 dígitos, lo envía al correo y guarda en una
 *    cookie httpOnly un "desafío" firmado con NEXTAUTH_SECRET: {correo, hash del código, vencimiento, id}.
 *    El código nunca viaja en la cookie, solo su hash.
 * 2. El proveedor "email-code" de NextAuth verifica la cookie, el vencimiento, el correo y el código.
 *
 * Protecciones: vence en 10 minutos, máximo 5 intentos por código, un solo uso
 * y un mínimo de 30 s entre envíos al mismo correo.
 */

export const OTP_COOKIE = "gv_otp";
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 30_000;

const secret = () => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Falta NEXTAUTH_SECRET");
  return s;
};

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const hmac = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");
const codeHash = (email: string, code: string, id: string) => hmac(`code:${email}:${code}:${id}`);

type Challenge = { email: string; h: string; exp: number; id: string; sent: number };

export function createChallenge(email: string): { code: string; cookie: string } {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomBytes(12).toString("base64url");
  const payload: Challenge = { email, h: codeHash(email, code, id), exp: Date.now() + TTL_MS, id, sent: Date.now() };
  const body = b64(JSON.stringify(payload));
  return { code, cookie: `${body}.${hmac(body)}` };
}

export function readChallenge(cookie: string | undefined): Challenge | null {
  if (!cookie) return null;
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()) as Challenge; } catch { return null; }
}

/** Evita reenvíos seguidos al mismo correo con la misma cookie. */
export function tooSoon(prev: Challenge | null, email: string): boolean {
  return !!prev && prev.email === email && Date.now() - prev.sent < RESEND_MS;
}

// Intentos y códigos usados, por instancia del servidor.
const attempts = new Map<string, number>();
const used = new Set<string>();

export type VerifyResult = "ok" | "expired" | "invalid" | "locked";

export function verifyCode(ch: Challenge | null, email: string, code: string): VerifyResult {
  if (!ch || ch.email !== email) return "invalid";
  if (Date.now() > ch.exp || used.has(ch.id)) return "expired";
  const n = (attempts.get(ch.id) ?? 0) + 1;
  attempts.set(ch.id, n);
  if (n > MAX_ATTEMPTS) return "locked";
  const clean = code.replace(/\D/g, "");
  const ok = clean.length === 6 && codeHash(email, clean, ch.id) === ch.h;
  if (ok) { used.add(ch.id); attempts.delete(ch.id); }
  // Limpieza simple para no crecer sin límite.
  if (attempts.size > 5000) attempts.clear();
  if (used.size > 5000) used.clear();
  return ok ? "ok" : "invalid";
}

export function cookieFromHeader(header: string | null | undefined): string | undefined {
  return header?.split(/;\s*/).find((c) => c.startsWith(`${OTP_COOKIE}=`))?.slice(OTP_COOKIE.length + 1);
}

/* ---------- Envío del correo ---------- */

export const mailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendCode(to: string, code: string, name?: string): Promise<void> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[desarrollo] Código para ${to}: ${code}`);
      return;
    }
    throw new Error("SMTP no configurado");
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.MAIL_FROM ?? `Generador de actas GeoVictoria <${process.env.SMTP_USER}>`;
  const hello = name ? `Hola ${name.split(" ")[0]},` : "Hola,";
  await transporter.sendMail({
    from,
    to,
    subject: `${code} es tu código para el generador de actas`,
    text: `${hello}\n\nTu código para entrar al generador de actas GeoVictoria es: ${code}\n\nVence en 10 minutos. Si no lo pediste, ignora este correo.`,
    html: `<div style="font-family:Nunito,Arial,sans-serif;color:#172b4d;max-width:480px">
      <p>${hello}</p>
      <p>Tu código para entrar al <b>generador de actas GeoVictoria</b> es:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0c2340;margin:16px 0">${code}</p>
      <p style="color:#5e6c84;font-size:13px">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>
    </div>`,
  });
}
