"use client";

import { useTranslations } from "next-intl";
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
      {({ org, userName }) => (
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
            <h2>{t("apiStatus")}</h2>
            <ApiStatus />
          </section>
        </>
      )}
    </AppShell>
  );
}
