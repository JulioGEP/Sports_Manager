// Tipos del bundle que genera scripts/bundle.mjs (handler.mjs no se commitea).
import type { Context } from "@netlify/functions";
declare function handler(request: Request, context: Context): Response | Promise<Response>;
export default handler;
