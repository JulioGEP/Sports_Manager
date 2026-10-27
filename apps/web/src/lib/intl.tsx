import type { ClubVoice, Locale } from "@sportsmanager/shared";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IntlProvider, ReactIntlErrorCode, useIntl } from "react-intl";
import ca from "@/messages/ca.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import caVoices from "@/messages/voices/ca.json";
import enVoices from "@/messages/voices/en.json";
import esVoices from "@/messages/voices/es.json";
import { initialLocale, writeLocaleCookie } from "./locale";

type Nested = { [key: string]: string | Nested };

/** react-intl quiere ids planos: `members.inviteDrawer.title`. */
function flatten(input: Nested, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[id] = value;
    else Object.assign(out, flatten(value, id));
  }
  return out;
}

const catalogs: Record<Locale, Record<string, string>> = {
  es: flatten(es),
  ca: flatten(ca),
  en: flatten(en),
};

/**
 * Voz del club en toda la web (ADR 0043). El diccionario de siempre es la voz `cercana`; las otras
 * dos reescriben encima los momentos de relación (saludo, vacíos, avisos tras guardar, partido,
 * retos, agenda). Los sensibles (dinero, salud, errores, accesos, bajas) no tienen capa: suenan
 * igual en todos los clubes. `messages.test.ts` lo vigila.
 */
type VoiceLayers = Partial<Record<Exclude<ClubVoice, "cercana">, Record<string, string>>>;
const voiceLayers: Record<Locale, VoiceLayers> = { es: esVoices, ca: caVoices, en: enVoices };

/** El diccionario de un idioma con la voz del club encima. */
export function voiceCatalog(locale: Locale, voice: ClubVoice): Record<string, string> {
  const layer = voice === "cercana" ? undefined : voiceLayers[locale][voice];
  return layer ? { ...catalogs[locale], ...layer } : catalogs[locale];
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale());
  const setLocale = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    setLocaleState(next);
    document.documentElement.lang = next;
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider
        locale={locale}
        defaultLocale="es"
        messages={catalogs[locale]}
        timeZone="Europe/Madrid"
        onError={(error) => {
          if (error.code !== ReactIntlErrorCode.MISSING_TRANSLATION) console.error(error);
        }}
      >
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleState {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale fuera de LocaleProvider");
  return value;
}

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** `t("inviteDrawer.title")` dentro de un bloque del diccionario, como antes con next-intl. */
export function useT(namespace?: string): Translate {
  const intl = useIntl();
  return useCallback(
    (key, values) => intl.formatMessage({ id: namespace ? `${namespace}.${key}` : key }, values),
    [intl, namespace],
  );
}

/** Todo lo que cuelga de aquí habla con la voz del club (ADR 0043). */
export function VoiceProvider({ voice, children }: { voice: ClubVoice; children: ReactNode }) {
  const { locale } = useLocale();
  const messages = useMemo(() => voiceCatalog(locale, voice), [locale, voice]);
  // Siempre el mismo árbol, también en `cercana`: cambiar de voz en la vista previa de los ajustes
  // no puede desmontar la pantalla (y perder lo que se está editando).
  return (
    <IntlProvider
      locale={locale}
      defaultLocale="es"
      messages={messages}
      timeZone="Europe/Madrid"
      onError={(error) => {
        if (error.code !== ReactIntlErrorCode.MISSING_TRANSLATION) console.error(error);
      }}
    >
      {children}
    </IntlProvider>
  );
}
