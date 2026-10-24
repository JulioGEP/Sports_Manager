import type { Config } from "@netlify/functions";
import handler from "./worker.mjs";

/**
 * Función en segundo plano de la propuesta con IA (ADR 0044). `background: true` (y el sufijo
 * `-background`, que Netlify sigue aceptando) hace que responda 202 enseguida y la deje correr
 * hasta 15 minutos. Si la invocación falla, Netlify la reintenta: la propuesta solo se genera una
 * vez. `worker.mjs` es el bundle autocontenido que genera `pnpm --filter @sportsmanager/api build`,
 * como el de la API. Región en Frankfurt, como la API (ADR 0007).
 */
export default handler;

export const config: Config = {
  background: true,
  region: "fra",
};
