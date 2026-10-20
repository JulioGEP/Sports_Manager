import {
  FamilyResponseSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  StructureSummarySchema,
  playerDisplayName,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import {
  Avatar,
  ButtonLink,
  Card,
  ClubHero,
  ClubHeroButton,
  Crest,
  EmptyState,
  Icon,
  Stat,
  StatusChip,
} from "@/ui";

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
  const canStructure = permissions.includes("org.structure.read");
  const canStructureWrite = permissions.includes("org.structure.write");
  const canFamily = permissions.includes("org.family.read");
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

  const summary = useQuery({
    queryKey: ["org", slug, "summary"],
    queryFn: () => apiFetch("/api/org/summary", { schema: StructureSummarySchema }),
    enabled: canStructure || support,
  });
  const family = useQuery({
    queryKey: ["org", slug, "family"],
    queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
    enabled: canFamily,
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
    {
      key: "team",
      done: (summary.data?.teams ?? 0) > 0,
      to: summary.data?.currentSeason ? `${paths.teams}?new=1` : `${paths.teams}?tab=seasons&new=1`,
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
            {canStructure ? (
              <ClubHeroButton ghost onClick={() => void navigate(paths.teams)}>
                {t("hero.teams")}
              </ClubHeroButton>
            ) : canReadMembers ? (
              <ClubHeroButton ghost onClick={() => void navigate(paths.members)}>
                {t("hero.members")}
              </ClubHeroButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.data ? (
          <>
            <Stat
              icon={<Icon.UsersThree weight="duotone" aria-hidden="true" />}
              value={summary.data.teams}
              label={t("stats.teams")}
            />
            <Stat
              icon={<Icon.PersonSimpleRun weight="duotone" aria-hidden="true" />}
              value={summary.data.players}
              label={t("stats.players")}
            />
          </>
        ) : null}
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
        {canStructure && summary.data ? (
          <Card
            title={t("structure.title")}
            description={t("structure.description")}
            padded={false}
          >
            {summary.data.currentSeason ? (
              <ul className="flex flex-col divide-y divide-line">
                <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                  <span className="text-club-text">
                    <Icon.CalendarBlank size={22} weight="duotone" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-body text-ink">{t("stats.season")}</span>
                  <StatusChip kind="club">{summary.data.currentSeason.name}</StatusChip>
                </li>
                <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                  <span className="text-club-text">
                    <Icon.SportIcons.Trofeo />
                  </span>
                  <span className="flex-1 text-body text-ink">
                    {t("structure.sections", { count: summary.data.sections })}
                  </span>
                </li>
                <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                  <span className="text-club-text">
                    <Icon.SportIcons.Balon />
                  </span>
                  <span className="flex-1 text-body text-ink">
                    {t("structure.teams", { count: summary.data.teams })}
                  </span>
                  <ButtonLink to={paths.teams} variant="secondary" size="sm">
                    {t("structure.openTeams")}
                  </ButtonLink>
                </li>
                <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                  <span className="text-club-text">
                    <Icon.SportIcons.Camiseta />
                  </span>
                  <span className="flex-1 text-body text-ink">
                    {t("structure.players", { count: summary.data.players })} ·{" "}
                    {t("structure.guardians", { count: summary.data.guardians })}
                  </span>
                  {canReadMembers ? (
                    <ButtonLink to={paths.players} variant="secondary" size="sm">
                      {t("structure.openPlayers")}
                    </ButtonLink>
                  ) : null}
                </li>
              </ul>
            ) : (
              <EmptyState
                icon={<Icon.CalendarBlank weight="duotone" />}
                title={t("structure.noSeasonTitle")}
                description={t("structure.noSeasonBody")}
                action={
                  canStructureWrite ? (
                    <ButtonLink
                      to={`${paths.teams}?tab=seasons&new=1`}
                      variant="secondary"
                      size="sm"
                    >
                      {t("structure.createSeason")}
                    </ButtonLink>
                  ) : null
                }
              />
            )}
          </Card>
        ) : null}
        {canFamily ? (
          <Card
            title={t("family.title")}
            description={t("family.description")}
            padded={false}
            actions={
              <ButtonLink to={paths.family} variant="secondary" size="sm">
                {t("family.open")}
              </ButtonLink>
            }
          >
            {family.data && family.data.players.length === 0 ? (
              <EmptyState icon={<Icon.HandHeart weight="duotone" />} title={t("family.empty")} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {family.data?.players.map((p) => (
                  <li key={p.id} className="flex min-h-16 items-center gap-3 px-5 py-3">
                    <Avatar name={playerDisplayName(p)} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link to={paths.family} className="truncate font-medium text-ink">
                        {playerDisplayName(p)}
                      </Link>
                      <span className="truncate text-secondary text-muted">
                        {p.teams.map((x) => x.teamName).join(", ") ||
                          t("structure.teams", { count: 0 })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
