import { z } from "zod";

/** Validación del acta que vuelve desde el navegador (ya revisada y editada por el usuario). */
const str = (max: number) => z.string().trim().max(max);
const dmy = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/);

export const ActaSchema = z.object({
  meetingId: z.string().regex(/^[a-f0-9]{24}$/),
  link: z.string().url().optional().or(z.literal("")),
  tipo: str(60).min(1),
  cliente: str(200).min(1),
  titulo: str(200).min(1),
  pais: str(60),
  fecha: dmy,
  objetivo: str(600),
  asistentesCliente: z.array(z.object({ nombre: str(120), rol: str(120) })).max(60),
  asistentesGV: z.array(z.object({ nombre: str(120), rol: str(120) })).max(60),
  temas: z.array(z.object({ texto: str(400), evidencia: str(600), verificada: z.boolean() })).max(20),
  decisiones: z.array(z.object({ texto: str(400), evidencia: str(600), verificada: z.boolean() })).max(20).default([]),
  cierre: str(400),
  acuerdos: z.array(z.object({
    id: str(10),
    compromiso: str(300),
    responsable: str(160).min(1),
    responsableEmail: z.string().email().optional(),
    fecha: str(60).min(1),
    evidencia: str(600),
    verificada: z.boolean(),
    advertencias: z.array(z.string()).default([]),
  })).max(50),
  generadoPor: z.object({ nombre: str(120), email: z.string().email() }),
  advertencias: z.array(z.string()).default([]),
});

/** Quita filas vacías antes de exportar o enviar al CRM. */
export function compact<T extends z.infer<typeof ActaSchema>>(a: T): T {
  return {
    ...a,
    asistentesCliente: a.asistentesCliente.filter((p) => p.nombre),
    asistentesGV: a.asistentesGV.filter((p) => p.nombre),
    temas: a.temas.filter((t) => t.texto),
    decisiones: (a.decisiones ?? []).filter((t) => t.texto),
    acuerdos: a.acuerdos.filter((t) => t.compromiso),
  };
}

export function safeFilename(acta: { titulo: string }, ext: string): string {
  const base = `Acta_${acta.titulo}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/_$/, "").slice(0, 80);
  return `${base}.${ext}`;
}
