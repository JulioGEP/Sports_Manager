import { InvitationsResponseSchema, MembersResponseSchema } from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import { ButtonLink, Card, ClubHero, ClubHeroButton, Crest, Icon, Stat, StatusChip } from "@/ui";

/** Inicio del club: portada con la marca del club (DESIGN.md 7), cifras, primeros pasos y lo que viene. */
export function ClubHome() {
  const t = useT("home");
  const roles = useT("roles");
  const { me, org, branding, slug } = useReadyClub();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canReadMembers = permissions.includes("org.members.read");
  const canInvite = permissions.includes("org.members.invite");
  const canSettings = permissions.includes("org.settings.write");
  const support = org.organization.view === "support";

  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    enabled: canReadMembers && !support,
  });
  const invitations = useQuery({
    queryKey: ["org", slug, "invitations"],
    queryFn: () => apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema }),
    enabled: canInvite && !support,
  });

  const counts = org.organization.view === "support" ? org.organization.counts : null;
  const membersCount = counts
    ? Object.values(counts.membersByRole).reduce((a: number, b: number) => a + b, 0)
    : members.data?.members.length;
  const coaches = counts
    ? counts.membersByRole.coach
    : members.data?.members.filter((m) => m.roles.includes("coach")).length;
  const pending = counts
    ? counts.pendingInvitations
    : invitations.data?.invitations.filter((i) => i.state === "pending").length;

  const defaultColors =
    branding.brandPrimaryColor === brandTokens["--color-brand-primary"] &&
    branding.brandSecondaryColor === brandTokens["--color-brand-secondary"];
  const steps = [
    { key: "logo", done: Boolean(branding.logoUrl), to: `${paths.settings}?tab=logo` },
    { key: "colors", done: !defaultColors, to: `${paths.settings}?tab=brand` },
    {
      key: "invite",
      done: (coaches ?? 0) > 0 || (pending ?? 0) > 0,
      to: `${paths.members}?invite=1`,
    },
  ] as const;
  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  const sportName = org.organization.view === "full" ? org.organization.sport.name[locale] : null;

  return (
    <div className="flex flex-col gap-6">
      <ClubHero
        clubName={org.organization.name}
        crest={<Crest name={org.organization.name} logoUrl={branding.logoUrl} size="lg" />}
        subtitle={t("greeting", { name: firstName })}
        {...(sportName ? { meta: t("hero.sport", { sport: sportName }) } : {})}
        ariaLabel={t("hero.label", { club: org.organization.name })}
        actions={
          <>
            {canInvite ? (
              <ClubHeroButton onClick={() => void navigate(`${paths.members}?invite=1`)}>
                {t("firstSteps.inviteAction")}
              </ClubHeroButton>
            ) : null}
            {canReadMembers ? (
              <ClubHeroButton ghost onClick={() => void navigate(paths.members)}>
                {t("hero.members")}
              </ClubHeroButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {membersCount !== undefined ? (
          <Stat
            icon={<Icon.Users weight="duotone" aria-hidden="true" />}
            value={membersCount}
            label={t("stats.members")}
          />
        ) : null}
        {pending !== undefined ? (
          <Stat
            icon={<Icon.Envelope weight="duotone" aria-hidden="true" />}
            value={pending}
            label={t("stats.pending")}
          />
        ) : null}
        <Stat
          icon={<Icon.ShieldCheck weight="duotone" aria-hidden="true" />}
          value={
            org.actor.kind === "member" ? (
              <span className="flex flex-wrap gap-1 font-sans">
                {org.actor.roles.map((r) => (
                  <StatusChip key={r} kind="club">
                    {roles(r)}
                  </StatusChip>
                ))}
              </span>
            ) : (
              <span className="font-sans">
                <StatusChip kind="warning">{t("support.badge")}</StatusChip>
              </span>
            )
          }
          label={t("stats.yourRole")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {canSettings ? (
          <Card
            title={t("firstSteps.title")}
            description={t("firstSteps.description")}
            padded={false}
          >
            <ul className="flex flex-col divide-y divide-line">
              {steps.map((step) => (
                <li key={step.key} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className={`grid size-7 shrink-0 place-items-center rounded-full ${step.done ? "bg-success-soft text-success" : "border border-control text-muted"}`}
                  >
                    {step.done ? <Icon.Check size={16} weight="bold" /> : null}
                  </span>
                  <span
                    className={`flex-1 text-body ${step.done ? "text-muted line-through" : "text-ink"}`}
                  >
                    {t(`firstSteps.${step.key}`)}
                  </span>
                  {step.done ? (
                    <StatusChip kind="success">{t("firstSteps.done")}</StatusChip>
                  ) : (
                    <ButtonLink to={step.to} variant="secondary" size="sm">
                      {t(`firstSteps.${step.key}Action`)}
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card title={t("soon.title")} description={t("soon.body")} padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {(["players", "teams", "sections"] as const).map((key) => (
              <li key={key} className="flex min-h-14 items-center gap-3 px-5 py-3">
                <span className="text-club-text">
                  {key === "players" ? (
                    <Icon.SportIcons.Camiseta />
                  ) : key === "teams" ? (
                    <Icon.SportIcons.Balon />
                  ) : (
                    <Icon.SportIcons.Trofeo />
                  )}
                </span>
                <span className="flex-1 text-body text-ink">{t(`soon.${key}`)}</span>
                <StatusChip kind="neutral">{t("soon.phase")}</StatusChip>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
