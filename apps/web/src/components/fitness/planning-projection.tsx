import {
  planTestByCode,
  projectedValue,
  formatSeconds,
  type Projection,
} from "@sportsmanager/shared";
import { useIntl } from "react-intl";
import { useT } from "@/lib/intl";
import { CAPACITY_COLOR, usePlanNames } from "./planning-ui";

/**
 * Lo que se puede esperar de un plan (ADR 0053): una banda por capacidad y un rango por test,
 * siempre orientativo y siempre con la frecuencia a la que se refiere. Con la marca de partida del
 * box, el rango sale también en kilos, segundos o repeticiones.
 */
export function ProjectionView({
  projection,
  frequency,
  baselines = {},
  calibrated = null,
  compact = false,
}: {
  projection: Projection;
  frequency: number;
  baselines?: Record<string, number>;
  /** Calibración del box (mejora real entre la prevista del último ciclo), si la hay. */
  calibrated?: number | null;
  compact?: boolean;
}) {
  const t = useT("fitness.planning.projection");
  const names = usePlanNames();
  const intl = useIntl();
  const number = (v: number) => intl.formatNumber(v, { maximumFractionDigits: 1 });
  const valueOf = (code: string, v: number) => {
    const test = planTestByCode(code);
    if (test?.lowerIsBetter) return formatSeconds(Math.round(v));
    if (test?.kind === "movement") return `${number(v)} kg`;
    return number(v);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-secondary text-muted">{t("forFrequency", { days: frequency })}</p>
      <ul className="flex flex-col gap-2">
        {projection.capacities.map((c) => (
          <li key={c.capacity} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-secondary text-ink">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: CAPACITY_COLOR[c.capacity] }}
              />
              {names.capacity(c.capacity)}
            </span>
            <span
              className={`rounded-chip px-2 py-0.5 text-label font-semibold ${
                c.band === "down"
                  ? "bg-danger-soft text-danger"
                  : c.band === "maintain"
                    ? "bg-neutral-soft text-neutral"
                    : "bg-success-soft text-success"
              }`}
            >
              {t(`band.${c.band}`)}
            </span>
          </li>
        ))}
      </ul>
      {projection.tests.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-label uppercase tracking-wide text-muted">{t("tests")}</span>
          <ul className="flex flex-col gap-2">
            {projection.tests.map((range) => {
              const base = baselines[range.code];
              const lower = planTestByCode(range.code)?.lowerIsBetter ?? false;
              const abs = base !== undefined ? projectedValue(range.code, base, range) : null;
              return (
                <li
                  key={range.code}
                  className="flex flex-col gap-0.5 rounded-control bg-raised px-3 py-2"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{names.test(range.code)}</span>
                    <span className="font-mono text-secondary text-ink">
                      {range.unit === "reps"
                        ? t("reps", { low: Math.round(range.low), high: Math.round(range.high) })
                        : lower
                          ? t("faster", { low: number(range.low), high: number(range.high) })
                          : t("better", { low: number(range.low), high: number(range.high) })}
                    </span>
                  </span>
                  {abs && base !== undefined && !compact ? (
                    <span className="text-label text-muted">
                      {t("fromTo", {
                        from: valueOf(range.code, base),
                        low: valueOf(range.code, lower ? abs.high : abs.low),
                        high: valueOf(range.code, lower ? abs.low : abs.high),
                      })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="text-label text-muted">
        {calibrated !== null ? t("calibrated", { factor: number(calibrated) }) : t("orientative")}
      </p>
    </div>
  );
}
