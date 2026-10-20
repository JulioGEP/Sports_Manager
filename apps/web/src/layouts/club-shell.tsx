"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useBranding } from "@/components/branding-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ClubProvider, useClub, type ClubState } from "@/lib/club-context";
import { signOut } from "@/lib/session";
import { Alert, Avatar, ButtonLink, Icon, Menu, initials } from "@/ui";

/** Espacio de un club: barra superior con su marca, navegación por permisos y menú de persona. */
export function ClubShell({ children }: { children: ReactNode }) {
  return (
    <ClubProvider>
      <ClubFrame>{children}</ClubFrame>
    </ClubProvider>
  );
}

function ClubFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const { state } = useClub();
  const branding = useBranding();
  const pathname = usePathname();
  const router = useRouter();

  const me = state.kind === "ready" || state.kind === "no_membership" ? state.me : null;
  const permissions = state.kind === "ready" ? state.org.actor.permissions : [];
  const clubName = branding?.name ?? (state.kind === "ready" ? state.org.organization.name : "");
  const memberships =
    state.kind === "ready" || state.kind === "no_membership" ? state.memberships : [];

  const links = [
    { href: "/", label: t("home"), icon: <Icon.Home size={18} />, show: state.kind === "ready" },
    {
      href: "/members",
      label: t("members"),
      icon: <Icon.Users size={18} />,
      show: permissions.includes("org.members.read"),
    },
    {
      href: "/settings",
      label: t("settings"),
      icon: <Icon.Settings size={18} />,
      show: permissions.includes("org.settings.write"),
    },
  ].filter((l) => l.show);

  async function onSignOut() {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link href="/" className="topbar__brand" aria-label={clubName}>
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="topbar__logo" />
            ) : (
              <span className="brand-mark" aria-hidden="true">
                {initials(clubName || "SM")}
              </span>
            )}
            <span className="topbar__name">{clubName}</span>
          </Link>
          <nav className="topbar__nav" aria-label={t("mainNav")}>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`navlink${pathname === l.href ? " navlink--active" : ""}`}
              >
                {l.icon}
                {l.label}
              </Link>
            ))}
          </nav>
          {me ? (
            <div className="topbar__user">
              <Menu
                label={t("userMenu")}
                trigger={
                  <>
                    <Avatar name={me.user.name} size="sm" />
                    <Icon.ChevronDown size={16} />
                  </>
                }
              >
                <div className="menu__identity">
                  <Avatar name={me.user.name} />
                  <div>
                    <strong>{me.user.name}</strong>
                    <span>{me.user.email}</span>
                  </div>
                </div>
                {memberships.length > 1 ? (
                  <Link href="/clubs" className="menu__item">
                    <Icon.Grid size={18} />
                    {t("myClubs")}
                  </Link>
                ) : null}
                {me.platformAdmin ? (
                  <Link href="/admin" className="menu__item">
                    <Icon.Shield size={18} />
                    {t("platformAdmin")}
                  </Link>
                ) : null}
                <div className="menu__section">{t("language")}</div>
                <div className="menu__lang" onClick={(e) => e.stopPropagation()}>
                  <LanguageSwitcher hasSession />
                </div>
                <button type="button" className="menu__item" onClick={() => void onSignOut()}>
                  <Icon.Logout size={18} />
                  {t("signOut")}
                </button>
              </Menu>
            </div>
          ) : null}
        </div>
      </header>
      <main className="main">
        <ClubBody state={state}>{children}</ClubBody>
      </main>
    </div>
  );
}

function ClubBody({ state, children }: { state: ClubState; children: ReactNode }) {
  const t = useTranslations("nav");
  if (state.kind === "loading") {
    return (
      <div className="skeleton" aria-busy="true" aria-label={t("loading")}>
        <div className="skeleton__line" style={{ width: "40%" }} />
        <div className="skeleton__block" />
        <div className="skeleton__block" />
      </div>
    );
  }
  if (state.kind === "error") return <Alert kind="error">{t("apiError")}</Alert>;
  if (state.kind === "no_membership") {
    return (
      <div className="main--narrow">
        <Alert
          kind="info"
          title={t("noMembershipTitle")}
          actions={
            <>
              {state.memberships.length > 0 ? (
                <ButtonLink href="/clubs" variant="secondary" size="sm">
                  {t("myClubs")}
                </ButtonLink>
              ) : null}
              {state.me.platformAdmin ? (
                <ButtonLink href="/admin" variant="secondary" size="sm">
                  {t("platformAdmin")}
                </ButtonLink>
              ) : null}
            </>
          }
        >
          {t("noMembershipBody", { email: state.me.user.email })}
        </Alert>
      </div>
    );
  }
  return (
    <>
      {state.org.actor.kind === "platform_support" ? (
        <div className="banner" role="status">
          <Icon.Shield size={20} />
          <span>{state.org.actor.hasGrant ? t("supportFull") : t("supportLimited")}</span>
        </div>
      ) : null}
      {children}
    </>
  );
}
