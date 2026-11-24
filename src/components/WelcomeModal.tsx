"use client";
import { useEffect, useRef, useState } from "react";
import { randomPhrase } from "@/lib/phrases";
import { connectZoho, useConnections } from "./useConnections";
import { YoTeAyudo } from "./YoTeAyudo";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Tarjeta de bienvenida: saluda a la persona en cada inicio de sesión y, antes que nada,
 * le pide conectar Samu.ai (sus reuniones) y Zoho (CSS Tareas).
 * Vuelve a abrirse al regresar de Samu si aún falta conectar Zoho.
 */
export function WelcomeModal({ name, loginAt }: { name: string; loginAt: number }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hello, setHello] = useState("Hola");
  const conn = useConnections();
  const box = useRef<HTMLDivElement>(null);
  const key = `gv-actas-welcome-${loginAt}`;

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch { /* almacenamiento bloqueado */ }
    const backFromSamu = new URLSearchParams(window.location.search).has("samu");
    if (!seen || backFromSamu) { setPhrase(randomPhrase()); setHello(greeting()); setOpen(true); }
  }, [key]);

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
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
  const showZoho = conn.zohoMode === "user";
  const samuDone = conn.samu === true;
  const zohoDone = !showZoho || conn.zoho === true;
  const allDone = samuDone && zohoDone;
  const next = !samuDone ? "samu" : !zohoDone ? "zoho" : null; // solo el siguiente paso va en amarillo

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" ref={box} tabIndex={-1}>
        <div className="welcome-top">
          <span className="ring a" /><span className="ring b" />
          <img className="iso" src="/brand/iso-white.svg" alt="" />
          <div className="hi">{hello}</div>
          <h2 id="welcome-title">Hola, {firstName}</h2>
        </div>
        <div className="welcome-body">
          <blockquote className="quote">{phrase}</blockquote>

          <div className="setup">
            <p className="setup-title">{allDone ? "Todo listo para generar tus actas" : "Antes de empezar, conecta tus cuentas"}</p>
            <div className={`setup-step ${samuDone ? "done" : ""}`}>
              <span className="num">{samuDone ? "✓" : "1"}</span>
              <span className="txt"><b>Samu.ai</b><small>{samuDone ? "Conectado. Ya vemos tus reuniones grabadas." : "Para leer tus reuniones grabadas."}</small></span>
              {!samuDone && conn.samu !== null && <a className={`btn btn-sm ${next === "samu" ? "btn-primary" : "btn-secondary"}`} href="/api/samu/connect">Conectar Samu</a>}
            </div>
            {showZoho && (
              <div className={`setup-step ${zohoDone ? "done" : ""}`}>
                <span className="num">{zohoDone ? "✓" : "2"}</span>
                <span className="txt"><b>Zoho CRM</b><small>{zohoDone ? "Conectado. Tus compromisos irán a CSS Tareas." : "Para crear tus compromisos en CSS Tareas."}</small></span>
                {!zohoDone && <button className={`btn btn-sm ${next === "zoho" ? "btn-primary" : "btn-secondary"}`} onClick={connectZoho}>Conectar Zoho</button>}
              </div>
            )}
          </div>

          <div className="welcome-foot">
            <YoTeAyudo />
            <button className={`btn ${allDone ? "btn-primary btn-lg" : "btn-ghost"}`} onClick={close}>{allDone ? "Ver mis reuniones" : "Lo hago después"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
