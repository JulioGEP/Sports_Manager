import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de interfaz contra la aplicación real: la API con Postgres embebido (serve-local) y la
 * web estática ya construida, servida por `vite preview`, que reenvía /api a la API local.
 * Capturas de cada pantalla en e2e/screenshots. Chromium propio si el entorno lo indica (PW_CHROMIUM_PATH).
 * Los clubes viven en una ruta del mismo origen (ADR 0027): `/demo`, `/prueba-escritorio`.
 */
const chromiumPath = process.env["PW_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    screenshot: "only-on-failure",
    // Todo va a localhost: nunca por el proxy del sistema (el entorno de desarrollo puede tener uno).
    launchOptions: {
      args: ["--no-proxy-server", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])],
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  projects: [
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "movil", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: [
    {
      // Node directo (sin pnpm por medio) para que Playwright pueda parar el proceso al terminar.
      command: "node ../api/scripts/serve-local.mjs",
      url: "http://127.0.0.1:9999/api/health",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: "9999",
        APP_BASE_DOMAIN: "localhost",
        TENANT_ROUTING: "path",
        TENANT_FALLBACK_SLUG: "",
        // admin@demo.test administra también la plataforma en las pruebas; los otros dos se dan de alta en /admin/setup.
        PLATFORM_ADMIN_EMAILS:
          "admin@demo.test,plataforma-escritorio@demo.test,plataforma-movil@demo.test",
      },
    },
    {
      command: "pnpm exec vite preview --port 3000 --strictPort",
      url: "http://localhost:3000/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: "http://127.0.0.1:9999" },
    },
  ],
});
