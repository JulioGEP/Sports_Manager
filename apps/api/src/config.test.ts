import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const base = { NODE_ENV: "test" };

describe("configuración", () => {
  it("por defecto: transporte outbox, sin remitente y sin log de depuración", () => {
    const config = loadConfig(base);
    expect(config.email).toEqual({
      transport: "outbox",
      from: null,
      resendApiKey: null,
      debugLog: false,
    });
    expect(config.invitationTtlDays).toBe(7);
  });

  it("resend exige clave y remitente", () => {
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      loadConfig({ ...base, EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" }),
    ).toThrow();
    const config = loadConfig({
      ...base,
      EMAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_x",
      EMAIL_FROM: "Sports Manager <no-reply@test.example>",
    });
    expect(config.email.transport).toBe("resend");
    expect(config.email.from).toBe("Sports Manager <no-reply@test.example>");
  });

  it("las variables vacías cuentan como no definidas", () => {
    const config = loadConfig({
      ...base,
      EMAIL_TRANSPORT: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: " ",
      TENANT_FALLBACK_SLUG: "",
    });
    expect(config.tenantFallbackSlug).toBeNull();
    expect(config.tenantRouting).toBe("path");
    expect(config.email.transport).toBe("outbox");
    expect(config.email.resendApiKey).toBeNull();
  });

  it("el log de depuración se activa por variable o en netlify dev, nunca por defecto", () => {
    expect(loadConfig({ ...base, EMAIL_DEBUG_LOG: "true" }).email.debugLog).toBe(true);
    expect(loadConfig({ NETLIFY_DEV: "true" }).email.debugLog).toBe(true);
    expect(loadConfig({ ...base, EMAIL_DEBUG_LOG: "false" }).email.debugLog).toBe(false);
  });

  it("el almacén de logos es Netlify salvo que local pida memoria", () => {
    expect(loadConfig(base).logoStore).toBe("netlify");
    expect(loadConfig({ ...base, LOGO_STORE: "memory" }).logoStore).toBe("memory");
    expect(loadConfig({ ...base, LOGO_STORE: "" }).logoStore).toBe("netlify");
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "x".repeat(32),
        LOGO_STORE: "memory",
      }),
    ).toThrow(/LOGO_STORE/);
  });

  it("fuera de local exige el secreto de sesiones", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/BETTER_AUTH_SECRET/);
    const config = loadConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(32) });
    expect(config.secureCookies).toBe(true);
    expect(config.email.debugLog).toBe(false);
  });
});
