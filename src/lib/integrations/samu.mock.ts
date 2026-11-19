import type { MeetingSummary } from "../types";

/** Datos de demostración (SAMU_MOCK=true o sin SAMU_API_KEY). Empresas y personas ficticias. */
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export function mockMeetings(userEmail: string, userName = "Ejecutiva CS"): MeetingSummary[] {
  const me = { name: userName, email: userEmail.toLowerCase(), gv: true };
  return [
    {
      id: "65a1f0c2b3d4e5f6a7b8c9d0", title: "Seguimiento de implementación", date: ago(3), durationMin: 42, host: userName,
      callType: "Seguimiento", link: "", emails: [userEmail, "crojas@logisticaandina.example", "mperez@logisticaandina.example"],
      people: [me, { name: "Carolina Rojas", email: "crojas@logisticaandina.example", gv: false }, { name: "Matías Pérez", email: "mperez@logisticaandina.example", gv: false }],
      client: "Logística Andina", internal: false, country: "Chile", platformShort: "Teams",
    },
    {
      id: "65a1f0c2b3d4e5f6a7b8c9d1", title: "Daily Customer Success", date: ago(27), durationMin: 15, host: userName,
      callType: "Llamada Interna", link: "", emails: [userEmail], people: [me], client: "", internal: true, country: "", platformShort: "Teams",
    },
  ];
}

export function mockTranscript(userName = "Ejecutiva CS"): string {
  const n = userName;
  return `[00:00:05] ${n}: Hola Carolina, Matías, gracias por el espacio. Soy la KAM de la cuenta y la idea es revisar cómo va la marcación en las bodegas.
[00:00:20] Carolina Rojas: Perfecto. Desde Recursos Humanos vemos que en la bodega de Pudahuel ya marcan todos con la app, pero en Quilicura tenemos problemas con el reloj biométrico.
[00:01:10] ${n}: Entiendo. ¿El problema es de conexión o de enrolamiento de huellas?
[00:01:25] Matías Pérez: Es conexión, el equipo pierde la red en las tardes. Yo veo la operación de bodegas.
[00:02:00] ${n}: Ok. Yo me comprometo a enviarles el manual de configuración de red del reloj y a coordinar una visita técnica.
[00:02:30] Carolina Rojas: Genial. Te pido que la visita sea antes del 20 de noviembre.
[00:02:40] ${n}: Sí, lo dejamos agendado antes del 20 de noviembre.
[00:03:15] Matías Pérez: Por nuestro lado, yo actualizo la nómina de trabajadores de Quilicura en la plataforma el martes.
[00:04:00] Carolina Rojas: También queremos capacitar a los supervisores en el reporte de horas extra.
[00:04:20] ${n}: Claro, les envío los manuales de marcación y propongo fecha para la capacitación.`;
}
