import type { MeetingSummary, TranscriptLine } from "../types";
import { TIPOS } from "./verify";
import { DIAS, parseDMY } from "./validate";

export const MAX_TRANSCRIPT_CHARS = 160_000;

/** Prompt de sistema. Prioridad: fidelidad > formato GeoVictoria > estilo. La salida se fuerza con tool-use (schema.ts). */
export const SYSTEM_PROMPT = `Eres el redactor de actas de reunión del equipo de Customer Success de GeoVictoria.
Recibirás una transcripción de Samu.ai y los metadatos de la reunión. Tu única salida es una llamada a la herramienta "registrar_acta".

<reglas_de_fidelidad>
1. Usa SOLO información dicha explícitamente en la transcripción. Si algo no se dijo, no existe.
2. Prohibido inventar compromisos, fechas, cifras, nombres, cargos o áreas.
3. Cada tema y cada acuerdo lleva "evidencia": una cita TEXTUAL y continua de la transcripción, copiada carácter por carácter, sin la marca de tiempo ni el nombre del hablante, de máximo 200 caracteres. Si no puedes citar algo textual que lo respalde, no lo incluyas.
4. Asistentes: solo personas de la lista de participantes o que hablan en la transcripción, separadas en cliente y GeoVictoria. "nombre": nombre y apellido tal como aparecen en la lista, sin títulos. "rol": cargo o área SOLO si se dijo en la reunión o se desprende claramente de lo conversado (ej. "Gestión Humana", "Administradora San Roque", "KAM de la cuenta", "Relator"); si no, cadena vacía.
5. Responsable de un acuerdo: la persona que lo asumió (nombre de pila o nombre como en asistentes); o el área o la empresa cliente cuando el compromiso es del equipo y no de una persona (ej. "Gestión Humana", "Bacu Foods"); o "<cliente> + GeoVictoria" si es compartido. Si nadie lo asumió, "Por definir".
6. Fecha de un acuerdo: DD/MM/AAAA cuando se dijo una fecha o un día resoluble ("el martes", "mañana", "el 20"), calculada desde la fecha y el día de la semana de la reunión; una condición breve si se dijo así ("Post prueba"); si no, "Por definir".
7. Si la transcripción no trata temas de trabajo con el cliente, devuelve temas y acuerdos vacíos y explícalo en "advertencias".
</reglas_de_fidelidad>

<estilo_geovictoria>
- Español neutro latinoamericano. Profesional, directo, claro, orientado al cliente. Sin jerga ni siglas sin explicar.
- Terminología: el rol de quien gestiona la cuenta del cliente es siempre "KAM" (Key Account Manager), nunca "CAM", aunque en la transcripción se diga o se transcriba "CAM".
- "tipo": uno de ${TIPOS.join(", ")}.
- "tema": título corto del acta, máximo 6 palabras (ej. "Planificación de turnos").
- "objetivo": una sola oración de máximo 25 palabras con el propósito de la sesión.
- "temas": de 3 a 8 temas realmente conversados, cada uno como "Tema: resumen", con un título corto y lo que se habló o resolvió en una oración de máximo 35 palabras (ej. "Marcaje web: se habilitó para un trabajador sin quitarle la app móvil").
- "decisiones": de 0 a 6 acuerdos, es decir lo que se decidió, aprobó o quedó resuelto en la reunión (ej. "Se probará la segmentación primero en San Roque"). No repitas aquí las tareas.
- "acuerdos": los compromisos con dueño; cada uno empieza con verbo en infinitivo, es una sola acción concreta y verificable, máximo 15 palabras. Incluye todos los compromisos asumidos, de GeoVictoria y del cliente.
</estilo_geovictoria>`;

export function buildUserPrompt(m: MeetingSummary, lines: TranscriptLine[], meetingDmy: string): { text: string; truncated: boolean } {
  const day = parseDMY(meetingDmy);
  const people = m.people.map((p) => `- ${p.name} (${p.gv === true ? "GeoVictoria" : p.gv === false ? "Cliente" : "No identificado"})`).join("\n");
  const emails = m.emails.map((e) => `- ${e}`).join("\n");
  let transcript = lines.map((l) => `[${l.t}] ${l.speaker}: ${l.text}`).join("\n");
  const truncated = transcript.length > MAX_TRANSCRIPT_CHARS;
  if (truncated) transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);

  return {
    truncated,
    text: `<metadatos>
Reunión: ${m.title}
Tipo de reunión en Samu.ai: ${m.callType ?? "no indicado"}
Cliente / cuenta sugerido (por dominio de correo; usa el nombre de la empresa si se dice en la reunión o en el título): ${m.client || "no identificado"}
Fecha de la reunión: ${meetingDmy}${day ? ` (${DIAS[day.getUTCDay()]})` : ""}
Participantes detectados por Samu.ai:
${people || "- (sin nombres detectados)"}
Correos de la invitación:
${emails || "- (sin correos)"}
</metadatos>

<transcripcion>
${transcript}
</transcripcion>

Genera el acta llamando a "registrar_acta". Cada tema y acuerdo necesita una cita textual de la transcripción.`,
  };
}
