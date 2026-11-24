"use client";
import { useCallback, useEffect, useState } from "react";

/** Estado de las conexiones de la persona: Samu.ai (reuniones) y Zoho (CSS Tareas). */
export type Conn = { samu: boolean | null; zoho: boolean | null; zohoMode: "user" | "team" | "off" | null };

export function useConnections() {
  const [c, setC] = useState<Conn>({ samu: null, zoho: null, zohoMode: null });

  const refresh = useCallback(async () => {
    const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [s, z] = await Promise.all([get("/api/samu/status"), get("/api/zoho/status")]);
    setC({ samu: s ? !!s.connected : null, zoho: z ? !!z.connected : null, zohoMode: z?.mode ?? null });
  }, []);

  useEffect(() => {
    refresh();
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.gvZoho === true) refresh(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refresh]);

  return { ...c, refresh };
}

/** Zoho se autoriza en una ventana aparte para no perder lo que hay en pantalla. */
export function connectZoho() {
  const w = window.open("/api/zoho/connect", "gv-zoho", "width=520,height=720");
  if (!w) window.location.href = "/api/zoho/connect";
}
