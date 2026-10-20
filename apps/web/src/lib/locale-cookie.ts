import type { Locale } from "@sportsmanager/shared";

export const LOCALE_COOKIE = "locale";

export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function readLocaleCookie(): string | null {
  const match = new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ?? null;
}
