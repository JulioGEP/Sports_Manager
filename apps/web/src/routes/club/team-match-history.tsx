import {
  MATCH_ZONES,
  TeamMatchHistoryResponseSchema,
  aggregateMatchStats,
  formatClock,
  type MatchActionType,
  type TeamMatchHistoryResponse,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ComparisonBars, GroupedBars, Scatter, ZoneGrid } from "@/components/match-charts";
import { FilterChips, PlayersTable, type PlayerRow } from "@/components/match-tables";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { formatRating, statsOf, statsTypesOf } from "@/lib/matches";
import { downloadXlsx, type Sheet } from "@/lib/xlsx";
import { Alert, Button, ButtonLink, Card, Field, Icon, PageHeader, Select, Stat } from "@/ui";
import { zoneCells } from "./match-stats";

type Metric = { key: string; label: string; of: (r: PlayerRow) => number };

/**
 * Histórico del equipo (Bloque 19): se eligen los partidos y los acumulados se recalculan al
 * momento con el motor compartido. Comparativa, evolución por partido, zonas, jugadores y el
 * cruce de dos métricas cualesquiera. Todo se baja a Excel.
 */
export function TeamMatchHistoryPage() {
  const t = useT("matchHistory");
  const ts = useT("matchStats");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const { id = "" } = useParams();
  const { slug, branding } = useReadyClub();
  const paths = clubPaths(slug);

  const history = useQuery({
    queryKey: ["org", slug, "team", id, "matches", "history"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/matches/history`, { schema: TeamMatchHistoryResponseSchema }),
    retry: false,
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"finished" | "all">("finished");
  const [xKey, setXKey] = useState("minutes");
  const [yKey, setYKey] = useState("rating");
  const [zoneCode, setZoneCode] = useState("all");

  if (history.isError) {
    const notFound = history.error instanceof ApiClientError && history.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(history.error))}</Alert>
    );
  }
  if (!history.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  return (
    <HistoryView
      data={history.data}
      clubName={branding.name}
      excluded={excluded}
      setExcluded={setExcluded}
      status={status}
      setStatus={setStatus}
      xKey={xKey}
      setXKey={setXKey}
      yKey={yKey}
      setYKey={setYKey}
      zoneCode={zoneCode}
      setZoneCode={setZoneCode}
      back={paths.teamMatches(id)}
      statsPath={paths.matchStats}
      dayOf={dates.day}
      t={t}
      ts={ts}
    />
  );
}

function HistoryView({
  data,
  clubName,
  excluded,
  setExcluded,
  status,
  setStatus,
  xKey,
  setXKey,
  yKey,
  setYKey,
  zoneCode,
  setZoneCode,
  back,
  statsPath,
  dayOf,
  t,
  ts,
}: {
  data: TeamMatchHistoryResponse;
  clubName: string;
  excluded: Set<string>;
  setExcluded: (s: Set<string>) => void;
  status: "finished" | "all";
  setStatus: (s: "finished" | "all") => void;
  xKey: string;
  setXKey: (k: string) => void;
  yKey: string;
  setYKey: (k: string) => void;
  zoneCode: string;
  setZoneCode: (k: string) => void;
  back: string;
  statsPath: (id: string) => string;
  dayOf: (iso: string) => string;
  t: ReturnType<typeof useT>;
  ts: ReturnType<typeof useT>;
}) {
  const { team, season, actionTypes, matches } = data;
  const candidates = matches.filter((m) => status === "all" || m.match.status === "finished");
  const chosen = candidates.filter((m) => !excluded.has(m.match.id));
  const perMatch = useMemo(
    () =>
      chosen.map((m) => ({
        match: m.match,
        stats: statsOf(m.match, m.squad, actionTypes, m.events),
      })),
    [chosen, actionTypes],
  );
  const agg = useMemo(
    () =>
      aggregateMatchStats(
        perMatch.map((m) => m.stats),
        statsTypesOf(actionTypes),
      ),
    [perMatch, actionTypes],
  );
  const types = useMemo(
    () =>
      actionTypes.filter(
        (a) => a.status === "active" || agg.totals.own[a.code] || agg.totals.opponent[a.code],
      ),
    [actionTypes, agg],
  );
  const playerTypes = types.filter((a) => a.scope === "player");
  const zoneTypes = types.filter((a) => a.requiresZone && a.scope === "player");
  const scoringCodes = types.filter((a) => a.ownScore > 0).map((a) => a.code);
  const rows: PlayerRow[] = useMemo(
    () =>
      agg.players.map((p) => ({
        id: p.playerId,
        name: p.name,
        shirtNumber: null,
        isGoalkeeper: false,
        timeMs: p.timeMs,
        plusMinus: p.plusMinus,
        scoreFor: p.scoreFor,
        scoreAgainst: p.scoreAgainst,
        actions: p.actions,
        rating: p.rating,
        matches: p.matches,
        starts: p.starts,
      })),
    [agg],
  );
  // Dorsal y portero: lo último que diga alguna convocatoria.
  const squadInfo = new Map<string, { shirtNumber: number | null; isGoalkeeper: boolean }>();
  for (const m of chosen)
    for (const p of m.squad)
      squadInfo.set(p.playerId, { shirtNumber: p.shirtNumber, isGoalkeeper: p.isGoalkeeper });
  const enriched = rows.map((r) => ({ ...r, ...(squadInfo.get(r.id) ?? {}) }));
  const field = enriched.filter((r) => !r.isGoalkeeper);
  const keepers = enriched.filter((r) => r.isGoalkeeper);
  const defaultCodes = playerTypes.filter((a) => a.quick && !a.keeperOnly).map((a) => a.code);

  const metrics: Metric[] = [
    { key: "minutes", label: ts("table.minutes"), of: (r) => Math.round(r.timeMs / 60_000) },
    { key: "matches", label: ts("table.matches"), of: (r) => r.matches ?? 0 },
    { key: "plusMinus", label: "+/-", of: (r) => r.plusMinus },
    { key: "scoreFor", label: ts("table.scoreFor"), of: (r) => r.scoreFor },
    { key: "scoreAgainst", label: ts("table.scoreAgainst"), of: (r) => r.scoreAgainst },
    { key: "rating", label: ts("table.rating"), of: (r) => Math.round(r.rating * 10) / 10 },
    ...playerTypes.map((a) => ({
      key: a.code,
      label: a.name,
      of: (r: PlayerRow) => r.actions[a.code] ?? 0,
    })),
  ];
  const metricOf = (key: string) => metrics.find((m) => m.key === key) ?? metrics[0]!;
  const x = metricOf(xKey);
  const y = metricOf(yKey);
  const points = enriched.map((r) => ({
    id: r.id,
    label: r.name.split(" ")[0] ?? r.name,
    x: x.of(r),
    y: y.of(r),
  }));
  const zoneCodes = zoneCode === "all" ? zoneTypes.map((a) => a.code) : [zoneCode];
  const cells = zoneCells(agg, zoneCodes, scoringCodes);
  const trend = perMatch.map((m) => ({
    key: m.match.id,
    label: `${m.match.opponent}`,
    a: m.stats.score.own,
    b: m.stats.score.opponent,
  }));

  function toggle(matchId: string) {
    const next = new Set(excluded);
    if (next.has(matchId)) next.delete(matchId);
    else next.add(matchId);
    setExcluded(next);
  }

  function exportExcel() {
    const sheets: Sheet[] = [
      {
        name: t("export.summary"),
        rows: [
          [t("export.team"), team.name],
          [t("export.season"), season.name],
          [t("export.matches"), agg.matches],
          [t("record"), `${agg.won}-${agg.drawn}-${agg.lost}`],
          [ts("export.ownScore"), agg.score.own],
          [ts("export.opponentScore"), agg.score.opponent],
          [],
          [ts("export.metric"), clubName, t("opponents")],
          ...agg.comparison.map((r) => [r.name, r.own, r.opponent]),
          [],
          [
            ts("export.match"),
            ts("export.date"),
            ts("export.opponent"),
            ts("export.ownScore"),
            ts("export.opponentScore"),
          ],
          ...perMatch.map((m) => [
            `${team.name} - ${m.match.opponent}`,
            m.match.playedOn,
            m.match.opponent,
            m.stats.score.own,
            m.stats.score.opponent,
          ]),
        ],
      },
      {
        name: t("export.players"),
        rows: [
          [
            ts("table.player"),
            ts("table.matches"),
            ts("table.starts"),
            ts("table.minutes"),
            ts("table.scoreFor"),
            ts("table.scoreAgainst"),
            "+/-",
            ...playerTypes.map((a) => a.name),
            ts("table.rating"),
          ],
          ...enriched.map((r) => [
            r.name,
            r.matches ?? 0,
            r.starts ?? 0,
            Math.round(r.timeMs / 60_000),
            r.scoreFor,
            r.scoreAgainst,
            r.plusMinus,
            ...playerTypes.map((a) => r.actions[a.code] ?? 0),
            Math.round(r.rating * 100) / 100,
          ]),
        ],
      },
      {
        name: t("export.zones"),
        rows: [
          [ts("export.zone"), ...zoneTypes.map((a) => a.name)],
          ...MATCH_ZONES.map((zone) => {
            const cell = agg.zones.find((z) => z.zone === zone);
            return [zone, ...zoneTypes.map((a) => cell?.total[a.code] ?? 0)];
          }),
        ],
      },
      {
        name: t("export.perMatch"),
        rows: [
          [
            ts("export.match"),
            ts("table.player"),
            ts("table.minutes"),
            "+/-",
            ...playerTypes.map((a) => a.name),
            ts("table.rating"),
          ],
          ...perMatch.flatMap((m) =>
            m.stats.players
              .filter((p) => p.timeMs > 0 || Object.keys(p.actions).length > 0)
              .map((p) => [
                `${m.match.playedOn} ${m.match.opponent}`,
                p.name,
                Math.round(p.timeMs / 60_000),
                p.plusMinus,
                ...playerTypes.map((a) => p.actions[a.code] ?? 0),
                Math.round(p.rating * 100) / 100,
              ]),
          ),
        ],
      },
    ];
    downloadXlsx(`${team.name} - ${season.name}`, sheets);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink
          to={back}
          variant="tertiary"
          size="sm"
          icon={<Icon.ArrowLeft size={16} aria-hidden="true" />}
        >
          {t("back")}
        </ButtonLink>
      </div>
      <PageHeader
        eyebrow={`${team.name} · ${season.name}`}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="secondary"
            icon={<Icon.DownloadSimple size={18} aria-hidden="true" />}
            onClick={exportExcel}
            disabled={agg.matches === 0}
          >
            {ts("export.button")}
          </Button>
        }
      />

      <Card
        title={t("selection.title")}
        description={t("selection.description", { count: chosen.length, total: candidates.length })}
        padded={false}
        actions={
          <>
            <FilterChips
              items={[
                { key: "finished", label: t("selection.finished") },
                { key: "all", label: t("selection.all") },
              ]}
              selected={status}
              onChange={setStatus}
              label={t("selection.status")}
            />
            <Button variant="secondary" size="sm" onClick={() => setExcluded(new Set())}>
              {t("selection.pickAll")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExcluded(new Set(candidates.map((m) => m.match.id)))}
            >
              {t("selection.pickNone")}
            </Button>
          </>
        }
      >
        {candidates.length === 0 ? (
          <p className="px-5 pb-5 text-secondary text-muted">{t("selection.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {candidates.map((m) => {
              const on = !excluded.has(m.match.id);
              return (
                <li key={m.match.id} className="flex min-h-13 items-center gap-3 px-5 py-2">
                  <input
                    id={`pick-${m.match.id}`}
                    type="checkbox"
                    className="size-5 accent-[var(--club-fill)]"
                    checked={on}
                    onChange={() => toggle(m.match.id)}
                  />
                  <label htmlFor={`pick-${m.match.id}`} className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">
                      {m.match.homeAway === "home"
                        ? `${team.name} – ${m.match.opponent}`
                        : `${m.match.opponent} – ${team.name}`}
                    </span>
                    <span className="text-secondary text-muted">{dayOf(m.match.playedOn)}</span>
                  </label>
                  <span className="font-mono text-body tabular text-ink">
                    {m.match.ownScore}–{m.match.opponentScore}
                  </span>
                  <Link to={statsPath(m.match.id)} className="text-secondary font-medium">
                    {t("selection.open")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Icon.SportIcons.Balon />} value={agg.matches} label={t("tiles.matches")} />
        <Stat
          icon={<Icon.Trophy weight="duotone" />}
          value={`${agg.won}-${agg.drawn}-${agg.lost}`}
          label={t("tiles.record")}
        />
        <Stat
          icon={<Icon.Target weight="duotone" />}
          value={`${agg.score.own} · ${agg.score.opponent}`}
          label={t("tiles.score")}
        />
        <Stat
          icon={<Icon.Timer weight="duotone" />}
          value={formatClock(agg.playedMs)}
          label={ts("tiles.played")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("trend.title")} description={t("trend.description")}>
          {trend.length === 0 ? (
            <p className="text-secondary text-muted">{t("selection.empty")}</p>
          ) : (
            <GroupedBars
              groups={trend}
              aLabel={clubName}
              bLabel={t("opponents")}
              summary={t("trend.summary")}
            />
          )}
        </Card>
        <Card title={ts("comparison.title")} description={t("comparisonDescription")}>
          {agg.comparison.length === 0 ? (
            <p className="text-secondary text-muted">{ts("comparison.empty")}</p>
          ) : (
            <ComparisonBars
              rows={agg.comparison}
              ownLabel={clubName}
              opponentLabel={t("opponents")}
              summary={ts("comparison.summary", {
                rows: agg.comparison.map((r) => `${r.name} ${r.own}-${r.opponent}`).join(", "),
              })}
            />
          )}
        </Card>
        <Card title={ts("zones.title")} description={t("zonesDescription")}>
          <div className="flex flex-col gap-3">
            {zoneTypes.length > 1 ? (
              <FilterChips
                items={[
                  { key: "all", label: ts("zones.allActions") },
                  ...zoneTypes.map((a) => ({ key: a.code, label: a.name })),
                ]}
                selected={zoneCode}
                onChange={setZoneCode}
                label={ts("zones.pick")}
              />
            ) : null}
            <ZoneGrid
              cells={cells}
              format={(shots, goals) => (goals > 0 ? `${shots} (${goals})` : String(shots))}
              summary={ts("zones.summary")}
              emptyLabel={ts("zones.empty")}
            />
          </div>
        </Card>
        <Card title={t("cross.title")} description={t("cross.description")}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("cross.x")}>
                {(id) => (
                  <Select id={id} value={x.key} onChange={(e) => setXKey(e.target.value)}>
                    {metrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("cross.y")}>
                {(id) => (
                  <Select id={id} value={y.key} onChange={(e) => setYKey(e.target.value)}>
                    {metrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            {points.length === 0 ? (
              <p className="text-secondary text-muted">{t("selection.empty")}</p>
            ) : (
              <Scatter
                points={points}
                xLabel={x.label}
                yLabel={y.label}
                summary={t("cross.summary", { x: x.label, y: y.label })}
              />
            )}
          </div>
        </Card>
      </div>

      <Card title={t("players.title")} description={t("players.description")} padded={false}>
        <PlayersTable
          rows={field}
          actionTypes={types}
          defaultCodes={defaultCodes}
          caption={t("players.title")}
          aggregate
        />
      </Card>
      {keepers.length > 0 ? (
        <Card title={ts("keepers.title")} description={t("keepersDescription")} padded={false}>
          <PlayersTable
            rows={keepers}
            actionTypes={types}
            defaultCodes={types.filter((a) => a.keeperOnly).map((a) => a.code)}
            caption={ts("keepers.title")}
            keepers
            aggregate
          />
        </Card>
      ) : null}
      <p className="text-secondary text-muted">
        {t("note", {
          best:
            enriched.length > 0 ? formatRating(Math.max(...enriched.map((r) => r.rating))) : "0",
        })}
      </p>
    </div>
  );
}

export type { MatchActionType };
