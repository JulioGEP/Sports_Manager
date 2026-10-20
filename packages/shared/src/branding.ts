import { tokens } from "../design/tokens.ts";

/** Luminancia relativa (WCAG) de un color #rrggbb. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Color de texto legible sobre un color de marca: tinta oscura sobre colores claros, blanco sobre oscuros. */
export function onBrandColor(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return tokens.color.surface;
  return relativeLuminance(hex) > 0.4 ? tokens.color.ink900 : tokens.color.surface;
}

/** Variables CSS que la web inyecta en `<html>` para pintar la marca de un club (Bloque 5). */
export function brandCssVariables(brand: {
  brandPrimaryColor: string;
  brandSecondaryColor: string;
}): Record<string, string> {
  return {
    "--color-brand-primary": brand.brandPrimaryColor,
    "--color-brand-secondary": brand.brandSecondaryColor,
    "--color-on-brand-primary": onBrandColor(brand.brandPrimaryColor),
    "--color-on-brand-secondary": onBrandColor(brand.brandSecondaryColor),
  };
}
