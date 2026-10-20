import { describe, expect, it } from "vitest";
import { EmailSchema } from "./invitations.ts";
import { BrandColorSchema, OrganizationCreateSchema } from "./organizations.ts";

describe("validaciones de organización", () => {
  it("normaliza colores a minúsculas y rechaza formatos inválidos", () => {
    expect(BrandColorSchema.parse(" #D71920 ")).toBe("#d71920");
    for (const bad of ["d71920", "#d71", "#ggg000", "rojo"]) {
      expect(BrandColorSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("valida la creación completa", () => {
    const ok = OrganizationCreateSchema.safeParse({
      name: " Club Ejemplo ",
      slug: "club-ejemplo",
      defaultLocale: "ca",
      defaultSportCode: "futsal",
      brandPrimaryColor: "#D71920",
      brandSecondaryColor: "#e8b52a",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe("Club Ejemplo");
    expect(
      OrganizationCreateSchema.safeParse({
        name: "x",
        slug: "admin",
        defaultLocale: "es",
        defaultSportCode: "futsal",
        brandPrimaryColor: "#000000",
        brandSecondaryColor: "#ffffff",
      }).success,
    ).toBe(false);
    expect(
      OrganizationCreateSchema.safeParse({
        name: "x",
        slug: "club",
        defaultLocale: "de",
        defaultSportCode: "futsal",
        brandPrimaryColor: "#000000",
        brandSecondaryColor: "#ffffff",
      }).success,
    ).toBe(false);
  });

  it("normaliza emails", () => {
    expect(EmailSchema.parse("  Ana@Club.COM ")).toBe("ana@club.com");
    expect(EmailSchema.safeParse("no-es-email").success).toBe(false);
  });
});
