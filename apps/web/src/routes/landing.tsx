import { useEffect } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/intl";
import { useSession } from "@/lib/session";
import { applyProductColors, setShape } from "@/lib/theme";
import { ButtonLink, Icon } from "@/ui";

/** Portada del producto: fuera de cualquier club. Entrar o elegir club. */
export function Landing() {
  const t = useT("landing");
  const session = useSession();
  useEffect(() => {
    applyProductColors();
    setShape("envolvente");
    document.title = "Sports Manager";
  }, []);
  return (
    <div className="grid min-h-screen place-items-center px-5 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <span
          aria-hidden="true"
          className="grid size-16 place-items-center rounded-full bg-brand text-title2 font-semibold text-white"
        >
          SM
        </span>
        <h1 className="text-display lg:text-display-lg text-ink">{t("title")}</h1>
        <p className="text-body text-muted">{t("subtitle")}</p>
        {session.kind === "authenticated" ? (
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink to="/clubs" icon={<Icon.SquaresFour size={20} aria-hidden="true" />}>
              {t("myClubs")}
            </ButtonLink>
            {session.me.platformAdmin ? (
              <ButtonLink
                to="/admin"
                variant="secondary"
                icon={<Icon.ShieldCheck size={20} aria-hidden="true" />}
              >
                {t("admin")}
              </ButtonLink>
            ) : null}
          </div>
        ) : (
          <ButtonLink to="/login">{t("signIn")}</ButtonLink>
        )}
        <LanguageSwitcher hasSession={session.kind === "authenticated"} compact />
      </div>
    </div>
  );
}
