import crypto from "node:crypto";

/**
 * Cifrado de cookies (AES-256-GCM) con una clave derivada de NEXTAUTH_SECRET.
 * Las credenciales de Samu de cada persona viajan solo en su navegador, cifradas,
 * y el servidor no guarda nada.
 */
function key(purpose: string): Buffer {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Falta NEXTAUTH_SECRET");
  return crypto.createHash("sha256").update(`${purpose}:${s}`).digest();
}

export function seal(data: unknown, purpose: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function unseal<T>(value: string | undefined, purpose: string): T | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
