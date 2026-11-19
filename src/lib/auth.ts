import crypto from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import { isAllowedEmail, config } from "./config";
import { cookieFromHeader, readChallenge, verifyCode } from "./otp";

/**
 * SSO corporativo. Se habilitan los proveedores que tengan credenciales:
 *  - Microsoft Entra ID (Azure AD) → recomendado si GeoVictoria usa Microsoft 365.
 *  - Google Workspace → alternativo; se pasa `hd` para restringir la cuenta al dominio.
 * En ambos casos, el callback `signIn` rechaza cualquier correo fuera de los dominios autorizados.
 */
const providers: NextAuthOptions["providers"] = [];

if (process.env.AZURE_AD_CLIENT_ID) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_AD_TENANT_ID, // tenant único → solo cuentas de la organización
    }),
  );
}

if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { hd: config.allowedDomains[0], prompt: "select_account" } },
    }),
  );
}

/**
 * Modo de ingreso (variable LOGIN_MODE en el servidor):
 *  - "email" (por defecto): la persona escribe su correo @geovictoria.com y entra. Si ACCESS_KEY
 *    está definida, además debe escribir esa clave del equipo.
 *  - "code": se envía un código de 6 dígitos al correo (requiere SMTP_USER y SMTP_PASS).
 * Microsoft o Google se suman como botones si sus credenciales están configuradas.
 */
export const loginMode = (process.env.LOGIN_MODE ?? "email").toLowerCase() === "code" ? "code" : "email";
/** Se lee en cada solicitud (no al compilar), para que agregar o quitar ACCESS_KEY tenga efecto de inmediato. */
export const accessKeyRequired = () => !!process.env["ACCESS_KEY"];

const nameFrom = (raw: string | undefined, email: string) =>
  (raw ?? "").trim().slice(0, 120) || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

if (loginMode === "email") {
  providers.push(
    CredentialsProvider({
      id: "email-only",
      name: "Correo corporativo",
      credentials: { email: { type: "email" }, name: { type: "text" }, key: { type: "password" } },
      async authorize(c) {
        const email = (c?.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+$/.test(email) || !isAllowedEmail(email)) throw new Error("DominioNoPermitido");
        if (accessKeyRequired() && !sameText(c?.key ?? "", process.env["ACCESS_KEY"] ?? "")) throw new Error("ClaveIncorrecta");
        return { id: email, email, name: nameFrom(c?.name, email) };
      },
    }),
  );
} else {
  providers.push(
    CredentialsProvider({
      id: "email-code",
      name: "Código por correo",
      credentials: { email: { type: "email" }, code: { type: "text" }, name: { type: "text" } },
      async authorize(c, req) {
        const email = (c?.email ?? "").trim().toLowerCase();
        if (!isAllowedEmail(email)) return null;
        const headers = (req as { headers?: Record<string, string> } | undefined)?.headers;
        const challenge = readChallenge(cookieFromHeader(headers?.cookie));
        const result = verifyCode(challenge, email, c?.code ?? "");
        if (result !== "ok") throw new Error(result === "expired" ? "CodigoVencido" : result === "locked" ? "DemasiadosIntentos" : "CodigoInvalido");
        return { id: email, email, name: nameFrom(c?.name, email) };
      },
    }),
  );
}

/**
 * Acceso de desarrollo (solo NODE_ENV !== "production" y DEV_LOGIN=true): permite probar la app
 * en local sin SSO, ingresando un correo del dominio autorizado. Nunca se activa en producción.
 */
if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true") {
  providers.push(
    CredentialsProvider({
      id: "dev",
      name: "Acceso de desarrollo",
      credentials: { name: { label: "Nombre", type: "text" }, email: { label: "Correo", type: "email" } },
      async authorize(c) {
        const email = (c?.email ?? "").trim().toLowerCase();
        if (!isAllowedEmail(email)) return null;
        return { id: email, email, name: c?.name?.trim() || email.split("@")[0] };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // jornada laboral
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = (user.email ?? (profile as { email?: string } | undefined)?.email ?? "").toLowerCase();
      // Google: además del correo, exige que la cuenta esté verificada.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (verified === false) return "/login?error=NoVerificado";
      return isAllowedEmail(email) ? true : "/login?error=DominioNoPermitido";
    },
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name ?? token.name;
        token.email = user.email?.toLowerCase() ?? token.email;
        token.loginAt = Date.now(); // solo cambia al iniciar sesión → dispara el pop-up de bienvenida
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      (session as unknown as { loginAt?: number }).loginAt = (token.loginAt as number) ?? 0;
      return session;
    },
  },
};

export type SessionUser = { name: string; email: string };

/** Obtiene el usuario autenticado y re-valida el dominio en cada request de API (defensa en profundidad). */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  if (!session || !isAllowedEmail(email)) {
    throw new HttpError(401, "No autorizado");
  }
  return { name: session.user?.name ?? email.split("@")[0], email };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Error interno. Intenta de nuevo en unos minutos." }, { status: 500 });
}
