"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSession } from "@/lib/session";

/** Portada de la plataforma cuando el host no es ningún club: entrar o elegir club. */
export function Landing() {
  const t = useTranslations("landing");
  const session = useSession();
  return (
    <main className="page">
      <section className="card landing">
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
        {session.kind === "authenticated" ? (
          <Link className="button" href="/clubs">
            {t("myClubs")}
          </Link>
        ) : (
          <Link className="button" href="/login">
            {t("signIn")}
          </Link>
        )}
      </section>
    </main>
  );
}
