"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { signOut, useRequiredSession } from "@/lib/session";

/** Cabecera del admin interno (ADR 0022). Solo administradores de plataforma. */
export function AdminShell({ children }: { children: (ctx: { userName: string }) => ReactNode }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const session = useRequiredSession();

  if (session.kind === "loading" || session.kind === "anonymous") {
    return <p className="muted page page--wide">{t("loading")}</p>;
  }
  if (session.kind === "error") {
    return <p className="alert alert--error page page--wide">{t("apiError")}</p>;
  }
  if (!session.me.platformAdmin) {
    return (
      <main className="page">
        <section className="card">
          <h1>{t("forbiddenTitle")}</h1>
          <p className="muted">{t("forbiddenBody", { email: session.me.user.email })}</p>
          <Link className="button button--secondary" href="/">
            {t("backToApp")}
          </Link>
        </section>
      </main>
    );
  }

  async function onSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="page page--wide">
      <header className="topbar">
        <div>
          <strong>{t("title")}</strong>
          <span className="muted"> · {session.me.user.name}</span>
        </div>
        <nav className="row">
          <Link href="/admin">{t("organizations")}</Link>
          <Link href="/">{t("backToApp")}</Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void onSignOut()}
          >
            {t("signOut")}
          </button>
        </nav>
      </header>
      {children({ userName: session.me.user.name })}
    </div>
  );
}
