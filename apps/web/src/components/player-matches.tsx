import {
  PlayerMatchesResponseSchema,
  formatClock,
  type PlayerMatchLine,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { formatRating, signed } from "@/lib/matches";
import { Card, EmptyState, Icon, StatusChip } from "@/ui";

/**
 * Partidos de un jugador (Bloque 20): sus totales y su línea en cada partido. Para el personal
 * (`/players/:id/matches`) y para su familia (`/family/players/:id/matches`), que solo ve lo
 * suyo: el resultado del equipo y lo que hizo su hijo o hija, nunca a los demás (DESIGN.md 0.10).
 */
export function PlayerMatchesCard({
  playerId,
  family = false,
}: {
  playerId: string;
  family?: boolean;
}) {
  const t = useT("playerMatches");
  const dates = useDates();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const canOpenStats = !family && org.actor.permissions.includes("org.matches.read");
  const data = useQuery({
    queryKey: ["org", slug, family ? "family" : "players", playerId, "matches"],
    queryFn: () =>
      apiFetch(
        family
          ? `/api/org/family/players/${playerId}/matches`
          : `/api/org/players/${playerId}/matches`,
        {
          schema: PlayerMatchesResponseSchema,
        },
      ),
    retry: false,
  });
  const lines = data.data?.lines ?? [];
  const totals = data.data?.totals;
  const types = data.data?.actionTypes ?? [];
  /** Las tres acciones con más peso que el jugador haya hecho alguna vez: lo que mejor lo describe. */
  const highlights = types
    .filter((a) => a.scope === "player" && (totals?.actions[a.code] ?? 0) > 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 3);
  const outcome = (l: PlayerMatchLine) =>
    l.match.ownScore > l.match.opponentScore
      ? "won"
      : l.match.ownScore < l.match.opponentScore
        ? "lost"
        : "drawn";

  return (
    <Card
      title={t("title")}
      description={family ? t("familyDescription") : t("description")}
      padded={false}
    >
      {data.isError ? (
        <p className="px-5 pb-5 text-secondary text-muted">{t("error")}</p>
      ) : !data.data ? (
        <div className="px-5 pb-5" aria-busy="true">
          <div className="h-16 animate-pulse rounded-field bg-raised" />
        </div>
      ) : lines.length === 0 ? (
        <EmptyState icon={<Icon.SportIcons.Balon />} title={t("empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-4">
            <div className="flex flex-col">
              <dt className="text-secondary text-muted">{t("matches")}</dt>
              <dd className="font-mono text-title2 text-ink">
                {totals?.matches ?? 0}
                <span className="text-secondary text-muted">
                  {" "}
                  · {t("starts", { count: totals?.starts ?? 0 })}
                </span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-secondary text-muted">{t("minutes")}</dt>
              <dd className="font-mono text-title2 text-ink">
                {Math.round((totals?.timeMs ?? 0) / 60_000)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-secondary text-muted">+/-</dt>
              <dd className="font-mono text-title2 text-ink">{signed(totals?.plusMinus ?? 0)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-secondary text-muted">{t("rating")}</dt>
              <dd className="font-mono text-title2 text-ink">
                {formatRating(totals?.rating ?? 0)}
              </dd>
            </div>
          </dl>
          {highlights.length > 0 ? (
            <ul className="flex flex-wrap gap-2 px-5">
              {highlights.map((a) => (
                <li key={a.code}>
                  <StatusChip
                    kind={
                      a.category === "positive"
                        ? "success"
                        : a.category === "negative"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {a.name}: {totals?.actions[a.code] ?? 0}
                  </StatusChip>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {lines.slice(0, 8).map((l) => {
              const o = outcome(l);
              const own = types
                .filter((a) => a.scope === "player" && (l.actions[a.code] ?? 0) > 0)
                .slice(0, 3);
              return (
                <li key={l.match.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-full font-mono text-secondary ${o === "won" ? "bg-success-soft text-success" : o === "lost" ? "bg-danger-soft text-danger" : "bg-raised text-ink"}`}
                  >
                    {l.match.ownScore}–{l.match.opponentScore}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">
                      {canOpenStats ? (
                        <Link to={paths.matchStats(l.match.id)}>{l.match.opponent}</Link>
                      ) : (
                        l.match.opponent
                      )}
                    </span>
                    <span className="truncate text-secondary text-muted">
                      {dates.day(l.match.playedOn)} · {l.starter ? t("starter") : t("bench")} ·{" "}
                      {formatClock(l.timeMs)} · {signed(l.plusMinus)}
                      {own.length > 0
                        ? ` · ${own.map((a) => `${a.name} ${l.actions[a.code]}`).join(", ")}`
                        : ""}
                    </span>
                  </span>
                  <span className="font-mono text-body text-ink">{formatRating(l.rating)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
