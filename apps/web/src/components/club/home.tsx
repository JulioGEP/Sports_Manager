"use client";

import { InvitationsResponseSchema, MembersResponseSchema } from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useBranding } from "@/components/branding-provider";
import { apiFetch } from "@/lib/api";
import { useReadyClub } from "@/lib/club-context";
import { Badge, ButtonLink, Card, Icon, PageHeader, Stat } from "@/ui";

interface Counts {
  members: number | null;
  coaches: number | null;
  pending: number | null;
}

/** Inicio del club: resumen, primeros pasos para quien administra y lo que viene en la Fase 1. */
export function ClubHome() {
  const t = useTranslations("home");
  const roles = useTranslations("roles");
  const { me, org } = useReadyClub();
  const branding = useBranding();
  const permissions = org.actor.permissions;
  const canReadMembers = permissions.includes("org.members.read");
  const canInvite = permissions.includes("org.members.invite");
  const canSettings = permissions.includes("org.settings.write");
  const [counts, setCounts] = useState<Counts>({ members: null, coaches: null, pending: null });

  useEffect(() => {
    if (org.organization.view === "support") {
      const byRole = org.organization.counts.membersByRole;
      setCounts({
        members: Object.values(byRole).reduce((a, b) => a + b, 0),
        coaches: byRole.coach,
        pending: org.organization.counts.pendingInvitations,
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Counts = { members: null, coaches: null, pending: null };
      if (canReadMembers) {
        try {
          const res = await apiFetch("/api/org/members", { schema: MembersResponseSchema });
          next.members = res.members.length;
          next.coaches = res.members.filter((m) => m.roles.includes("coach")).length;
        } catch {
          /* se queda sin cifra */
        }
      }
      if (canInvite) {
        try {
          const res = await apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema });
          next.pending = res.invitations.filter((i) => i.state === "pending").length;
        } catch {
          /* se queda sin cifra */
        }
      }
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [org, canReadMembers, canInvite]);

  const defaultColors =
    branding?.brandPrimaryColor === brandTokens["--color-brand-primary"] &&
    branding?.brandSecondaryColor === brandTokens["--color-brand-secondary"];
  const steps = [
    { key: "logo", done: Boolean(branding?.logoUrl), href: "/settings?tab=logo" },
    { key: "colors", done: !defaultColors, href: "/settings?tab=brand" },
    {
      key: "invite",
      done: (counts.coaches ?? 0) > 0 || (counts.pending ?? 0) > 0,
      href: "/members?invite=1",
    },
  ] as const;

  return (
    <div className="stack">
      <PageHeader
        title={t("greeting", { name: me.user.name.split(" ")[0] ?? me.user.name })}
        description={t("subtitle", { club: org.organization.name })}
      />

      <div className="stats">
        {counts.members !== null ? (
          <Stat icon={<Icon.Users />} value={counts.members} label={t("stats.members")} />
        ) : null}
        {counts.pending !== null ? (
          <Stat icon={<Icon.Mail />} value={counts.pending} label={t("stats.pending")} />
        ) : null}
        <Stat
          icon={<Icon.Shield />}
          value={
            org.actor.kind === "member" ? (
              <span className="cell-badges">
                {org.actor.roles.map((r) => (
                  <Badge key={r} tone="brand">
                    {roles(r)}
                  </Badge>
                ))}
              </span>
            ) : (
              <Badge tone="warning">{t("support.badge")}</Badge>
            )
          }
          label={t("stats.yourRole")}
        />
      </div>

      <div className="grid-2">
        {canSettings ? (
          <Card title={t("firstSteps.title")} description={t("firstSteps.description")}>
            <ul className="checklist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {steps.map((step) => (
                <li
                  key={step.key}
                  className={`checklist__item${step.done ? " checklist__item--done" : ""}`}
                >
                  <span className="checklist__text">
                    <span className={`checklist__mark${step.done ? " checklist__mark--done" : ""}`}>
                      <Icon.Check size={16} />
                    </span>
                    <span className="checklist__label">{t(`firstSteps.${step.key}`)}</span>
                  </span>
                  {step.done ? (
                    <Badge tone="success">{t("firstSteps.done")}</Badge>
                  ) : (
                    <ButtonLink href={step.href} variant="secondary" size="sm">
                      {t(`firstSteps.${step.key}Action`)}
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card title={t("soon.title")} description={t("soon.body")}>
          <ul className="checklist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(["players", "teams", "sections"] as const).map((item) => (
              <li key={item} className="checklist__item">
                <span className="checklist__text">
                  <Icon.Trophy size={20} />
                  <span>{t(`soon.${item}`)}</span>
                </span>
                <Badge tone="neutral">{t("soon.phase")}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
