import type { Locale } from "@sportsmanager/shared";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IntlProvider, ReactIntlErrorCode, useIntl } from "react-intl";
import ca from "@/messages/ca.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
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
