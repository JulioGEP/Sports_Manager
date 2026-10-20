import { HealthResponseSchema } from "@sportsmanager/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { DataLayer } from "./data/index.ts";

const fakeData: DataLayer = {
  checkDatabase: () => Promise.resolve({ ok: true, region: "eu-central-1", latencyMs: 3 }),
  getAppMeta: () => Promise.resolve("1"),
  close: () => Promise.resolve(),
};

describe("API", () => {
  const app = createApp({ data: fakeData });

  it("GET /api/health responde con el contrato compartido", async () => {
    const res = await app.request("/api/health", {}, { server: { region: "fra" } });
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

  it("publica la especificación OpenAPI con la ruta de salud", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/api/health");
  });

  it("sirve la documentación interactiva", async () => {
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
