import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";
import { classifyRequest, organizationUrl, publicOrigin } from "./tenancy.ts";

const production = loadConfig({
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_BASE_DOMAIN: "hubsports.netlify.app",
  TENANT_FALLBACK_SLUG: "demo",
  TENANT_ROUTING: "subdomain",
});
const local = loadConfig({
  NODE_ENV: "test",
  APP_BASE_DOMAIN: "sportsmanager.test",
  TENANT_ROUTING: "subdomain",
});
/** Por defecto los clubes viven en una ruta del dominio base (ADR 0027). */
const byPath = loadConfig({
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_BASE_DOMAIN: "hubsports.netlify.app",
});

describe("clubes por ruta (ADR 0027)", () => {
  it("la cabecera x-sm-club resuelve el club en el dominio base, en local y en previews", () => {
    expect(classifyRequest({ host: "hubsports.netlify.app", club: "Demo" }, byPath)).toEqual({
      kind: "organization",
      slug: "demo",
      source: "path",
    });
    expect(
      classifyRequest(
        { host: "deploy-preview-9--hubsports.netlify.app", club: "demo" },
        byPath,
        "deploy-preview",
      ),
    ).toEqual({ kind: "organization", slug: "demo", source: "path" });
    expect(classifyRequest({ host: "localhost:3000", club: "demo" }, local)).toEqual({
      kind: "organization",
      slug: "demo",
      source: "path",
    });
  });

  it("un slug reservado o mal formado no resuelve nada", () => {
    expect(classifyRequest({ host: "hubsports.netlify.app", club: "admin" }, byPath)).toEqual({
      kind: "unknown",
    });
    expect(classifyRequest({ host: "hubsports.netlify.app", club: "login" }, byPath)).toEqual({
      kind: "unknown",
    });
    expect(classifyRequest({ host: "hubsports.netlify.app", club: "Mi Club" }, byPath)).toEqual({
      kind: "unknown",
    });
  });

  it("el subdominio manda sobre la cabecera; sin señales vale el host", () => {
    expect(classifyRequest({ host: "club-a.sportsmanager.test", club: "club-b" }, local)).toEqual({
      kind: "organization",
      slug: "club-a",
      source: "subdomain",
    });
    expect(classifyRequest({ host: "hubsports.netlify.app" }, byPath)).toEqual({ kind: "unknown" });
    expect(classifyRequest({ host: "hubsports.netlify.app" }, production)).toEqual({
      kind: "organization",
      slug: "demo",
      source: "fallback",
    });
  });

  it("las direcciones de los clubes llevan el slug en la ruta, sobre el origen de la petición", () => {
    expect(organizationUrl("demo", byPath, "hubsports.netlify.app")).toBe(
      "https://hubsports.netlify.app/demo",
    );
    expect(
      organizationUrl("demo", byPath, "deploy-preview-9--hubsports.netlify.app", "deploy-preview"),
    ).toBe("https://deploy-preview-9--hubsports.netlify.app/demo");
    expect(organizationUrl("demo", byPath, "atacante.example")).toBe(
      "https://hubsports.netlify.app/demo",
    );
  });
});

describe("origen público para los enlaces de los emails", () => {
  it("acepta el host de un club o de la plataforma", () => {
    expect(publicOrigin("Club-A.sportsmanager.test", local)).toBe(
      "http://club-a.sportsmanager.test",
    );
    expect(publicOrigin("hubsports.netlify.app", production)).toBe("https://hubsports.netlify.app");
    expect(publicOrigin("admin.hubsports.netlify.app", production)).toBe(
      "https://admin.hubsports.netlify.app",
    );
  });

  it("en una deploy preview conserva el host de la preview", () => {
    expect(
      publicOrigin("deploy-preview-9--hubsports.netlify.app", production, "deploy-preview"),
    ).toBe("https://deploy-preview-9--hubsports.netlify.app");
  });

  it("un host ajeno, reservado o desconocido cae al dominio base: nadie envenena el enlace", () => {
    expect(publicOrigin("atacante.example", production)).toBe("https://hubsports.netlify.app");
    expect(publicOrigin("www.hubsports.netlify.app", production)).toBe(
      "https://hubsports.netlify.app",
    );
    expect(publicOrigin(undefined, production)).toBe("https://hubsports.netlify.app");
    expect(publicOrigin("x.sportsmanager.test", local)).toBe("http://x.sportsmanager.test");
    expect(publicOrigin("otro.test", local)).toBe("http://sportsmanager.test");
  });
});

describe("dirección pública de un club", () => {
  it("subdominio del dominio base; el club de reserva vive en el dominio base", () => {
    expect(organizationUrl("club-a", production, "hubsports.netlify.app")).toBe(
      "https://club-a.hubsports.netlify.app",
    );
    expect(organizationUrl("demo", production, "hubsports.netlify.app")).toBe(
      "https://hubsports.netlify.app",
    );
  });

  it("en local conserva el puerto de la petición", () => {
    expect(organizationUrl("club-a", local, "localhost:8888")).toBe(
      "http://club-a.sportsmanager.test:8888",
    );
    expect(organizationUrl("club-a", local, undefined)).toBe("http://club-a.sportsmanager.test");
  });
});
