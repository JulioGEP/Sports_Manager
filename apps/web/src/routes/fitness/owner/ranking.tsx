import { useState } from "react";
import { useIntl } from "react-intl";
import { todayInClub, useClubTimezone, useRanking } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, EmptyState, Icon, PageHeader } from "@/ui";

/** El mes `AAAA-MM` anterior o siguiente. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Ranking del box (ADR 0049): quién ha venido más este mes. Lo ven todos; quien prefiere no salir
 * en las clasificaciones no sale, y se dice cuántos son.
 */
export function RankingPage() {
  const t = useT("fitness.owner.ranking");
  const intl = useIntl();
  const timezone = useClubTimezone();
  const current = todayInClub(timezone).slice(0, 7);
  const [month, setMonth] = useState(current);
  const ranking = useRanking(month === current ? undefined : month);
  const label = intl.formatDate(new Date(`${month}-15T12:00:00Z`), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const rows = ranking.data?.consistency ?? [];
  const podium = (rank: number) =>
    rank === 1
      ? "bg-club text-on-club"
      : rank <= 3
        ? "bg-club-soft text-club-soft-text"
        : "bg-raised text-ink";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon.ArrowLeft size={18} aria-hidden="true" />}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          {t("previous")}
        </Button>
        <h2 className="text-title2 text-ink first-letter:uppercase" aria-live="polite">
          {label}
        </h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={month >= current}
          icon={<Icon.ArrowRight size={18} aria-hidden="true" />}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          {t("next")}
        </Button>
      </div>
      {ranking.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <Card padded={false} title={t("consistency")} description={t("consistencyHint")}>
        {rows.length === 0 && !ranking.isPending ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Icon.Trophy weight="duotone" />}
              title={t("empty")}
              description={t("emptyHint")}
            />
          </div>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {rows.map((r) => (
              <li
                key={r.playerId}
                className={`flex min-h-14 items-center gap-3 px-5 py-2 ${r.isMe ? "bg-club-soft" : ""}`}
                aria-current={r.isMe ? "true" : undefined}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-body font-semibold ${podium(r.rank)}`}
                >
                  {r.rank}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink">{r.name}</span>
                  {r.isMe ? <span className="text-label text-club-text">{t("you")}</span> : null}
                </span>
                <span className="font-mono text-body text-ink">
                  {t("classes", { count: r.classes })}
                </span>
              </li>
            ))}
          </ol>
        )}
        {ranking.data && ranking.data.hiddenCount > 0 ? (
          <p className="border-t border-line px-5 py-3 text-secondary text-muted">
            {t("hidden", { count: ranking.data.hiddenCount })}
          </p>
        ) : null}
      </Card>
      <p className="text-secondary text-muted">{t("privacy")}</p>
    </div>
  );
}
