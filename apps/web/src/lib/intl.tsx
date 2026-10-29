import type { ClubVoice, Locale } from "@sportsmanager/shared";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { IntlProvider, ReactIntlErrorCode, useIntl } from "react-intl";
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

/**
 * Voz del club en toda la web (ADR 0043). El diccionario de siempre es la voz `cercana`; las otras
 * dos reescriben encima los momentos de relación (saludo, vacíos, avisos tras guardar, partido,
 * retos, agenda). Los sensibles (dinero, salud, errores, accesos, bajas) no tienen capa: suenan
 * igual en todos los clubes. `messages.test.ts` lo vigila.
 */
type VoiceLayers = Partial<Record<Exclude<ClubVoice, "cercana">, Record<string, string>>>;

interface Catalog {
  messages: Record<string, string>;
  voices: VoiceLayers;
}

/**
 * Diccionarios bajo demanda (ADR 0060): cada idioma es un fichero aparte y solo se descarga el que
 * se usa. Antes viajaban los tres (unos 680 KB) en el código de arranque y se aplanaban los tres.
 */
const loaders: Record<Locale, () => Promise<[{ default: Nested }, { default: VoiceLayers }]>> = {
  es: () => Promise.all([import("@/messages/es.json"), import("@/messages/voices/es.json")]),
  ca: () => Promise.all([import("@/messages/ca.json"), import("@/messages/voices/ca.json")]),
  en: () => Promise.all([import("@/messages/en.json"), import("@/messages/voices/en.json")]),
};

const catalogs = new Map<Locale, Catalog>();
const pending = new Map<Locale, Promise<void>>();

/** Descarga y prepara el diccionario de un idioma. Se puede llamar las veces que haga falta. */
export function loadLocale(locale: Locale): Promise<void> {
  if (catalogs.has(locale)) return Promise.resolve();
  let load = pending.get(locale);
  if (!load) {
    load = loaders[locale]().then(([base, voices]) => {
      catalogs.set(locale, { messages: flatten(base.default), voices: voices.default });
    });
    pending.set(locale, load);
  }
  return load;
}

/** El diccionario de un idioma con la voz del club encima. El idioma tiene que estar cargado. */
export function voiceCatalog(locale: Locale, voice: ClubVoice): Record<string, string> {
  const catalog = catalogs.get(locale);
  if (!catalog) return {};
  const layer = voice === "cercana" ? undefined : catalog.voices[voice];
  return layer ? { ...catalog.messages, ...layer } : catalog.messages;
}

/** Fuera de la render: el mismo manejador siempre, para que react-intl no rehaga su objeto. */
const onIntlError: NonNullable<ComponentProps<typeof IntlProvider>["onError"]> = (error) => {
  if (error.code !== ReactIntlErrorCode.MISSING_TRANSLATION) console.error(error);
};

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale());
  const setLocale = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    // Se cambia cuando el diccionario ya está: mientras llega, se sigue leyendo el de antes.
    void loadLocale(next).then(() => {
      setLocaleState(next);
      document.documentElement.lang = next;
    });
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider
        locale={locale}
        defaultLocale="es"
        messages={catalogs.get(locale)?.messages ?? {}}
        timeZone="Europe/Madrid"
        onError={onIntlError}
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
      onError={onIntlError}
    >
      {children}
    </IntlProvider>
  );
}
