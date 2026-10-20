import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next genera un AGENTS.md en cada arranque de dev. No queremos ficheros generados en el repo.
  agentRules: false,
  // Paquetes del workspace publicados como TypeScript sin compilar.
  transpilePackages: ["@sportsmanager/shared"],
  // Raíz de trazado de ficheros = raíz del monorepo. Así el manifiesto de Next indica que la app
  // vive en apps/web y el adaptador de Netlify la localiza sin depender de ajustes de interfaz.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Pruebas de interfaz y desarrollo sin Netlify CLI: la web reenvía /api a la API servida aparte
  // (apps/api/scripts/serve-local.mjs). En Netlify la variable no existe y no hay reenvío.
  rewrites() {
    const target = process.env["API_PROXY_TARGET"];
    return Promise.resolve(
      target ? [{ source: "/api/:path*", destination: `${target}/api/:path*` }] : [],
    );
  },
};

export default withNextIntl(nextConfig);
