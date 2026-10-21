import {
  MATCH_ZONES,
  MatchDetailResponseSchema,
  formatClock,
  type MatchActionType,
  type MatchDetailResponse,
  type MatchStats,
  type MatchZone,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { ComparisonBars, GroupedBars, Matrix, ZoneGrid } from "@/components/match-charts";
import { FilterChips, PlayersTable, type PlayerRow } from "@/components/match-tables";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { formatRating, statsOf } from "@/lib/matches";
import { downloadXlsx, type Sheet } from "@/lib/xlsx";
import { Alert, Button, ButtonLink, Card, Icon, PageHeader, Stat, StatusChip } from "@/ui";
import { periodLabel } from "./match-live";

/** Celdas del mapa de zonas para un conjunto de acciones (todas las de zona, o una). */
export function zoneCells(
  stats: Pick<MatchStats, "zones">,
  codes: string[],
  scoringCodes: string[],
): Record<MatchZone, { shots: number; goals: number }> {
  const cells = {} as Record<MatchZone, { shots: number; goals: number }>;
  for (const zone of MATCH_ZONES) {
    const cell = stats.zones.find((z) => z.zone === zone);
    let shots = 0;
    let goals = 0;
    for (const code of codes) {
      const n = cell?.total[code] ?? 0;
      shots += n;
      if (scoringCodes.includes(code)) goals += n;
    }
    cells[zone] = { shots, goals };
  }
  return cells;
}

export function playerRowsOf(stats: MatchStats): PlayerRow[] {
  return stats.players.map((p) => ({
    id: p.playerId,
    name: p.name,
    shirtNumber: p.shirtNumber,
    isGoalkeeper: p.isGoalkeeper,
    timeMs: p.timeMs,
    plusMinus: p.plusMinus,
    scoreFor: p.scoreFor,
    scoreAgainst: p.scoreAgainst,
    actions: p.actions,
    rating: p.rating,
  }));
}

/** Resumen de un partido (Bloque 20): comparativa, trabajo por periodos, zonas, jugadores y porteros. */
export function MatchStatsPage() {
  const t = useT("matchStats");
  const tm = useT("match");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const { id = "" } = useParams();
  const { slug, branding } = useReadyClub();
  const paths = clubPaths(slug);
  const [scope, setScope] = useState<string>("all");
  const [zoneCode, setZoneCode] = useState<string>("all");

  const detail = useQuery({
    queryKey: ["org", slug, "match", id, "stats"],
    queryFn: () => apiFetch(`/api/org/matches/${id}`, { schema: MatchDetailResponseSchema }),
    retry: false,
  });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  return (
    <StatsView
      data={detail.data}
      clubName={branding.name}
      scope={scope}
      setScope={setScope}
      zoneCode={zoneCode}
      setZoneCode={setZoneCode}
      back={paths.teamMatches(detail.data.match.team.id)}
      live={paths.match(id)}
      dayOf={dates.day}
      t={t}
      tm={tm}
    />
  );
}

function StatsView({
  data,
  clubName,
  scope,
  setScope,
  zoneCode,
  setZoneCode,
  back,
  live,
  dayOf,
  t,
  tm,
}: {
  data: MatchDetailResponse;
  clubName: string;
  scope: string;
  setScope: (s: string) => void;
  zoneCode: string;
  setZoneCode: (s: string) => void;
  back: string;
  live: string;
  dayOf: (iso: string) => string;
  t: ReturnType<typeof useT>;
  tm: ReturnType<typeof useT>;
}) {
  const { match, squad, actionTypes, events, access } = data;
  const settings = match.settings;
  const period = scope === "all" ? undefined : Number(scope);
  const stats = useMemo(
    () => statsOf(match, squad, actionTypes, events, { period }),
    [match, squad, actionTypes, events, period],
  );
  const full = useMemo(
    () => statsOf(match, squad, actionTypes, events),
    [match, squad, actionTypes, events],
  );
  const types = useMemo(
    () =>
      actionTypes.filter(
        (a) => a.status === "active" || full.totals.own[a.code] || full.totals.opponent[a.code],
      ),
    [actionTypes, full],
  );
  const playerTypes = types.filter((a) => a.scope === "player");
  const zoneTypes = types.filter((a) => a.requiresZone && a.scope === "player");
  const scoringCodes = types.filter((a) => a.ownScore > 0).map((a) => a.code);
  const rows = useMemo(() => playerRowsOf(stats), [stats]);
  const field = rows.filter((r) => !r.isGoalkeeper);
  const keepers = rows.filter((r) => r.isGoalkeeper);
  const defaultCodes = playerTypes.filter((a) => a.quick && !a.keeperOnly).map((a) => a.code);
  const scopeItems = [
    { key: "all", label: t("scope.all") },
    ...Array.from({ length: settings.periods }, (_, i) => ({
      key: String(i + 1),
      label: periodLabel(tm, i + 1, settings.periods),
    })),
  ];
  const zoneCodes = zoneCode === "all" ? zoneTypes.map((a) => a.code) : [zoneCode];
  const cells = zoneCells(stats, zoneCodes, scoringCodes);
  const outcome =
    match.ownScore > match.opponentScore
      ? "won"
      : match.ownScore < match.opponentScore
        ? "lost"
        : "drawn";
  const cards = stats.players.reduce((a, p) => a + p.cards.yellow + p.cards.red, 0);
  const title =
    match.homeAway === "home"
      ? `${clubName} ${match.ownScore} – ${match.opponentScore} ${match.opponent}`
      : `${match.opponent} ${match.opponentScore} – ${match.ownScore} ${clubName}`;

  const workRows = types.filter((a) => a.scope !== "opponent");
  const workMatrix = workRows.map((a) => ({
    key: a.code,
    label: a.name,
    cells: [...full.periods.map((p) => p.own[a.code] ?? 0), full.totals.own[a.code] ?? 0],
  }));
  const periodGroups = full.periods.map((p) => ({
    key: String(p.period),
    label: periodLabel(tm, p.period, settings.periods),
    a: workRows
      .filter((x) => x.category === "positive")
      .reduce((s, x) => s + (p.own[x.code] ?? 0), 0),
    b: workRows
      .filter((x) => x.category === "negative")
      .reduce((s, x) => s + (p.own[x.code] ?? 0), 0),
  }));

  function exportExcel() {
    const sheets: Sheet[] = [];
    sheets.push({
      name: t("export.summary"),
      rows: [
        [t("export.match"), title],
        [t("export.date"), match.playedOn],
        [t("export.opponent"), match.opponent],
        [],
        [t("export.metric"), clubName, match.opponent],
        ...full.comparison.map((r) => [r.name, r.own, r.opponent]),
        [],
        [
          t("export.period"),
          ...full.periods.map((p) => periodLabel(tm, p.period, settings.periods)),
          t("scope.all"),
        ],
        [t("export.ownScore"), ...full.periods.map((p) => p.ownScore), full.score.own],
        [
          t("export.opponentScore"),
          ...full.periods.map((p) => p.opponentScore),
          full.score.opponent,
        ],
        [t("export.ownFouls"), ...full.periods.map((p) => p.ownFouls), full.fouls.own],
        [
          t("export.opponentFouls"),
          ...full.periods.map((p) => p.opponentFouls),
          full.fouls.opponent,
        ],
        ...workMatrix.map((r) => [r.label, ...r.cells]),
      ],
    });
    const fullRows = playerRowsOf(full);
    sheets.push({
      name: t("export.players"),
      rows: [
        [
          "#",
          t("table.player"),
          t("table.minutes"),
          t("table.scoreFor"),
          t("table.scoreAgainst"),
          "+/-",
          ...playerTypes.map((a) => a.name),
          t("table.rating"),
        ],
        ...fullRows.map((r) => [
          r.shirtNumber,
          r.name,
          Math.round(r.timeMs / 60_000),
          r.scoreFor,
          r.scoreAgainst,
          r.plusMinus,
          ...playerTypes.map((a) => r.actions[a.code] ?? 0),
          Math.round(r.rating * 100) / 100,
        ]),
      ],
    });
    sheets.push({
      name: t("export.zones"),
      rows: [
        [t("export.zone"), ...zoneTypes.map((a) => a.name)],
        ...MATCH_ZONES.map((zone) => {
          const cell = full.zones.find((z) => z.zone === zone);
          return [zone, ...zoneTypes.map((a) => cell?.total[a.code] ?? 0)];
        }),
      ],
    });
    sheets.push({
      name: t("export.events"),
      rows: [
        [
          "#",
          t("export.period"),
          t("export.clock"),
          t("export.kind"),
          t("export.action"),
          t("table.player"),
          t("export.zone"),
        ],
        ...events.map((e) => [
          e.seq,
          e.period,
          formatClock(e.clockMs),
          e.kind,
          actionTypes.find((a) => a.id === e.actionTypeId)?.name ?? e.actionCode ?? "",
          squad.find((p) => p.playerId === e.playerId)?.name ?? "",
          e.zone ?? "",
        ]),
      ],
    });
    downloadXlsx(`${match.team.name} - ${match.opponent} - ${match.playedOn}`, sheets);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink to={back} variant="tertiary" size="sm" action="back">
          {t("back", { team: match.team.name })}
        </ButtonLink>
      </div>
      <PageHeader
        eyebrow={`${match.team.name} · ${dayOf(match.playedOn)} · ${match.homeAway === "home" ? tm("home") : tm("away")}`}
        title={
          <>
            <span className="font-mono">{title}</span>
            {match.status === "finished" ? (
              <StatusChip
                kind={outcome === "won" ? "success" : outcome === "lost" ? "danger" : "neutral"}
              >
                {t(`outcome.${outcome}`)}
              </StatusChip>
            ) : (
              <StatusChip kind="club">{tm(`status.${match.status}`)}</StatusChip>
            )}
          </>
        }
        actions={
          <>
            {match.status !== "finished" && access.write ? (
              <ButtonLink to={live} variant="secondary" action="back">
                {t("backToLive")}
              </ButtonLink>
            ) : null}
            <Button
              variant="secondary"
              icon={<Icon.DownloadSimple size={18} aria-hidden="true" />}
              onClick={exportExcel}
            >
              {t("export.button")}
            </Button>
          </>
        }
      />

      <FilterChips
        items={scopeItems}
        selected={scope}
        onChange={setScope}
        label={t("scope.label")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Icon.Timer weight="duotone" />}
          value={formatClock(stats.playedMs)}
          label={t("tiles.played")}
        />
        <Stat
          icon={<Icon.SportIcons.Silbato />}
          value={`${stats.fouls.own} · ${stats.fouls.opponent}`}
          label={t("tiles.fouls")}
        />
        <Stat icon={<Icon.Warning weight="duotone" />} value={cards} label={t("tiles.cards")} />
        <Stat
          icon={<Icon.ListChecks weight="duotone" />}
          value={stats.eventsCount}
          label={t("tiles.events")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("comparison.title")} description={t("comparison.description")}>
          {stats.comparison.length === 0 ? (
            <p className="text-secondary text-muted">{t("comparison.empty")}</p>
          ) : (
            <ComparisonBars
              rows={stats.comparison}
              ownLabel={clubName}
              opponentLabel={match.opponent}
              summary={t("comparison.summary", {
                rows: stats.comparison.map((r) => `${r.name} ${r.own}-${r.opponent}`).join(", "),
              })}
            />
          )}
        </Card>
        <Card title={t("zones.title")} description={t("zones.description")}>
          <div className="flex flex-col gap-3">
            {zoneTypes.length > 1 ? (
              <FilterChips
                items={[
                  { key: "all", label: t("zones.allActions") },
                  ...zoneTypes.map((a) => ({ key: a.code, label: a.name })),
                ]}
                selected={zoneCode}
                onChange={setZoneCode}
                label={t("zones.pick")}
              />
            ) : null}
            <ZoneGrid
              cells={cells}
              format={(shots, goals) => (goals > 0 ? `${shots} (${goals})` : String(shots))}
              summary={t("zones.summary")}
              emptyLabel={t("zones.empty")}
            />
            <p className="text-secondary text-muted">{t("zones.legend")}</p>
          </div>
        </Card>
      </div>

      <Card title={t("work.title")} description={t("work.description")} padded={false}>
        <div className="flex flex-col gap-4">
          <div className="px-5">
            <GroupedBars
              groups={periodGroups}
              aLabel={t("work.positive")}
              bLabel={t("work.negative")}
              summary={t("work.summary")}
            />
          </div>
          <Matrix
            caption={t("work.title")}
            columns={[
              ...full.periods.map((p) => periodLabel(tm, p.period, settings.periods)),
              t("scope.all"),
            ]}
            rows={workMatrix}
          />
        </div>
      </Card>

      <Card title={t("players.title")} description={t("players.description")} padded={false}>
        <PlayersTable
          rows={field}
          actionTypes={types}
          defaultCodes={defaultCodes}
          caption={t("players.title")}
        />
      </Card>

      {keepers.length > 0 ? (
        <Card title={t("keepers.title")} description={t("keepers.description")} padded={false}>
          <PlayersTable
            rows={keepers}
            actionTypes={types}
            defaultCodes={types.filter((a) => a.keeperOnly).map((a) => a.code)}
            caption={t("keepers.title")}
            keepers
          />
        </Card>
      ) : null}

      <Card
        title={t("timeline.title")}
        description={t("timeline.description", { count: events.length })}
        padded={false}
      >
        <ol className="flex flex-col divide-y divide-line px-5 pb-3">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-body">
              <span className="w-28 shrink-0 font-mono text-secondary text-muted">
                {periodLabel(tm, e.period, settings.periods)} {formatClock(e.clockMs)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {describeEvent(e, actionTypes, squad, tm, settings.periods)}
              </span>
              {e.ownScoreDelta > 0 || e.opponentScoreDelta > 0 ? (
                <StatusChip kind={e.ownScoreDelta > 0 ? "club" : "neutral"}>
                  {e.ownScoreDelta > 0 ? `+${e.ownScoreDelta}` : `+${e.opponentScoreDelta}`}
                </StatusChip>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-secondary text-muted">
        {t("note", {
          rating:
            stats.players.length > 0
              ? formatRating(Math.max(...stats.players.map((p) => p.rating)))
              : "0",
        })}
      </p>
    </div>
  );
}

export function describeEvent(
  e: MatchDetailResponse["events"][number],
  actionTypes: MatchActionType[],
  squad: MatchDetailResponse["squad"],
  tm: ReturnType<typeof useT>,
  periods: number,
): string {
  const who = (pid: string | null) => squad.find((p) => p.playerId === pid)?.name ?? "";
  switch (e.kind) {
    case "action": {
      const name = actionTypes.find((a) => a.id === e.actionTypeId)?.name ?? e.actionCode ?? "";
      return e.playerId ? `${name} · ${who(e.playerId)}` : name;
    }
    case "sub":
      return tm("feedSub", { in: who(e.playerId), out: who(e.relatedPlayerId) });
    case "period_start":
      return tm("feedPeriodStart", { period: periodLabel(tm, e.period, periods) });
    case "period_end":
      return tm("feedPeriodEnd", { period: periodLabel(tm, e.period, periods) });
    case "lineup":
      return tm("feedLineup");
  }
}
