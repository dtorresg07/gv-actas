import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFromSamu, splitSections } from "./fromSamu.ts";
import { verifyDraft, applyTerms } from "./verify.ts";
import type { MeetingSummary } from "../types.ts";

// Datos ficticios con el mismo formato de resumen que entrega Samu.
const summary = `**Participantes y roles (participants_and_roles)**

- **Lucía:** representante de GeoVictoria; coordina la sesión.
- **Pedro:** jefe de operaciones del cliente, revisa turnos.
- **Laura:** mencionada como aprobadora; no consta que haya participado.

**Objetivo declarado de la reunión (objective)**

Capacitar al equipo en la planificación de turnos. Luego se revisó la carga masiva.

**Contenido de la conversación (conversation_content)**

1. **Planificador Inteligente:** se mostraron las vistas semanal y mensual.
2. **Carga masiva por Excel:** requiere códigos de turno.

**Avances y compromisos (advancements_and_commitments)**

- Se acordó probar la planificación primero en la sede norte.

**Acciones acordadas (agreed_actions)**

- **Pedro:** configurar los grupos de prueba en la sede norte; validar con el equipo.
- **Equipo administrativo/cliente:** definir quién tendrá permisos para modificar turnos.
- **Lucía/Geovictoria:** compartir el acta de la sesión con el CAM.`;

const m: MeetingSummary = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Capacitación Planificación Geo Victoria - Panadería Sol", date: "2026-11-13T16:00:00.000Z", durationMin: 50,
  callType: "Masterclass", emails: [], client: "PANSOL", internal: false, country: "Colombia", platformShort: "Teams",
  people: [{ name: "Lucía Gómez", gv: true }, { name: "Pedro Ruiz", gv: false }],
  samuSummary: summary,
  samuTasks: [{ description: "Compartir el acta de la sesión con el equipo.", dueAt: "2026-11-17T16:00:00.000Z" }],
};

test("secciones del resumen", () => {
  assert.deepEqual(splitSections(summary).map((s) => s.key), ["participants_and_roles", "objective", "conversation_content", "advancements_and_commitments", "agreed_actions"]);
});

test("acta desde el resumen de Samu", () => {
  const a = applyTerms(verifyDraft(draftFromSamu(m), m, [], "13/11/2026", { name: "Lucía Gómez", email: "lgomez@geovictoria.com" }, { source: "samu" }));
  assert.equal(a.tipo, "Acta de capacitación");
  assert.equal(a.titulo, "Capacitación Planificación – Panadería Sol");
  assert.equal(a.objetivo, "Capacitar al equipo en la planificación de turnos");
  assert.deepEqual(a.asistentesGV, [{ nombre: "Lucía Gómez", rol: "Representante de GeoVictoria" }]);
  assert.deepEqual(a.asistentesCliente, [{ nombre: "Pedro Ruiz", rol: "Jefe de operaciones del cliente" }], "Laura no participó");
  assert.deepEqual(a.temas.map((t) => t.texto), ["Planificador Inteligente: se mostraron las vistas semanal y mensual", "Carga masiva por Excel: requiere códigos de turno"]);
  assert.deepEqual(a.decisiones.map((t) => t.texto), ["Se acordó probar la planificación primero en la sede norte"]);
  assert.deepEqual(a.acuerdos.map((x) => [x.compromiso, x.responsable, x.fecha]), [
    ["Configurar los grupos de prueba en la sede norte", "Pedro", "Por definir"],
    ["Definir quién tendrá permisos para modificar turnos", "Panadería Sol", "Por definir"],
    ["Compartir el acta de la sesión con el KAM", "Lucía", "17/11/2026"],
  ]);
  assert.ok(a.acuerdos.every((x) => x.verificada));
});

test("sin secciones: usa las tareas de Samu", () => {
  const a = draftFromSamu({ ...m, title: "Daily", samuSummary: "Conversación breve sobre el viaje de un compañero.", samuTasks: [{ description: "Agendar la próxima reunión", dueAt: "2026-11-20T00:00:00Z" }] });
  assert.equal(a.acuerdos[0].compromiso, "Agendar la próxima reunión");
  assert.equal(a.acuerdos[0].fecha, "20/11/2026");
});

test("compromisos: una acción por fila, cortos; acuerdos desde el contenido", () => {
  const s = `**Contenido de la conversación (conversation_content)**

1. **Turnos nocturnos:** se revisó la planilla. Se acordó usar el turno de 22 a 6 en la planta sur.

**Acciones acordadas (agreed_actions)**

- **Lucía:** consultar con Soporte y el equipo de producto las alternativas de carga y preparar una propuesta de modelos para la planta sur y las sucursales del norte que se sumarán el próximo año.`;
  const a = draftFromSamu({ ...m, samuSummary: s, samuTasks: [] });
  assert.deepEqual(a.acuerdos.map((x) => x.compromiso), [
    "Consultar con Soporte y el equipo de producto las alternativas de carga",
    "Preparar una propuesta de modelos para la planta sur",
  ]);
  assert.deepEqual((a.decisiones ?? []).map((d) => d.texto), ["Se acordó usar el turno de 22 a 6 en la planta sur"]);
  assert.equal(a.temas[0].texto, "Turnos nocturnos: se revisó la planilla. Se acordó usar el turno de 22 a 6 en la planta sur");
});
