"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Acta, Acuerdo, Asistente, MeetingSummary } from "@/lib/types";
import { Alert, Download, Send, X } from "./Icons";

type CrmResult = { externalId: string; status: string; id?: string; detalle?: string };

const TIPOS = ["Acta de capacitación", "Acta de reunión", "Acta de seguimiento", "Acta de implementación", "Acta de kickoff"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const longDate = (dmy: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  return m ? `${Number(m[1])} de ${MESES[Number(m[2]) - 1]} de ${m[3]}` : dmy;
};
const STEPS = ["Leyendo la transcripción de Samu.ai", "Identificando temas y acuerdos", "Verificando cada dato contra la reunión"];

/** Quita filas vacías antes de exportar o enviar al CRM. */
const clean = (a: Acta): Acta => ({
  ...a,
  asistentesCliente: a.asistentesCliente.filter((p) => p.nombre.trim()),
  asistentesGV: a.asistentesGV.filter((p) => p.nombre.trim()),
  temas: a.temas.filter((t) => t.texto.trim()),
  acuerdos: a.acuerdos.filter((t) => t.compromiso.trim()),
});

export function ActaEditor({ meetingId, user }: { meetingId: string; user: { name: string; email: string } }) {
  const [acta, setActa] = useState<Acta | null>(null);
  const [meeting, setMeeting] = useState<MeetingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setActa(null); setError(null); setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3000);
    fetch("/api/actas/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId }) })
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return; }
        const data = await r.json();
        if (r.status === 409 && data.code === "samu_not_connected") { window.location.href = "/"; return; }
        if (!r.ok) throw new Error(data.error ?? "No pudimos generar el acta.");
        if (alive) { setActa(data.acta); setMeeting(data.meeting); }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => clearInterval(timer));
    return () => { alive = false; clearInterval(timer); };
  }, [meetingId, nonce]);

  if (error) {
    return (
      <div className="card center">
        <h3>No pudimos generar el acta</h3>
        <p className="muted">{error}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setNonce((n) => n + 1)}>Reintentar</button>
          <Link className="btn btn-secondary" href="/">Volver a mis reuniones</Link>
        </div>
      </div>
    );
  }

  if (!acta || !meeting) {
    return (
      <div className="card center" aria-live="polite">
        <div className="spinner" />
        <h3>Generando tu acta</h3>
        <ul className="steps">
          {STEPS.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "on" : ""}>{i < step ? "✓" : i === step ? "•" : "○"} {s}</li>)}
        </ul>
      </div>
    );
  }

  return <Editor initial={acta} meeting={meeting} user={user} onRegenerate={() => setNonce((n) => n + 1)} />;
}

function Editor({ initial, meeting, user, onRegenerate }: { initial: Acta; meeting: MeetingSummary; user: { name: string; email: string }; onRegenerate: () => void }) {
  const [a, setA] = useState<Acta>(initial);
  const [showEv, setShowEv] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const set = <K extends keyof Acta>(k: K, v: Acta[K]) => setA((x) => ({ ...x, [k]: v }));
  const setPerson = (key: "asistentesCliente" | "asistentesGV", i: number, patch: Partial<Asistente>) =>
    setA((x) => ({ ...x, [key]: x[key].map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setAcuerdo = (i: number, patch: Partial<Acuerdo>) =>
    setA((x) => ({ ...x, acuerdos: x.acuerdos.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const emailFor = (name: string) => {
    const p = meeting.people.find((x) => x.name === name || x.name.toLowerCase().startsWith(name.toLowerCase() + " "));
    if (p?.email) return p.email;
    return user.name.toLowerCase().startsWith(name.toLowerCase()) ? user.email : undefined;
  };
  const respOptions = (cur: string) =>
    [...new Set([...a.asistentesCliente, ...a.asistentesGV].map((p) => p.nombre).filter(Boolean)
      .concat([a.cliente, `${a.cliente} + GeoVictoria`, "GeoVictoria", "Por definir", cur]))].filter(Boolean);

  const unT = a.temas.filter((t) => !t.verificada).length;
  const unA = a.acuerdos.filter((t) => !t.verificada).length;

  const people = (key: "asistentesCliente" | "asistentesGV") => (
    <>
      {a[key].map((p, i) => (
        <div key={i} className="inline nowrap">
          <input className="f" style={{ flex: "1 1 45%" }} value={p.nombre} onChange={(e) => setPerson(key, i, { nombre: e.target.value })} aria-label="Nombre" />
          <span>–</span>
          <input className="f" style={{ flex: "1 1 55%" }} value={p.rol} placeholder="Rol" onChange={(e) => setPerson(key, i, { rol: e.target.value })} aria-label="Rol" />
          <button className="x" title="Quitar" onClick={() => set(key, a[key].filter((_, j) => j !== i))}><X /></button>
        </div>
      ))}
      <button className="link-btn small" onClick={() => set(key, [...a[key], { nombre: "", rol: "" }])}>+ Agregar</button>
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="muted">← Mis reuniones</Link>
          <h1>{meeting.title}</h1>
          <p>Revisa y ajusta el borrador antes de enviarlo al cliente. Todo se edita con un clic.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {meeting.link && <a className="btn btn-secondary btn-sm" href={meeting.link} target="_blank" rel="noopener noreferrer">Ver en Samu.ai</a>}
          <label className="check"><input type="checkbox" checked={showEv} onChange={(e) => setShowEv(e.target.checked)} /> Mostrar citas de respaldo</label>
        </div>
      </div>

      <div className="editor">
        <div className="paper-scroll">
          <section className="acta" aria-label="Acta">
            <div className="a-head">
              <img className="a-logo" src="/brand/logo-full-color.svg" alt="GeoVictoria" />
              <div className="a-meta">
                <select className="f a-tipo" value={a.tipo} onChange={(e) => set("tipo", e.target.value)} aria-label="Tipo de acta">
                  {[...new Set([...TIPOS, a.tipo])].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className="f a-title" value={a.titulo} onChange={(e) => set("titulo", e.target.value)} aria-label="Título" />
                <div className="a-sub">
                  <input className="f" style={{ width: 110, textAlign: "right" }} value={a.pais} placeholder="País" onChange={(e) => set("pais", e.target.value)} aria-label="País" /> ·
                  <input className="f" style={{ width: 96 }} value={a.fecha} onChange={(e) => set("fecha", e.target.value)} aria-label="Fecha (DD/MM/AAAA)" />
                  <span>{longDate(a.fecha)}</span>
                </div>
              </div>
            </div>
            <div className="a-line y" /><div className="a-line c" />

            <div className="a-obj-l">Objetivo de la sesión</div>
            <textarea className="f" rows={2} value={a.objetivo} onChange={(e) => set("objetivo", e.target.value)} aria-label="Objetivo" />
            <div className="a-rule" />

            <div className="a-cols">
              <div>
                <div className="a-lbl">Asistentes <input className="f a-lbl-in" value={a.cliente} onChange={(e) => set("cliente", e.target.value)} aria-label="Nombre del cliente" /></div>
                {people("asistentesCliente")}
              </div>
              <div><div className="a-lbl">Asistentes GeoVictoria</div>{people("asistentesGV")}</div>
            </div>
            <div className="a-rule" />

            <div className="a-lbl">Temas tratados</div>
            <ul className="a-list">
              {a.temas.map((t, i) => (
                <li key={i} className={t.verificada ? "" : "unverified"}>
                  <div className="inline nowrap">
                    <input className="f" value={t.texto} onChange={(e) => set("temas", a.temas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} aria-label={`Tema ${i + 1}`} />
                    <button className="x" title="Quitar" onClick={() => set("temas", a.temas.filter((_, j) => j !== i))}><X /></button>
                  </div>
                  {!t.verificada && (
                    <div className="warnline"><Alert /><span>No encontramos este tema en la transcripción. <button className="link-btn small" onClick={() => set("temas", a.temas.map((x, j) => (j === i ? { ...x, verificada: true } : x)))}>Lo revisé, es correcto</button></span></div>
                  )}
                  {showEv && t.evidencia && <div className="ev">“{t.evidencia}”</div>}
                </li>
              ))}
            </ul>
            <button className="link-btn small" onClick={() => set("temas", [...a.temas, { texto: "", evidencia: `Agregado a mano por ${user.name}`, verificada: true }])}>+ Agregar tema</button>
            <textarea className="f" rows={1} value={a.cierre} placeholder="Nota de cierre (opcional)" onChange={(e) => set("cierre", e.target.value)} aria-label="Nota de cierre" />
            <div className="a-rule" />

            <div className="a-lbl">Acuerdos y próximos pasos</div>
            <table className="a-table">
              <thead><tr><th style={{ width: "56%" }}>Compromiso</th><th style={{ width: "26%" }}>Responsable</th><th>Fecha</th></tr></thead>
              <tbody>
                {a.acuerdos.map((t, i) => (
                  <tr key={t.id} className={t.verificada ? "" : "unverified"}>
                    <td>
                      <textarea className="f" rows={1} value={t.compromiso} onChange={(e) => setAcuerdo(i, { compromiso: e.target.value })} aria-label="Compromiso" />
                      {!t.verificada && (
                        <>
                          {t.advertencias.map((w, k) => <div key={k} className="warnline"><Alert /><span>{w}</span></div>)}
                          <button className="link-btn small" onClick={() => setAcuerdo(i, { verificada: true, advertencias: [] })}>Lo revisé, es correcto</button>
                        </>
                      )}
                      {showEv && t.evidencia && <div className="ev">“{t.evidencia}”</div>}
                    </td>
                    <td>
                      <select className="f" value={t.responsable} onChange={(e) => setAcuerdo(i, { responsable: e.target.value, responsableEmail: emailFor(e.target.value) })} aria-label="Responsable">
                        {respOptions(t.responsable).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="inline nowrap">
                        <input className="f" value={t.fecha} placeholder="DD/MM/AAAA" onChange={(e) => setAcuerdo(i, { fecha: e.target.value })} aria-label="Fecha" />
                        <button className="x" title="Quitar acuerdo" onClick={() => set("acuerdos", a.acuerdos.filter((_, j) => j !== i))}><X /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {a.acuerdos.length === 0 && <tr><td colSpan={3} className="ev">No se registraron acuerdos.</td></tr>}
              </tbody>
            </table>
            <button
              className="link-btn small"
              onClick={() => {
                const n = Math.max(0, ...a.acuerdos.map((t) => Number(t.id.slice(1)) || 0)) + 1;
                set("acuerdos", [...a.acuerdos, { id: `A${n}`, compromiso: "", responsable: "Por definir", fecha: "Por definir", evidencia: `Agregado a mano por ${user.name}`, verificada: true, advertencias: [] }]);
              }}
            >+ Agregar acuerdo</button>
            <div className="a-foot">GeoVictoria · {a.tipo} · {longDate(a.fecha)}</div>
          </section>
        </div>

        <aside className="side">
          {a.advertencias.length > 0 || unT + unA > 0 ? (
            <div className="notice warn">
              <b>Revisa antes de enviar</b>
              <ul>
                {unT > 0 && <li>{unT} tema(s) sin respaldo.</li>}
                {unA > 0 && <li>{unA} acuerdo(s) con observaciones.</li>}
                {a.advertencias.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : <div className="notice ok">Todo el contenido tiene respaldo en la transcripción.</div>}
          <ExportCard acta={a} />
          <CrmCard acta={a} />
          {confirmRegen ? (
            <div className="notice warn">
              <b>¿Generar de nuevo?</b> Perderás los cambios que hiciste.
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { setConfirmRegen(false); onRegenerate(); }}>Sí, generar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRegen(false)}>Cancelar</button>
              </div>
            </div>
          ) : <button className="btn btn-secondary" onClick={() => setConfirmRegen(true)}>Generar de nuevo</button>}
        </aside>
      </div>
    </>
  );
}

function ExportCard({ acta }: { acta: Acta }) {
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function download(format: "docx" | "pdf") {
    setBusy(format); setErr(null);
    try {
      const res = await fetch("/api/actas/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, acta: clean(acta) }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No pudimos exportar el acta.");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `acta.${format}`;
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h4>Descargar acta</h4>
      <p className="muted" style={{ margin: 0 }}>Formato GeoVictoria en Nunito, listo para revisión antes de enviarlo al cliente.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={!!busy} onClick={() => download("docx")}><Download /> {busy === "docx" ? "Generando…" : "Word"}</button>
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={!!busy} onClick={() => download("pdf")}><Download /> {busy === "pdf" ? "Generando…" : "PDF"}</button>
      </div>
      {err && <div className="notice err">{err}</div>}
    </div>
  );
}

function CrmCard({ acta }: { acta: Acta }) {
  const valid = useMemo(() => acta.acuerdos.filter((t) => t.compromiso.trim()), [acta.acuerdos]);
  const [selected, setSelected] = useState<string[]>(() => acta.acuerdos.map((t) => t.id));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<CrmResult[] | null>(null);
  const [matriz, setMatriz] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  const ids = selected.filter((id) => valid.some((t) => t.id === id));
  const blocked = valid.filter((t) => ids.includes(t.id) && !t.verificada);

  async function send(preview: boolean) {
    setBusy(true); setErr(null); setConfirm(false);
    try {
      const res = await fetch("/api/crm/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acta: clean(acta), taskIds: ids, preview }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMatriz(data.matriz);
      if (!preview) setResults(data.resultados);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (valid.length === 0) return null;
  const label = (s: string) => (s === "creada" ? "creada en Zoho" : s === "omitida" ? "ya existía" : s === "simulada" ? "simulada (modo prueba)" : "error");

  return (
    <div className="card">
      <h4>Crear tareas en Zoho CRM</h4>
      <p className="muted" style={{ margin: 0 }}>Los acuerdos de GeoVictoria quedan a nombre de su responsable. Los del cliente quedan a tu nombre para que hagas el seguimiento.</p>
      <div className="stack">
        {valid.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" disabled={!!results} checked={selected.includes(t.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))} />
            <span>{t.compromiso} <span className="muted">· {t.responsable}</span>{!t.verificada && <span style={{ color: "var(--warn-fg)" }}> · por revisar</span>}</span>
          </label>
        ))}
      </div>
      {blocked.length > 0 && <div className="notice warn">Marca como revisados los acuerdos “por revisar” antes de enviarlos.</div>}
      {confirm ? (
        <div className="notice warn">
          <b>¿Crear {ids.length} tarea(s) en Zoho CRM?</b>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => send(false)}>Sí, crear</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !ids.length} onClick={() => send(true)}>Ver matriz</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy || !ids.length || blocked.length > 0 || !!results} onClick={() => setConfirm(true)}>
            <Send /> {busy ? "Enviando…" : results ? "Enviadas" : `Enviar ${ids.length} tarea(s)`}
          </button>
        </div>
      )}
      {err && <div className="notice err">{err}</div>}
      {results && (
        <div className={`notice ${results.every((r) => r.status !== "error") ? "ok" : "warn"}`}>
          <ul>{results.map((r) => <li key={r.externalId}>{r.externalId.split(":")[1]}: {label(r.status)}{r.detalle && r.status === "error" ? ` (${r.detalle})` : ""}</li>)}</ul>
        </div>
      )}
      {matriz !== null && (
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>Matriz de tareas (JSON para API)</summary>
          <pre className="json">{JSON.stringify(matriz, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
