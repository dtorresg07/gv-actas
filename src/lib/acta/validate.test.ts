import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEvidence, matchPerson, dateSupported, kam, wordsMentioned, normalize, longDate } from "./validate.ts";
import { verifyDraft, applyTerms } from "./verify.ts";
import type { MeetingSummary, TranscriptLine } from "../types.ts";

const lines = [
  "Ok. Yo me comprometo a enviarles el manual de configuración de red del reloj.",
  "Sí, lo dejamos agendado antes del 20 de noviembre.",
  "Armo los grupos de prueba entre hoy y el martes con Ana.",
];

test("cita exacta (ignora tildes y signos) y cita inventada", () => {
  assert.equal(checkEvidence("me comprometo a enviarles el manual de configuracion de red", lines), true);
  assert.equal(checkEvidence("enviaremos la factura corregida el lunes", lines), false);
});

test("responsable por nombre de pila, completo o inexistente", () => {
  const people = [{ name: "Carolina Rojas" }, { name: "Matías Pérez" }];
  assert.equal(matchPerson("@Carolina Rojas", people)?.name, "Carolina Rojas");
  assert.equal(matchPerson("Matias", people)?.name, "Matías Pérez");
  assert.equal(matchPerson("Pedro Soto", people), null);
});

test("fechas: explícita, por día de la semana y no mencionada", () => {
  const t = lines.join("\n");
  // Reunión el viernes 13/11/2026: "el martes" = 17/11/2026
  assert.equal(dateSupported("20/11/2026", "", t, "13/11/2026"), true);
  assert.equal(dateSupported("17/11/2026", "entre hoy y el martes", t, "13/11/2026"), true);
  assert.equal(dateSupported("18/11/2026", "", t, "13/11/2026"), false);
  assert.equal(dateSupported("25/11/2026", "", t, "13/11/2026"), false);
});

test("roles mencionados y KAM", () => {
  assert.equal(wordsMentioned("Gestión Humana", normalize("habla gestion humana")), true);
  assert.equal(wordsMentioned("Gerente general", normalize("hablamos del reloj")), false);
  assert.equal(kam("Juan David Cañas – CAM de la cuenta"), "Juan David Cañas – KAM de la cuenta");
  assert.equal(kam("Consultar con el CAM"), "Consultar con el KAM");
  assert.equal(kam("Camila revisa la cámara"), "Camila revisa la cámara");
  assert.equal(longDate("13/11/2026"), "13 de noviembre de 2026");
});

test("verifyDraft: quita lo inventado y marca lo dudoso", () => {
  const m: MeetingSummary = {
    id: "65a1f0c2b3d4e5f6a7b8c9d0", title: "Capacitación", date: "2026-11-13T16:00:00Z", durationMin: 50, emails: ["dtorresg@geovictoria.com"],
    people: [{ name: "Daniela Torres Garzón", gv: true, email: "dtorresg@geovictoria.com" }, { name: "Katerinne", gv: false }, { name: "Juan David Cañas", gv: true }],
    client: "Baco", internal: false, country: "Colombia", platformShort: "Teams",
  };
  const tl: TranscriptLine[] = [
    { t: "00:00:01", speaker: "Juan David Cañas", text: "Soy el CAM de la cuenta, veamos la planificación de turnos con el planificador inteligente." },
    { t: "00:01:00", speaker: "Katerinne", text: "Desde gestión humana armo los grupos de prueba entre hoy y el martes con Ana en San Roque." },
    { t: "00:02:00", speaker: "Daniela Torres Garzón", text: "Perfecto, yo les comparto el acta de la sesión y quedo atenta a cualquier error que encuentren." },
  ];
  const acta = applyTerms(verifyDraft({
    tipo: "Acta de capacitación", tema: "Planificación de turnos", cliente: "Bacu Foods", objetivo: "Capacitar en planificación.",
    asistentesCliente: [{ nombre: "Katerinne", rol: "Gestión Humana" }, { nombre: "Laura Fantasma", rol: "Directora" }],
    asistentesGeoVictoria: [{ nombre: "Juan David Cañas", rol: "CAM de la cuenta" }, { nombre: "Daniela Torres Garzón", rol: "Gerente regional" }],
    temas: [{ texto: "Planificador Inteligente", evidencia: "veamos la planificación de turnos con el planificador inteligente" }],
    acuerdos: [
      { compromiso: "Configurar prueba piloto en San Roque", responsable: "Katerinne", fecha: "17/11/2026", evidencia: "armo los grupos de prueba entre hoy y el martes con Ana en San Roque" },
      { compromiso: "Compartir el acta", responsable: "Daniela", fecha: "Por definir", evidencia: "yo les comparto el acta de la sesión" },
      { compromiso: "Socializar la App Supervisor", responsable: "Gestión Humana", fecha: "Por definir", evidencia: "Desde gestión humana armo los grupos de prueba" },
      { compromiso: "Pagar la factura", responsable: "Laura Fantasma", fecha: "30/11/2026", evidencia: "pagamos la factura el lunes" },
    ],
    advertencias: [],
  }, m, tl, "13/11/2026", { name: "Daniela Torres Garzón", email: "dtorresg@geovictoria.com" }));

  assert.equal(acta.titulo, "Planificación de turnos – Bacu Foods");
  assert.deepEqual(acta.asistentesCliente.map((p) => p.nombre), ["Katerinne"]);
  assert.equal(acta.asistentesGV.find((p) => p.nombre === "Juan David Cañas")?.rol, "KAM de la cuenta");
  assert.equal(acta.asistentesGV.find((p) => p.nombre.startsWith("Daniela"))?.rol, "", "rol no mencionado se quita");
  assert.equal(acta.acuerdos[0].fecha, "17/11/2026");
  assert.equal(acta.acuerdos[0].verificada, true);
  assert.equal(acta.acuerdos[1].responsableEmail, "dtorresg@geovictoria.com");
  assert.equal(acta.acuerdos[2].responsable, "Gestión Humana");
  assert.equal(acta.acuerdos[3].responsable, "Por definir");
  assert.equal(acta.acuerdos[3].fecha, "Por definir");
  assert.equal(acta.acuerdos[3].verificada, false);
  assert.equal(acta.cierre.endsWith("en Teams."), true);
});
