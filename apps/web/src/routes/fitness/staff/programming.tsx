import {
  addDays,
  WorkoutResponseSchema,
  WorkoutsCopiedResponseSchema,
  WorkoutsPublishedResponseSchema,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import {
  OwnPlansOfDay,
  ownPeople,
  PeopleLine,
  peopleOf,
  WodClasses,
  type OwnPlanDay,
} from "@/components/fitness/class-programming";
import {
  CopyFromSheet,
  DaySheet,
  EmptyDay,
  upsertBodyOf,
  useDayParts,
  useWorkoutName,
  WorkoutCard,
} from "@/components/fitness/programming-week";
import { usePlanNames, WeekRoles } from "@/components/fitness/planning-ui";
import { useHas, useStaffError } from "@/components/fitness/staff-ui";
import { mondayOf } from "@/components/fitness/staff-workout";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import {
  dayRange,
  daysFrom,
  useClasses,
  useClassTime,
  useClassTypes,
  useInvalidateFitness,
  useWorkouts,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlan, usePlans } from "@/lib/planning";
import {
  Alert,
  Button,
  ButtonLink,
  Icon,
  IconButton,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
  StatusChip,
  useToast,
} from "@/ui";

const ALL = "all";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La programación de la semana (ADR 0050), pensada como la pizarra del coach: un día debajo de
 * otro, a todo el ancho, con el WOD entero a la vista y su estado. Los días con clase y sin WOD
 * se ven a la primera y se programan desde ahí (en blanco, con un benchmark, con IA o copiando
 * otro día); la semana se publica de una vez y se arranca copiando la anterior. Cada WOD dice en
 * qué clases se hace y quién viene, y debajo van los planes propios del día con su sesión y su
 * gente en clase (ADR 0055).
 */
export function ProgrammingPage() {
  const t = useT("fitness.staff.programming");
  const intl = useIntl();
  const has = useHas();
  const time = useClassTime();
  const parts = useDayParts();
  const nameOf = useWorkoutName();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params, setParams] = useSearchParams();
  const rawWeek = params.get("week");
  const monday = rawWeek && DATE.test(rawWeek) ? mondayOf(rawWeek) : mondayOf(time.today);
  const section = params.get("section") ?? ALL;
  const sunday = addDays(monday, 6);
  const week = daysFrom(monday, 7);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const goWeek = (date: string) => setParam("week", date === mondayOf(time.today) ? null : date);

  // Con las sesiones de los planes propios (ADR 0055): van aparte, debajo del WOD de cada día.
  const workouts = useWorkouts({ from: monday, to: sunday, own: true });
  const classes = useClasses(dayRange(time.timezone, monday, 7));
  const classTypes = useClassTypes(has("org.structure.read"));
  const plans = usePlans();

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of classTypes.data?.sections ?? []) map.set(s.id, s.name);
    for (const cl of classes.data?.classes ?? [])
      if (cl.section) map.set(cl.section.id, cl.section.name);
    for (const w of workouts.data?.workouts ?? []) map.set(w.section.id, w.section.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classTypes.data, classes.data, workouts.data]);
  const multi = sections.length > 1;
  const shown = section === ALL ? sections : sections.filter((s) => s.id === section);
  const writable = new Set(workouts.data?.writableSections ?? []);
  const canWrite = writable.size > 0;

  /** Clases de cada día por disciplina. */
  const classesBy = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const cl of classes.data?.classes ?? []) {
      if (!cl.section) continue;
      const day = map.get(cl.date) ?? new Map<string, number>();
      day.set(cl.section.id, (day.get(cl.section.id) ?? 0) + 1);
      map.set(cl.date, day);
    }
    return map;
  }, [classes.data]);

  const inShown = (sectionId: string) => shown.some((s) => s.id === sectionId);
  const list = (workouts.data?.workouts ?? []).filter((w) => !w.specific && inShown(w.section.id));
  const sessions = (workouts.data?.workouts ?? []).filter((w) => w.specific);
  const ownPlans = (plans.data?.plans ?? []).filter(
    (p) => p.status === "active" && p.audience !== "section" && inShown(p.section.id),
  );
  const weekClasses = (classes.data?.classes ?? []).filter(
    (cl) => cl.section && inShown(cl.section.id),
  );
  const drafts = list.filter((w) => w.status === "draft" && writable.has(w.section.id)).length;

  /** Las clases en que se hace un WOD: las que lo tienen como suyo (ADR 0055). */
  const classesOfWod = (w: WorkoutView) =>
    weekClasses.filter((cl) => cl.programming?.workoutId === w.id);
  /** Los planes propios de un día: los que tienen sesión o gente en clase ese día. */
  const ownRowsOf = (day: string): OwnPlanDay[] => {
    const people = peopleOf(weekClasses.filter((cl) => cl.date === day));
    return ownPlans.flatMap((plan) => {
      const session = sessions.find((w) => w.onDate === day && w.plan?.id === plan.id) ?? null;
      const inClass = people.filter((p) => p.ownPlan?.id === plan.id && p.status !== "no_show");
      return session || inClass.length > 0 ? [{ plan, session, inClass }] : [];
    });
  };
  const weekBooked = weekClasses.reduce((sum, cl) => sum + cl.booked, 0);
  const weekOwn = weekClasses.reduce(
    (sum, cl) => sum + ownPeople(cl.programming?.people ?? []).length,
    0,
  );
  const classDays = week.filter((d) => shown.some((s) => (classesBy.get(d)?.get(s.id) ?? 0) > 0));
  const programmed = classDays.filter((d) =>
    shown.every(
      (s) =>
        (classesBy.get(d)?.get(s.id) ?? 0) === 0 ||
        list.some((w) => w.onDate === d && w.section.id === s.id),
    ),
  ).length;

  const [sheet, setSheet] = useState<
    | { kind: "duplicate" | "move"; workout: WorkoutView }
    | { kind: "copyFrom"; date: string; section: { id: string; name: string } }
    | null
  >(null);
  const [busy, setBusy] = useState<"publish" | "copy" | null>(null);
  const sectionParam = section === ALL ? {} : { sectionId: section };

  async function publishWeek() {
    setBusy("publish");
    try {
      const res = await apiFetch("/api/org/workouts/publish", {
        method: "POST",
        body: { from: monday, to: sunday, ...sectionParam },
        schema: WorkoutsPublishedResponseSchema,
      });
      toast("success", t("weekPublished", { count: res.published }));
      await invalidate();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function copyPreviousWeek() {
    setBusy("copy");
    try {
      const res = await apiFetch("/api/org/workouts/copy", {
        method: "POST",
        body: { from: addDays(monday, -7), to: monday, days: 7, ...sectionParam },
        schema: WorkoutsCopiedResponseSchema,
      });
      toast(
        "success",
        res.created === 0 && res.skipped === 0
          ? t("weekCopiedNothing")
          : t("weekCopied", { created: res.created, skipped: res.skipped }),
      );
      await invalidate();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function publishOne(w: WorkoutView) {
    try {
      await apiFetch(`/api/org/workouts/${w.id}`, {
        method: "PUT",
        body: upsertBodyOf(w, { status: "published", publishAt: null }),
        schema: WorkoutResponseSchema,
      });
      toast("success", t("published", { title: nameOf(w) }));
      await invalidate();
    } catch (err) {
      toast("error", errorText(err));
    }
  }

  const loading = workouts.isPending || classes.isPending;
  const weekLabel = t("weekOf", {
    day: intl.formatDate(new Date(`${monday}T12:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <>
              {drafts > 0 ? (
                <Button
                  action="send"
                  loading={busy === "publish"}
                  onClick={() => void publishWeek()}
                >
                  {t("publishWeek", { count: drafts })}
                </Button>
              ) : null}
              {/* Una semana vacía se empieza copiando la anterior: entonces va a la vista. */}
              {list.length === 0 && !loading ? (
                <Button
                  variant="secondary"
                  action="copy"
                  loading={busy === "copy"}
                  onClick={() => void copyPreviousWeek()}
                >
                  {t("copyPreviousWeek")}
                </Button>
              ) : (
                <Menu
                  label={t("weekActions")}
                  trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
                  triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
                >
                  <MenuItem
                    icon={<Icon.Copy size={20} aria-hidden="true" />}
                    onClick={() => void copyPreviousWeek()}
                  >
                    {t("copyPreviousWeek")}
                  </MenuItem>
                </Menu>
              )}
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={t("prev")} onClick={() => goWeek(addDays(monday, -7))}>
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex min-w-36 flex-col items-center px-1 text-center">
            <span className="font-semibold text-ink">{weekLabel}</span>
            <span className="text-label text-muted">
              {t("range", {
                when:
                  monday === mondayOf(time.today)
                    ? "current"
                    : monday === addDays(mondayOf(time.today), 7)
                      ? "next"
                      : monday === addDays(mondayOf(time.today), -7)
                        ? "previous"
                        : "other",
                to: intl.formatDate(new Date(`${sunday}T12:00:00Z`), {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }),
              })}
            </span>
          </div>
          <IconButton label={t("next")} onClick={() => goWeek(addDays(monday, 7))}>
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          {monday !== mondayOf(time.today) ? (
            <Button variant="tertiary" size="sm" onClick={() => goWeek(mondayOf(time.today))}>
              {t("thisWeek")}
            </Button>
          ) : null}
        </div>
        {multi ? (
          <Segmented<string>
            label={t("sections")}
            value={section}
            onChange={(key) => setParam("section", key === ALL ? null : key)}
            options={[
              { key: ALL, label: t("allSections") },
              ...sections.map((s) => ({ key: s.id, label: s.name })),
            ]}
          />
        ) : null}
      </div>

      <PlanStrips monday={monday} sections={shown.map((s) => s.id)} />

      {workouts.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {!loading && sections.length === 0 ? (
        <Alert
          kind="info"
          actions={
            has("org.structure.write") ? (
              <ButtonLink to={paths.classTypes} variant="secondary" size="sm" action="open">
                {t("openSchedule")}
              </ButtonLink>
            ) : null
          }
        >
          {t("noSections")}
        </Alert>
      ) : null}
      {!loading && sections.length > 0 && !canWrite ? (
        <Alert kind="info">{t("readOnly")}</Alert>
      ) : null}

      {!loading && classDays.length > 0 ? (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-muted"
          role="status"
        >
          <span>{t("summary", { programmed, total: classDays.length })}</span>
          {drafts > 0 ? (
            <StatusChip kind="neutral">{t("drafts", { count: drafts })}</StatusChip>
          ) : null}
          <PeopleLine booked={weekBooked} own={weekOwn} />
        </p>
      ) : null}

      <ol className="flex flex-col gap-3" aria-busy={loading}>
        {week.map((day) => {
          const p = parts(day);
          const isToday = day === time.today;
          const ofDay = list.filter((w) => w.onDate === day);
          const counts = classesBy.get(day);
          const missing = shown.filter(
            (s) =>
              (counts?.get(s.id) ?? 0) > 0 &&
              writable.has(s.id) &&
              !ofDay.some((w) => w.section.id === s.id),
          );
          const past = day < time.today;
          // Lo pasado no se programa: un día pasado sin WOD solo lo dice.
          const toProgram = past ? [] : missing;
          const quiet = ofDay.length === 0 && toProgram.length === 0;
          const ownRows = ownRowsOf(day);
          const bookedIn = (sectionId: string) =>
            weekClasses
              .filter((cl) => cl.date === day && cl.section?.id === sectionId)
              .reduce((sum, cl) => sum + cl.booked, 0);
          return (
            <li
              key={day}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]"
              aria-label={time.day(day)}
            >
              <div
                className={`flex flex-col items-center justify-start rounded-card py-3 ${
                  isToday
                    ? "bg-club text-on-club"
                    : quiet && ownRows.length === 0
                      ? "text-muted"
                      : "bg-raised text-ink"
                }`}
              >
                <span className="text-label font-semibold tracking-wide">{p.weekday}</span>
                <span className="font-mono text-title2">{p.day}</span>
                {isToday ? <span className="text-label">{t("today")}</span> : null}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                {loading ? (
                  <div className="h-20 animate-pulse rounded-card bg-raised" />
                ) : (
                  <>
                    {quiet ? (
                      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-card px-4 py-2">
                        <span className="text-secondary text-muted">
                          {counts && counts.size > 0 ? t("noWod") : t("noClasses")}
                        </span>
                        {canWrite && !past ? (
                          <ButtonLink
                            to={`${paths.workoutNew}?date=${day}${section !== ALL ? `&section=${section}` : ""}`}
                            variant="tertiary"
                            size="sm"
                            action="add"
                            aria-label={t("programAnyway", { day: time.day(day) })}
                          >
                            {t("program")}
                          </ButtonLink>
                        ) : null}
                      </div>
                    ) : null}
                    {ofDay.map((w) => (
                      <WorkoutCard
                        key={w.id}
                        workout={w}
                        showSection={multi && section === ALL}
                        editable={writable.has(w.section.id)}
                        onDuplicate={() => setSheet({ kind: "duplicate", workout: w })}
                        onMove={() => setSheet({ kind: "move", workout: w })}
                        onPublish={() => void publishOne(w)}
                        footer={<WodClasses classes={classesOfWod(w)} />}
                      />
                    ))}
                    {toProgram.map((s) => (
                      <EmptyDay
                        key={s.id}
                        date={day}
                        section={s}
                        classes={counts?.get(s.id) ?? 0}
                        booked={bookedIn(s.id)}
                        showSection={multi}
                        onCopyFrom={() => setSheet({ kind: "copyFrom", date: day, section: s })}
                      />
                    ))}
                    <OwnPlansOfDay date={day} rows={ownRows} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {sheet?.kind === "duplicate" || sheet?.kind === "move" ? (
        <DaySheet workout={sheet.workout} mode={sheet.kind} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "copyFrom" ? (
        <CopyFromSheet date={sheet.date} section={sheet.section} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}

/**
 * El plan de cada disciplina encima de la semana (ADR 0053): en qué semana y bloque está, el papel
 * de cada día y el enlace a la semana del plan, donde se escribe con su intención y su validación.
 * Esta semana es la del WOD del box: los planes propios (ADR 0054) van aparte, con un acceso a la
 * semana de cada uno, donde se escriben sus sesiones.
 */
function PlanStrips({ monday, sections }: { monday: string; sections: string[] }) {
  const t = useT("fitness.planning.strip");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plans = usePlans();
  const active = (plans.data?.plans ?? []).filter(
    (p) => p.status === "active" && sections.includes(p.section.id),
  );
  const box = active.filter((p) => p.audience === "section");
  const own = active.filter((p) => p.audience !== "section");
  if (plans.isPending) return null;
  return (
    <div className="flex flex-col gap-3">
      {box.length === 0 ? <NoPlanHint /> : null}
      {box.map((p) => (
        <PlanStrip key={p.id} id={p.id} monday={monday} />
      ))}
      {own.length > 0 ? (
        <nav aria-label={t("ownPlans")} className="flex flex-wrap items-center gap-2">
          <span className="text-secondary font-medium text-muted">{t("ownPlans")}</span>
          {own.map((p) => (
            <ButtonLink
              key={p.id}
              to={
                p.currentWeek ? paths.planningWeek(p.id, p.currentWeek) : paths.planningPlan(p.id)
              }
              variant="tertiary"
              size="sm"
            >
              {p.name}
            </ButtonLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function NoPlanHint() {
  const t = useT("fitness.planning.strip");
  const has = useHas();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  if (!has("org.training.write") && !has("org.training.write_own")) return null;
  return (
    <Alert
      kind="info"
      title={t("noPlanTitle")}
      actions={
        <ButtonLink to={paths.planningNew} variant="secondary" size="sm" action="add">
          {t("create")}
        </ButtonLink>
      }
    >
      {t("noPlanBody")}
    </Alert>
  );
}

function PlanStrip({ id, monday }: { id: string; monday: string }) {
  const t = useT("fitness.planning.strip");
  const names = usePlanNames();
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plan = usePlan(id).data?.plan;
  if (!plan) return null;
  const n =
    Math.floor(
      (Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${plan.startsOn}T00:00:00Z`)) /
        (7 * 86_400_000),
    ) + 1;
  const week = n >= 1 && n <= plan.weeks ? plan.structure.weeks[n - 1] : undefined;
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card sm:flex-row sm:items-center precisa:border precisa:border-border">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-label uppercase tracking-wide text-muted">{plan.section.name}</span>
        <span className="truncate font-semibold text-ink">{plan.name}</span>
        <span className="text-secondary text-muted">
          {week
            ? t("position", {
                n,
                weeks: plan.weeks,
                block: names.blockOf(plan.structure, week.block),
              })
            : t("outside")}
        </span>
      </div>
      {week ? (
        <div className="w-full sm:w-72">
          <WeekRoles roles={week.roles} closed={week.closed} monday={monday} today={time.today} />
        </div>
      ) : null}
      <ButtonLink
        to={week ? paths.planningWeek(plan.id, n) : paths.planningPlan(plan.id)}
        variant="secondary"
        size="sm"
        action="open"
      >
        {week ? t("openWeek") : t("openPlan")}
      </ButtonLink>
    </div>
  );
}
