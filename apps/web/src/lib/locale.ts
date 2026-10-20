import { DEFAULT_LOCALE, LOCALES, type Locale } from "@sportsmanager/shared";

export const LOCALE_COOKIE = "locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function readLocaleCookie(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : null;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/** Idioma inicial: cookie → navegador → castellano. El perfil de la persona manda cuando hay sesión. */
export function initialLocale(): Locale {
  const fromCookie = readLocaleCookie();
  if (fromCookie) return fromCookie;
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const short = candidate.toLowerCase().split("-")[0];
    if (isLocale(short)) return short;
  }
  return DEFAULT_LOCALE;
}
