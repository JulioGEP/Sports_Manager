"use client";

import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useSession } from "@/lib/session";
import { ButtonLink, Icon } from "@/ui";

/** Portada de la plataforma cuando el host no es ningún club: entrar o elegir club. */
export function Landing() {
  const t = useTranslations("landing");
  const session = useSession();
  return (
    <div className="auth">
      <div className="auth__box landing">
        <span className="brand-mark" aria-hidden="true">
          SM
        </span>
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
        {session.kind === "authenticated" ? (
          <div className="row">
            <ButtonLink href="/clubs" icon={<Icon.Grid size={18} />}>
              {t("myClubs")}
            </ButtonLink>
            {session.me.platformAdmin ? (
              <ButtonLink href="/admin" variant="secondary" icon={<Icon.Shield size={18} />}>
                {t("admin")}
              </ButtonLink>
            ) : null}
          </div>
        ) : (
          <ButtonLink href="/login">{t("signIn")}</ButtonLink>
        )}
        <div className="auth__footer">
          <LanguageSwitcher hasSession={session.kind === "authenticated"} />
        </div>
      </div>
    </div>
  );
}
