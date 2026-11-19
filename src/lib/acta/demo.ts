import type { ActaDraft } from "./verify";

/**
 * Borrador de demostración para la transcripción ficticia de samu.mock.ts.
 * Se usa solo sin ANTHROPIC_API_KEY y con Samu en modo demo, para recorrer la app sin credenciales.
 * Incluye a propósito datos NO respaldados (un asistente, un rol, una fecha y un acuerdo) para ver el verificador.
 */
export function demoDraft(userName: string, client: string): ActaDraft {
  const y = new Date().getFullYear();
  return {
    tipo: "Acta de seguimiento",
    tema: "Marcación en bodegas",
    cliente: client || "Logística Andina",
    objetivo: "Revisar el estado de la marcación en las bodegas de Pudahuel y Quilicura y acordar los próximos pasos.",
    asistentesCliente: [
      { nombre: "Carolina Rojas", rol: "Recursos Humanos" },
      { nombre: "Matías Pérez", rol: "Operación de bodegas" },
      { nombre: "Pedro Soto", rol: "Gerente general" },
    ],
    asistentesGeoVictoria: [{ nombre: userName, rol: "CAM de la cuenta" }],
    temas: [
      { texto: "Marcación con app en Pudahuel", evidencia: "en la bodega de Pudahuel ya marcan todos con la app" },
      { texto: "Conexión del reloj biométrico en Quilicura", evidencia: "el equipo pierde la red en las tardes" },
      { texto: "Capacitación a supervisores en horas extra", evidencia: "queremos capacitar a los supervisores en el reporte de horas extra" },
    ],
    acuerdos: [
      { compromiso: "Enviar manual de configuración de red del reloj", responsable: userName.split(" ")[0], fecha: "Por definir", evidencia: "Yo me comprometo a enviarles el manual de configuración de red del reloj" },
      { compromiso: "Agendar visita técnica a Quilicura", responsable: userName.split(" ")[0], fecha: `20/11/${y}`, evidencia: "lo dejamos agendado antes del 20 de noviembre" },
      { compromiso: "Actualizar la nómina de Quilicura en la plataforma", responsable: "Matías", fecha: "Por definir", evidencia: "yo actualizo la nómina de trabajadores de Quilicura en la plataforma el martes" },
      { compromiso: "Enviar factura corregida", responsable: "Pedro Soto", fecha: `28/11/${y}`, evidencia: "enviaremos la factura corregida el viernes" },
    ],
    advertencias: [],
  };
}
