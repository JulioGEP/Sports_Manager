import { z } from "zod";

/**
 * Identidad visual del club (ADR 0043). Además de sus dos colores y su logo, cada club elige cómo
 * se ve su plataforma: tipografía, botones, iconos, fondo, portada, navegación y esquinas. Son
 * opciones cerradas del design system, no CSS libre: cualquier combinación sigue cumpliendo el
 * contraste y las medidas de DESIGN.md. Los valores por defecto son el aspecto de siempre.
 */

/** Pareja de títulos y texto. Las cifras siguen siempre en Geist Mono (DESIGN.md 4). */
export const CLUB_TYPOGRAPHIES = [
  "moderna",
  "clasica",
  "deportiva",
  "amable",
  "geometrica",
] as const;
export type ClubTypography = (typeof CLUB_TYPOGRAPHIES)[number];

/** Forma y peso de los botones y controles. `sistema`: píldora en la app, radio 8 en gestión. */
export const CLUB_BUTTON_STYLES = ["sistema", "pildora", "suave", "recta", "relieve"] as const;
export type ClubButtonStyle = (typeof CLUB_BUTTON_STYLES)[number];

/** Peso de los iconos (Phosphor y deporte propios). `duotono`: trazo y relleno suave del club. */
export const CLUB_ICON_STYLES = ["duotono", "linea", "fina", "gruesa", "relleno"] as const;
export type ClubIconStyle = (typeof CLUB_ICON_STYLES)[number];

/** Fondo de las pantallas: neutros teñidos, grises puros, más teñido, degradado o trama. */
export const CLUB_BACKGROUNDS = ["liso", "neutro", "tenido", "degradado", "trama"] as const;
export type ClubBackground = (typeof CLUB_BACKGROUNDS)[number];

/** Portada del club (DESIGN.md 7): color liso, degradado, rayas, banda o el escudo de fondo. */
export const CLUB_HERO_STYLES = ["liso", "degradado", "rayas", "banda", "escudo"] as const;
export type ClubHeroStyle = (typeof CLUB_HERO_STYLES)[number];

/** Barra lateral y barra inferior: claras, en el color del club u oscuras. */
export const CLUB_NAV_STYLES = ["claro", "club", "oscuro"] as const;
export type ClubNavStyle = (typeof CLUB_NAV_STYLES)[number];

/** Esquinas de tarjetas, campos y paneles. */
export const CLUB_CORNERS = ["sistema", "redondeadas", "rectas"] as const;
export type ClubCorners = (typeof CLUB_CORNERS)[number];

export const ClubStyleSchema = z.object({
  typography: z.enum(CLUB_TYPOGRAPHIES),
  buttons: z.enum(CLUB_BUTTON_STYLES),
  icons: z.enum(CLUB_ICON_STYLES),
  background: z.enum(CLUB_BACKGROUNDS),
  hero: z.enum(CLUB_HERO_STYLES),
  nav: z.enum(CLUB_NAV_STYLES),
  corners: z.enum(CLUB_CORNERS),
});
export type ClubStyle = z.infer<typeof ClubStyleSchema>;

/** El aspecto de siempre: un club nuevo, o uno que no ha tocado nada, se ve igual que antes. */
export const DEFAULT_CLUB_STYLE: ClubStyle = {
  typography: "moderna",
  buttons: "sistema",
  icons: "duotono",
  background: "liso",
  hero: "liso",
  nav: "claro",
  corners: "sistema",
};

/** Cada opción con su lista, para pintar los selectores sin repetirlas en la web. */
export const CLUB_STYLE_OPTIONS = {
  typography: CLUB_TYPOGRAPHIES,
  buttons: CLUB_BUTTON_STYLES,
  icons: CLUB_ICON_STYLES,
  background: CLUB_BACKGROUNDS,
  hero: CLUB_HERO_STYLES,
  nav: CLUB_NAV_STYLES,
  corners: CLUB_CORNERS,
} as const satisfies { [K in keyof ClubStyle]: readonly ClubStyle[K][] };

/** Lema del club: una frase corta que sale en la portada, bajo el nombre. Vacío es sin lema. */
export const CLUB_MOTTO_MAX = 80;
export const ClubMottoSchema = z.string().trim().max(CLUB_MOTTO_MAX).nullable();

/** El lema tal como se guarda: sin espacios de más y nulo si queda vacío. */
export function normalizeMotto(motto: string | null): string | null {
  const value = motto?.trim() ?? "";
  return value === "" ? null : value;
}
