import {
  ActivityResponseSchema,
  FamilyResponseSchema,
  StructureSummarySchema,
  centsToAmount,
  playerDisplayName,
  type EventSummary,
  type OperationsSummary,
  type ReadinessSummary,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Link, useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
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
import { SectionCard } from "./sections";
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
 * Inicio del club (Bloque 14, ADR 0031). Responde, en este orden: qué pasa hoy, cómo está el club
 * en cifras, cómo está cada sección, qué hace falta hoy y cómo van las fichas. La portada manda
 * (DESIGN.md 7). Para quien no administra, el panel de su cargo; para la familia, los suyos.
 */
export function ClubHome() {
  const t = useT("home");
  const eventKinds = useT("eventKinds");
  const roles = useT("roles");
  const positions = useT("positions");
  const { me, org, branding, look, slug } = useReadyClub();
  const intl = useIntl();
  const navigate = useNavigate();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const has = (p: (typeof permissions)[number]) => permissions.includes(p);
  const canStructure = has("org.structure.read");
  const canStructureWrite = has("org.structure.write");
  const canPlayers = has("org.players.read");
  const canFamily = has("org.family.read");
  const canEvents = has("org.events.read");
  const canSettings = has("org.settings.write");
  const support = org.organization.view === "support";
  const timezone = org.organization.view === "full" ? org.organization.timezone : undefined;

  const summary = useQuery({
    queryKey: ["org", slug, "summary"],
    queryFn: () => apiFetch("/api/org/summary", { schema: StructureSummarySchema }),
    enabled: canStructure || support || canEvents,
  });
  const family = useQuery({
    queryKey: ["org", slug, "family"],
    queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
    enabled: canFamily,
  });

  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  const data = summary.data;
  const hour = (iso: string) =>
    intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  const dayOf = (iso: string) =>
    intl.formatDate(new Date(iso), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    });
  const eventLine = (e: EventSummary) =>
    [e.team?.name ?? e.section?.name, e.facility?.name ?? e.location].filter(Boolean).join(" · ");

  /** Panel del cargo: entrenador, cargo del personal, o nada (administración y familias). */
  const panel: PanelKind | null =
    org.actor.kind !== "member"
      ? null
      : org.actor.position
        ? org.actor.position
        : org.actor.roles.includes("coach") && !org.actor.roles.includes("org_admin")
          ? "coach"
          : null;

  const operations = data?.operations ?? null;
  const readiness = data?.readiness ?? null;
  const alerts: { key: AlertKey; count: number; to: string }[] = operations
    ? (
        [
          { key: "teamsWithoutStaff", to: paths.sections },
          { key: "pendingInvitations", to: `${paths.staff}?tab=invitations` },
          { key: "feesOverdue", to: `${paths.fees}?status=overdue` },
          { key: "challengeSubmissionsPending", to: paths.challenges },
          { key: "objectivesOverdue", to: paths.players },
          { key: "plansOverdue", to: paths.players },
          { key: "playersWithoutTeam", to: `${paths.players}?missing=team` },
          { key: "playersWithoutMembership", to: `${paths.players}?missing=member` },
          { key: "playersWithoutObjective", to: `${paths.players}?missing=objective` },
          { key: "playersWithoutFamily", to: `${paths.players}?missing=family` },
          { key: "playersWithoutPhoto", to: `${paths.players}?missing=photo` },
          { key: "facilitiesWithoutHours", to: paths.facilities },
          { key: "storeOrdersToPrepare", to: `${paths.store}?status=pending` },
          { key: "storeOutOfStock", to: `${paths.store}?tab=products` },
        ] as const
      )
        .map((a) => ({ ...a, count: operations[a.key] }))
        .filter((a) => a.count > 0)
        .filter((a) => a.key !== "pendingInvitations" || has("org.members.read"))
        .filter((a) => a.key !== "challengeSubmissionsPending" || has("org.challenges.read"))
        .filter((a) => a.key !== "feesOverdue" || has("org.fees.read"))
        .filter((a) => a.key !== "facilitiesWithoutHours" || has("org.facilities.write"))
        .filter((a) => a.key !== "playersWithoutMembership" || has("org.club_members.read"))
        .filter(
          (a) =>
            (a.key !== "storeOrdersToPrepare" && a.key !== "storeOutOfStock") ||
            has("org.store.read"),
        )
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

  /** Puesta en marcha: solo mientras falten el logo o los colores, y en el primer mes del club. */
  const defaultColors =
    branding.brandPrimaryColor === brandTokens["--color-brand-primary"] &&
    branding.brandSecondaryColor === brandTokens["--color-brand-secondary"];
  const youngClub =
    org.organization.view === "full" &&
    Date.now() - new Date(org.organization.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
  const onboarding = canSettings && youngClub && (!branding.logoUrl || defaultColors);
  /** Ámbito restringido (Bloque 19): el inicio dice qué parte del club se ve, o que no hay nada asignado. */
  const scope = org.actor.kind === "member" ? org.actor.scope : null;
  const restricted = scope && scope.kind === "restricted" ? scope : null;
  const scopeEmpty =
    restricted !== null &&
    restricted.sections === 0 &&
    restricted.teams === 0 &&
    restricted.players === 0;

  // Sin resumen (familias y quien no lee deportistas), el héroe dice con qué papel entra.
  const roleLine =
    org.actor.kind === "member"
      ? org.actor.roles
          .map((r) =>
            r === "staff" && org.actor.kind === "member" && org.actor.position
              ? positions(org.actor.position)
              : roles(r),
          )
          .join(" · ")
      : undefined;
  const meta = data
    ? t("hero.meta", {
        season: data.currentSeason?.name ?? t("hero.noSeason"),
        sections: data.sections,
        teams: data.teams,
      })
    : roleLine;
  const subtitle = data?.nextEvent
    ? t("hero.next", {
        when: `${dayOf(data.nextEvent.startsAt)} ${hour(data.nextEvent.startsAt)}`,
        title: data.nextEvent.title,
      })
    : t("greeting", { name: firstName });

  return (
    <div className="flex flex-col gap-6">
      <ClubHero
        clubName={org.organization.name}
        crest={<Crest name={org.organization.name} logoUrl={branding.logoUrl} size="lg" />}
        subtitle={subtitle}
        motto={look.motto}
        {...(meta ? { meta } : {})}
        ariaLabel={t("hero.label", { club: org.organization.name })}
        actions={
          <>
            {has("org.players.write") ? (
              <ClubHeroButton action="add" onClick={() => void navigate(`${paths.players}?new=1`)}>
                {t("hero.newPlayer")}
              </ClubHeroButton>
            ) : canFamily ? (
              <ClubHeroButton action="open" onClick={() => void navigate(paths.family)}>
                {t("hero.family")}
              </ClubHeroButton>
            ) : null}
            {canEvents || canFamily ? (
              <ClubHeroButton action="open" ghost onClick={() => void navigate(paths.agenda)}>
                {t("hero.agenda")}
              </ClubHeroButton>
            ) : null}
          </>
        }
      />

      {restricted ? (
        scopeEmpty ? (
          <Alert kind="warning" title={t("scope.emptyTitle")}>
            {t("scope.emptyBody")}
          </Alert>
        ) : (
          <Alert kind="info">
            {t("scope.restricted", {
              sections: restricted.sections,
              teams: restricted.teams,
              players: restricted.players,
            })}
          </Alert>
        )
      ) : null}

      {onboarding ? (
        <Alert
          kind="info"
          title={t("onboarding.title")}
          actions={
            <ButtonLink action="open" to={paths.settings} variant="secondary" size="sm">
              {t("onboarding.action")}
            </ButtonLink>
          }
        >
          {t("onboarding.body")}
        </Alert>
      ) : null}

      {/* 2. Hoy en el club */}
      {canEvents && data ? (
        <Card
          padded={false}
          title={
            <span className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("today.eyebrow")}
              </span>
              {intl.formatDate(new Date(), {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: timezone,
              })}
            </span>
          }
          actions={
            <ButtonLink action="open" to={paths.agenda} variant="tertiary" size="sm">
              {t("today.week")}
            </ButtonLink>
          }
        >
          {data.today.length === 0 ? (
            <EmptyState
              icon={<Icon.CalendarBlank weight="duotone" />}
              title={t("today.empty")}
              description={t("today.emptyHint")}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.today.map((e) => (
                <li key={e.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                  <span className="w-14 shrink-0 font-mono text-body text-ink">
                    {hour(e.startsAt)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link
                      to={`${paths.agenda}?event=${e.id}`}
                      className="truncate font-medium text-ink"
                    >
                      {e.title}
                    </Link>
                    <span className="truncate text-secondary text-muted">{eventLine(e)}</span>
                  </span>
                  <StatusChip kind={e.kind === "match" ? "club" : "neutral"}>
                    {eventKinds(e.kind)}
                  </StatusChip>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {/* 3. Cifras del club: solo para quien lee la estructura (las familias ven lo suyo). */}
      {data && (canStructure || support) ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {has("org.club_members.read") || support ? (
            <Link to={paths.clubMembers} className="no-underline">
              <Stat
                icon={<Icon.IdentificationCard weight="duotone" aria-hidden="true" />}
                value={data.clubMembers}
                label={
                  data.clubMembersJoinedThisMonth > 0
                    ? t("stats.clubMembersJoined", { count: data.clubMembersJoinedThisMonth })
                    : t("stats.clubMembers")
                }
              />
            </Link>
          ) : null}
          <Link to={canPlayers ? paths.players : paths.home} className="no-underline">
            <Stat
              icon={<Icon.PersonSimpleRun weight="duotone" aria-hidden="true" />}
              value={data.players}
              label={t("stats.players")}
            />
          </Link>
          <Link to={paths.sections} className="no-underline">
            <Stat
              icon={<Icon.SquaresFour weight="duotone" aria-hidden="true" />}
              value={data.teams}
              label={t("stats.teams")}
            />
          </Link>
          {has("org.members.read") ? (
            <Link to={paths.staff} className="no-underline">
              <Stat
                icon={<Icon.Users weight="duotone" aria-hidden="true" />}
                value={data.staff}
                label={t("stats.staff")}
              />
            </Link>
          ) : null}
          {has("org.fees.read") ? (
            <Link to={`${paths.fees}?status=pending`} className="no-underline">
              <Stat
                icon={<Icon.Coins weight="duotone" aria-hidden="true" />}
                value={
                  data.fees ? (
                    <span className="flex items-baseline gap-1">
                      {centsToAmount(data.fees.pendingCents)}
                      <span className="text-secondary text-muted">€</span>
                    </span>
                  ) : (
                    "—"
                  )
                }
                label={
                  data.fees && data.fees.overdueCount > 0
                    ? t("stats.feesOverdue", { count: data.fees.overdueCount })
                    : t("stats.feesPending")
                }
              />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* 4. Secciones (con ámbito restringido sin secciones, no hay nada que enseñar) */}
      {canStructure && data && (!restricted || restricted.sections > 0) ? (
        <section className="flex flex-col gap-3" aria-labelledby="home-sections">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("sections.eyebrow")}
              </span>
              <h2 id="home-sections" className="text-title2 lg:text-title2-lg text-ink">
                {t("sections.title")}
              </h2>
            </div>
            <ButtonLink action="open" to={paths.sections} variant="tertiary" size="sm">
              {t("sections.all")}
            </ButtonLink>
          </div>
          {data.sectionCards.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.SquaresFour weight="duotone" />}
                title={t("sections.empty")}
                description={t("sections.emptyHint")}
                action={
                  canStructureWrite ? (
                    <ButtonLink
                      action="add"
                      to={`${paths.sections}?new=1`}
                      variant="secondary"
                      size="sm"
                    >
                      {t("sections.new")}
                    </ButtonLink>
                  ) : null
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.sectionCards
                .filter((s) => s.status === "active")
                .map((s) => (
                  <SectionCard key={s.id} section={s} to={paths.section(s.id)} />
                ))}
              {canStructureWrite ? (
                <Link
                  to={`${paths.sections}?new=1`}
                  className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-club-soft-text text-club-soft-text no-underline transition-colors hover:bg-club-soft"
                >
                  <span className="grid size-10 place-items-center rounded-full border border-dashed border-current">
                    <Icon.Plus size={20} aria-hidden="true" />
                  </span>
                  <span className="font-medium">{t("sections.new")}</span>
                </Link>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {/* 5 y 6. Qué hace falta hoy y salud de las fichas */}
      {canPlayers && data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
                    <ButtonLink action="open" to={alert.to} variant="tertiary" size="sm">
                      {t("operations.go")}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
                <Link to={paths.sections} className="text-secondary font-medium">
                  {t("readiness.bySection")}
                </Link>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {panel ? <StaffPanel kind={panel} /> : null}

      {/* Familia: los suyos */}
      {canFamily ? (
        <Card
          title={t("family.title")}
          description={t("family.description")}
          actions={
            <ButtonLink action="open" to={paths.family} variant="secondary" size="sm">
              {t("family.open")}
            </ButtonLink>
          }
        >
          {family.data && family.data.players.length === 0 ? (
            <p className="text-body text-muted">{t("family.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {family.data?.players.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar name={playerDisplayName(p)} src={p.photoUrl} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link to={paths.familyPlayer(p.id)} className="truncate font-medium text-ink">
                      {playerDisplayName(p)}
                    </Link>
                    <span className="truncate text-secondary text-muted">
                      {p.teams.map((x) => x.teamName).join(", ") || t("family.noTeam")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {/* 7. Últimos movimientos, plegados al final */}
      {has("org.activity.read") ? <RecentActivity /> : null}
    </div>
  );
}

/** Últimos movimientos del club, plegados: cinco entradas y el enlace a la lista completa. */
function RecentActivity() {
  const t = useT("home.activity");
  const auditActions = useT("audit");
  const intl = useIntl();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const activity = useQuery({
    queryKey: ["org", slug, "activity", 5],
    queryFn: () => apiFetch("/api/org/activity?limit=5", { schema: ActivityResponseSchema }),
  });
  const entries = activity.data?.entries ?? [];
  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-body">
        <h2 className="flex items-center gap-2 text-body font-medium text-ink">
          <Icon.Pulse size={20} weight="duotone" aria-hidden="true" />
          {t("title")}
          {entries.length > 0 ? (
            <span className="font-mono text-secondary text-muted">{entries.length}</span>
          ) : null}
        </h2>
        <span className="text-secondary text-club-text">{t("toggle")}</span>
      </summary>
      {entries.length === 0 ? (
        <p className="px-5 pb-4 text-secondary text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex min-h-12 items-center gap-3 px-5 py-2 text-secondary"
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                <span className="font-medium">{entry.actorName ?? t("system")}</span>{" "}
                {auditActions(entry.action)}
                {entry.target ? <span className="text-muted"> · {entry.target}</span> : null}
              </span>
              <span className="shrink-0 text-muted">
                {intl.formatDate(new Date(entry.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </li>
          ))}
          <li className="px-5 py-3">
            <Link to={`${paths.settings}?tab=activity`} className="text-secondary font-medium">
              {t("all")}
            </Link>
          </li>
        </ul>
      )}
    </details>
  );
}
