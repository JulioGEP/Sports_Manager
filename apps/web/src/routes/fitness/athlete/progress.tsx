import {
  BENCHMARKS,
  benchmarkByCode,
  FitnessPreferencesSchema,
  MOVEMENTS,
  percentLoad,
  REP_MAXES,
  scoreIsComplete,
  WORKOUT_LEVELS,
  type BenchmarkEntry,
  type FitnessPreferences,
  type MovementProgress,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link } from "react-router";
import {
  EMPTY_SCORE,
  ScoreFields,
  scoreOf,
  type ScoreDraft,
} from "@/components/fitness/athlete-ui";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useClassTime, useInvalidateFitness, useKg, useProgress } from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import { useMyCycle } from "@/lib/planning";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Stat,
  StatusChip,
  useToast,
} from "@/ui";

const PERCENTS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Las celdas del mes empezando en lunes: huecos (nulo) y días `AAAA-MM-DD`. */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
}

/**
 * El progreso del atleta (ADR 0049): el mes entrenado, su racha, sus máximas con la tabla de
 * porcentajes, sus benchmarks, sus medidas (privadas) y en qué ha trabajado. Abajo, su privacidad:
 * salir o no en la lista de la clase y en la clasificación, y compartir medidas con su coach.
 */
export function ProgressPage() {
  const t = useT("fitness.athlete.progress");
  const errors = useT("errors");
  const kinds = useT("fitness.common.blockKinds");
  const intl = useIntl();
  const time = useClassTime();
  const currentMonth = time.today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const progress = useProgress(month === currentMonth ? undefined : month);
  const [sheet, setSheet] = useState<"record" | "benchmark" | "body" | null>(null);

  if (progress.isPending) {
    return <div className="h-64 animate-pulse rounded-card bg-raised" aria-busy="true" />;
  }
  if (progress.isError) return <Alert kind="error">{errors(errorKey(progress.error))}</Alert>;
  const data = progress.data;
  const byDay = new Map(data.days.map((d) => [d.date, d]));
  const mixMax = Math.max(1, ...data.workMix.map((m) => m.count));
  const monthLabel = intl.formatDate(new Date(`${month}-01T12:00:00Z`), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    intl.formatDate(new Date(Date.UTC(2024, 0, 1 + i, 12)), { weekday: "narrow", timeZone: "UTC" }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <CycleTeaser />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Icon.Lightning weight="duotone" aria-hidden="true" />}
          value={data.streak.current}
          label={t("streak", { count: data.streak.current, best: data.streak.best })}
        />
        <Stat
          icon={<Icon.CalendarBlank weight="duotone" aria-hidden="true" />}
          value={data.classesThisMonth}
          label={t("thisMonth", { count: data.classesThisMonth })}
        />
        <Stat
          icon={<Icon.Medal weight="duotone" aria-hidden="true" />}
          value={data.totalClasses}
          label={t("total", { count: data.totalClasses })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title={<span className="first-letter:uppercase">{monthLabel}</span>}
          actions={
            <div className="flex gap-1">
              <IconButton
                label={t("prevMonth")}
                className="text-muted"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <Icon.ArrowLeft size={18} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={t("nextMonth")}
                className="text-muted disabled:opacity-40"
                disabled={month >= currentMonth}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <Icon.ArrowRight size={18} aria-hidden="true" />
              </IconButton>
            </div>
          }
        >
          <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1 text-center">
            {weekdays.map((w, i) => (
              <span key={i} className="text-label uppercase text-muted">
                {w}
              </span>
            ))}
          </div>
          <ol className="grid grid-cols-7 gap-1 text-center" aria-label={monthLabel}>
            {monthCells(month).map((day, i) => {
              if (!day) return <li key={`gap-${i}`} aria-hidden="true" />;
              const mark = byDay.get(day);
              return (
                <li
                  key={day}
                  className={`grid aspect-square place-items-center rounded-full font-mono text-secondary ${
                    mark?.attended
                      ? "bg-club text-on-club"
                      : mark?.booked
                        ? "text-club-text ring-2 ring-club ring-inset"
                        : day === time.today
                          ? "bg-raised text-ink"
                          : "text-muted"
                  }`}
                >
                  <span aria-hidden="true">{Number(day.slice(8))}</span>
                  <span className="sr-only">
                    {mark?.attended
                      ? t("dayTrained", { day: time.day(day) })
                      : mark?.booked
                        ? t("dayBooked", { day: time.day(day) })
                        : time.day(day)}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap gap-4 text-secondary text-muted">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-full bg-club" />
              {t("legendTrained")}
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 rounded-full ring-2 ring-club ring-inset"
              />
              {t("legendBooked")}
            </span>
          </div>
        </Card>

        <Card title={t("mix.title")} description={t("mix.description")}>
          {data.workMix.length === 0 ? (
            <p className="text-body text-muted">{t("mix.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.workMix.map((m) => (
                <li key={m.kind} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3">
                  <span className="truncate text-secondary text-ink">{kinds(m.kind)}</span>
                  <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-raised">
                    <span
                      className="block h-full rounded-full bg-club"
                      style={{ width: `${Math.round((m.count / mixMax) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-secondary text-ink">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Section
        title={t("records.title")}
        description={t("records.description")}
        action={
          <Button size="sm" action="add" onClick={() => setSheet("record")}>
            {t("records.add")}
          </Button>
        }
      >
        {data.movements.length === 0 ? (
          <EmptyState
            icon={<Icon.Barbell size={28} weight="duotone" aria-hidden="true" />}
            title={t("records.emptyTitle")}
            description={t("records.emptyHint")}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.movements.map((m) => (
              <MovementCard key={m.movementCode} movement={m} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t("benchmarks.title")}
        description={t("benchmarks.description")}
        action={
          <Button size="sm" action="add" onClick={() => setSheet("benchmark")}>
            {t("benchmarks.add")}
          </Button>
        }
      >
        <BenchmarkList results={data.benchmarks} />
      </Section>

      <Section
        title={t("body.title")}
        description={data.preferences.shareBodyWithCoach ? t("body.shared") : t("body.private")}
        action={
          <Button size="sm" action="add" onClick={() => setSheet("body")}>
            {t("body.add")}
          </Button>
        }
      >
        <BodyList body={data.body} />
      </Section>

      <PrivacyCard preferences={data.preferences} />

      {sheet === "record" ? <RecordSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "benchmark" ? <BenchmarkSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "body" ? <BodySheet onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-title2 text-ink">{title}</h2>
          {description ? <p className="text-secondary text-muted">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Borrar algo propio con confirmación y su aviso. */
function useRemove() {
  const errors = useT("errors");
  const t = useT("fitness.athlete.progress");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  return async (path: string) => {
    try {
      await apiFetch(path, { method: "DELETE" });
      toast("success", t("removed"));
      await invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  };
}

function MovementCard({ movement }: { movement: MovementProgress }) {
  const t = useT("fitness.athlete.progress.records");
  const c = useT("fitness.common");
  const kg = useKg();
  const { day } = useDates();
  const name = useMovementName();
  const remove = useRemove();
  const [confirm, setConfirm] = useState<string | null>(null);
  const oneRm = movement.oneRm;
  return (
    <Card
      title={name(movement.movementCode)}
      description={oneRm ? (oneRm.estimated ? t("estimated") : t("real")) : undefined}
      actions={
        oneRm ? (
          <span className="font-mono text-title2 text-ink">
            {oneRm.estimated ? "~" : ""}
            {kg(oneRm.kg)}
          </span>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {movement.best.map((r) => (
            <StatusChip key={r.id} kind="club">
              {`${r.reps}RM · ${kg(r.loadKg)}`}
            </StatusChip>
          ))}
        </div>
        {oneRm ? (
          <details className="group">
            <summary className="cursor-pointer text-secondary font-medium text-club-text">
              {t("percentTable")}
            </summary>
            <table className="mt-2 w-full text-secondary">
              <caption className="sr-only">{t("percentTable")}</caption>
              <tbody>
                {PERCENTS.map((p) => (
                  <tr key={p} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1 text-left font-normal text-muted">
                      {`${p} %`}
                    </th>
                    <td className="py-1 text-right font-mono text-ink">
                      {kg(percentLoad(oneRm.kg, p))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
        <details>
          <summary className="cursor-pointer text-secondary font-medium text-club-text">
            {t("history", { count: movement.history.length })}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {movement.history.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-3 py-1">
                <span className="flex flex-1 flex-col">
                  <span className="font-mono text-body text-ink">
                    {`${r.reps}RM · ${kg(r.loadKg)}`}
                  </span>
                  <span className="text-label text-muted">
                    {day(r.onDate)}
                    {r.source === "result" ? ` · ${t("fromWod")}` : ""}
                  </span>
                </span>
                <IconButton
                  label={t("remove")}
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setConfirm(r.id)}
                >
                  <Icon.Trash size={18} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={t("removeTitle")}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        tone="danger"
        onConfirm={() => {
          const id = confirm;
          setConfirm(null);
          if (id) void remove(`/api/org/me/records/${id}`);
        }}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

function BenchmarkList({
  results,
}: {
  results: {
    id: string;
    benchmarkCode: string;
    level: WorkoutLevel;
    display: string;
    onDate: string;
    isBest: boolean;
  }[];
}) {
  const t = useT("fitness.athlete.progress.benchmarks");
  const c = useT("fitness.common");
  const levels = useT("fitness.common.levels");
  const { day } = useDates();
  const { locale } = useLocale();
  const remove = useRemove();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (results.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Trophy size={28} weight="duotone" aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyHint")}
      />
    );
  }
  const codes = [...new Set(results.map((r) => r.benchmarkCode))];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {codes.map((code) => {
        const entry = benchmarkByCode(code);
        const rows = results.filter((r) => r.benchmarkCode === code);
        return (
          <Card key={code} title={entry?.name ?? code} description={entry?.description[locale]}>
            <ul className="flex flex-col divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex min-h-11 items-center gap-3 py-1">
                  <span className="flex flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-body text-ink">{r.display}</span>
                      <StatusChip kind="neutral">{levels(r.level)}</StatusChip>
                      {r.isBest ? <StatusChip kind="success">{t("best")}</StatusChip> : null}
                    </span>
                    <span className="text-label text-muted">{day(r.onDate)}</span>
                  </span>
                  <IconButton
                    label={t("remove")}
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirm(r.id)}
                  >
                    <Icon.Trash size={18} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <ConfirmDialog
        open={confirm !== null}
        title={t("removeTitle")}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        tone="danger"
        onConfirm={() => {
          const id = confirm;
          setConfirm(null);
          if (id) void remove(`/api/org/me/benchmarks/${id}`);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

const BODY_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "hipCm",
  "chestCm",
  "armCm",
  "thighCm",
] as const;
type BodyField = (typeof BODY_FIELDS)[number];

function BodyList({
  body,
}: {
  body: ({ id: string; onDate: string; note: string | null } & Record<BodyField, number | null>)[];
}) {
  const t = useT("fitness.athlete.progress.body");
  const c = useT("fitness.common");
  const { day } = useDates();
  const intl = useIntl();
  const remove = useRemove();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (body.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Pulse size={28} weight="duotone" aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyHint")}
      />
    );
  }
  const rows = [...body].sort((a, b) => b.onDate.localeCompare(a.onDate));
  const used = BODY_FIELDS.filter((f) => rows.some((r) => r[f] !== null));
  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-secondary">
          <thead>
            <tr className="border-b border-line text-left text-label uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-2 font-medium">
                {t("date")}
              </th>
              {used.map((f) => (
                <th key={f} scope="col" className="px-3 py-2 text-right font-medium">
                  {t(`fields.${f}`)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <th scope="row" className="px-5 py-2 text-left font-normal text-ink">
                  {day(r.onDate)}
                </th>
                {used.map((f) => (
                  <td key={f} className="px-3 py-2 text-right font-mono text-ink">
                    {r[f] === null ? "—" : intl.formatNumber(r[f], { maximumFractionDigits: 1 })}
                  </td>
                ))}
                <td className="px-3 py-1 text-right">
                  <IconButton
                    label={t("remove")}
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirm(r.id)}
                  >
                    <Icon.Trash size={18} aria-hidden="true" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={t("removeTitle")}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        tone="danger"
        onConfirm={() => {
          const id = confirm;
          setConfirm(null);
          if (id) void remove(`/api/org/me/body/${id}`);
        }}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

function PrivacyCard({ preferences }: { preferences: FitnessPreferences }) {
  const t = useT("fitness.athlete.progress.privacy");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [busy, setBusy] = useState<keyof FitnessPreferences | null>(null);
  async function toggle(key: keyof FitnessPreferences) {
    setBusy(key);
    try {
      await apiFetch("/api/org/me/fitness-preferences", {
        method: "PUT",
        body: { [key]: !preferences[key] },
        schema: FitnessPreferencesSchema,
      });
      toast("success", t("saved"));
      await invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }
  const rows: { key: keyof FitnessPreferences; on: boolean }[] = [
    { key: "hideFromAttendees", on: !preferences.hideFromAttendees },
    { key: "hideFromLeaderboards", on: !preferences.hideFromLeaderboards },
    { key: "shareBodyWithCoach", on: preferences.shareBodyWithCoach },
  ];
  return (
    <Card title={t("title")} description={t("description")}>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex min-h-16 items-center gap-4 py-3">
            <span className="flex flex-1 flex-col" id={`privacy-${r.key}`}>
              <span className="font-medium text-ink">{t(`${r.key}.label`)}</span>
              <span className="text-secondary text-muted">{t(`${r.key}.hint`)}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={r.on}
              aria-labelledby={`privacy-${r.key}`}
              disabled={busy !== null}
              onClick={() => void toggle(r.key)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                r.on ? "bg-club" : "bg-raised"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 size-6 rounded-full bg-surface shadow-card transition-[left] ${
                  r.on ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Formulario corto en panel, con su guardar. */
function FormSheet({
  title,
  description,
  formId,
  busy,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  formId: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  const c = useT("fitness.common");
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form={formId} loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit}>
        {children}
      </form>
    </Sheet>
  );
}

/** Enviar un alta del atleta con su aviso; cierra al guardar. */
function useCreate(onClose: () => void) {
  const t = useT("fitness.athlete.progress");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [busy, setBusy] = useState(false);
  async function send(path: string, body: unknown, message = t("saved")) {
    setBusy(true);
    try {
      await apiFetch(path, { method: "POST", body });
      toast("success", message);
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }
  return { busy, send };
}

function RecordSheet({ onClose }: { onClose: () => void }) {
  const t = useT("fitness.athlete.progress.recordSheet");
  const time = useClassTime();
  const name = useMovementName();
  const { busy, send } = useCreate(onClose);
  const [movement, setMovement] = useState(MOVEMENTS[0]!.code);
  const [reps, setReps] = useState<number>(1);
  const [load, setLoad] = useState("");
  const [onDate, setOnDate] = useState(time.today);
  const [error, setError] = useState(false);
  return (
    <FormSheet
      title={t("title")}
      description={t("description")}
      formId="record-form"
      busy={busy}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const kg = Number.parseFloat(load.replace(",", "."));
        if (!Number.isFinite(kg) || kg < 0.5) {
          setError(true);
          return;
        }
        void send("/api/org/me/records", { movementCode: movement, reps, loadKg: kg, onDate });
      }}
    >
      <Field label={t("movement")}>
        {(id) => (
          <Select id={id} value={movement} onChange={(e) => setMovement(e.target.value)}>
            {MOVEMENTS.map((m) => (
              <option key={m.code} value={m.code}>
                {name(m.code)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-secondary font-medium text-ink">{t("reps")}</span>
        <Segmented
          label={t("reps")}
          value={String(reps)}
          onChange={(v) => setReps(Number(v))}
          options={REP_MAXES.map((r) => ({ key: String(r), label: `${r}RM` }))}
        />
      </div>
      <Field label={t("load")} error={error ? t("loadError") : undefined}>
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error || undefined}
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={load}
            onChange={(e) => {
              setLoad(e.target.value);
              setError(false);
            }}
          />
        )}
      </Field>
      <Field label={t("date")}>
        {(id) => (
          <Input
            id={id}
            type="date"
            max={time.today}
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const FAMILIES: BenchmarkEntry["family"][] = ["girls", "heroes", "hybrid", "open"];

function BenchmarkSheet({ onClose }: { onClose: () => void }) {
  const t = useT("fitness.athlete.progress.benchmarkSheet");
  const families = useT("fitness.athlete.progress.families");
  const levels = useT("fitness.common.levels");
  const { locale } = useLocale();
  const time = useClassTime();
  const { busy, send } = useCreate(onClose);
  const [code, setCode] = useState(BENCHMARKS[0]!.code);
  const [level, setLevel] = useState<WorkoutLevel>("rx");
  const [score, setScore] = useState<ScoreDraft>(EMPTY_SCORE);
  const [onDate, setOnDate] = useState(time.today);
  const [error, setError] = useState(false);
  const entry = benchmarkByCode(code) ?? BENCHMARKS[0]!;
  return (
    <FormSheet
      title={t("title")}
      formId="benchmark-form"
      busy={busy}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const value = scoreOf(entry.scoreType, score);
        const completed = entry.scoreType === "time" ? score.completed : true;
        if (!scoreIsComplete(entry.scoreType, value, completed)) {
          setError(true);
          return;
        }
        void send("/api/org/me/benchmarks", {
          benchmarkCode: code,
          level,
          score: value,
          completed,
          onDate,
        });
      }}
    >
      <Field label={t("benchmark")} hint={entry.description[locale]}>
        {(id, describedBy) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setScore(EMPTY_SCORE);
              setError(false);
            }}
          >
            {FAMILIES.map((f) => (
              <optgroup key={f} label={families(f)}>
                {BENCHMARKS.filter((b) => b.family === f).map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-secondary font-medium text-ink">{t("level")}</span>
        <Segmented
          label={t("level")}
          value={level}
          onChange={setLevel}
          options={WORKOUT_LEVELS.map((l) => ({ key: l, label: levels(l) }))}
        />
      </div>
      <ScoreFields
        type={entry.scoreType}
        value={score}
        onChange={(next) => {
          setScore(next);
          setError(false);
        }}
        timeCap
      />
      {error ? (
        <p role="alert" className="text-secondary text-danger">
          {t("missingScore")}
        </p>
      ) : null}
      <Field label={t("date")}>
        {(id) => (
          <Input
            id={id}
            type="date"
            max={time.today}
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}

function BodySheet({ onClose }: { onClose: () => void }) {
  const t = useT("fitness.athlete.progress.body");
  const time = useClassTime();
  const { busy, send } = useCreate(onClose);
  const [values, setValues] = useState<Record<BodyField, string>>({
    weightKg: "",
    bodyFatPct: "",
    waistCm: "",
    hipCm: "",
    chestCm: "",
    armCm: "",
    thighCm: "",
  });
  const [onDate, setOnDate] = useState(time.today);
  const [error, setError] = useState(false);
  return (
    <FormSheet
      title={t("sheetTitle")}
      description={t("sheetDescription")}
      formId="body-form"
      busy={busy}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = Object.fromEntries(
          BODY_FIELDS.map((f) => {
            const n = Number.parseFloat(values[f].replace(",", "."));
            return [f, Number.isFinite(n) ? n : null];
          }),
        ) as Record<BodyField, number | null>;
        if (BODY_FIELDS.every((f) => parsed[f] === null)) {
          setError(true);
          return;
        }
        void send("/api/org/me/body", { onDate, ...parsed });
      }}
    >
      <Field label={t("date")}>
        {(id) => (
          <Input
            id={id}
            type="date"
            max={time.today}
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {BODY_FIELDS.map((f) => (
          <Field key={f} label={t(`fields.${f}`)}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={values[f]}
                onChange={(e) => {
                  setValues({ ...values, [f]: e.target.value });
                  setError(false);
                }}
              />
            )}
          </Field>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-secondary text-danger">
          {t("missing")}
        </p>
      ) : null}
    </FormSheet>
  );
}

/** La entrada a "Tu ciclo" (ADR 0052): el plan del box en una línea y el enlace. */
function CycleTeaser() {
  const t = useT("fitness.planning.cycle");
  const cycle = useMyCycle();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plan = cycle.data?.plan;
  if (!plan) return null;
  return (
    <Link
      to={paths.cycle}
      className="flex items-center gap-4 rounded-card bg-ink p-4 text-surface no-underline shadow-card"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface/15">
        <Icon.Target size={22} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label uppercase tracking-wide opacity-70">{t("title")}</span>
        <span className="truncate font-semibold">{plan.name}</span>
        <span className="truncate text-secondary opacity-80">
          {plan.week
            ? t("position", { n: plan.week, weeks: plan.weeks, block: plan.blockLabel ?? "" })
            : plan.finished
              ? t("finished")
              : plan.name}
        </span>
      </span>
      <Icon.CaretRight size={20} aria-hidden="true" className="opacity-70" />
    </Link>
  );
}
