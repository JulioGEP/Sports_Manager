import type { Config } from "@netlify/functions";
import handler from "./handler.mjs";

/**
 * Única función de la API. Responde a todo /api/* en el mismo host que la web (ADR 0010).
 * `handler.mjs` es el bundle autocontenido que genera `pnpm --filter @sportsmanager/api build`.
 * Región fijada en Frankfurt por residencia de datos (ADR 0007).
 */
export default handler;

export const config: Config = {
  path: "/api/*",
  region: "fra",
};
