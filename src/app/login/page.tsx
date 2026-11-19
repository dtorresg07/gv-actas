import { authOptions } from "@/lib/auth";
import { LoginButtons } from "./LoginButtons";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  DominioNoPermitido: "Este generador es solo para cuentas corporativas de GeoVictoria. Ingresa con tu correo de la empresa.",
  NoVerificado: "Tu correo aún no está verificado. Verifícalo con tu proveedor e intenta de nuevo.",
  AccessDenied: "Este generador es solo para cuentas corporativas de GeoVictoria. Ingresa con tu correo de la empresa.",
  CredentialsSignin: "Ese correo no pertenece a un dominio autorizado.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  // Antes de inicializar NextAuth, el id/nombre personalizado vive en `options`.
  const providers = authOptions.providers.map((p) => {
    const o = (p as { options?: { id?: string; name?: string } }).options;
    return { id: o?.id ?? p.id, name: o?.name ?? p.name };
  });
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "No pudimos iniciar tu sesión. Intenta de nuevo." : null;
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "geovictoria.com").split(",").map((d) => "@" + d.trim()).join(" o ");

  return (
    <main className="login">
      <div className="panel">
        <img src="/brand/logo-full-color.svg" alt="GeoVictoria" />
        <h1>Generador de actas</h1>
        <p>Convierte tus reuniones de Samu.ai en actas listas para enviar. Ingresa con tu cuenta {domains}.</p>
        {error && <div className="notice err" role="alert" style={{ marginBottom: 16, textAlign: "left" }}>{error}</div>}
        <LoginButtons providers={providers} />
      </div>
    </main>
  );
}
