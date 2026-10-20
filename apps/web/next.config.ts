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
};

export default withNextIntl(nextConfig);
