import { addDays, WorkoutResponseSchema, type WorkoutView } from "@sportsmanager/shared";
import { useEffect, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link, useNavigate } from "react-router";
import { detailOf, QUIET_KINDS } from "@/components/fitness/programming-model";
import { useStaffError } from "@/components/fitness/staff-ui";
import { RoleChip } from "@/components/fitness/planning-ui";
import { blockInputOf, copyOf, planFieldsOf } from "@/components/fitness/staff-workout";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness, useWorkouts } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Icon,
  Input,
  Menu,
  MenuDivider,
  MenuItem,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/** El cuerpo que pide la API para volver a guardar un WOD con algún cambio (día o estado). */
export function upsertBodyOf(
  w: WorkoutView,
  patch: Partial<{ onDate: string; status: "draft" | "published"; publishAt: string | null }>,
) {
  return {
    sectionId: w.section.id,
    teamId: w.team?.id ?? null,
    onDate: w.onDate,
    title: w.title,
    notes: w.notes,
    status: w.status,
    publishAt: w.publishAt,
    blocks: w.blocks.map(blockInputOf),
    ...planFieldsOf(w),
    ...patch,
  };
}

/**
 * Cómo se llama un WOD en la semana: su título del día o, si no tiene, sus bloques con nombre
 * propio ("Back squat + Fran"), sin calentamiento ni vuelta a la calma.
 */
export function useWorkoutName() {
  const t = useT("fitness.staff.programming");
  const kinds = useT("fitness.common.blockKinds");
  return (w: Pick<WorkoutView, "title" | "blocks">) => {
    if (w.title) return w.title;
    const named = w.blocks
      .filter((b) => !QUIET_KINDS.includes(b.kind) && b.title !== kinds(b.kind))
      .map((b) => b.title);
    return named.length > 0 ? named.slice(0, 3).join(" + ") : t("untitled");
  };
}

/** Cómo está un WOD para los atletas, en palabras y en color. */
export function useWorkoutState() {
  const t = useT("fitness.staff.programming.state");
  const time = useClassTime();
  return (w: Pick<WorkoutView, "status" | "visible" | "publishAt">) =>
    w.status === "draft"
      ? { kind: "neutral" as const, label: t("draft") }
      : !w.visible && w.publishAt
        ? { kind: "info" as const, label: t("scheduled", { when: time.when(w.publishAt) }) }
        : { kind: "success" as const, label: t("published") };
}

/** Día corto en dos piezas para la columna de la semana: "LUN" y "26". */
export function useDayParts() {
  const intl = useIntl();
  return (date: string) => {
    const at = new Date(`${date}T12:00:00Z`);
    return {
      weekday: intl
        .formatDate(at, { weekday: "short", timeZone: "UTC" })
        .replace(/[.,]/g, "")
        .toUpperCase(),
      day: intl.formatDate(at, { day: "numeric", timeZone: "UTC" }),
    };
  };
}

/**
 * Un WOD en la semana (ADR 0050): se abre tocándolo; los bloques en líneas legibles enteras
 * ("A · Fuerza · Back squat 5x5 · al 75 % de back squat"), su estado y sus resultados. Lo demás
 * (duplicar, mover, publicar) va en el menú.
 */
export function WorkoutCard({
  workout,
  showSection,
  editable,
  onDuplicate,
  onMove,
  onPublish,
  footer,
}: {
  workout: WorkoutView;
  showSection: boolean;
  editable: boolean;
  onDuplicate: () => void;
  onMove: () => void;
  onPublish: () => void;
  /** Debajo de los bloques: las clases en que se hace (ADR 0055). */
  footer?: ReactNode;
}) {
  const t = useT("fitness.staff.programming");
  const line = useT("fitness.staff.programming.line");
  const kinds = useT("fitness.common.blockKinds");
  const movementName = useMovementName();
  const state = useWorkoutState()(workout);
  const name = useWorkoutName()(workout);
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const results = workout.blocks.reduce((sum, b) => sum + b.results, 0);
  const context = [showSection ? workout.section.name : null, workout.team?.name]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="relative flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card transition-colors hover:bg-page precisa:border precisa:border-border">
      {/* El estado va a la derecha del título y, si no cabe (móvil), debajo. */}
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            {context ? (
              <span className="text-label uppercase tracking-wide text-muted">{context}</span>
            ) : null}
            <h3 className="text-body font-semibold text-ink">
              <Link
                to={paths.workoutEdit(workout.id)}
                className="text-inherit no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
              >
                {name}
              </Link>
            </h3>
          </div>
          <span className="relative z-10 flex flex-wrap items-center gap-2">
            {workout.dayRole ? <RoleChip role={workout.dayRole} /> : null}
            <StatusChip kind={state.kind}>{state.label}</StatusChip>
          </span>
        </div>
        <span className="relative z-10 shrink-0">
          {editable ? (
            <Menu
              label={t("actions", { title: name })}
              trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
              triggerClassName="text-muted hover:bg-raised hover:text-ink"
            >
              <MenuItem
                to={paths.workoutEdit(workout.id)}
                icon={<Icon.Gear size={20} aria-hidden="true" />}
              >
                {t("edit")}
              </MenuItem>
              <MenuItem icon={<Icon.Copy size={20} aria-hidden="true" />} onClick={onDuplicate}>
                {t("duplicate")}
              </MenuItem>
              <MenuItem
                icon={<Icon.ArrowsLeftRight size={20} aria-hidden="true" />}
                onClick={onMove}
              >
                {t("move")}
              </MenuItem>
              {workout.status === "draft" || !workout.visible ? (
                <>
                  <MenuDivider />
                  <MenuItem icon={<Icon.Play size={20} aria-hidden="true" />} onClick={onPublish}>
                    {t("publishNow")}
                  </MenuItem>
                </>
              ) : null}
            </Menu>
          ) : null}
        </span>
      </header>
      <ol className="flex flex-col gap-1.5">
        {workout.blocks.map((b) => {
          const detail = detailOf(
            { ...b, movementCode: b.movement?.code ?? null },
            line,
            movementName,
          );
          return (
            <li key={b.id} className="flex gap-2.5 text-secondary">
              <span className="w-4 shrink-0 font-mono font-semibold text-ink">{b.label}</span>
              <span className="min-w-0">
                {/* Un bloque sin nombre propio se llama como su tipo: no se repite. */}
                {b.title === kinds(b.kind) ? null : (
                  <span className="text-muted">{kinds(b.kind)} · </span>
                )}
                <span className="font-medium text-ink">{b.title}</span>
                {detail ? <span className="text-muted"> · {detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {results > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-label text-muted">
          <Icon.Trophy size={14} aria-hidden="true" />
          {t("results", { count: results })}
        </span>
      ) : null}
      {footer}
    </article>
  );
}

/**
 * Un día con clase y sin WOD de una disciplina: un hueco que pide programarlo, con las formas
 * rápidas de hacerlo (en blanco, un benchmark, la IA o copiando otro día).
 */
export function EmptyDay({
  date,
  section,
  classes,
  booked,
  showSection,
  onCopyFrom,
}: {
  date: string;
  section: { id: string; name: string };
  classes: number;
  /** Reservas de esas clases: la gente que espera el WOD (ADR 0055). */
  booked: number;
  showSection: boolean;
  onCopyFrom: () => void;
}) {
  const t = useT("fitness.staff.programming");
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const base = `${paths.workoutNew}?date=${date}&section=${section.id}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border-2 border-dashed border-line p-4">
      <span className="flex min-w-48 flex-1 flex-col">
        <span className="font-medium text-ink">
          {showSection ? t("missingSection", { section: section.name }) : t("missing")}
        </span>
        <span className="text-secondary text-muted">
          {t("classesThatDay", { count: classes, booked })}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <ButtonLink
          to={base}
          variant="secondary"
          size="sm"
          action="add"
          aria-label={t("programDay", { section: section.name, day: time.day(date) })}
        >
          {t("program")}
        </ButtonLink>
        <Menu
          label={t("moreWays", { day: time.day(date) })}
          trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
          triggerClassName="text-muted hover:bg-raised hover:text-ink"
        >
          <MenuItem to={`${base}&benchmark=1`} icon={<Icon.Medal size={20} aria-hidden="true" />}>
            {t("fromBenchmark")}
          </MenuItem>
          <MenuItem to={`${base}&ai=1`} icon={<Icon.Lightbulb size={20} aria-hidden="true" />}>
            {t("withAi")}
          </MenuItem>
          <MenuItem icon={<Icon.Copy size={20} aria-hidden="true" />} onClick={onCopyFrom}>
            {t("copyFrom")}
          </MenuItem>
        </Menu>
      </span>
    </div>
  );
}

/** Elegir un día de dos semanas (o cualquier otro) para mover o duplicar un WOD. */
function DayChooser({
  start,
  value,
  onChange,
  taken,
}: {
  start: string;
  value: string;
  onChange: (date: string) => void;
  taken: Set<string>;
}) {
  const t = useT("fitness.staff.programming.dayChooser");
  const parts = useDayParts();
  const time = useClassTime();
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const p = parts(d);
          const busy = taken.has(d);
          const selected = d === value;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${time.day(d)}${busy ? `, ${t("busy")}` : ""}`}
              disabled={busy}
              onClick={() => onChange(d)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-field text-label transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? "bg-club text-on-club"
                  : d === time.today
                    ? "border border-club bg-surface text-ink hover:bg-raised"
                    : "bg-raised text-ink hover:bg-page"
              }`}
            >
              <span>{p.weekday}</span>
              <span className="font-mono text-body">{p.day}</span>
            </button>
          );
        })}
      </div>
      <Field label={t("other")}>
        {(id) => (
          <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
        )}
      </Field>
    </div>
  );
}

/** Duplicar un WOD en otro día (como borrador) o moverlo de día. */
export function DaySheet({
  workout,
  mode,
  onClose,
}: {
  workout: WorkoutView;
  mode: "duplicate" | "move";
  onClose: () => void;
}) {
  const t = useT("fitness.staff.programming");
  const nameOf = useWorkoutName();
  const c = useT("fitness.common");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const time = useClassTime();
  const weekday = (new Date(`${workout.onDate}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(workout.onDate, -weekday);
  const around = useWorkouts({ from: start, to: addDays(start, 13) });
  const taken = new Set(
    (around.data?.workouts ?? [])
      .filter(
        (w) =>
          w.section.id === workout.section.id &&
          (w.team?.id ?? null) === (workout.team?.id ?? null),
      )
      .map((w) => w.onDate),
  );
  const [date, setDate] = useState(() => {
    for (let i = 1; i < 14; i += 1) {
      const d = addDays(workout.onDate, i);
      if (!taken.has(d)) return d;
    }
    return addDays(workout.onDate, 1);
  });
  const [busy, setBusy] = useState(false);
  const title = nameOf(workout);
  const loaded = around.data !== undefined;
  // Con la semana cargada, si el día propuesto ya tiene WOD, el primer día libre.
  useEffect(() => {
    if (!loaded || !taken.has(date)) return;
    for (let i = 1; i < 14; i += 1) {
      const d = addDays(workout.onDate, i);
      if (!taken.has(d)) {
        setDate(d);
        return;
      }
    }
    // Solo cuando llega la semana: luego manda lo que elija la persona.
  }, [loaded]);

  async function run() {
    setBusy(true);
    try {
      if (mode === "duplicate") {
        await apiFetch("/api/org/workouts", {
          method: "POST",
          body: copyOf(workout, date),
          schema: WorkoutResponseSchema,
        });
        toast("success", t("duplicated", { day: time.day(date) }));
      } else {
        await apiFetch(`/api/org/workouts/${workout.id}`, {
          method: "PUT",
          body: upsertBodyOf(workout, { onDate: date }),
          schema: WorkoutResponseSchema,
        });
        toast("success", t("moved", { day: time.day(date) }));
      }
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errorText(err, t("dayTaken")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={mode === "duplicate" ? t("duplicateTitle", { title }) : t("moveTitle", { title })}
      description={mode === "duplicate" ? t("duplicateHint") : t("moveHint")}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={mode === "duplicate" ? "copy" : undefined}
            icon={
              mode === "move" ? <Icon.ArrowsLeftRight size={20} aria-hidden="true" /> : undefined
            }
            loading={busy}
            disabled={!date || taken.has(date) || date === workout.onDate}
            onClick={() => void run()}
          >
            {mode === "duplicate"
              ? t("duplicateTo", { day: time.day(date) })
              : t("moveTo", { day: time.day(date) })}
          </Button>
        </>
      }
    >
      <DayChooser
        start={start}
        value={date}
        onChange={setDate}
        taken={new Set([...taken, ...(mode === "move" ? [workout.onDate] : [])])}
      />
    </Sheet>
  );
}

/** Copiar a un día vacío el WOD de otro día de la misma disciplina (de las dos semanas antes). */
export function CopyFromSheet({
  date,
  section,
  onClose,
}: {
  date: string;
  section: { id: string; name: string };
  onClose: () => void;
}) {
  const t = useT("fitness.staff.programming");
  const nameOf = useWorkoutName();
  const c = useT("fitness.common");
  const kinds = useT("fitness.common.blockKinds");
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const recent = useWorkouts({
    from: addDays(date, -21),
    to: addDays(date, 7),
    section: section.id,
  });
  const options = (recent.data?.workouts ?? [])
    .filter((w) => w.onDate !== date && w.section.id === section.id)
    .sort((a, b) => b.onDate.localeCompare(a.onDate));
  const [busy, setBusy] = useState<string | null>(null);

  async function copy(w: WorkoutView) {
    setBusy(w.id);
    try {
      const created = await apiFetch("/api/org/workouts", {
        method: "POST",
        body: copyOf(w, date),
        schema: WorkoutResponseSchema,
      });
      await invalidate();
      toast("success", t("duplicated", { day: time.day(date) }));
      void navigate(paths.workoutEdit(created.workout.id));
    } catch (err) {
      toast("error", errorText(err, t("dayTaken")));
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("copyFromTitle", { day: time.day(date) })}
      description={t("copyFromHint", { section: section.name })}
    >
      {recent.isPending ? (
        <div className="h-32 animate-pulse rounded-card bg-raised" />
      ) : options.length === 0 ? (
        <EmptyState
          icon={<Icon.Copy weight="duotone" />}
          title={t("copyFromEmpty")}
          description={t("copyFromEmptyHint")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void copy(w)}
                className="flex w-full min-h-14 flex-col gap-0.5 rounded-field bg-raised px-4 py-3 text-left transition-colors hover:bg-page disabled:opacity-60"
              >
                <span className="text-label uppercase tracking-wide text-muted">
                  {time.day(w.onDate)}
                </span>
                <span className="font-medium text-ink">{nameOf(w)}</span>
                <span className="text-secondary text-muted">
                  {w.blocks.map((b) => `${b.label} ${kinds(b.kind)}: ${b.title}`).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
