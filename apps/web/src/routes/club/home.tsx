import {
  ActivityResponseSchema,
  FamilyResponseSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  StructureSummarySchema,
  playerDisplayName,
  type OperationsSummary,
  type ReadinessSummary,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
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
import { StaffPanel, type PanelKind } from "./staff-panel";

/** Barra de progreso en color del club, siempre con la cifra al lado (DESIGN.md 0.5). */
function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-raised"
    >
      <div className="h-full rounded-full bg-club" style={{ width: `${pct}%` }} />
    </div>
  );
}

type AlertKey = keyof OperationsSummary;

/**
 * Inicio del club: portada con la marca (DESIGN.md 7), cifras y, para el personal, qué hace falta
 * hoy, la preparación de las fichas, accesos rápidos, el panel de su cargo y los últimos
 * movimientos (Bloque 13). La administración mantiene sus primeros pasos; la familia, sus jugadores.
 */
export function ClubHome() {
  const t = useT("home");
  const roles = useT("roles");
  const positions = useT("positions");
  const auditActions = useT("audit");
  const { me, org, branding, slug } = useReadyClub();
  const { locale } = useLocale();
  const intl = useIntl();
  const navigate = useNavigate();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canReadMembers = permissions.includes("org.members.read");
  const canInvite = permissions.includes("org.members.invite");
  const canSettings = permissions.includes("org.settings.write");
  const canStructure = permissions.includes("org.structure.read");
  const canStructureWrite = permissions.includes("org.structure.write");
  const canPlayers = permissions.includes("org.players.read");
  const canPlayersWrite = permissions.includes("org.players.write");
  const canFamily = permissions.includes("org.family.read");
  const canActivity = permissions.includes("org.activity.read");
  const canChallenges = permissions.includes("org.challenges.read");
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
  const activity = useQuery({
    queryKey: ["org", slug, "activity"],
    queryFn: () => apiFetch("/api/org/activity?limit=8", { schema: ActivityResponseSchema }),
    enabled: canActivity,
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

  /** Panel del cargo: entrenador, cargo del personal, o nada (administración y familias). */
  const panel: PanelKind | null =
    org.actor.kind !== "member"
      ? null
      : org.actor.position
        ? org.actor.position
        : org.actor.roles.includes("coach") && !org.actor.roles.includes("org_admin")
          ? "coach"
          : null;

  const operations = summary.data?.operations ?? null;
  const readiness = summary.data?.readiness ?? null;
  const alerts: { key: AlertKey; count: number; to: string }[] = operations
    ? (
        [
          { key: "pendingInvitations", to: `${paths.members}?tab=invitations` },
          { key: "challengeSubmissionsPending", to: paths.challenges },
          { key: "objectivesOverdue", to: paths.players },
          { key: "plansOverdue", to: paths.players },
          { key: "playersWithoutTeam", to: `${paths.players}?missing=team` },
          { key: "playersWithoutObjective", to: `${paths.players}?missing=objective` },
          { key: "playersWithoutFamily", to: `${paths.players}?missing=family` },
          { key: "playersWithoutPhoto", to: `${paths.players}?missing=photo` },
        ] as const
      )
        .map((a) => ({ ...a, count: operations[a.key] }))
        .filter((a) => a.count > 0)
        .filter((a) => a.key !== "pendingInvitations" || canInvite)
        .filter((a) => a.key !== "challengeSubmissionsPending" || canChallenges)
    : [];
  const readinessChecks: (keyof Omit<ReadinessSummary, "total" | "percent">)[] = [
    "withPhoto",
    "withBirthDate",
    "withTeam",
    "withFamily",
    "withObjective",
    "withIndicators",
    "withPlan",
  ];
  const when = (iso: string) =>
    intl.formatDate(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  const quickActions = [
    canPlayersWrite ? { key: "newPlayer", to: `${paths.players}?new=1`, icon: Icon.Plus } : null,
    canStructureWrite && summary.data?.currentSeason
      ? { key: "newTeam", to: `${paths.teams}?new=1`, icon: Icon.UsersThree }
      : null,
    canPlayersWrite ? { key: "inviteFamily", to: paths.players, icon: Icon.HandHeart } : null,
    canChallenges ? { key: "challenge", to: paths.challenges, icon: Icon.Trophy } : null,
  ].filter((a): a is NonNullable<typeof a> => a !== null);

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
                    {r === "staff" && org.actor.kind === "member" && org.actor.position
                      ? positions(org.actor.position)
                      : roles(r)}
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

      {canPlayers && summary.data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Qué hace falta hoy: alertas de operación con el recuento y el atajo que las resuelve. */}
          <Card
            title={
              <span className="flex flex-col gap-0.5">
                <span className="text-label uppercase tracking-wide text-muted">
                  {t("operations.eyebrow")}
                </span>
                {t("operations.title")}
              </span>
            }
            padded={false}
            actions={
              <StatusChip kind={alerts.length === 0 ? "success" : "warning"}>
                {t("operations.count", { count: alerts.length })}
              </StatusChip>
            }
          >
            {alerts.length === 0 ? (
              <EmptyState
                icon={<Icon.CheckCircle weight="duotone" />}
                title={t("operations.allClear")}
                description={t("operations.allClearHint")}
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {alerts.map((alert) => (
                  <li key={alert.key} className="flex min-h-16 items-center gap-3 px-5 py-3">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full bg-warning-soft ring-2 ring-warning"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink">
                        {t(`operations.${alert.key}`, { count: alert.count })}
                      </span>
                      <span className="text-secondary text-muted">
                        {t(`operations.${alert.key}Hint`)}
                      </span>
                    </span>
                    <ButtonLink
                      to={alert.to}
                      variant="tertiary"
                      size="sm"
                      icon={<Icon.ArrowRight size={16} aria-hidden="true" />}
                    >
                      {t("operations.go")}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Preparación de las fichas: siete comprobaciones y un porcentaje. */}
          <Card
            title={
              <span className="flex flex-col gap-0.5">
                <span className="text-label uppercase tracking-wide text-muted">
                  {t("readiness.eyebrow")}
                </span>
                {t("readiness.title")}
              </span>
            }
            description={t("readiness.description")}
          >
            {readiness ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <span className="font-mono text-display lg:text-display-lg text-ink">
                    {readiness.percent}%
                  </span>
                  <span className="text-secondary text-muted">
                    {t("readiness.total", { count: readiness.total })}
                  </span>
                </div>
                <ProgressBar
                  value={readiness.percent}
                  label={t("readiness.progressLabel", { percent: readiness.percent })}
                />
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-2">
                  {readinessChecks.map((check) => (
                    <li key={check} className="flex items-baseline justify-between gap-2">
                      <span className="text-secondary text-muted">{t(`readiness.${check}`)}</span>
                      <span className="font-mono text-body text-ink">
                        {readiness[check]}/{readiness.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {panel ? <StaffPanel kind={panel} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {quickActions.length > 0 ? (
          <Card title={t("quickActions.title")} description={t("quickActions.description")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {quickActions.map((action) => (
                <li key={action.key}>
                  <Link
                    to={action.to}
                    className="flex min-h-16 items-center gap-3 rounded-field border border-border px-4 py-3 text-body font-medium text-ink no-underline transition-colors hover:bg-raised"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text">
                      <action.icon size={22} weight="duotone" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span>{t(`quickActions.${action.key}`)}</span>
                      <span className="text-secondary font-normal text-muted">
                        {t(`quickActions.${action.key}Hint`)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {canActivity ? (
          <Card title={t("activity.title")} description={t("activity.description")} padded={false}>
            {activity.data && activity.data.entries.length === 0 ? (
              <EmptyState icon={<Icon.Pulse weight="duotone" />} title={t("activity.empty")} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {activity.data?.entries.map((entry) => (
                  <li key={entry.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                    <span className="text-club-text">
                      <Icon.Pulse size={20} weight="duotone" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body text-ink">
                        {auditActions(entry.action)}
                        {entry.target ? ` · ${entry.target}` : ""}
                      </span>
                      <span className="truncate text-secondary text-muted">
                        {entry.actorName ?? t("activity.system")} · {when(entry.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

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
                  {canPlayers ? (
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
                    <Avatar name={playerDisplayName(p)} src={p.photoUrl} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link to={paths.familyPlayer(p.id)} className="truncate font-medium text-ink">
                        {playerDisplayName(p)}
                      </Link>
                      <span className="truncate text-secondary text-muted">
                        {p.teams.map((x) => x.teamName).join(", ") ||
                          t("structure.teams", { count: 0 })}
                      </span>
                    </span>
                    <ButtonLink to={paths.challenges} variant="tertiary" size="sm">
                      {t("family.challenge")}
                    </ButtonLink>
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
