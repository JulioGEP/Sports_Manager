/**
 * Marca por defecto de un club recién creado y neutros que la API usa en los emails.
 * El design system de la interfaz vive en packages/design (ADR 0027).
 */

export const brandTokens = {
  "--color-brand-primary": "#d71920",
  "--color-brand-secondary": "#e8b52a",
} as const;

/** Tokens que cada organización puede sobrescribir desde su configuración. */
export type BrandTokenName = keyof typeof brandTokens;

export const tokens = {
  color: {
    brandPrimary: brandTokens["--color-brand-primary"],
    brandSecondary: brandTokens["--color-brand-secondary"],
    ink900: "#111827",
    ink800: "#1f2937",
    bg: "#f4f7fb",
    surface: "#ffffff",
    surfaceSoft: "#f8fafc",
    border: "#dbe3ec",
    text: "#111827",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    success: "#16885b",
    warning: "#f59e0b",
    danger: "#dc2626",
    info: "#2563eb",
  },
  font: {
    family: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    size: {
      xs: "0.75rem",
      sm: "0.875rem",
      md: "1rem",
      lg: "1.125rem",
      xl: "1.375rem",
      "2xl": "1.875rem",
      "3xl": "clamp(2rem, 4vw, 3rem)",
    },
    lineHeight: { tight: 1.1, body: 1.55 },
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.5rem",
    6: "2rem",
    7: "2.5rem",
    8: "3rem",
    9: "4rem",
  },
  radius: {
    sm: "0.75rem",
    md: "1rem",
    lg: "1.375rem",
    xl: "1.75rem",
    pill: "999px",
  },
  shadow: {
    sm: "0 8px 24px rgba(20, 36, 59, 0.05)",
    md: "0 16px 38px rgba(15, 23, 42, 0.09)",
    lg: "0 30px 90px rgba(0, 0, 0, 0.25)",
  },
  motion: { fast: "140ms ease", base: "220ms ease" },
  touchTargetMin: "44px",
} as const;

export type Tokens = typeof tokens;
