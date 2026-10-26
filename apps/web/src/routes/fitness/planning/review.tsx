import {
  CAPACITY_NAMES,
  PlanReviewResponseSchema,
  type Capacity,
  type PlanReviewResponse,
} from "@sportsmanager/shared";
import { useState } from "react";
import { useIntl } from "react-intl";
import { useParams } from "react-router";
import { PlanTabs } from "@/components/fitness/planning-nav";
import { Kpi, RoleChip, usePlanNames } from "@/components/fitness/planning-ui";
import { useStaffError } from "@/components/fitness/staff-ui";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlanReview } from "@/lib/planning";
import { Alert, Button, Card, Icon, PageHeader, Segmented, StatusChip, useToast } from "@/ui";

const VERDICT_KIND = {
  as_planned: "success",
  longer: "warning",
  shorter: "info",
  harder: "warning",
  easier: "info",
  no_data: "neutral",
} as const;

/**
 * La revisión del domingo (ADR 0053): lo previsto frente a lo que pasó, día a día; lo que ha
 * aprendido el box; y los ajustes para la semana siguiente, cada uno con su antes y su después.
 * Se aceptan o se descartan de uno en uno: aceptar cambia el WOD de la semana que viene.
 */
export function PlanReviewPage() {
  const { id } = useParams();
  const [week, setWeek] = useState<number | null>(null);
  const t = useT("fitness.planning.review");
  const home = useT("fitness.planning.home");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const review = usePlanReview(id, week);
  if (!id) return null;
  if (review.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.planning} backLabel={home("title")} title={t("title")} />
        <Alert kind="error">{t("loadError")}</Alert>
      </div>
    );
  if (!review.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-96 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <ReviewView data={review.data} onWeek={setWeek} />;
}

function ReviewView({ data, onWeek }: { data: PlanReviewResponse; onWeek: (n: number) => void }) {
  const t = useT("fitness.planning.review");
  const names = usePlanNames();
  const intl = useIntl();
  const time = useClassTime();
  const movementName = useMovementName();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [deciding, setDeciding] = useState<string | null>(null);
  const { plan, kpis } = data;
  const num = (v: number) => intl.formatNumber(v, { maximumFractionDigits: 1 });
  const pending = data.adjustments.filter((a) => a.status === "pending");

  async function decide(key: string, decision: "accept" | "discard") {
    setDeciding(key);
    try {
      await apiFetch(`/api/org/plans/${plan.id}/review/${data.week}/decide`, {
        method: "POST",
        body: { key, decision },
        schema: PlanReviewResponseSchema,
      });
      await invalidate();
      toast("success", decision === "accept" ? t("accepted") : t("discarded"));
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setDeciding(null);
    }
  }

  const adjustmentText = (a: PlanReviewResponse["adjustments"][number]) => {
    const p = a.params;
    switch (a.kind) {
      case "cap":
        return t("adj.cap", {
          before: Number(p.before),
          after: Number(p.after),
          pct: Number(p.pct),
        });
      case "pace":
        return t("adj.pace", { real: num(Number(p.real)), target: num(Number(p.target)) });
      case "percent":
        return t("adj.percent", {
          movement: movementName(String(p.movement)),
          before: Number(p.before),
          after: Number(p.after),
          completion: Number(p.completion),
        });
      case "coverage":
        return t("adj.coverage", {
          capacity:
            CAPACITY_NAMES[String(p.capacity) as Capacity]?.[names.locale] ?? String(p.capacity),
          days: String(p.days)
            .split(",")
            .map((d) => names.weekdayShort(Number(d)))
            .join(" · "),
        });
    }
  };

  const valueText = (row: PlanReviewResponse["rows"][number]) => {
    if (row.value === null) return t("noData");
    if (row.metric === "minutes") return t("minutes", { value: num(row.value) });
    if (row.metric === "effort") return t("effort", { value: num(row.value) });
    return t("completion", { value: Math.round(row.value) });
  };
  const bandText = (row: PlanReviewResponse["rows"][number]) =>
    row.metric === "minutes"
      ? t("bandMinutes", { low: num(row.low), high: num(row.high) })
      : row.metric === "effort"
        ? t("bandEffort", { low: num(row.low), high: num(row.high) })
        : t("bandCompletion", { low: row.low });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planningPlan(plan.id)}
        backLabel={plan.name}
        eyebrow={plan.section.name}
        title={t("title")}
        description={t("description")}
      />
      <PlanTabs planId={plan.id} current="review" week={plan.currentWeek ?? data.week} />

      {data.weeks.length > 1 ? (
        <Segmented<string>
          label={t("week")}
          value={String(data.week)}
          onChange={(v) => onWeek(Number(v))}
          options={data.weeks
            .slice(-8)
            .map((n) => ({ key: String(n), label: t("weekShort", { n }) }))}
        />
      ) : null}

      <p className="text-secondary text-muted">
        {t("range", {
          n: data.week,
          from: names.shortDate(data.startsOn),
        })}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi value={`${kpis.fulfilled} %`} label={t("kpi.fulfilled")} />
        <Kpi
          value={kpis.attendees}
          label={t("kpi.attendees")}
          note={
            kpis.usualAttendees !== null
              ? t("kpi.usual", { usual: kpis.usualAttendees })
              : undefined
          }
        />
        <Kpi
          value={kpis.effort !== null ? num(kpis.effort) : "—"}
          label={t("kpi.effort")}
          note={
            kpis.plannedEffort !== null
              ? t("kpi.planned", { planned: num(kpis.plannedEffort) })
              : undefined
          }
        />
        <Kpi value={`${kpis.logged} %`} label={t("kpi.logged")} />
        <Kpi value={kpis.prs} label={t("kpi.prs")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card title={t("rows")} description={t("rowsHint")} padded={false}>
          {data.rows.length === 0 ? (
            <p className="px-5 pb-5 text-secondary text-muted">{t("rowsEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.rows.map((row) => {
                const scale = Math.max(1, row.scaleMax);
                return (
                  <li key={row.workoutId} className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-secondary font-medium text-ink first-letter:uppercase">
                          {time.weekday(row.date, "short")}
                        </span>
                        {row.role ? <RoleChip role={row.role} /> : null}
                        {row.title ? (
                          <span className="truncate text-secondary text-muted">{row.title}</span>
                        ) : null}
                      </span>
                      <StatusChip kind={VERDICT_KIND[row.verdict]}>
                        {t(`verdict.${row.verdict}`)}
                      </StatusChip>
                    </div>
                    <div className="relative h-3 rounded-full bg-raised" aria-hidden="true">
                      <span
                        className="absolute inset-y-0 rounded-full bg-success-soft"
                        style={{
                          left: `${(row.low / scale) * 100}%`,
                          width: `${((row.high - row.low) / scale) * 100}%`,
                        }}
                      />
                      {row.value !== null ? (
                        <span
                          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
                          style={{ left: `${Math.min(100, (row.value / scale) * 100)}%` }}
                        />
                      ) : null}
                    </div>
                    <span className="flex flex-wrap justify-between gap-2 text-label text-muted">
                      <span>{bandText(row)}</span>
                      <span className="font-mono text-ink">
                        {valueText(row)}
                        {row.samples > 0 ? ` · ${t("samples", { count: row.samples })}` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title={t("adjustments")}
            description={
              pending.length > 0
                ? t("adjustmentsHint", { count: pending.length })
                : t("adjustmentsNone")
            }
          >
            {data.adjustments.length === 0 ? (
              <p className="text-secondary text-muted">{t("adjustmentsEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.adjustments.map((a) => (
                  <li
                    key={a.key}
                    className="flex flex-col gap-2 rounded-control border border-line p-3"
                  >
                    <span className="text-label uppercase tracking-wide text-muted">
                      {`${t(`adjKind.${a.kind}`)} · ${time.weekday(a.date, "short")}`}
                    </span>
                    <span className="text-secondary text-ink">{adjustmentText(a)}</span>
                    {a.status === "pending" && data.canWrite ? (
                      <span className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          action="approve"
                          loading={deciding === a.key}
                          onClick={() => void decide(a.key, "accept")}
                        >
                          {t("accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => void decide(a.key, "discard")}
                        >
                          {t("discard")}
                        </Button>
                      </span>
                    ) : a.status !== "pending" ? (
                      <StatusChip kind={a.status === "accepted" ? "success" : "neutral"}>
                        {t(`status.${a.status}`)}
                      </StatusChip>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("learned")} description={t("learnedHint")}>
            {data.learned.length === 0 ? (
              <p className="text-secondary text-muted">{t("learnedEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.learned.map((l) => (
                  <li key={l.code} className="flex items-start gap-2 text-secondary text-ink">
                    <Icon.Brain
                      size={18}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-muted"
                    />
                    {t(`learn.${l.code}`, {
                      value: num(Math.abs(l.value)),
                      samples: l.samples,
                      sign: l.value >= 0 ? "more" : "less",
                    })}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
