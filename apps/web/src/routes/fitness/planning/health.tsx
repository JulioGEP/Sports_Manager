import { CAPACITIES, type PlanHealthResponse } from "@sportsmanager/shared";
import { useIntl } from "react-intl";
import { useParams } from "react-router";
import { PlanTabs } from "@/components/fitness/planning-nav";
import { CAPACITY_COLOR, CompareBars, Kpi, usePlanNames } from "@/components/fitness/planning-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { usePlanHealth } from "@/lib/planning";
import { Alert, Card, PageHeader } from "@/ui";

const DOMAIN_COLOR = { short: "#C2304A", medium: "#C46A12", long: "#0B7F70", very_long: "#2457D6" };

/**
 * La salud de la programación (ADR 0053): si el plan se cumple, si la gente mejora y viene más, el
 * equilibrio real frente al del plan, las duraciones, qué patrones se repiten semana a semana, los
 * límites y lo que ha costado la IA. Una pantalla para el head coach y el dueño.
 */
export function PlanHealthPage() {
  const { id } = useParams();
  const t = useT("fitness.planning.health");
  const home = useT("fitness.planning.home");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const health = usePlanHealth(id);
  if (!id) return null;
  if (health.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.planning} backLabel={home("title")} title={t("title")} />
        <Alert kind="error">{t("loadError")}</Alert>
      </div>
    );
  if (!health.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-96 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <HealthView data={health.data} />;
}

function HealthView({ data }: { data: PlanHealthResponse }) {
  const t = useT("fitness.planning.health");
  const patterns = useT("fitness.planning.validation.patterns");
  const limits = useT("fitness.planning.week.limit");
  const names = usePlanNames();
  const intl = useIntl();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const { plan, kpis } = data;
  const max = Math.max(1, ...data.heat.flatMap((h) => h.weeks));
  const dollars = (micros: number) =>
    intl.formatNumber(micros / 1_000_000, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  const num = (v: number) => intl.formatNumber(v, { maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planningPlan(plan.id)}
        backLabel={plan.name}
        eyebrow={plan.section.name}
        title={t("title")}
        description={t("description")}
      />
      <PlanTabs planId={plan.id} current="health" week={plan.currentWeek ?? 1} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          value={`${kpis.fulfilled} %`}
          label={t("kpi.fulfilled")}
          note={t("kpi.fulfilledNote")}
        />
        <Kpi
          value={kpis.athletes > 0 ? `${kpis.athletesWithPr}/${kpis.athletes}` : "—"}
          label={t("kpi.prs")}
          note={t("kpi.prsNote")}
        />
        <Kpi
          value={kpis.frequency !== null ? num(kpis.frequency) : "—"}
          label={t("kpi.frequency")}
          note={
            kpis.frequencyBefore !== null
              ? t("kpi.before", { value: num(kpis.frequencyBefore) })
              : undefined
          }
        />
        <Kpi
          value={kpis.aiAccepted !== null ? `${kpis.aiAccepted} %` : "—"}
          label={t("kpi.accepted")}
          note={t("kpi.ahead", { count: kpis.scheduledAhead })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("balance")} description={t("balanceHint")}>
          <CompareBars
            planLabel={t("plan")}
            realLabel={t("real")}
            rows={CAPACITIES.map((cap) => {
              const row = data.balance.find((b) => b.capacity === cap);
              return {
                key: cap,
                label: names.capacity(cap),
                color: CAPACITY_COLOR[cap],
                plan: row?.plan ?? 0,
                real: row?.real ?? 0,
              };
            })}
          />
        </Card>
        <Card title={t("durations")} description={t("durationsHint")}>
          <CompareBars
            planLabel={t("plan")}
            realLabel={t("real")}
            rows={data.durations.map((d) => ({
              key: d.domain,
              label: names.domain(d.domain),
              color: DOMAIN_COLOR[d.domain],
              plan: d.plan,
              real: d.real,
            }))}
          />
        </Card>
      </div>

      <Card title={t("heat")} description={t("heatHint")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-separate border-spacing-1 text-secondary">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted" scope="col">
                  <span className="sr-only">{t("pattern")}</span>
                </th>
                {data.weeks.map((n) => (
                  <th
                    key={n}
                    scope="col"
                    className={`font-mono font-medium ${n === plan.currentWeek ? "text-club-text" : "text-muted"}`}
                  >
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.heat.map((h) => (
                <tr key={h.pattern}>
                  <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal text-ink">
                    {patterns(h.pattern)}
                  </th>
                  {h.weeks.map((v, i) => (
                    <td
                      key={i}
                      className="h-7 rounded-sm text-center font-mono text-label"
                      style={{
                        background:
                          v === 0
                            ? "var(--color-raised)"
                            : `color-mix(in srgb, var(--color-ink) ${Math.round((v / max) * 70) + 10}%, transparent)`,
                        color: v / max > 0.5 ? "var(--color-surface)" : "var(--color-ink)",
                      }}
                      title={t("heatCell", { days: v, week: data.weeks[i] ?? i + 1 })}
                    >
                      {v || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("limits")} description={t("limitsHint")}>
          <ul className="flex flex-col gap-2.5">
            {data.limits.map((l) => (
              <li key={l.code} className="flex items-center justify-between gap-3 text-secondary">
                <span className="text-ink">{limits(l.code)}</span>
                <span className={`font-mono ${l.value > l.max ? "text-danger" : "text-ink"}`}>
                  {l.value}/{l.max}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("ai")} description={t("aiHint")}>
          {data.ai.byKind.length === 0 ? (
            <p className="text-secondary text-muted">{t("aiEmpty")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5">
                {data.ai.byKind.map((k) => (
                  <li
                    key={k.kind}
                    className="flex items-center justify-between gap-3 text-secondary"
                  >
                    <span className="text-ink">{t(`aiKind.${k.kind}`)}</span>
                    <span className="font-mono text-muted">
                      {t("aiCalls", { count: k.count })} · {dollars(k.costMicros)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="flex items-center justify-between border-t border-line pt-2 text-secondary font-medium text-ink">
                <span>{t("aiTotal")}</span>
                <span className="font-mono">{dollars(data.ai.totalMicros)}</span>
              </p>
              <p className="text-label text-muted">{t("aiNote", { planned: kpis.planned })}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
