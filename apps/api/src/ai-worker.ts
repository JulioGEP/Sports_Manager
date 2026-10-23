import { z } from "zod";
import { loadConfig } from "./config.ts";
import { createDataLayer } from "./data/index.ts";
import { runGeneration, verifyGeneration } from "./services/ai-drafts.ts";

const config = loadConfig();
const data = createDataLayer({ config });

const BodySchema = z.object({
  id: z.string().uuid(),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Trabajo en segundo plano de la propuesta con IA (ADR 0043). Netlify responde 202 a quien llama
 * y deja correr la función hasta 15 minutos: el modelo puede tardar minutos en una semana entera.
 * Solo atiende ids firmados por la API, y una propuesta solo se genera una vez (la toma quien la
 * encuentra en cola), así que repetir la llamada no gasta de nuevo.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { id, signature } = parsed.data;
  if (!verifyGeneration(config.authSecret, id, signature))
    return new Response(null, { status: 401 });
  await runGeneration(data, id);
  return new Response(null, { status: 202 });
}
