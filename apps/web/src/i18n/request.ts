import { resolveLocale } from "@sportsmanager/shared";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { getBranding } from "@/lib/branding";
import { loadMessages } from "./messages";

/**
 * Idioma sin enrutado por URL (ADR 0012): la misma página se ve en castellano, catalán o inglés
 * según la persona. Resolución: preferencia de la persona (cookie `locale`, que la web sincroniza
 * con `users.locale` al entrar y al cambiarla) → idioma del club del host → castellano.
 * Zona horaria fija de la plataforma para fechas y horas.
 */
export default getRequestConfig(async () => {
  const [store, branding] = await Promise.all([cookies(), getBranding()]);
  const locale = resolveLocale([store.get("locale")?.value, branding?.defaultLocale]);
  return { locale, messages: await loadMessages(locale), timeZone: "Europe/Madrid" };
});
