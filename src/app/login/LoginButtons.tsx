"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

const LABELS: Record<string, string> = { "azure-ad": "Ingresar con Microsoft", google: "Ingresar con Google" };

export function LoginButtons({ providers }: { providers: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const sso = providers.filter((p) => p.id !== "dev");
  const dev = providers.some((p) => p.id === "dev");

  if (!providers.length) {
    return <div className="notice warn">No hay un proveedor SSO configurado. Revisa las variables AZURE_AD_* o GOOGLE_* del servidor.</div>;
  }

  return (
    <>
      {sso.map((p, i) => (
        <button key={p.id} className={`btn btn-lg ${i === 0 ? "btn-primary" : "btn-secondary"}`} onClick={() => signIn(p.id, { callbackUrl: "/" })}>
          {LABELS[p.id] ?? `Ingresar con ${p.name}`}
        </button>
      ))}
      {dev && (
        <form
          className="stack"
          style={{ marginTop: sso.length ? 16 : 0, textAlign: "left" }}
          onSubmit={(e) => { e.preventDefault(); signIn("dev", { name, email, callbackUrl: "/" }); }}
        >
          <div className="notice warn">Acceso de desarrollo activo. No usar en producción.</div>
          <input className="field" style={{ border: "1px solid var(--border)", padding: 10 }} placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" style={{ border: "1px solid var(--border)", padding: 10 }} type="email" required placeholder="tu.correo@geovictoria.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-secondary btn-lg" type="submit">Ingresar (desarrollo)</button>
        </form>
      )}
    </>
  );
}
