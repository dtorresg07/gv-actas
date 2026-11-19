import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { HttpError, type SessionUser } from "../auth";
import type { Acta, MeetingSummary, TranscriptLine } from "../types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { ACTA_TOOL, ActaDraftSchema } from "./schema";
import { applyTerms, verifyDraft, type ActaDraft } from "./verify";
import { demoDraft } from "./demo";
import { draftFromSamu } from "./fromSamu";
import { samuMode } from "../integrations/samu";

/** Fecha de la reunión (DD/MM/AAAA) en la zona horaria de la operación. */
export function meetingDmy(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-CO", { timeZone: config.anthropic.timezone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")}`;
}

async function callModel(m: MeetingSummary, lines: TranscriptLine[], dmy: string): Promise<{ draft: ActaDraft; truncated: boolean }> {
  const { text, truncated } = buildUserPrompt(m, lines, dmy);
  const res = await new Anthropic({ apiKey: config.anthropic.apiKey }).messages.create({
    model: config.anthropic.model,
    max_tokens: 4000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [ACTA_TOOL],
    tool_choice: { type: "tool", name: ACTA_TOOL.name },
    messages: [{ role: "user", content: text }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("El modelo no devolvió un acta estructurada");
  return { draft: ActaDraftSchema.parse(block.input), truncated };
}

/** Genera el acta y aplica la verificación anti-alucinación y la terminología GeoVictoria. */
/** ¿Se redacta con IA (clave de Anthropic) o con el resumen de Samu? */
export const usesAI = () => !!config.anthropic.apiKey;

/** Genera el acta y aplica la verificación anti-alucinación y la terminología GeoVictoria. */
export async function generateActa(m: MeetingSummary, lines: TranscriptLine[], user: SessionUser): Promise<Acta> {
  const dmy = meetingDmy(m.date);

  // Sin clave de IA: reuniones de ejemplo → borrador de demostración; reuniones reales → resumen de Samu.
  if (!usesAI()) {
    if (samuMode() === "mock") {
      const acta = applyTerms(verifyDraft(demoDraft(user.name, m.client), m, lines, dmy, user));
      acta.advertencias.unshift("Modo demostración: este borrador no fue generado por IA.");
      return acta;
    }
    return applyTerms(verifyDraft(draftFromSamu(m), m, lines, dmy, user, { source: "samu" }));
  }

  if (lines.map((l) => l.text).join(" ").split(/\s+/).length < 40) {
    throw new HttpError(422, "La transcripción es muy corta o está vacía. Si la reunión terminó hace poco, Samu.ai puede estar procesándola todavía.");
  }
  let result: { draft: ActaDraft; truncated: boolean };
  try { result = await callModel(m, lines, dmy); }
  catch (e) { console.warn("Reintentando generación:", e); result = await callModel(m, lines, dmy); }

  const acta = applyTerms(verifyDraft(result.draft, m, lines, dmy, user));
  if (result.truncated) acta.advertencias.unshift("La reunión es muy larga: solo se analizó la primera parte de la transcripción.");
  return acta;
}
