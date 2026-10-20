import { LOCALES, type Locale } from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocale, useT } from "@/lib/intl";
import { ME_QUERY } from "@/lib/session";
import { controlClass } from "@/ui/field";

/** Idioma de la interfaz. Con sesión, también se guarda en el perfil (Bloque 7). */
export function LanguageSwitcher({
  hasSession,
  compact = false,
}: {
  hasSession: boolean;
  compact?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  const t = useT("locales");
  const client = useQueryClient();

  async function onChange(next: Locale) {
    setLocale(next);
    if (hasSession) {
      try {
        await apiFetch("/api/me", { method: "PATCH", body: { locale: next }, club: null });
        await client.invalidateQueries({ queryKey: ME_QUERY });
      } catch {
        /* la cookie ya está escrita; el perfil se actualizará la próxima vez */
      }
    }
  }

  return (
    <select
      aria-label={t("label")}
      className={`${controlClass} ${compact ? "!h-10 w-auto px-3 text-secondary" : "w-auto"}`}
      value={locale}
      onChange={(e) => void onChange(e.target.value as Locale)}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {t(code)}
        </option>
      ))}
    </select>
  );
}
