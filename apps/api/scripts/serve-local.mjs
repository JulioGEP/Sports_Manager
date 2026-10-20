// Sirve la API real en local sin Netlify CLI: Postgres embebido con las migraciones del repo
// y el bundle de la API (`pnpm --filter @sportsmanager/api build`) detrás de un servidor Node.
// Lo usan las pruebas de interfaz (Playwright) y vale para desarrollo cuando `netlify dev` no arranca.
import { NetlifyDB } from "@netlify/database-dev";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 9999);
const migrations = fileURLToPath(new URL("../../../netlify/database/migrations", import.meta.url));

const db = new NetlifyDB();
const connectionString = await db.start();
await db.applyMigrations(migrations);

process.env.NETLIFY_DB_URL = connectionString;
process.env.NODE_ENV ??= "development";
process.env.APP_BASE_DOMAIN ??= "sportsmanager.localhost";
process.env.TENANT_FALLBACK_SLUG ??= "demo";
process.env.EMAIL_TRANSPORT ??= "outbox";
process.env.LOGO_STORE ??= "memory";
process.env.EMAIL_DEBUG_LOG ??= "true";

const { default: handler } = await import("../netlify/functions/api/handler.mjs");
const context = { server: { region: "local" }, deploy: { context: "dev" } };

/**
 * Detrás del proxy de Vite (`API_PROXY_TARGET`) el Host que llega es 127.0.0.1:9999 y el real viene en
 * `x-forwarded-host`. En Netlify la función recibe el Host real; aquí se reconstruye la petición para
 * que la cadena de inquilino y las URL de los clubes se comporten igual que en producción.
 */
function withForwardedHost(request) {
  const forwarded = request.headers.get("x-forwarded-host");
  if (!forwarded) return request;
  const url = new URL(request.url);
  url.host = forwarded;
  const headers = new Headers(request.headers);
  headers.set("host", forwarded);
  headers.delete("x-forwarded-host");
  if (process.env.DEBUG_HOST) console.log("[api] host reenviado:", forwarded);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    ...(hasBody ? { duplex: "half" } : {}),
  });
}

const server = serve(
  { fetch: (request) => handler(withForwardedHost(request), context), port },
  () => {
    console.log(`[api] http://127.0.0.1:${port}/api/health (Postgres embebido con migraciones)`);
  },
);

async function shutdown() {
  server.close();
  await db.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
