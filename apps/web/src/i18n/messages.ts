import type { Locale } from "@sportsmanager/shared";

/** Carga el diccionario de la interfaz para un idioma. Los ficheros viven en apps/web/messages. */
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  switch (locale) {
    case "ca":
      return (await import("../../messages/ca.json")).default;
    case "en":
      return (await import("../../messages/en.json")).default;
    case "es":
      return (await import("../../messages/es.json")).default;
  }
}
