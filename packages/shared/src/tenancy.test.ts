import { describe, expect, it } from "vitest";
import { OrganizationSlugSchema, RESERVED_SUBDOMAINS, subdomainFromHost } from "./tenancy.ts";

describe("slug de organización", () => {
  it("acepta slugs válidos", () => {
    for (const slug of ["club", "ae-eixample", "c1", "a"]) {
      expect(OrganizationSlugSchema.safeParse(slug).success, slug).toBe(true);
    }
  });

  it("rechaza formatos inválidos", () => {
    for (const slug of ["", "-club", "club-", "Club", "club.a", "a".repeat(64), "cl ub"]) {
      expect(OrganizationSlugSchema.safeParse(slug).success, JSON.stringify(slug)).toBe(false);
    }
  });

  it("rechaza los subdominios reservados", () => {
    for (const reserved of RESERVED_SUBDOMAINS) {
      expect(OrganizationSlugSchema.safeParse(reserved).success, reserved).toBe(false);
    }
  });
});

describe("subdominio a partir del host", () => {
  it("extrae la primera etiqueta", () => {
    expect(subdomainFromHost("club.sportsmanager.com", "sportsmanager.com")).toBe("club");
    expect(subdomainFromHost("Club.sportsmanager.localhost:8888", "sportsmanager.localhost")).toBe(
      "club",
    );
  });

  it("devuelve null sin subdominio, con otro dominio o con más de un nivel", () => {
    expect(subdomainFromHost("sportsmanager.com", "sportsmanager.com")).toBeNull();
    expect(subdomainFromHost("club.otro.com", "sportsmanager.com")).toBeNull();
    expect(subdomainFromHost("a.b.sportsmanager.com", "sportsmanager.com")).toBeNull();
    expect(
      subdomainFromHost("deploy-preview-1--hubsports.netlify.app", "sportsmanager.com"),
    ).toBeNull();
  });
});
