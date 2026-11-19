"use client";
import { useEffect, useRef, useState } from "react";
import { randomPhrase } from "@/lib/phrases";

/**
 * Pop-up de bienvenida. Aparece una vez por cada inicio de sesión:
 * la clave es el instante de login del token (loginAt), así que no reaparece al navegar
 * pero sí después de cerrar y volver a iniciar sesión.
 */
export function WelcomeModal({ name, loginAt }: { name: string; loginAt: number }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const key = `gv-actas-welcome-${loginAt}`;

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch { /* almacenamiento bloqueado */ }
    if (!seen) {
      setPhrase(randomPhrase());
      setOpen(true);
    }
  }, [key]);

  useEffect(() => {
    if (!open) return;
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    try { sessionStorage.setItem(key, "1"); } catch { /* ignorar */ }
    setOpen(false);
  }

  if (!open) return null;
  const firstName = name.split(" ")[0] || name;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <img className="iso" src="/brand/iso-color.svg" alt="" />
        <h2 id="welcome-title">¡Hola {firstName}, bienvenid@ a tu generador de actas GeoVictoria!</h2>
        <blockquote>{phrase}</blockquote>
        <button ref={btn} className="btn btn-primary btn-lg" onClick={close}>Ver mis reuniones</button>
      </div>
    </div>
  );
}
