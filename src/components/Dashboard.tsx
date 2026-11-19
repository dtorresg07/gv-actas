"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MeetingSummary } from "@/lib/types";
import { Calendar, Clock } from "./Icons";

const POLL_MS = 90_000;

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function Dashboard() {
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [syncedAt, setSyncedAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyClients, setOnlyClients] = useState(true);
  const [needsSamu, setNeedsSamu] = useState(false);
  const [mode, setMode] = useState<string>("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Mensaje al volver de Samu (?samu=...)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("samu");
    if (!q) return;
    const texts: Record<string, { ok: boolean; text: string }> = {
      conectado: { ok: true, text: "Listo, tu cuenta de Samu quedó conectada." },
      cancelado: { ok: false, text: "Cancelaste la conexión con Samu. Puedes intentarlo cuando quieras." },
      vencido: { ok: false, text: "La conexión tardó demasiado. Vuelve a tocar “Conectar mi Samu”." },
      "no-configurado": { ok: false, text: "La conexión con Samu aún no está configurada en el servidor. Avisa a quien administra la herramienta." },
    };
    setNotice(texts[q] ?? { ok: false, text: "No pudimos conectar tu cuenta de Samu. Intenta de nuevo en un minuto." });
    window.history.replaceState(null, "", "/");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings", { cache: "no-store" });
      if (res.status === 401) return void (window.location.href = "/login");
      const data = await res.json();
      if (res.status === 409 && data.code === "samu_not_connected") { setNeedsSamu(true); setMeetings([]); setError(null); return; }
      if (!res.ok) throw new Error(data.error);
      setNeedsSamu(false); setMode(data.mode ?? "");
      setMeetings(data.meetings); setDemo(data.demo); setSyncedAt(data.syncedAt); setError(null);
    } catch (e) {
      setError((e as Error).message || "No pudimos conectar con Samu.ai. Reintentamos en un minuto.");
      setMeetings((m) => m ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function disconnect() {
    await fetch("/api/samu/disconnect", { method: "POST" }).catch(() => undefined);
    setNotice({ ok: true, text: "Desconectaste tu cuenta de Samu." });
    load();
  }

  if (needsSamu) {
    return (
      <>
        {notice && <div className={`notice ${notice.ok ? "ok" : "err"}`} role="status" style={{ marginBottom: 16 }}>{notice.text}</div>}
        <div className="card connect-card">
          <img src="/brand/iso-color.svg" alt="" width={48} height={48} />
          <h2>Conecta tu cuenta de Samu</h2>
          <p>Para generar actas necesitamos leer tus reuniones grabadas en Samu.ai. Te llevaremos a Samu para que inicies sesión y autorices el acceso. Solo verás las reuniones que tu cuenta de Samu ya te permite ver.</p>
          <a className="btn btn-primary btn-lg" href="/api/samu/connect">Conectar mi Samu</a>
          <p className="muted">Solo lectura: la herramienta no modifica nada en Samu. Puedes desconectarla cuando quieras.</p>
        </div>
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const all = meetings ?? [];
  const list = all.filter((m) => (!onlyClients || !m.internal) && (!q || `${m.title} ${m.client} ${m.host ?? ""}`.toLowerCase().includes(q)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tus reuniones recientes</h1>
          <p>Elige una reunión y genera su acta en segundos.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {demo ? <span className="badge demo">Datos de demostración</span> : syncedAt && !error ? <span className="badge live">Sincronizado con Samu.ai</span> : null}
          {syncedAt && <span className="muted">Actualizado {new Date(syncedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button className="btn btn-secondary btn-sm" onClick={load}>Actualizar</button>
          {mode === "user" && <button className="btn btn-secondary btn-sm" onClick={disconnect}>Desconectar Samu</button>}
        </div>
      </div>

      <div className="filters">
        <input className="search" placeholder="Buscar por cliente, reunión o anfitrión" aria-label="Buscar reuniones" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="seg" role="group" aria-label="Filtrar reuniones">
          <button aria-pressed={onlyClients} onClick={() => setOnlyClients(true)}>Con clientes</button>
          <button aria-pressed={!onlyClients} onClick={() => setOnlyClients(false)}>Todas</button>
        </div>
      </div>

      {notice && <div className={`notice ${notice.ok ? "ok" : "err"}`} role="status" style={{ marginBottom: 16 }}>{notice.text}</div>}
      {error && <div className="notice err" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {meetings === null ? (
        <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>
      ) : list.length === 0 ? (
        <div className="card center">
          <h3>{q ? "Sin resultados para tu búsqueda" : onlyClients && all.length ? "No tienes reuniones con clientes en este periodo" : "Aún no tienes reuniones grabadas"}</h3>
          <p className="muted">{q ? "Prueba con otro nombre de cliente." : "Cuando Samu.ai grabe una reunión donde participes, aparecerá aquí sola."}</p>
          {onlyClients && !q && all.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setOnlyClients(false)}>Ver también reuniones internas</button>}
        </div>
      ) : (
        <div className="grid">{list.map((m) => <MeetingCard key={m.id} m={m} />)}</div>
      )}
    </>
  );
}

function MeetingCard({ m }: { m: MeetingSummary }) {
  const shown = m.people.slice(0, 5);
  const extra = m.people.length - shown.length;
  return (
    <article className="card">
      <div>
        <div className={`client ${m.internal ? "internal" : ""}`}>{m.internal ? "Reunión interna" : m.client}</div>
        <h3>{m.title}</h3>
      </div>
      <div className="meta">
        <span className="ic"><Calendar /> {fmt(m.date)}</span>
        {m.durationMin ? <span className="ic"><Clock /> {m.durationMin} min</span> : null}
      </div>
      <div>
        <div className="muted" style={{ marginBottom: 6 }}>Asistentes detectados</div>
        <div className="chips">
          {shown.map((p) => <span key={p.name} className={`chip ${p.gv ? "gv" : ""}`} title={p.email}>{p.name}</span>)}
          {extra > 0 && <span className="chip">+{extra}</span>}
          {m.people.length === 0 && (m.emails.length
            ? m.emails.slice(0, 4).map((e) => <span key={e} className="chip">{e}</span>)
            : <span className="muted">Sin asistentes detectados</span>)}
        </div>
      </div>
      <div className="actions">
        <Link href={`/acta/${m.id}`} className="btn btn-primary btn-lg">Generar Acta</Link>
      </div>
    </article>
  );
}
