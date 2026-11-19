import { authOptions, loginMode, accessKeyRequired } from "@/lib/auth";
import { config } from "@/lib/config";
import { LoginButtons } from "./LoginButtons";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  DominioNoPermitido: "Este generador es solo para cuentas corporativas de GeoVictoria. Ingresa con tu correo de la empresa.",
  NoVerificado: "Tu correo aún no está verificado. Verifícalo con tu proveedor e intenta de nuevo.",
  ClaveIncorrecta: "La clave del equipo no es correcta.",
  AccessDenied: "Este generador es solo para cuentas corporativas de GeoVictoria. Ingresa con tu correo de la empresa.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  // Antes de inicializar NextAuth, el id/nombre personalizado vive en `options`.
  const providers = authOptions.providers.map((p) => {
    const o = (p as { options?: { id?: string; name?: string } }).options;
    return { id: o?.id ?? p.id, name: o?.name ?? p.name };
  });
  const error = searchParams.error && ERRORS[searchParams.error];
  const domains = config.allowedDomains.map((d) => "@" + d).join(" o ");

  return (
    <main className="login">
      <div className="panel">
        <img src="/brand/logo-full-color.svg" alt="GeoVictoria" />
        <h1>Generador de actas</h1>
        <p>Convierte tus reuniones de Samu.ai en actas listas para enviar. {loginMode === "code" ? "Te enviaremos un código a tu correo de GeoVictoria para entrar." : "Entra con tu correo de GeoVictoria."}</p>
        {error && <div className="notice err" role="alert" style={{ marginBottom: 16, textAlign: "left" }}>{error}</div>}
        <LoginButtons providers={providers} domains={domains} mode={loginMode} keyRequired={accessKeyRequired()} />
      </div>
    </main>
  );
}
