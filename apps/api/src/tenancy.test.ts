import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";
import { publicOrigin } from "./tenancy.ts";

const production = loadConfig({
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_BASE_DOMAIN: "hubsports.netlify.app",
  TENANT_FALLBACK_SLUG: "demo",
});
const local = loadConfig({ NODE_ENV: "test", APP_BASE_DOMAIN: "sportsmanager.test" });

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
