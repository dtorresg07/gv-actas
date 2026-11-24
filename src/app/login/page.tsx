import { authOptions, loginMode, accessKeyRequired } from "@/lib/auth";
import { config } from "@/lib/config";
import { LoginButtons } from "./LoginButtons";
import { YoTeAyudo } from "@/components/YoTeAyudo";

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
      <section className="login-art" aria-hidden="true">
        <span className="ring a" /><span className="ring b" />
        <img className="float" src="/brand/iso-white.svg" alt="" />
        <img className="logo" src="/brand/logo-full-white.svg" alt="" />
        <div>
          <h2>Tus reuniones, en actas claras</h2>
          <p>Menos tiempo redactando y más tiempo acompañando a tus clientes. Temas, acuerdos y compromisos listos para enviar.</p>
        </div>
        <div className="tag"><YoTeAyudo size={20} /></div>
      </section>
      <section className="side-form">
        <div className="panel">
          <div className="eyebrow">Generador de actas</div>
          <h1>Entra con tu correo</h1>
          <p>{loginMode === "code" ? "Te enviaremos un código a tu correo de GeoVictoria para entrar." : "Usa tu correo de GeoVictoria. Así vemos solo tus reuniones."}</p>
          {error && <div className="notice err" role="alert" style={{ marginBottom: 16, textAlign: "left" }}>{error}</div>}
          <LoginButtons providers={providers} domains={domains} mode={loginMode} keyRequired={accessKeyRequired()} />
        </div>
      </section>
    </main>
  );
}
