import { createApp, type NetlifyContext } from "./app.ts";

const app = createApp();

/**
 * Punto de entrada que esbuild empaqueta en un único fichero (scripts/bundle.mjs).
 * Adaptador mínimo para Netlify Functions: la función recibe (Request, Context) y
 * Hono expone el contexto de Netlify en `c.env.context`.
 */
export default function handler(
  request: Request,
  context: NetlifyContext,
): Response | Promise<Response> {
  return app.fetch(request, { context });
}
