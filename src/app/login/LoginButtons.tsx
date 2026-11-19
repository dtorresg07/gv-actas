"use client";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

const SSO_LABELS: Record<string, string> = { "azure-ad": "Ingresar con Microsoft", google: "Ingresar con Google" };
const ERRORS: Record<string, string> = {
  CodigoInvalido: "El código no es correcto. Revísalo e intenta de nuevo.",
  CodigoVencido: "El código venció o ya se usó. Pide uno nuevo.",
  DemasiadosIntentos: "Demasiados intentos con ese código. Pide uno nuevo.",
};

export function LoginButtons({ providers, domains }: { providers: { id: string; name: string }[]; domains: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const sso = providers.filter((p) => SSO_LABELS[p.id]);
  const dev = providers.some((p) => p.id === "dev");

  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/auth/code/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No pudimos enviar el código.");
      setStep("code"); setCode("");
      setMsg({ ok: true, text: `Te enviamos un código a ${email.trim().toLowerCase()}. Si no lo ves en un minuto, revisa Correo no deseado.` });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await signIn("email-code", { email: email.trim().toLowerCase(), code, name, redirect: false });
    if (res?.ok && !res.error) { window.location.href = "/"; return; }
    setBusy(false);
    setMsg({ ok: false, text: ERRORS[res?.error ?? ""] ?? "No pudimos verificar el código. Intenta de nuevo." });
  }

  return (
    <div className="stack" style={{ textAlign: "left" }}>
      {step === "email" ? (
        <form className="stack" onSubmit={requestCode}>
          <label className="fl" htmlFor="login-email">Correo corporativo</label>
          <input className="input" id="login-email" type="email" autoComplete="email" required placeholder="nombre@geovictoria.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="fl" htmlFor="login-name">Tu nombre <span className="muted">(como aparecerá en las actas)</span></label>
          <input className="input" id="login-name" type="text" autoComplete="name" placeholder="Nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviarme un código"}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <label className="fl" htmlFor="login-code">Código de 6 dígitos</label>
          <input
            ref={codeRef} className="input code-input" id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
            placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verificando…" : "Entrar"}</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="link-btn" onClick={() => { setStep("email"); setMsg(null); }}>Cambiar correo</button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => requestCode()}>Reenviar código</button>
          </div>
        </form>
      )}

      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <p className="muted" style={{ margin: 0, textAlign: "center" }}>Solo se aceptan correos {domains}.</p>

      {sso.length > 0 && (
        <>
          <div className="divider"><span>o</span></div>
          {sso.map((p) => (
            <button key={p.id} className="btn btn-secondary btn-lg" onClick={() => signIn(p.id, { callbackUrl: "/" })}>{SSO_LABELS[p.id]}</button>
          ))}
        </>
      )}

      {dev && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>Acceso de desarrollo (solo local)</summary>
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => signIn("dev", { name: name || "Desarrollo", email, callbackUrl: "/" })}>Entrar sin código</button>
        </details>
      )}
    </div>
  );
}
