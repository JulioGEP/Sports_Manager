import { TeamLoadResponseSchema, type TeamLoadResponse } from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Link, useParams } from "react-router";
import {
  AvailabilityChip,
  InsightList,
  RatioChip,
  Sparkline,
  useLoadFormat,
  useShortDate,
} from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Avatar, Card, DataList, EmptyState, Icon, PageHeader, Stat } from "@/ui";

type LoadRow = TeamLoadResponse["players"][number];

/**
 * Panel de carga del equipo (Bloque 22, ADR 0038): por jugador, la carga aguda frente a la
 * crónica, la monotonía, los últimos 28 días y el último bienestar, con las recomendaciones de
 * carga. La relación aguda:crónica es un aviso para revisar, nunca una predicción de lesión.
 */
export function TeamLoadPage() {
  const t = useT("loadPanel");
  const ins = useT("insights");
  const w = useT("wellness");
  const a = useT("availability");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const fmt = useLoadFormat();
  const short = useShortDate();
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);

  const query = useQuery({
    queryKey: ["org", slug, "team", id, "load"],
    queryFn: () => apiFetch(`/api/org/teams/${id}/load`, { schema: TeamLoadResponseSchema }),
    retry: false,
  });

  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(query.error))}</Alert>
    );
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { team, players, insights, tracking, access } = query.data;
  // Umbrales de la relación aguda:crónica de la sección.
  const { high, low } = query.data.acwr;
  const number = (n: number | null) =>
    n === null ? "—" : intl.formatNumber(n, { maximumFractionDigits: 2 });
  const rows = [...players].sort(
    (a, b) => (b.metrics.ratio ?? -1) - (a.metrics.ratio ?? -1) || a.name.localeCompare(b.name),
  );
  const above = players.filter((p) => p.metrics.ratio !== null && p.metrics.ratio > high).length;
  const below = players.filter((p) => p.metrics.ratio !== null && p.metrics.ratio < low).length;
  const noHistory = players.filter((p) => p.metrics.ratio === null).length;
  const unavailable = players.filter((p) => p.availability.status !== "available").length;
  const wellness = (p: LoadRow) =>
    p.lastWellness ? (
      <span className="flex flex-col">
        <span className="font-mono text-ink">{w("score", { score: p.lastWellness.score })}</span>
        <span className="text-label text-muted">{short.weekday(p.lastWellness.date)}</span>
      </span>
    ) : (
      <span className="text-muted">{t("noWellness")}</span>
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.teamTraining(id)}
        backLabel={t("backToWeek")}
        eyebrow={team.name}
        title={t("title")}
        description={t("description")}
      />

      {tracking === "basic" ? (
        <Alert kind="info" title={t("basicTitle")}>
          {t("basicBody")}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Icon.Lightning aria-hidden="true" />}
          value={above}
          label={t("stats.high", { high: number(high) })}
        />
        <Stat
          icon={<Icon.Pulse aria-hidden="true" />}
          value={below}
          label={t("stats.low", { low: number(low) })}
        />
        <Stat
          icon={<Icon.Clock aria-hidden="true" />}
          value={noHistory}
          label={t("stats.noHistory")}
        />
        <Stat
          icon={<Icon.Heartbeat aria-hidden="true" />}
          value={unavailable}
          label={t("stats.unavailable")}
        />
      </div>

      <Card title={ins("title")} description={ins("description")}>
        <InsightList
          insights={insights}
          contents={[]}
          players={players.map((p) => ({ id: p.playerId, name: p.name }))}
          teamId={team.id}
          canAnswer={access.write}
          onAnswered={() => void client.invalidateQueries({ queryKey: ["org", slug] })}
          limit={5}
        />
      </Card>

      <Card title={t("table.title")} description={t("table.description")} padded={false}>
        <div className="flex flex-col gap-4">
          <p className="px-5 text-secondary text-muted">
            {t("ratioNote", { low: number(low), high: number(high) })}
          </p>
          <DataList<LoadRow>
            caption={t("table.title")}
            rows={rows}
            getKey={(p) => p.playerId}
            empty={<EmptyState icon={<Icon.Users />} title={t("empty")} />}
            href={(p) => paths.playerPerformance(p.playerId)}
            columns={[
              {
                key: "player",
                header: t("table.player"),
                cell: (p) => (
                  <span className="flex items-center gap-3">
                    <Avatar name={p.name} src={p.photoUrl} size="sm" />
                    <Link to={paths.playerPerformance(p.playerId)} className="font-medium text-ink">
                      {p.shirtNumber !== null ? `${p.shirtNumber}. ` : ""}
                      {p.name}
                    </Link>
                  </span>
                ),
              },
              {
                key: "availability",
                header: t("table.availability"),
                cell: (p) => <AvailabilityChip value={p.availability} />,
              },
              {
                key: "acute",
                header: t("table.acute"),
                numeric: true,
                cell: (p) => fmt.load(p.metrics.acute),
              },
              {
                key: "chronic",
                header: t("table.chronic"),
                numeric: true,
                cell: (p) => fmt.load(p.metrics.chronic),
              },
              {
                key: "ratio",
                header: t("table.ratio"),
                cell: (p) => <RatioChip ratio={p.metrics.ratio} high={high} low={low} />,
              },
              {
                key: "monotony",
                header: t("table.monotony"),
                numeric: true,
                cell: (p) => number(p.metrics.monotony),
              },
              {
                key: "trend",
                header: t("table.trend"),
                cell: (p) => (
                  <Sparkline values={p.daily} label={t("trendLabel", { name: p.name })} />
                ),
              },
              { key: "wellness", header: t("table.wellness"), cell: wellness },
            ]}
            mobileRow={(p) => ({
              leading: <Avatar name={p.name} src={p.photoUrl} size="md" />,
              title: <Link to={paths.playerPerformance(p.playerId)}>{p.name}</Link>,
              subtitle: [
                t("mobileSubtitle", {
                  acute: fmt.load(p.metrics.acute),
                  chronic: fmt.load(p.metrics.chronic),
                }),
                p.availability.status !== "available" ? a(`status.${p.availability.status}`) : "",
              ]
                .filter(Boolean)
                .join(" · "),
              trailing: <RatioChip ratio={p.metrics.ratio} high={high} low={low} />,
            })}
          />
        </div>
      </Card>
    </div>
  );
}
