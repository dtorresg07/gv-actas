/**
 * Configuración central. Todo lo sensible viene de variables de entorno (ver .env.example).
 */
function list(v: string | undefined, fallback: string[]): string[] {
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const config = {
  /** Dominios autorizados. Spec: geovictoria.com. Se puede ampliar vía ALLOWED_EMAIL_DOMAINS. */
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAINS, ["geovictoria.com", "geo-victoria.com"]),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    /** Zona horaria para fechas del acta y para resolver "el martes" en la transcripción. */
    timezone: process.env.ACTA_TIMEZONE ?? "America/Bogota",
  },

  samu: {
    baseUrl: process.env.SAMU_API_BASE_URL ?? "https://api.samu.ai",
    apiKey: process.env.SAMU_API_KEY ?? "",
    /** Si es "true", usa datos de demostración (útil para desarrollo sin credenciales). */
    mock: process.env.SAMU_MOCK === "true" || !process.env.SAMU_API_KEY,
    recentDays: Number(process.env.SAMU_RECENT_DAYS ?? 30),
  },

  zoho: {
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com",
    apiDomain: process.env.ZOHO_API_DOMAIN ?? "https://www.zohoapis.com",
    clientId: process.env.ZOHO_CLIENT_ID ?? "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
    refreshToken: process.env.ZOHO_REFRESH_TOKEN ?? "",
    /** Días por defecto para el vencimiento cuando la reunión no fijó fecha (no se inventa: se marca en la descripción). */
    dryRun: process.env.ZOHO_DRY_RUN === "true" || !(process.env.ZOHO_REFRESH_TOKEN || (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET)),
  },
};

/** Correo en su forma canónica (@geovictoria.com) y sus variantes con los otros dominios autorizados. */
export function emailVariants(email: string): string[] {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain || !config.allowedDomains.includes(domain)) return [email.toLowerCase()];
  return config.allowedDomains.map((d) => `${local}@${d}`);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return config.allowedDomains.includes(domain);
}
