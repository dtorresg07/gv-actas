/**
 * Cliente MCP mínimo (JSON-RPC sobre "Streamable HTTP"): initialize → tools/call.
 * Acepta respuestas JSON o en flujo de eventos (text/event-stream).
 */

export class McpAuthError extends Error {}
export class McpError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}
export class McpRateLimited extends McpError {}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PROTOCOL = "2025-06-18";
let nextId = 1;

async function readMessage(res: Response, id: number): Promise<{ result?: unknown; error?: { message: string } }> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/event-stream")) {
    const text = await res.text();
    for (const block of text.split(/\n\n+/)) {
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg.id === id) return msg;
      } catch { /* bloque que no es JSON */ }
    }
    throw new McpError("Samu no respondió la solicitud");
  }
  const msg = await res.json().catch(() => null);
  if (!msg) throw new McpError("Respuesta de Samu ilegible");
  return Array.isArray(msg) ? msg.find((m) => m.id === id) ?? msg[0] : msg;
}

async function rpc(url: string, token: string, method: string, params: unknown, sessionId?: string, notify = false) {
  const id = nextId++;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
    "MCP-Protocol-Version": PROTOCOL,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const body = JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params });
  let res = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
  // Samu limita la cantidad de solicitudes: si pide esperar, se espera (hasta 2 veces).
  for (let i = 0; res.status === 429 && i < 2; i++) {
    const after = Number(res.headers.get("retry-after"));
    await wait(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1500 * (i + 1), 4000));
    res = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
  }
  if (res.status === 429) throw new McpRateLimited("Samu pidió esperar un momento", 429);
  if (res.status === 401 || res.status === 403) throw new McpAuthError("La conexión con Samu venció o fue revocada");
  if (!res.ok && res.status !== 202) throw new McpError(`Samu respondió ${res.status}`, res.status);
  const newSession = res.headers.get("mcp-session-id") ?? sessionId;
  if (notify) return { session: newSession, result: null };
  const msg = await readMessage(res, id);
  if (msg.error) throw new McpError(msg.error.message);
  return { session: newSession, result: msg.result };
}

type ToolResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

function parseToolResult<T>(result: unknown): T {
  const r = result as ToolResult;
  if (r?.structuredContent) return r.structuredContent as T;
  const text = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  if (r?.isError) throw new McpError(text.slice(0, 300) || "Samu devolvió un error");
  const i = text.indexOf("{");
  if (i < 0) throw new McpError("Respuesta de Samu sin datos");
  return JSON.parse(text.slice(i)) as T;
}

/** Abre una sola sesión con Samu y permite varias llamadas a herramientas dentro de ella. */
export async function openSession(url: string, token: string) {
  const init = await rpc(url, token, "initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "gv-actas", version: "1.0.0" },
  });
  const session = init.session ?? undefined;
  await rpc(url, token, "notifications/initialized", {}, session, true).catch(() => undefined);
  return {
    async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
      const { result } = await rpc(url, token, "tools/call", { name: tool, arguments: args }, session);
      return parseToolResult<T>(result);
    },
  };
}

/** Llama una herramienta de Samu (una sesión por llamada). */
export async function callTool<T>(url: string, token: string, tool: string, args: Record<string, unknown>): Promise<T> {
  return (await openSession(url, token)).call<T>(tool, args);
}
