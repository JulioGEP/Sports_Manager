import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Web del SaaS: SPA estática (ADR 0027). En producción la sirve la CDN de Netlify y `/api` lo
 * atiende la función de la API en el mismo origen. En local y en las pruebas de interfaz, `/api`
 * se reenvía a la API local (`API_PROXY_TARGET`) conservando el Host real en `x-forwarded-host`,
 * igual que hace Netlify.
 */
const apiTarget = process.env["API_PROXY_TARGET"] ?? "http://127.0.0.1:9999";
const apiProxy: Record<string, ProxyOptions> = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq, req) => {
        if (req.headers.host) proxyReq.setHeader("x-forwarded-host", req.headers.host);
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
