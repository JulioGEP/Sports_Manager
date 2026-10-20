import { HealthResponseSchema } from "@sportsmanager/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDataLayer } from "./data/index.ts";

const config = loadConfig({ NODE_ENV: "test", APP_BASE_DOMAIN: "sportsmanager.test" });
const data = createDataLayer({ config, connectionString: "postgresql://u:p@127.0.0.1:1/none" });
data.checkDatabase = () => Promise.resolve({ ok: true, region: "eu-central-1", latencyMs: 3 });

describe("API", () => {
  const app = createApp({ config, data });

  it("GET /api/health responde con el contrato compartido", async () => {
    const res = await app.request("/api/health", {}, { context: { server: { region: "fra" } } });
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.region).toBe("fra");
    expect(body.db).toEqual({ ok: true, region: "eu-central-1", latencyMs: 3 });
  });

  it("devuelve 404 en JSON para rutas desconocidas", async () => {
    const res = await app.request("/api/nada");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("publica la especificación OpenAPI con las rutas y el esquema de seguridad", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.openapi).toBe("3.1.0");
    for (const path of [
      "/api/health",
      "/api/me",
      "/api/me/memberships",
      "/api/org",
      "/api/org/members",
      "/api/platform/me",
    ]) {
      expect(Object.keys(spec.paths), path).toContain(path);
    }
    expect(spec.components.securitySchemes).toHaveProperty("sessionCookie");
  });

  it("sirve la documentación interactiva", async () => {
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("sin sesión, /api/me devuelve 401 y /api/org en un host desconocido devuelve 404", async () => {
    expect(
      (await app.request("/api/me", { headers: { host: "club.sportsmanager.test" } })).status,
    ).toBe(401);
    expect((await app.request("/api/org", { headers: { host: "otro.dominio.test" } })).status).toBe(
      404,
    );
  });
});
