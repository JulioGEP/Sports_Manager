import type { Config } from "@netlify/functions";
import { handle } from "hono/netlify";
import { createApp } from "../../src/app.ts";

/**
 * Única función de la API. Responde a todo /api/* en el mismo host que la web (ADR 0010).
 * Región fijada en Frankfurt por residencia de datos (ADR 0007); el ajuste de proyecto
 * cubre además las funciones que genera el adaptador de Next.js.
 */
export default handle(createApp());

export const config: Config = {
  path: "/api/*",
  region: "fra",
};
