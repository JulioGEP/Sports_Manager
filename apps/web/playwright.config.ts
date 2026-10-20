import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de interfaz contra la aplicación real: la API con Postgres embebido (serve-local) y
 * la web de Next ya construida. Capturas de cada pantalla en e2e/screenshots.
 * Chromium propio cuando el entorno lo indica (PW_CHROMIUM_PATH); si no, el que instala Playwright.
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
    // Chromium resuelve *.localhost sin DNS: el club demo responde en el dominio base y cada club
    // nuevo en su subdominio, como en producción. Node no lo resuelve, por eso los webServer usan localhost.
    baseURL: "http://sportsmanager.localhost:3000",
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
        APP_BASE_DOMAIN: "sportsmanager.localhost",
        SESSION_COOKIE_DOMAIN: "sportsmanager.localhost",
        // admin@demo.test administra también la plataforma en las pruebas; los otros dos se dan de alta en /admin/setup.
        PLATFORM_ADMIN_EMAILS:
          "admin@demo.test,plataforma-escritorio@demo.test,plataforma-movil@demo.test",
      },
    },
    {
      command: "pnpm exec next start --port 3000",
      url: "http://localhost:3000/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: "http://127.0.0.1:9999" },
    },
  ],
});
