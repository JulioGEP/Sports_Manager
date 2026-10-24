import { applyClubTheme, buildClubTheme } from "@sportsmanager/design";
import tokens from "@sportsmanager/design/tokens.json";
import {
  DEFAULT_CLUB_STYLE,
  type ClubBackground,
  type ClubStyle,
  type OrganizationBranding,
} from "@sportsmanager/shared";
import { initials } from "@/ui/misc";

export type Shape = "envolvente" | "precisa";

/** Marca del producto: solo fuera del club (acceso, alta, negocio). DESIGN.md, sección 2. */
const PRODUCT_BRAND = (tokens as unknown as { color: { product: { cobalt: string } } }).color
  .product.cobalt;

/** Tinte de los neutros según el fondo del club (ADR 0043): 0,6 es el de siempre. */
export function tintFor(background: ClubBackground): number {
  if (background === "neutro") return 0;
  if (background === "tenido") return 1.25;
  return 0.6;
}

/** Aplica los colores de un club en la raíz (motor del design system). */
export function applyClubColors(
  primary: string,
  secondary: string,
  background: ClubBackground = DEFAULT_CLUB_STYLE.background,
): string[] {
  const theme = buildClubTheme({ primary, secondary, mode: "light", tint: tintFor(background) });
  applyClubTheme(document.documentElement, theme);
  return theme.warnings;
}

/** Atributo de la raíz que lleva cada capa de la identidad visual (ver tokens.css). */
const STYLE_ATTRIBUTES = {
  typography: "type",
  buttons: "buttons",
  icons: "icons",
  background: "bg",
  hero: "hero",
  nav: "nav",
  corners: "corners",
} as const satisfies Record<keyof ClubStyle, string>;

const DEFAULT_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%232F5BFF'/%3E%3Ctext x='16' y='21' font-family='system-ui' font-size='13' font-weight='700' text-anchor='middle' fill='white'%3ESM%3C/text%3E%3C/svg%3E";

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function setThemeColor(color: string | null): void {
  let meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (!color) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

/** Icono de la pestaña sin logo: las iniciales del club (como su escudo) sobre su color. */
function initialsFavicon(name: string, fill: string, ink: string): string {
  const letters = initials(name).replace(/[^\p{L}\p{N}]/gu, "") || "SM";
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>` +
    `<circle cx='16' cy='16' r='16' fill='${fill}'/>` +
    `<text x='16' y='21' font-family='system-ui' font-size='13' font-weight='700' text-anchor='middle' fill='${ink}'>${letters}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Lo que hace falta para pintar un club: su marca pública, o el borrador de los ajustes. */
export type ClubLook = Pick<
  OrganizationBranding,
  "name" | "brandPrimaryColor" | "brandSecondaryColor" | "logoUrl" | "style"
>;

/**
 * Pinta un club entero en la raíz (ADR 0043): colores, identidad visual (atributos que lee
 * tokens.css), escudo para la portada, icono de la pestaña y color de la barra del navegador.
 * Devuelve los avisos del motor de color.
 */
export function applyClubLook(look: ClubLook): string[] {
  const root = document.documentElement;
  const warnings = applyClubColors(
    look.brandPrimaryColor,
    look.brandSecondaryColor,
    look.style.background,
  );
  for (const [option, attribute] of Object.entries(STYLE_ATTRIBUTES)) {
    root.dataset[attribute] = look.style[option as keyof ClubStyle];
  }
  if (look.logoUrl) root.style.setProperty("--club-logo", `url("${look.logoUrl}")`);
  else root.style.removeProperty("--club-logo");
  const fill = root.style.getPropertyValue("--club-fill");
  const ink = root.style.getPropertyValue("--club-on-fill");
  setFavicon(look.logoUrl ?? initialsFavicon(look.name, fill, ink));
  setThemeColor(look.style.nav === "claro" ? null : fill);
  return warnings;
}

/** Fuera de un club manda la marca del producto, nunca la de un club. */
export function applyProductColors(): void {
  const theme = buildClubTheme({ primary: PRODUCT_BRAND, secondary: "#FFFFFF", mode: "light" });
  const root = document.documentElement;
  applyClubTheme(root, theme);
  for (const attribute of Object.values(STYLE_ATTRIBUTES)) delete root.dataset[attribute];
  root.style.removeProperty("--club-logo");
  setFavicon(DEFAULT_FAVICON);
  setThemeColor(null);
}

export function setShape(shape: Shape): void {
  document.documentElement.dataset.shape = shape;
}

/** Escritorio de gestión a partir de 1024 px (DESIGN.md, sección 6). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
