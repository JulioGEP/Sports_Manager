import { applyClubTheme, buildClubTheme } from "@sportsmanager/design";
import tokens from "@sportsmanager/design/tokens.json";

export type Shape = "envolvente" | "precisa";

/** Marca del producto: solo fuera del club (acceso, alta, negocio). DESIGN.md, sección 2. */
const PRODUCT_BRAND = (tokens as unknown as { color: { product: { cobalt: string } } }).color
  .product.cobalt;

/** Aplica los colores de un club en la raíz (motor del design system). */
export function applyClubColors(primary: string, secondary: string): string[] {
  const theme = buildClubTheme({ primary, secondary, mode: "light" });
  applyClubTheme(document.documentElement, theme);
  return theme.warnings;
}

/** Fuera de un club manda la marca del producto, nunca la de un club. */
export function applyProductColors(): void {
  const theme = buildClubTheme({ primary: PRODUCT_BRAND, secondary: "#FFFFFF", mode: "light" });
  applyClubTheme(document.documentElement, theme);
}

export function setShape(shape: Shape): void {
  document.documentElement.dataset.shape = shape;
}

/** Escritorio de gestión a partir de 1024 px (DESIGN.md, sección 6). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
