import { z } from "zod";

const persona = z.object({ nombre: z.string().min(1), rol: z.string().nullish().transform((v) => v ?? "") });

/** Salida estructurada que el modelo debe producir (validada con zod antes de verificar). */
export const ActaDraftSchema = z.object({
  tipo: z.string().default("Acta de reunión"),
  tema: z.string().default(""),
  cliente: z.string().default(""),
  objetivo: z.string().default(""),
  asistentesCliente: z.array(persona).default([]),
  asistentesGeoVictoria: z.array(persona).default([]),
  temas: z.array(z.object({ texto: z.string(), evidencia: z.string().default("") })).max(12).default([]),
  decisiones: z.array(z.object({ texto: z.string(), evidencia: z.string().default("") })).max(10).default([]),
  acuerdos: z.array(z.object({
    compromiso: z.string(),
    responsable: z.string().default("Por definir"),
    fecha: z.string().nullish().transform((v) => v ?? "Por definir"),
    evidencia: z.string().default(""),
  })).default([]),
  advertencias: z.array(z.string()).default([]),
});

const personaJson = {
  type: "object",
  required: ["nombre", "rol"],
  properties: {
    nombre: { type: "string" },
    rol: { type: "string", description: "Cargo o área solo si se dijo en la reunión; si no, cadena vacía." },
  },
};

/** Misma estructura como JSON Schema para la herramienta de Claude. */
export const ACTA_TOOL = {
  name: "registrar_acta",
  description: "Registra el acta de reunión GeoVictoria. Solo con información explícita de la transcripción.",
  input_schema: {
    type: "object" as const,
    required: ["tipo", "tema", "cliente", "objetivo", "asistentesCliente", "asistentesGeoVictoria", "temas", "decisiones", "acuerdos", "advertencias"],
    properties: {
      tipo: { type: "string" },
      tema: { type: "string", description: "Título corto, máximo 6 palabras." },
      cliente: { type: "string", description: "Nombre de la empresa cliente." },
      objetivo: { type: "string", description: "Una oración, máximo 25 palabras." },
      asistentesCliente: { type: "array", items: personaJson },
      asistentesGeoVictoria: { type: "array", items: personaJson },
      temas: {
        type: "array", maxItems: 8,
        items: { type: "object", required: ["texto", "evidencia"], properties: {
          texto: { type: "string", description: "\"Tema: resumen\" — título corto, dos puntos y lo conversado en una oración (máx. 35 palabras)." },
          evidencia: { type: "string", description: "Cita textual exacta de la transcripción." },
        } },
      },
      decisiones: {
        type: "array", maxItems: 6,
        items: { type: "object", required: ["texto", "evidencia"], properties: {
          texto: { type: "string", description: "Lo que se decidió o quedó resuelto, en una oración." },
          evidencia: { type: "string", description: "Cita textual exacta de la transcripción." },
        } },
      },
      acuerdos: {
        type: "array",
        items: { type: "object", required: ["compromiso", "responsable", "fecha", "evidencia"], properties: {
          compromiso: { type: "string", description: "Verbo en infinitivo, una acción concreta, máximo 15 palabras." },
          responsable: { type: "string", description: "Persona, área, empresa, '<cliente> + GeoVictoria' o 'Por definir'." },
          fecha: { type: "string", description: "DD/MM/AAAA, condición breve dicha o 'Por definir'." },
          evidencia: { type: "string", description: "Cita textual exacta de la transcripción." },
        } },
      },
      advertencias: { type: "array", items: { type: "string" } },
    },
  },
};
