/**
 * Motor de color del club.
 *
 * Entrada: color principal y secundario del club (hex) y el modo.
 * Salida: variables CSS listas para aplicar en el elemento raíz de la app del club.
 *
 * Reglas que garantiza:
 * - El color exacto del club se usa en rellenos (botones, escudo, portada).
 * - El texto sobre ese relleno es blanco o tinta, el que más contraste dé.
 * - El texto en color del club cumple 4,5:1 sobre la superficie.
 * - En modo oscuro, el relleno cumple 3:1 sobre la superficie.
 * - Si el principal es casi blanco, el secundario toma las acciones.
 *
 * Ver DESIGN.md, sección 3.
 */

export type Mode = "light" | "dark";

export interface ClubThemeOptions {
  /** Color principal del club, en hex. */
  primary: string;
  /** Color secundario del club, en hex. */
  secondary: string;
  /** Modo de color. Por defecto, claro. */
  mode?: Mode;
  /**
   * Intensidad del tinte de los neutros, de 0 a 2. La estrategia Portada usa 0.6; el fondo
   * "neutro" del club usa 0 y el "teñido", 1,25 (ADR 0043).
   */
  tint?: number;
}

export interface ClubTheme {
  /** Variables CSS: nombre → valor. */
  vars: Record<string, string>;
  /** Avisos para mostrar al club al configurar sus colores. */
  warnings: string[];
  /** true si el secundario ha tomado el papel del principal. */
  swapped: boolean;
  /** Modo con el que se ha generado. */
  mode: Mode;
}

type RGB = [number, number, number];
interface OKLCH {
  L: number;
  C: number;
  h: number;
}

export const INK = "#0B0D12";
export const WHITE = "#FFFFFF";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];

const L_LADDER = [0.975, 0.94, 0.88, 0.8, 0.71, 0.62, 0.53, 0.45, 0.37, 0.29, 0.21];
const C_FACTOR = [0.1, 0.22, 0.45, 0.7, 0.88, 1, 1, 0.92, 0.8, 0.66, 0.52];

/* ---------- Conversión de color ---------- */

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const delin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function parseHex(hex: string): RGB {
  let h = String(hex || "")
    .trim()
    .replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((x) => x + x)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Color no válido: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

export function toOklch(hex: string): OKLCH {
  const [r, g, b] = parseHex(hex).map(lin) as RGB;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    C: Math.sqrt(A * A + B * B),
    h: Math.atan2(B, A),
  };
}

function oklchToLinearRgb(L: number, C: number, h: number): RGB {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → hex, reduciendo croma hasta entrar en la gama sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  let c = C;
  let v = oklchToLinearRgb(L, c, h);
  let n = 0;
  while (v.some((x) => x < -0.0005 || x > 1.0005) && n < 48) {
    c *= 0.9;
    v = oklchToLinearRgb(L, c, h);
    n++;
  }
  return (
    "#" +
    v
      .map((x) => {
        const s = delin(Math.min(1, Math.max(0, x)));
        return Math.round(Math.min(1, Math.max(0, s)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
      .toUpperCase()
  );
}

/* ---------- Contraste (WCAG 2.x) ---------- */

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(lin) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Blanco o tinta: el que más contraste dé sobre el fondo. */
export function inkOn(bg: string): string {
  return contrast(bg, WHITE) >= contrast(bg, INK) ? WHITE : INK;
}

function firstWithContrast(candidates: string[], bg: string, min: number): string {
  for (const c of candidates) if (contrast(c, bg) >= min) return c;
  return candidates[candidates.length - 1] ?? bg;
}

/** Mezcla dos colores en sRGB: `t` es cuánto de `b` lleva el resultado (0, solo `a`; 1, solo `b`). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round((v * (1 - t) + (y[i] ?? 0) * t) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex).map((x) => Math.round(x * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- Escala del club ---------- */

export function clubScale(hex: string): Record<Step, string> {
  const o = toOklch(hex);
  const out = {} as Record<Step, string>;
  STEPS.forEach((step, i) => {
    out[step] = oklchToHex(L_LADDER[i] ?? 0.5, o.C * (C_FACTOR[i] ?? 1), o.h);
  });
  return out;
}

/* ---------- Tema completo ---------- */

export function buildClubTheme(opts: ClubThemeOptions): ClubTheme {
  const mode: Mode = opts.mode ?? "light";
  const tint = Math.min(2, Math.max(0, opts.tint ?? 0.6));
  const warnings: string[] = [];

  const p = toOklch(opts.primary);
  const swapped = p.C < 0.03 && p.L > 0.8;
  const club = swapped ? opts.secondary : opts.primary;
  const second = swapped ? opts.primary : opts.secondary;
  if (swapped) {
    warnings.push(
      "El color principal es casi blanco. El secundario se usará en botones y acciones.",
    );
  }

  const o = toOklch(club);
  const S = clubScale(club);
  const tc = Math.min(o.C, 0.03) * tint;
  const n = (L: number, f = 1) => oklchToHex(L, tc * f, o.h);

  const vars: Record<string, string> = {};
  STEPS.forEach((step) => {
    vars[`--club-${step}`] = S[step];
  });

  if (mode === "light") {
    const surface = WHITE;
    const fill = club;
    const onFill = inkOn(fill);
    const clubText = firstWithContrast(
      [club, S[600], S[700], S[800], S[900], S[950]],
      surface,
      4.5,
    );
    const soft = S[100];
    const softText = firstWithContrast([club, S[700], S[800], S[900], S[950]], soft, 4.5);
    const white = onFill === WHITE;

    Object.assign(vars, {
      "--surface-page": n(0.975),
      "--surface": surface,
      "--surface-raised": n(0.955, 1.2),
      "--border": n(0.905, 1.2),
      "--line": n(0.94),
      "--text": INK,
      "--text-muted": n(0.5),
      "--club-fill": fill,
      "--club-on-fill": onFill,
      "--club-edge": contrast(fill, surface) < 1.6 ? S[400] : fill,
      "--club-text": clubText,
      "--club-soft": soft,
      "--club-soft-text": softText,
      "--club-deep": S[900],
      "--club-on-deep": inkOn(S[900]),
      "--club-second": second,
      "--icon-duo": withAlpha(clubText, 0.16),
      "--icon-duo-active": withAlpha(clubText, 0.28),
      "--hero-bg": fill,
      "--hero-ink": onFill,
      "--hero-sub": white ? "rgba(255, 255, 255, 0.86)" : "rgba(11, 13, 18, 0.78)",
      "--hero-crest-bg": onFill,
      "--hero-crest-ink": fill,
      "--hero-btn-bg": onFill,
      "--hero-btn-ink": white ? clubText : fill,
      "--hero-ghost": white ? "rgba(255, 255, 255, 0.6)" : "rgba(11, 13, 18, 0.45)",
    });

    if (contrast(second, fill) < 1.4) {
      warnings.push(
        "El secundario apenas se distingue del principal. La franja de la portada no se verá.",
      );
    }
  } else {
    const surface = n(0.215);
    const fill = firstWithContrast([club, S[500], S[400], S[300], S[200]], surface, 3);
    const onFill = inkOn(fill);
    const clubText = firstWithContrast([club, S[300], S[200], S[100], S[50]], surface, 4.5);
    const soft = oklchToHex(0.32, Math.min(o.C, 0.08), o.h);
    const deep = oklchToHex(0.25, Math.min(o.C, 0.09), o.h);

    Object.assign(vars, {
      "--surface-page": n(0.17),
      "--surface": surface,
      "--surface-raised": n(0.26),
      "--border": n(0.31),
      "--line": n(0.27),
      "--text": "#F2F3F5",
      "--text-muted": n(0.75, 0.6),
      "--club-fill": fill,
      "--club-on-fill": onFill,
      "--club-edge": fill,
      "--club-text": clubText,
      "--club-soft": soft,
      "--club-soft-text": firstWithContrast([S[200], S[100], S[50], WHITE], soft, 4.5),
      "--club-deep": deep,
      "--club-on-deep": "#F2F3F5",
      "--club-second": second,
      "--icon-duo": withAlpha(clubText, 0.2),
      "--icon-duo-active": withAlpha(clubText, 0.32),
      "--hero-bg": deep,
      "--hero-ink": "#F2F3F5",
      "--hero-sub": n(0.75, 0.6),
      "--hero-crest-bg": fill,
      "--hero-crest-ink": onFill,
      "--hero-btn-bg": fill,
      "--hero-btn-ink": onFill,
      "--hero-ghost": n(0.31),
    });

    if (fill !== club) {
      warnings.push("En modo oscuro el color del club se aclara para que los botones se vean.");
    }
  }

  Object.assign(vars, navVars(club, vars, S, o));

  return { vars, warnings, swapped, mode };
}

/**
 * Navegación en el color del club o en oscuro (ADR 0043). El texto de la barra cumple 4,5:1 sobre
 * su fondo y el elemento activo se distingue 3:1 del fondo, para cualquier club. La barra clara usa
 * los neutros de siempre y no necesita nada de aquí.
 */
function navVars(
  club: string,
  vars: Record<string, string>,
  S: Record<Step, string>,
  o: OKLCH,
): Record<string, string> {
  const fill = vars["--club-fill"] ?? club;
  const onFill = vars["--club-on-fill"] ?? inkOn(fill);
  // Activo en la barra del club: la pastilla se invierte (blanco o tinta) y el texto va en el color
  // legible del club. Un tinte del relleno no llega a 4,5:1 con rojos y azules medios.
  const activeClubInk = onFill === WHITE ? (vars["--club-text"] ?? fill) : fill;

  const dark = oklchToHex(0.2, Math.min(o.C, 0.05), o.h);
  const light = "#F2F3F5";
  const activeDark = firstWithContrast([fill, S[500], S[400], S[300], S[200]], dark, 3);

  return {
    "--navc-bg": fill,
    "--navc-ink": onFill,
    "--navc-muted": firstWithContrast(
      [mixHex(onFill, fill, 0.24), mixHex(onFill, fill, 0.14), onFill],
      fill,
      4.5,
    ),
    "--navc-hover": mixHex(fill, onFill, 0.1),
    "--navc-active": onFill,
    "--navc-active-ink": activeClubInk,
    "--navc-accent": onFill,
    "--navc-edge": mixHex(fill, onFill, 0.2),
    "--navc-crest-ring": withAlpha(onFill, 0.7),

    "--navd-bg": dark,
    "--navd-ink": light,
    "--navd-muted": firstWithContrast(
      [mixHex(dark, light, 0.68), mixHex(dark, light, 0.8), light],
      dark,
      4.5,
    ),
    "--navd-hover": mixHex(dark, light, 0.08),
    "--navd-active": activeDark,
    "--navd-active-ink": inkOn(activeDark),
    "--navd-accent": firstWithContrast([S[300], S[200], S[100], WHITE], dark, 4.5),
    "--navd-edge": mixHex(dark, light, 0.12),
    "--navd-crest-ring": "transparent",

    /** Velo de la portada (degradado): oscurece si el texto es blanco y aclara si es tinta. */
    "--hero-shade": luminance(vars["--hero-ink"] ?? onFill) > 0.5 ? "#000000" : WHITE,
  };
}

/** Aplica el tema en un elemento (normalmente document.documentElement). */
export function applyClubTheme(el: HTMLElement, theme: ClubTheme): void {
  for (const [k, v] of Object.entries(theme.vars)) el.style.setProperty(k, v);
  el.dataset.theme = theme.mode;
}
