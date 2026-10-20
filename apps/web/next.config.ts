import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next genera un AGENTS.md en cada arranque de dev. No queremos ficheros generados en el repo.
  agentRules: false,
  // Paquetes del workspace publicados como TypeScript sin compilar.
  transpilePackages: ["@sportsmanager/shared"],
};

export default withNextIntl(nextConfig);
