import { useIntl } from "react-intl";
import { MeterBar, usePercent } from "@/components/fitness/owner-ui";
import { money } from "@/components/fees";
import { useFitnessMetrics } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Card, EmptyState, Icon, PageHeader, Stat } from "@/ui";

/**
 * Métricas del box (ADR 0049): cómo se llenan las clases por franja horaria en las últimas cuatro
 * semanas, esta semana frente a la anterior, cuánto viene cada atleta, altas y bajas, el
 * recurrente y la captación. Cada gráfico es también su tabla: la cifra va siempre al lado.
 */
export function MetricsPage() {
  const t = useT("fitness.owner.metrics");
  const intl = useIntl();
  const percent = usePercent();
  const metrics = useFitnessMetrics();
  const m = metrics.data;
  const ratio = (taken: number, offered: number) => (offered > 0 ? taken / offered : 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {metrics.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {!m ? (
        metrics.isPending ? (
          <div className="h-40 animate-pulse rounded-card bg-raised" />
        ) : null
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={<Icon.UsersThree weight="duotone" />}
              value={m.activeAthletes}
              label={t("active")}
            />
            <Stat
              icon={<Icon.Pulse weight="duotone" />}
              value={intl.formatNumber(m.visitsPerAthlete30, { maximumFractionDigits: 1 })}
              label={t("visits")}
            />
            <Stat
              icon={<Icon.Coins weight="duotone" />}
              value={money(m.recurringMonthlyCents)}
              label={t("recurring")}
            />
            <Stat
              icon={<Icon.UserPlus weight="duotone" />}
              value={`${m.trialsThisWeek} → ${m.trialsConvertedThisMonth}`}
              label={t("trials")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t("weekTitle")} description={t("weekHint")}>
              <table className="w-full text-body">
                <caption className="sr-only">{t("weekTitle")}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t("table.period")}</th>
                    <th scope="col">{t("table.bar")}</th>
                    <th scope="col">{t("table.occupancy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      [t("thisWeek"), m.occupancyWeek, "club"],
                      [t("lastWeek"), m.occupancyLastWeek, "muted"],
                    ] as const
                  ).map(([label, value, tone]) => (
                    <tr key={label}>
                      <th scope="row" className="w-36 py-2 pr-3 text-left font-medium text-ink">
                        {label}
                      </th>
                      <td className="py-2">
                        <MeterBar ratio={value ?? 0} tone={tone} />
                      </td>
                      <td className="w-20 py-2 pl-3 text-right font-mono text-ink">
                        {value === null ? "–" : percent(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title={t("membersTitle")} description={t("membersHint")}>
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <dt className="text-secondary text-muted">{t("joined")}</dt>
                  <dd className="font-mono text-title2 text-success">+{m.joinedThisMonth}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-secondary text-muted">{t("left")}</dt>
                  <dd className="font-mono text-title2 text-danger">−{m.leftThisMonth}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-secondary text-muted">{t("net")}</dt>
                  <dd className="font-mono text-title2 text-ink">
                    {m.joinedThisMonth - m.leftThisMonth >= 0 ? "+" : "−"}
                    {Math.abs(m.joinedThisMonth - m.leftThisMonth)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-secondary text-muted">{t("conversion")}</dt>
                  <dd className="font-mono text-title2 text-ink">{m.trialsConvertedThisMonth}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card title={t("byHourTitle")} description={t("byHourHint")}>
            {m.byHour.length === 0 ? (
              <EmptyState
                icon={<Icon.ChartBar weight="duotone" />}
                title={t("byHourEmpty")}
                description={t("byHourEmptyHint")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-body">
                  <caption className="sr-only">{t("byHourTitle")}</caption>
                  <thead>
                    <tr className="text-left text-label uppercase tracking-wide text-muted">
                      <th scope="col" className="w-20 pb-2 font-medium">
                        {t("table.hour")}
                      </th>
                      <th scope="col" className="pb-2 font-medium">
                        <span className="sr-only">{t("table.bar")}</span>
                      </th>
                      <th scope="col" className="w-28 pb-2 text-right font-medium">
                        {t("table.taken")}
                      </th>
                      <th scope="col" className="w-20 pb-2 text-right font-medium">
                        {t("table.occupancy")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.byHour.map((row) => (
                      <tr key={row.hour} className="border-t border-line">
                        <th scope="row" className="py-2 pr-3 text-left font-mono text-ink">
                          {row.hour}
                        </th>
                        <td className="py-2">
                          <MeterBar ratio={ratio(row.taken, row.offered)} />
                        </td>
                        <td className="py-2 pl-3 text-right font-mono text-muted">
                          {t("takenOf", { taken: row.taken, offered: row.offered })}
                        </td>
                        <td className="py-2 pl-3 text-right font-mono text-ink">
                          {percent(ratio(row.taken, row.offered))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
