import Anthropic from "@anthropic-ai/sdk";
import type { AiUsage } from "@sportsmanager/shared";

/**
 * Cliente del modelo de la propuesta con IA (ADR 0044). Como Resend con el email, solo la capa
 * de datos habla con el proveedor: el resto de la API recibe texto y consumo, nunca el SDK. Un
 * único token del proveedor, en la variable `ANTHROPIC_API_KEY` de Netlify, para todos los clubes.
 */

export interface AiModelRequest {
  model: string;
  system: string;
  user: string;
  /** Esquema JSON de la salida estructurada. */
  schema: Record<string, unknown>;
}

export type AiModelResult =
  | { kind: "ok"; model: string; text: string; usage: AiUsage }
  | { kind: "refused"; model: string; usage: AiUsage }
  | { kind: "truncated"; model: string; usage: AiUsage }
  | { kind: "error"; failure: "model_error" | "timeout"; message: string };

export interface AiModelClient {
  generate(request: AiModelRequest): Promise<AiModelResult>;
}

/**
 * Esfuerzo del modelo. Una sesión bien planificada pide pensar: el contexto es largo y hay que
 * cruzar disponibilidad, carga, biblioteca y objetivo. `high` sube algo el coste por llamada.
 */
const EFFORT = "high" as const;
/** Margen de salida: la propuesta de una semana entera, con el razonamiento del modelo. */
const MAX_TOKENS = 64_000;
/** La función en segundo plano de Netlify vive 15 minutos; el modelo tiene 12. */
const TIMEOUT_MS = 12 * 60_000;
/**
 * Modelos con reintento en el servidor si sus filtros de seguridad rechazan la petición: otro
 * modelo la atiende en la misma llamada. En planificación deportiva es raro, pero un falso positivo
 * no debería costar una propuesta.
 */
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

const NO_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function createAnthropicModel(apiKey: string): AiModelClient {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  return {
    async generate(request) {
      try {
        const fallback = SERVER_FALLBACK_MODELS.has(request.model);
        const stream = client.beta.messages.stream({
          model: request.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: {
            effort: EFFORT,
            format: { type: "json_schema", schema: request.schema },
          },
          ...(fallback
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
        const message = await stream.finalMessage();
        const usage: AiUsage = {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        };
        if (message.stop_reason === "refusal")
          return { kind: "refused", model: message.model, usage };
        if (message.stop_reason === "max_tokens")
          return { kind: "truncated", model: message.model, usage };
        const text = message.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("");
        return { kind: "ok", model: message.model, text, usage };
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError)
          return { kind: "error", failure: "timeout", message: error.message };
        if (error instanceof Anthropic.APIError) {
          console.error("[ai] model error", error.status, error.message);
          return { kind: "error", failure: "model_error", message: error.message };
        }
        throw error;
      }
    },
  };
}

/** Modelo de pruebas: devuelve lo que se le diga y guarda lo que recibió. */
export function createFakeModel(
  respond: (request: AiModelRequest) => AiModelResult | Promise<AiModelResult>,
): AiModelClient & { requests: AiModelRequest[] } {
  const requests: AiModelRequest[] = [];
  return {
    requests,
    async generate(request) {
      requests.push(request);
      return respond(request);
    },
  };
}

export { NO_USAGE };
