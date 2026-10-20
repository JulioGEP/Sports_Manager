import { createCopy, type CopyFile } from "@sportsmanager/design";
import ca from "@sportsmanager/design/i18n/ca.json";
import en from "@sportsmanager/design/i18n/en.json";
import es from "@sportsmanager/design/i18n/es.json";
import { useCallback } from "react";
import { useReadyClub } from "./club";
import { useLocale } from "./intl";

const copy = createCopy({ es: es as CopyFile, ca: ca as CopyFile, en: en as CopyFile });

/**
 * Textos del design system con la voz del club (DESIGN.md 11): los momentos de relación hablan
 * como el club eligió; los sensibles (bajas, dinero, datos personales) siempre en voz profesional.
 */
export function useVoice() {
  const { locale } = useLocale();
  const { branding } = useReadyClub();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      copy(locale, key, { voice: branding.voice, ...(vars ? { vars } : {}) }),
    [locale, branding.voice],
  );
}
