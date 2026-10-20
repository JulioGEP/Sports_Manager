"use client";

import { LOCALES, MeResponseSchema, type Locale } from "@sportsmanager/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { writeLocaleCookie } from "@/lib/locale-cookie";

/**
 * Selector de idioma (Bloque 7). Guarda la preferencia en la cookie y, con sesión, en el perfil
 * (`PATCH /api/me`), para que siga a la persona entre dispositivos y llegue a los emails.
 */
export function LanguageSwitcher({
  hasSession,
  className,
}: {
  hasSession: boolean;
  className?: string;
}) {
  const t = useTranslations("locales");
  const current = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(locale: Locale) {
    setBusy(true);
    writeLocaleCookie(locale);
    if (hasSession) {
      try {
        await apiFetch("/api/me", { method: "PATCH", body: { locale }, schema: MeResponseSchema });
      } catch {
        // La cookie ya cambió: la página se ve en el idioma elegido aunque el perfil no se guarde.
      }
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <select
      className={["lang-select", className ?? ""].join(" ").trim()}
      value={current}
      disabled={busy}
      aria-label={t("label")}
      onChange={(e) => void change(e.target.value as Locale)}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {t(code)}
        </option>
      ))}
    </select>
  );
}
