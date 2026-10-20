"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ApiStatus } from "@/components/api-status";
import { AppShell } from "@/components/app-shell";
import { useBranding } from "@/components/branding-provider";
import { Landing } from "@/components/landing";

export default function HomePage() {
  const t = useTranslations("home");
  const roles = useTranslations("roles");
  const branding = useBranding();
  if (!branding) return <Landing />;
  return (
    <AppShell>
      {({ org, userName, platformAdmin }) => (
        <>
          <section className="card">
            <h1>{t("greeting", { name: userName })}</h1>
            <p className="muted">{t("club", { club: org.organization.name })}</p>
            {org.actor.kind === "member" ? (
              <p>
                {t("yourRoles")}{" "}
                {org.actor.roles.map((role) => (
                  <span key={role} className="pill">
                    {roles(role)}
                  </span>
                ))}
              </p>
            ) : (
              <p className="muted">{org.actor.hasGrant ? t("supportFull") : t("supportLimited")}</p>
            )}
          </section>
          <section className="card">
            <h2>{t("actionsTitle")}</h2>
            <div className="actions">
              {org.actor.permissions.includes("org.members.read") ? (
                <Link className="action" href="/members">
                  <strong>{t("actionMembers")}</strong>
                  <span className="muted">{t("actionMembersBody")}</span>
                </Link>
              ) : null}
              {org.actor.permissions.includes("org.settings.write") ? (
                <Link className="action" href="/settings">
                  <strong>{t("actionSettings")}</strong>
                  <span className="muted">{t("actionSettingsBody")}</span>
                </Link>
              ) : null}
              <Link className="action" href="/clubs">
                <strong>{t("actionClubs")}</strong>
                <span className="muted">{t("actionClubsBody")}</span>
              </Link>
              {platformAdmin ? (
                <Link className="action" href="/admin">
                  <strong>{t("actionAdmin")}</strong>
                  <span className="muted">{t("actionAdminBody")}</span>
                </Link>
              ) : null}
            </div>
            <p className="muted">{t("phaseNote")}</p>
          </section>
          <section className="card">
            <h2>{t("apiStatus")}</h2>
            <ApiStatus />
          </section>
        </>
      )}
    </AppShell>
  );
}
