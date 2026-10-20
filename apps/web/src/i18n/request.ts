import { resolveLocale } from "@sportsmanager/shared";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { loadMessages } from "./messages";

/**
 * Idioma sin enrutado por URL: el mismo club se ve en castellano o catalán según la persona.
 * Resolución (Bloque 7 la completa): preferencia del usuario → idioma de la organización → es.
 * De momento, cookie `locale` y después el idioma por defecto.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale([store.get("locale")?.value]);
  return { locale, messages: await loadMessages(locale) };
});
