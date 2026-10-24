import { describe, expect, it } from "vitest";
import { buildClubTheme, contrast } from "./clubTheme";

/** Los colores con los que se probó el motor (DESIGN.md 3.1) y algunos difíciles más. */
const CLUBS: [string, string][] = [
  ["#0B6E4F", "#F2C200"], // verde
  ["#7A1F3D", "#F2C200"], // granate
  ["#F2C200", "#0B0D12"], // amarillo
  ["#0B1F4B", "#D71920"], // marino
  ["#FFFFFF", "#5B2A86"], // blanco
  ["#0B0D12", "#E8B52A"], // negro
  ["#6CB4EE", "#FFFFFF"], // celeste
  ["#F26A1B", "#0B0D12"], // naranja
  ["#D71920", "#E8B52A"], // rojo del club demo
  ["#FF0000", "#FFFFFF"], // rojo puro
  ["#808080", "#FFFFFF"], // gris medio
];

describe("motor de color del club: navegación (ADR 0043)", () => {
  for (const [primary, secondary] of CLUBS) {
    it(`${primary}: la barra del club y la oscura se leen`, () => {
      const v = buildClubTheme({ primary, secondary }).vars;
      const c = (a: string, b: string) => contrast(v[a]!, v[b]!);
      // El texto de la barra del club cumple lo mismo que el texto de los botones del club.
      expect(c("--navc-ink", "--navc-bg")).toBeGreaterThanOrEqual(
        c("--club-on-fill", "--club-fill") - 0.01,
      );
      expect(c("--navc-muted", "--navc-bg")).toBeGreaterThanOrEqual(
        Math.min(4.5, c("--navc-ink", "--navc-bg")),
      );
      expect(c("--navc-active-ink", "--navc-active")).toBeGreaterThanOrEqual(
        Math.min(4.5, c("--club-on-fill", "--club-fill") - 0.01),
      );
      expect(c("--navd-ink", "--navd-bg")).toBeGreaterThanOrEqual(4.5);
      expect(c("--navd-muted", "--navd-bg")).toBeGreaterThanOrEqual(4.5);
      expect(c("--navd-accent", "--navd-bg")).toBeGreaterThanOrEqual(4.5);
      expect(c("--navd-active", "--navd-bg")).toBeGreaterThanOrEqual(3);
      expect(c("--navd-active-ink", "--navd-active")).toBeGreaterThanOrEqual(4.4);
    });
  }

  it("los neutros siguen cumpliendo con el fondo teñido y sin tinte", () => {
    for (const [primary, secondary] of CLUBS) {
      for (const tint of [0, 0.6, 1.25, 2]) {
        const v = buildClubTheme({ primary, secondary, tint }).vars;
        expect(contrast(v["--text-muted"]!, v["--surface-page"]!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v["--text"]!, v["--surface-page"]!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("sin tinte, los neutros son grises puros", () => {
    const v = buildClubTheme({ primary: "#0B6E4F", secondary: "#F2C200", tint: 0 }).vars;
    const page = v["--surface-page"]!;
    expect(page.slice(1, 3)).toBe(page.slice(3, 5));
    expect(page.slice(3, 5)).toBe(page.slice(5, 7));
  });
});
