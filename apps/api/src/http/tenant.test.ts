import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { classifyHost } from "./tenant.ts";

const base = { NODE_ENV: "test", APP_BASE_DOMAIN: "sportsmanager.test" };
const withFallback = loadConfig({ ...base, TENANT_FALLBACK_SLUG: "demo" });
const withoutFallback = loadConfig(base);

describe("classifyHost", () => {
  it("un subdominio del dominio base es ese club", () => {
    expect(classifyHost("club-a.sportsmanager.test", withFallback)).toEqual({
      kind: "organization",
      slug: "club-a",
      source: "subdomain",
    });
    expect(classifyHost("Club-A.sportsmanager.test:8888", withFallback)).toMatchObject({
      slug: "club-a",
    });
  });

  it("admin es la plataforma y el resto de reservados no son nada", () => {
    expect(classifyHost("admin.sportsmanager.test", withFallback)).toEqual({ kind: "platform" });
    expect(classifyHost("www.sportsmanager.test", withFallback)).toEqual({
      kind: "reserved",
      label: "www",
    });
    expect(classifyHost("api.sportsmanager.test", withFallback)).toMatchObject({
      kind: "reserved",
    });
  });

  it("sin subdominio sirve el club de reserva solo si está configurado", () => {
    expect(classifyHost("sportsmanager.test", withFallback)).toEqual({
      kind: "organization",
      slug: "demo",
      source: "fallback",
    });
    expect(classifyHost("localhost:8888", withFallback)).toMatchObject({
      slug: "demo",
      source: "fallback",
    });
    expect(classifyHost("sportsmanager.test", withoutFallback)).toEqual({ kind: "unknown" });
  });

  it("en deploy previews y branch deploys manda el club de reserva, nunca el host", () => {
    expect(
      classifyHost("deploy-preview-9--hubsports.netlify.app", withFallback, "deploy-preview"),
    ).toMatchObject({ slug: "demo", source: "fallback" });
    expect(
      classifyHost("deploy-preview-9--hubsports.netlify.app", withoutFallback, "deploy-preview"),
    ).toEqual({ kind: "unknown" });
    expect(classifyHost("club-a.sportsmanager.test", withFallback, "production")).toMatchObject({
      slug: "club-a",
      source: "subdomain",
    });
  });

  it("un host de otro dominio o con más niveles no es nada", () => {
    expect(classifyHost("club.otro.test", withFallback)).toEqual({ kind: "unknown" });
    expect(classifyHost("a.b.sportsmanager.test", withFallback)).toEqual({ kind: "unknown" });
    expect(classifyHost(undefined, withFallback)).toEqual({ kind: "unknown" });
  });
});

describe("loadConfig", () => {
  it("exige el secreto fuera de local y acepta el de desarrollo en tests", () => {
    expect(() => loadConfig({ APP_BASE_DOMAIN: "x.test" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(loadConfig({ NODE_ENV: "test" }).secureCookies).toBe(false);
    expect(
      loadConfig({ BETTER_AUTH_SECRET: "a".repeat(32), APP_BASE_DOMAIN: "X.TEST" }),
    ).toMatchObject({
      baseDomain: "x.test",
      secureCookies: true,
      tenantFallbackSlug: null,
      invitationTtlDays: 7,
    });
  });
});
