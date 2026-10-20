"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { signOut, useRequiredSession } from "@/lib/session";
import { Alert, Avatar, Button, ButtonLink, Icon } from "@/ui";

/** Panel del negocio (ADR 0022): barra lateral oscura, sin marca de ningún club. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const t = useTranslations("platform.nav");
  const pathname = usePathname();
  const router = useRouter();
  const session = useRequiredSession("/admin/login");

  async function onSignOut() {
    try {
      await signOut();
    } finally {
      router.replace("/admin/login");
    }
  }

  if (session.kind === "loading" || session.kind === "anonymous") {
    return (
      <div className="auth">
        <div className="skeleton" style={{ width: "min(480px, 100%)" }}>
          <div className="skeleton__line" />
          <div className="skeleton__block" />
        </div>
      </div>
    );
  }
  if (session.kind === "error") {
    return (
      <div className="auth">
        <Alert kind="error">{t("apiError")}</Alert>
      </div>
    );
  }
  if (!session.me.platformAdmin) {
    return (
      <div className="auth auth--platform">
        <div className="auth__box">
          <Alert
            kind="warning"
            title={t("forbiddenTitle")}
            actions={
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Icon.Logout size={16} />}
                  onClick={() => void onSignOut()}
                >
                  {t("switchAccount")}
                </Button>
                <ButtonLink
                  href="/"
                  variant="secondary"
                  size="sm"
                  icon={<Icon.ArrowLeft size={16} />}
                >
                  {t("backToApp")}
                </ButtonLink>
              </>
            }
          >
            {t("forbiddenBody", { email: session.me.user.email })}
          </Alert>
        </div>
      </div>
    );
  }

  const links = [
    { href: "/admin", label: t("clubs"), icon: <Icon.Building size={18} />, exact: true },
    { href: "/admin/audit", label: t("audit"), icon: <Icon.Activity size={18} />, exact: false },
    { href: "/admin/system", label: t("system"), icon: <Icon.Info size={18} />, exact: false },
  ];
  const isActive = (href: string, exact: boolean) =>
    exact
      ? pathname === href || /^\/admin\/(?!audit|system)[^/]+$/.test(pathname)
      : pathname.startsWith(href);

  return (
    <div className="pshell">
      <aside className="sidebar">
        <Link href="/admin" className="sidebar__brand">
          <span className="brand-mark sidebar__mark" aria-hidden="true">
            SM
          </span>
          <span>
            <strong>Sports Manager</strong>
            <span>{t("subtitle")}</span>
          </span>
        </Link>
        <nav className="sidebar__nav" aria-label={t("mainNav")}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`navlink${isActive(l.href, l.exact) ? " navlink--active" : ""}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <Avatar name={session.me.user.name} size="sm" />
            <div>
              <strong>{session.me.user.name}</strong>
              <span>{session.me.user.email}</span>
            </div>
          </div>
          <LanguageSwitcher hasSession />
          <Link href="/" className="navlink">
            <Icon.ArrowLeft size={18} />
            {t("backToApp")}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon.Logout size={18} />}
            onClick={() => void onSignOut()}
          >
            {t("signOut")}
          </Button>
        </div>
      </aside>
      <main className="pmain">{children}</main>
    </div>
  );
}
