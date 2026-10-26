import { addDays, WorkoutResponseSchema, type WorkoutView } from "@sportsmanager/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useHas, useStaffError } from "@/components/fitness/staff-ui";
import { copyOf, mondayOf } from "@/components/fitness/staff-workout";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import {
  daysFrom,
  useClassTime,
  useClassTypes,
  useInvalidateFitness,
  useWorkouts,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Segmented,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

const ALL = "all";

/**
 * La programación de la semana (ADR 0049): un WOD por día y disciplina (o por tipo de clase),
 * en borrador, publicado o programado para salir a una hora. Los días vacíos se ven a la primera
 * y se programan con un toque; un WOD se copia a otro día como borrador.
 */
export function ProgrammingPage() {
  const t = useT("fitness.staff.programming");
  const c = useT("fitness.common");
  const status = useT("fitness.common.workoutStatus");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const has = useHas();
  const time = useClassTime();
  const [monday, setMonday] = useState(() => mondayOf(time.today));
  const [section, setSection] = useState<string>(ALL);
  const [copying, setCopying] = useState<WorkoutView | null>(null);
  const week = daysFrom(monday, 7);
  const workouts = useWorkouts({ from: monday, to: addDays(monday, 6) });
  const classTypes = useClassTypes(has("org.structure.read"));

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of classTypes.data?.sections ?? []) map.set(s.id, s.name);
    for (const w of workouts.data?.workouts ?? []) map.set(w.section.id, w.section.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [classTypes.data, workouts.data]);
  const writable = new Set(workouts.data?.writableSections ?? []);
  const list = (workouts.data?.workouts ?? []).filter(
    (w) => section === ALL || w.section.id === section,
  );
  /** Disciplina con la que se programa un día vacío: la elegida o la única en la que se puede. */
  const target = section !== ALL ? section : writable.size === 1 ? [...writable][0]! : null;
  const canProgram = target ? writable.has(target) : writable.size > 0;
  const newLink = (date: string) =>
    `${paths.workoutNew}?date=${date}${target ? `&section=${target}` : ""}`;
  const multi = sections.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canProgram ? (
            <ButtonLink action="add" to={newLink(time.today < monday ? monday : time.today)}>
              {t("add")}
            </ButtonLink>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton label={t("prev")} onClick={() => setMonday(addDays(monday, -7))}>
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <span className="min-w-40 text-center font-medium text-ink">
            {t("week", {
              from: time.weekday(monday, "short"),
              to: time.weekday(addDays(monday, 6), "short"),
            })}
          </span>
          <IconButton label={t("next")} onClick={() => setMonday(addDays(monday, 7))}>
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          {monday !== mondayOf(time.today) ? (
            <Button variant="tertiary" size="sm" onClick={() => setMonday(mondayOf(time.today))}>
              {t("thisWeek")}
            </Button>
          ) : null}
        </div>
        {multi ? (
          <Segmented<string>
            label={t("sections")}
            value={section}
            onChange={setSection}
            options={[
              { key: ALL, label: t("allSections") },
              ...sections.map((s) => ({ key: s.id, label: s.name })),
            ]}
          />
        ) : null}
      </div>

      {workouts.isError ? (
        <Alert kind="error">{t("loadError")}</Alert>
      ) : workouts.data && sections.length === 0 ? (
        <Alert kind="info">{t("noSections")}</Alert>
      ) : null}
      {workouts.data && writable.size === 0 && sections.length > 0 ? (
        <Alert kind="info">{t("readOnly")}</Alert>
      ) : null}

      <ol className="grid gap-3 lg:grid-cols-7" aria-busy={workouts.isPending}>
        {week.map((day) => {
          const ofDay = list.filter((w) => w.onDate === day);
          const isToday = day === time.today;
          return (
            <li
              key={day}
              className={`flex min-h-32 flex-col gap-2 rounded-card p-3 ${
                isToday ? "bg-club-soft" : "bg-raised"
              }`}
            >
              <h2
                className={`flex items-baseline justify-between gap-2 text-label uppercase tracking-wide ${
                  isToday ? "text-club-soft-text" : "text-muted"
                }`}
              >
                <span>{time.weekday(day, "short")}</span>
                {isToday ? <span>{c("today")}</span> : null}
              </h2>
              {workouts.isPending ? (
                <div className="h-16 animate-pulse rounded-field bg-surface" />
              ) : ofDay.length === 0 ? (
                <div className="flex flex-1 flex-col items-start justify-between gap-2">
                  <span className="text-secondary text-muted">{t("empty")}</span>
                  {canProgram ? (
                    <ButtonLink action="add" to={newLink(day)} variant="tertiary" size="sm">
                      {t("program")}
                    </ButtonLink>
                  ) : null}
                </div>
              ) : (
                ofDay.map((w) => (
                  <WorkoutTile
                    key={w.id}
                    workout={w}
                    showSection={multi && section === ALL}
                    to={paths.workoutEdit(w.id)}
                    statusLabel={
                      w.status === "published" && !w.visible && w.publishAt
                        ? t("scheduled", { when: time.when(w.publishAt) })
                        : status(w.status)
                    }
                    onCopy={writable.has(w.section.id) ? () => setCopying(w) : undefined}
                  />
                ))
              )}
            </li>
          );
        })}
      </ol>

      {copying ? <CopySheet workout={copying} onClose={() => setCopying(null)} /> : null}
    </div>
  );
}

function WorkoutTile({
  workout,
  showSection,
  to,
  statusLabel,
  onCopy,
}: {
  workout: WorkoutView;
  showSection: boolean;
  to: string;
  statusLabel: string;
  onCopy?: (() => void) | undefined;
}) {
  const t = useT("fitness.staff.programming");
  const results = workout.blocks.reduce((sum, b) => sum + b.results, 0);
  const shown = workout.blocks.slice(0, 4);
  return (
    <article className="flex flex-col gap-2 rounded-field bg-surface p-3 shadow-row">
      <div className="flex flex-col gap-1">
        {showSection || workout.team ? (
          <span className="text-label uppercase tracking-wide text-muted">
            {[showSection ? workout.section.name : null, workout.team?.name]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        <Link to={to} className="font-medium text-ink no-underline hover:underline">
          {workout.title ?? t("untitled")}
        </Link>
        <span>
          <StatusChip
            kind={workout.status === "draft" ? "neutral" : workout.visible ? "success" : "info"}
          >
            {statusLabel}
          </StatusChip>
        </span>
      </div>
      <ol className="flex flex-col gap-0.5 text-secondary text-muted">
        {shown.map((b) => (
          <li key={b.id} className="truncate">
            <span className="font-mono font-semibold text-ink">{b.label}</span> {b.title}
          </li>
        ))}
        {workout.blocks.length > shown.length ? (
          <li>{t("blocksMore", { count: workout.blocks.length - shown.length })}</li>
        ) : null}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {results > 0 ? (
          <span className="text-label text-muted">{t("results", { count: results })}</span>
        ) : (
          <span />
        )}
        {onCopy ? (
          <Button variant="ghost" size="sm" iconOnly action="copy" onClick={onCopy}>
            {t("copy")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CopySheet({ workout, onClose }: { workout: WorkoutView; onClose: () => void }) {
  const t = useT("fitness.staff.programming");
  const c = useT("fitness.common");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const time = useClassTime();
  const [date, setDate] = useState(addDays(workout.onDate, 1));
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      await apiFetch("/api/org/workouts", {
        method: "POST",
        body: copyOf(workout, date),
        schema: WorkoutResponseSchema,
      });
      toast("success", t("copied", { date: time.day(date) }));
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errorText(err, t("copyConflict")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("copyTitle")}
      description={t("copyDescription")}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="copy" loading={busy} disabled={!date} onClick={() => void copy()}>
            {t("copy")}
          </Button>
        </>
      }
    >
      <Field label={t("copyDate")}>
        {(id, describedBy) => (
          <Input
            id={id}
            type="date"
            value={date}
            aria-describedby={describedBy}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
    </Sheet>
  );
}
