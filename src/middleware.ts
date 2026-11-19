import { withAuth } from "next-auth/middleware";

/**
 * Bloquea toda la app (páginas y APIs) salvo /login y /api/auth.
 * Re-valida el dominio del token por si cambia la configuración de dominios.
 */
const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? "geovictoria.com,geo-victoria.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

export default withAuth({
  pages: { signIn: "/login" },
  callbacks: {
    authorized: ({ token }) => {
      const email = (token?.email as string | undefined)?.toLowerCase() ?? "";
      return allowed.includes(email.split("@")[1] ?? "");
    },
  },
});

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|fonts|brand|favicon.ico).*)"],
};
