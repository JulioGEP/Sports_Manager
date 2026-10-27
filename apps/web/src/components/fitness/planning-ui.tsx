import {
  CAPACITIES,
  CAPACITY_NAMES,
  DAY_ROLE_INFO,
  DAY_ROLE_NAMES,
  PLAN_BLOCK_NAMES,
  addDays,
  blockLabel,
  planTestByCode,
  type Capacity,
  type DayRole,
  type Emphasis,
  type PlanBlockKind,
  type PlanStructure,
  type ValidationResult,
} from "@sportsmanager/shared";
import { useCallback, type CSSProperties, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { useLocale, useT } from "@/lib/intl";
import { Icon, StatusChip } from "@/ui";

/**
 * Piezas de la planificación del box (ADR 0053): el color de cada capacidad, el papel de un día,
 * el reparto de los 100 puntos, el mapa del ciclo y las comprobaciones del validador. Las usan el
 * coach (plan, semana, revisión, salud) y el atleta (su ciclo).
 */

/** Un color por capacidad: el mismo en el mapa, en la semana, en el WOD y en el ciclo del atleta. */
export const CAPACITY_COLOR: Record<Capacity, string> = {
  strength: "#2457D6",
  weightlifting: "#7B3FC6",
  gymnastics: "#0B7F70",
  engine: "#C46A12",
  intensity: "#C2304A",
  mobility: "#8A8A7E",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Los nombres del vocabulario del plan en el idioma de quien mira. */
export function usePlanNames() {
  const { locale } = useLocale();
  const t = useT("fitness.planning.names");
  const intl = useIntl();
  return {
    locale,
    role: useCallback((r: DayRole) => DAY_ROLE_NAMES[r][locale], [locale]),
    block: useCallback((k: PlanBlockKind) => PLAN_BLOCK_NAMES[k][locale], [locale]),
    blockOf: useCallback(
      (structure: PlanStructure, index: number) => blockLabel(structure, index, locale),
      [locale],
    ),
    capacity: useCallback((c: Capacity) => capitalize(CAPACITY_NAMES[c][locale]), [locale]),
    test: useCallback((code: string) => planTestByCode(code)?.name[locale] ?? code, [locale]),
    domain: useCallback((d: string) => t(`domain.${d}`), [t]),
    /** "L", "M"… o "Mon", "Tue"… de un día de la semana (1 = lunes). */
    weekdayShort: useCallback(
      (weekday: number) =>
        intl
          .formatDate(new Date(Date.UTC(2024, 0, weekday)), { weekday: "short", timeZone: "UTC" })
          .replace(".", ""),
      [intl],
    ),
    /** "lunes", "Monday"…: el nombre entero de un día de la semana (1 = lunes). */
    weekday: useCallback(
      (weekday: number) =>
        intl.formatDate(new Date(Date.UTC(2024, 0, weekday)), {
          weekday: "long",
          timeZone: "UTC",
        }),
      [intl],
    ),
    /** "3 nov.": un día de calendario corto. */
    shortDate: useCallback(
      (date: string) =>
        intl.formatDate(new Date(`${date}T12:00:00Z`), {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }),
      [intl],
    ),
  };
}

export function CapacityDot({ capacity, size = 10 }: { capacity: Capacity; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: CAPACITY_COLOR[capacity] }}
    />
  );
}

/** El papel de un día con el color de su capacidad principal. */
export function RoleChip({ role, compact = false }: { role: DayRole; compact?: boolean }) {
  const names = usePlanNames();
  const info = DAY_ROLE_INFO[role];
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-line bg-surface px-2 py-0.5 text-label font-medium text-ink"
      title={names.role(role)}
    >
      <CapacityDot capacity={info.capacity} size={8} />
      <span className={compact ? "truncate" : ""}>{names.role(role)}</span>
    </span>
  );
}

/** Esfuerzo de 1 a 5 en cinco rayas. */
export function EffortMeter({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`h-3 w-1.5 rounded-full ${n <= value ? "bg-ink" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

/** El reparto de los 100 puntos en una barra apilada, con su leyenda. */
export function EmphasisBar({
  emphasis,
  legend = true,
  height = 12,
}: {
  emphasis: Emphasis;
  legend?: boolean;
  height?: number;
}) {
  const names = usePlanNames();
  const total = CAPACITIES.reduce((s, c) => s + emphasis[c], 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex w-full overflow-hidden rounded-full bg-line"
        style={{ height }}
        role="img"
        aria-label={CAPACITIES.map((c) => `${names.capacity(c)} ${emphasis[c]}`).join(", ")}
      >
        {CAPACITIES.filter((c) => emphasis[c] > 0).map((c) => (
          <span
            key={c}
            style={{ width: `${(emphasis[c] / total) * 100}%`, background: CAPACITY_COLOR[c] }}
          />
        ))}
      </div>
      {legend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
          {CAPACITIES.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <CapacityDot capacity={c} size={8} />
              <span>{names.capacity(c)}</span>
              <span className="font-mono text-ink">{emphasis[c]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Lo previsto frente a lo real, por capacidad: dos barras finas por fila. */
export function CompareBars({
  rows,
  planLabel,
  realLabel,
  unit = "%",
}: {
  rows: { key: string; label: ReactNode; color: string; plan: number; real: number }[];
  planLabel: string;
  realLabel: string;
  unit?: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.plan, r.real]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 text-label text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-line" aria-hidden="true" />
          {planLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-ink" aria-hidden="true" />
          {realLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[8rem_minmax(0,1fr)_5.5rem] items-center gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-secondary text-ink">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: r.color }}
              />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="flex flex-col gap-1">
              <span
                className="h-2 rounded-full bg-line"
                style={{ width: `${(r.plan / max) * 100}%` }}
              />
              <span
                className="h-2 rounded-full"
                style={{ width: `${(r.real / max) * 100}%`, background: r.color }}
              />
            </span>
            <span className="text-right font-mono text-secondary text-ink">
              {r.plan}
              <span className="text-muted">{` → ${r.real}${unit}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * El mapa del ciclo: los bloques en una franja y, debajo, cada semana con su volumen, su
 * intensidad y el papel de sus días. La semana en curso se marca; cada semana se puede abrir.
 */
export function CycleMap({
  structure,
  startsOn,
  current,
  onWeek,
  compact = false,
}: {
  structure: PlanStructure;
  startsOn: string;
  current: number | null;
  onWeek?: (n: number) => void;
  compact?: boolean;
}) {
  const names = usePlanNames();
  const t = useT("fitness.planning.map");
  const total = structure.weeks.length;
  const colWidth = compact ? "minmax(1.25rem,1fr)" : "minmax(3.25rem,1fr)";
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${total}, ${colWidth})` };
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="flex min-w-fit flex-col gap-2"
        style={{ minWidth: compact ? undefined : `${total * 3.25}rem` }}
      >
        <div className="grid gap-1" style={grid}>
          {structure.blocks.map((b, i) => (
            <div
              key={i}
              className={`flex min-w-0 flex-col rounded-control px-2 py-1.5 ${
                b.kind === "deload" || b.kind === "test"
                  ? "bg-raised text-ink"
                  : "bg-ink text-surface"
              }`}
              style={{ gridColumn: `${b.startWeek} / span ${b.weeks}` }}
              title={b.focus ?? names.blockOf(structure, i)}
            >
              <span className="truncate text-label font-semibold uppercase tracking-wide">
                {names.blockOf(structure, i)}
              </span>
              {!compact && b.focus ? (
                <span className="truncate text-label opacity-80">{b.focus}</span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="grid gap-1" style={grid}>
          {structure.weeks.map((w) => {
            const isCurrent = w.n === current;
            const content = (
              <>
                <span className="flex items-center justify-between gap-1">
                  <span className="font-mono text-label text-ink">{w.n}</span>
                  {!compact && w.tags.includes("test") ? (
                    <Icon.Target size={12} aria-hidden="true" className="text-muted" />
                  ) : null}
                  {!compact && w.tags.includes("retest") ? (
                    <Icon.FlagCheckered size={12} aria-hidden="true" className="text-muted" />
                  ) : null}
                </span>
                {compact ? null : (
                  <span className="flex h-10 items-end gap-0.5" aria-hidden="true">
                    <span
                      className="w-1/2 rounded-sm bg-ink/25"
                      style={{ height: `${Math.max(8, w.volume)}%` }}
                    />
                    <span
                      className="w-1/2 rounded-sm bg-ink"
                      style={{ height: `${Math.max(8, w.intensity)}%` }}
                    />
                  </span>
                )}
                <span className="flex gap-0.5" aria-hidden="true">
                  {w.roles.map((r, i) => (
                    <span
                      key={i}
                      className="h-1.5 flex-1 rounded-full"
                      style={{
                        background: r
                          ? CAPACITY_COLOR[DAY_ROLE_INFO[r].capacity]
                          : "var(--color-line)",
                      }}
                    />
                  ))}
                </span>
              </>
            );
            const className = `flex min-w-0 flex-col gap-1 rounded-control border p-1.5 text-left ${
              isCurrent ? "border-club bg-club-soft" : "border-line bg-surface"
            }`;
            const label = t("week", {
              n: w.n,
              date: names.shortDate(addDays(startsOn, (w.n - 1) * 7)),
              block: names.blockOf(structure, w.block),
            });
            return onWeek ? (
              <button
                key={w.n}
                type="button"
                className={`${className} transition-colors hover:border-ink`}
                onClick={() => onWeek(w.n)}
                aria-label={label}
                aria-current={isCurrent ? "true" : undefined}
              >
                {content}
              </button>
            ) : (
              <div key={w.n} className={className} aria-label={label} role="img">
                {content}
              </div>
            );
          })}
        </div>
        {compact ? null : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-label text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2 rounded-sm bg-ink/25" aria-hidden="true" />
              {t("volume")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2 rounded-sm bg-ink" aria-hidden="true" />
              {t("intensity")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Target size={12} aria-hidden="true" />
              {t("test")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon.FlagCheckered size={12} aria-hidden="true" />
              {t("retest")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Los siete días de una semana del plan con su papel (o sin clase). */
export function WeekRoles({
  roles,
  closed = [],
  today,
  monday,
}: {
  roles: readonly (DayRole | null)[];
  closed?: readonly number[];
  today?: string | undefined;
  monday?: string | undefined;
}) {
  const names = usePlanNames();
  const t = useT("fitness.planning.map");
  return (
    <ol className="grid grid-cols-7 gap-1">
      {roles.map((r, i) => {
        const isToday = monday && today ? addDays(monday, i) === today : false;
        return (
          <li
            key={i}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-control px-1 py-2 ${
              isToday ? "bg-club-soft" : "bg-raised"
            }`}
            title={r ? names.role(r) : closed.includes(i + 1) ? t("closed") : t("noClass")}
          >
            <span className="text-label font-semibold text-muted">{names.weekdayShort(i + 1)}</span>
            {r ? (
              <span
                className="size-3 rounded-full"
                style={{ background: CAPACITY_COLOR[DAY_ROLE_INFO[r].capacity] }}
                aria-label={names.role(r)}
              />
            ) : (
              <span className="size-3 rounded-full border border-line" aria-label={t("noClass")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** El texto de una comprobación del validador. */
export function useValidationText() {
  const t = useT("fitness.planning.validation");
  const names = usePlanNames();
  const equipmentT = useT("fitness.exercises.equipment");
  return useCallback(
    (r: ValidationResult) => {
      const p = r.params;
      const kinds = (list: string | number | undefined) =>
        String(list ?? "")
          .split(",")
          .filter(Boolean)
          .map((k) => equipmentT(k))
          .join(", ");
      switch (r.check) {
        case "equipment":
          if (p.reason === "no_inventory") return t("equipmentNoInventory");
          return r.status === "ok"
            ? t("equipmentOk")
            : t("equipmentMissing", { kinds: kinds(p.kinds) });
        case "logistics":
          if (r.status === "fail")
            return t("logisticsShort", {
              block: String(p.block),
              kind: p.kind === "machines" ? t("machines") : equipmentT(String(p.kind)),
              available: Number(p.available),
              needed: Number(p.needed),
            });
          if (r.status === "warn")
            return t("logisticsWaves", {
              block: String(p.block),
              kind: p.kind === "machines" ? t("machines") : equipmentT(String(p.kind)),
              waves: Number(p.waves),
            });
          return t("logisticsOk");
        case "time":
          if (p.reason === "unknown") return t("timeUnknown");
          return r.status === "fail"
            ? t("timeOver", { minutes: Number(p.minutes), classMinutes: Number(p.classMinutes) })
            : r.status === "warn"
              ? t("timePartial", {
                  minutes: Number(p.minutes),
                  classMinutes: Number(p.classMinutes),
                })
              : t("timeOk", { minutes: Number(p.minutes), classMinutes: Number(p.classMinutes) });
        case "exercises":
          return r.status === "ok"
            ? t("exercisesOk")
            : t("exercisesMissing", { blocks: String(p.blocks) });
        case "pattern":
          return r.status === "ok"
            ? t("patternOk")
            : t("patternRepeated", {
                patterns: String(p.patterns)
                  .split(",")
                  .map((x) => t(`patterns.${x}`))
                  .join(", "),
              });
        case "levels":
          return r.status === "ok"
            ? t("levelsOk")
            : t("levelsMissing", { blocks: String(p.blocks) });
        case "progression":
          return r.status === "ok"
            ? t("progressionOk")
            : t("progressionOff", { movement: String(p.movement), percent: Number(p.percent) });
      }
      return names.locale;
    },
    [t, names.locale, equipmentT],
  );
}

/** Las comprobaciones del validador de un día: verde, ámbar o rojo, con su porqué. */
export function ValidationList({
  results,
  onlyIssues = false,
}: {
  results: readonly ValidationResult[];
  onlyIssues?: boolean;
}) {
  const text = useValidationText();
  const shown = onlyIssues ? results.filter((r) => r.status !== "ok") : results;
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((r) => (
        <li key={r.check} className="flex items-start gap-2 text-secondary">
          {r.status === "ok" ? (
            <Icon.CheckCircle
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-success"
            />
          ) : r.status === "warn" ? (
            <Icon.Warning size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          ) : (
            <Icon.Warning size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
          )}
          <span className={r.status === "ok" ? "text-muted" : "text-ink"}>{text(r)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Resumen del validador en un chip: todo bien, avisos o fallos. */
export function ValidationChip({ results }: { results: readonly ValidationResult[] }) {
  const t = useT("fitness.planning.validation");
  if (results.length === 0) return null;
  const fails = results.filter((r) => r.status === "fail").length;
  const warns = results.filter((r) => r.status === "warn").length;
  if (fails > 0) return <StatusChip kind="danger">{t("chipFail", { count: fails })}</StatusChip>;
  if (warns > 0) return <StatusChip kind="warning">{t("chipWarn", { count: warns })}</StatusChip>;
  return <StatusChip kind="success">{t("chipOk")}</StatusChip>;
}

/** Una cifra con su etiqueta y, si hace falta, una nota debajo. */
export function Kpi({
  value,
  label,
  note,
}: {
  value: ReactNode;
  label: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
      <span className="font-mono text-title2 text-ink">{value}</span>
      <span className="text-secondary text-muted">{label}</span>
      {note ? <span className="text-label text-muted">{note}</span> : null}
    </div>
  );
}
