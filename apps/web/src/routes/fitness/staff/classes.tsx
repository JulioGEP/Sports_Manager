import {
  addDays,
  type ClassSummary,
  type PlanSummary,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useMemo } from "react";
import { Link } from "react-router";
import {
  ClassBlock,
  ClassCalendar,
  SectionFilter,
  ViewToggle,
  WeekNav,
  WeekStrip,
  useCalendarState,
  useSections,
  type PlacedClass,
} from "@/components/fitness/class-calendar";
import {
  FacePile,
  OwnPlansOfDay,
  ownPeople,
  PeopleLine,
  peopleOf,
  type OwnPlanDay,
} from "@/components/fitness/class-programming";
import { RoleChip } from "@/components/fitness/planning-ui";
import { useWorkoutName, useWorkoutState } from "@/components/fitness/programming-week";
import { useHas } from "@/components/fitness/staff-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, useClasses, useClassTime, useFitnessRole, useWorkouts } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlans } from "@/lib/planning";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Segmented,
  StatusChip,
} from "@/ui";

type Scope = "mine" | "all";

/**
 * Las clases del box para el personal (ADR 0049, en calendario desde ADR 0051): la semana en
 * columnas con cada clase en su hora, sus plazas y, cuando ya ha empezado, el check-in. El coach
 * empieza por las suyas y el dueño por todo el box. Cada clase abre su ficha para pasar lista.
 * Cada clase avisa si no tiene WOD y cuántos vienen con plan propio, y el día enseña al lado su
 * programación: el WOD, quién viene y los planes propios (ADR 0057).
 */
export function StaffClassesPage() {
  const t = useT("fitness.staff.classes");
  const s = useT("fitness.staff");
  const c = useT("fitness.common");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const has = useHas();
  const role = useFitnessRole();
  const time = useClassTime();
  const state = useCalendarState();
  const defaultScope: Scope = role === "coach" ? "mine" : "all";
  const rawScope = state.params.get("scope");
  const scope: Scope = rawScope === "mine" || rawScope === "all" ? rawScope : defaultScope;
  const classes = useClasses(dayRange(time.timezone, state.monday, 7), {
    mine: scope === "mine",
  });

  const all = useMemo(() => classes.data?.classes ?? [], [classes.data]);
  // La disciplina filtra en escritorio, donde la semana entera se ve de golpe.
  const sections = useSections(all, state.desktop ? state.params.get("section") : null);
  const week = useMemo(
    () => (sections.selected ? all.filter((x) => x.section?.id === sections.selected) : all),
    [all, sections.selected],
  );
  const day = state.dayOf(week);
  const shown = state.view === "week" ? week : week.filter((x) => x.date === day);
  const booked = shown.reduce((sum, x) => sum + x.booked, 0);
  const capacity = shown.reduce((sum, x) => sum + (x.capacity ?? 0), 0);
  // La programación de la semana (ADR 0057): el WOD de cada clase y los planes propios.
  const training = has("org.training.read");
  const workouts = useWorkouts(
    { from: state.monday, to: addDays(state.monday, 6), own: true },
    training,
  );
  const plans = usePlans(training);
  const now = Date.now();
  const withoutWod = shown.filter(
    (x) => x.section && x.programming && !x.programming.workoutId && Date.parse(x.endsAt) > now,
  ).length;

  const setupLink = has("org.structure.write") ? (
    <ButtonLink action="edit" to={paths.classTypes} variant="secondary">
      {t("setup")}
    </ButtonLink>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("description")} actions={setupLink} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav
          monday={state.monday}
          today={state.today}
          onWeek={(monday) => state.goWeek(monday, day)}
          onToday={state.goToday}
        />
        {state.desktop ? <ViewToggle view={state.view} onChange={state.setView} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Scope>
            label={t("scope")}
            value={scope}
            onChange={(v) => state.set({ scope: v === defaultScope ? null : v })}
            options={[
              { key: "mine", label: t("mine") },
              { key: "all", label: t("all") },
            ]}
          />
          {state.desktop ? (
            <SectionFilter
              sections={sections.list}
              value={sections.selected}
              onChange={(id) => state.set({ section: id })}
            />
          ) : null}
        </div>
        {classes.data && week.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-muted">
            <span>
              {t("summary", { classes: shown.length, booked })}
              {capacity > 0
                ? ` · ${t("occupancy", { percent: Math.round((booked / capacity) * 100) })}`
                : null}
            </span>
            {training && withoutWod > 0 ? (
              <Link
                to={`${paths.programming}?week=${state.monday}`}
                className="inline-flex min-h-11 items-center gap-1 font-medium text-warning"
              >
                <Icon.Warning size={16} aria-hidden="true" />
                {t("withoutWod", { count: withoutWod })}
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>

      {classes.isError ? (
        <Alert
          kind="error"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void classes.refetch()}>
              {c("retry")}
            </Button>
          }
        >
          {s("loadError")}
        </Alert>
      ) : classes.isPending ? (
        <div
          className="h-[32rem] animate-pulse rounded-card bg-raised"
          aria-busy="true"
          aria-label={c("loading")}
        />
      ) : week.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
            title={scope === "mine" ? t("emptyMine") : t("empty")}
            action={
              scope === "mine" ? (
                <Button variant="secondary" size="sm" onClick={() => state.set({ scope: "all" })}>
                  {t("seeAll")}
                </Button>
              ) : (
                setupLink
              )
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col">
          {state.view === "day" ? (
            <WeekStrip
              days={state.week}
              selected={day}
              today={state.today}
              onSelect={state.setDay}
              empty={(d) => !week.some((x) => x.date === d)}
            />
          ) : null}
          <div
            className={
              state.view === "day" && training
                ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start"
                : ""
            }
          >
            <ClassCalendar
              view={state.view}
              days={state.view === "week" ? state.week : [day]}
              classes={shown}
              today={state.today}
              label={t("title")}
              onOpenDay={state.openDay}
              renderBlock={(placed) => (
                <StaffBlock
                  placed={placed}
                  view={state.view}
                  to={paths.classDetail(placed.cls.id)}
                />
              )}
            />
            {state.view === "day" && training ? (
              <DayProgramming
                day={day}
                classes={shown}
                workouts={workouts.data?.workouts ?? []}
                writable={workouts.data?.writableSections ?? []}
                plans={plans.data?.plans ?? []}
                loading={workouts.isPending}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La programación del día al lado del calendario (ADR 0057): por disciplina, su WOD con su papel,
 * su estado y su plan, quién viene y cuántos con plan propio, y los planes propios con su sesión.
 * Si falta el WOD, a un toque de programarlo.
 */
function DayProgramming({
  day,
  classes,
  workouts,
  writable,
  plans,
  loading,
}: {
  day: string;
  classes: readonly ClassSummary[];
  workouts: readonly WorkoutView[];
  writable: readonly string[];
  plans: readonly PlanSummary[];
  loading: boolean;
}) {
  const t = useT("fitness.staff.classes.day");
  const kinds = useT("fitness.common.blockKinds");
  const nameOf = useWorkoutName();
  const stateOf = useWorkoutState();
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const sections = new Map<string, { id: string; name: string; classes: ClassSummary[] }>();
  for (const cls of classes) {
    if (!cls.section) continue;
    const entry = sections.get(cls.section.id) ?? { ...cls.section, classes: [] };
    entry.classes.push(cls);
    sections.set(cls.section.id, entry);
  }
  const sessions = workouts.filter((w) => w.specific && w.onDate === day);
  return (
    <aside aria-label={t("title")} className="flex flex-col gap-3">
      <h2 className="text-title3 text-ink">{t("title")}</h2>
      {loading ? <div className="h-40 animate-pulse rounded-card bg-raised" /> : null}
      {!loading && sections.size === 0 ? (
        <p className="text-secondary text-muted">{t("empty")}</p>
      ) : null}
      {loading
        ? null
        : [...sections.values()].map((section) => {
            const ids = [
              ...new Set(section.classes.flatMap((x) => x.programming?.workoutId ?? [])),
            ];
            const wods = ids.flatMap((id) => workouts.find((w) => w.id === id) ?? []);
            const people = peopleOf(section.classes);
            const booked = section.classes.reduce((sum, x) => sum + x.booked, 0);
            const rows: OwnPlanDay[] = plans
              .filter(
                (p) =>
                  p.status === "active" && p.audience !== "section" && p.section.id === section.id,
              )
              .flatMap((plan) => {
                const session = sessions.find((w) => w.plan?.id === plan.id) ?? null;
                const inClass = ownPeople(people).filter((p) => p.ownPlan?.id === plan.id);
                return session || inClass.length > 0 ? [{ plan, session, inClass }] : [];
              });
            const canProgram = writable.includes(section.id) && day >= time.today;
            return (
              <section
                key={section.id}
                aria-label={section.name}
                className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label uppercase tracking-wide text-muted">
                    {section.name}
                  </span>
                  <FacePile people={people} max={6} size="xs" />
                </div>
                <PeopleLine booked={booked} own={ownPeople(people).length} />
                {wods.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-warning-soft px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-secondary font-medium text-warning">
                      <Icon.Warning size={16} aria-hidden="true" />
                      {t("missing")}
                    </span>
                    {canProgram ? (
                      <ButtonLink
                        to={`${paths.workoutNew}?date=${day}&section=${section.id}`}
                        variant="secondary"
                        size="sm"
                        action="add"
                        aria-label={t("program", { section: section.name, day: time.day(day) })}
                      >
                        {t("programShort")}
                      </ButtonLink>
                    ) : null}
                  </div>
                ) : null}
                {wods.map((w) => {
                  const state = stateOf(w);
                  return (
                    <Link
                      key={w.id}
                      to={paths.workoutEdit(w.id)}
                      aria-label={t("openWod", { title: nameOf(w) })}
                      className="flex flex-col gap-2 rounded-field border border-line px-3 py-2.5 text-inherit no-underline transition-colors hover:bg-raised"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{nameOf(w)}</span>
                        {w.dayRole ? <RoleChip role={w.dayRole} /> : null}
                        <StatusChip kind={state.kind}>{state.label}</StatusChip>
                      </span>
                      {w.plan ? (
                        <span className="text-secondary text-muted">
                          {t("plan", {
                            plan: w.plan.name,
                            week: w.plan.week,
                            weeks: w.plan.weeks,
                            block: w.plan.blockLabel,
                          })}
                        </span>
                      ) : null}
                      <ol className="flex flex-col gap-0.5 text-secondary">
                        {w.blocks.map((b) => (
                          <li key={b.id} className="flex gap-2">
                            <span className="w-4 shrink-0 font-mono font-semibold text-ink">
                              {b.label}
                            </span>
                            <span className="min-w-0 truncate">
                              {b.title === kinds(b.kind) ? null : (
                                <span className="text-muted">{kinds(b.kind)} · </span>
                              )}
                              <span className="text-ink">{b.title}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </Link>
                  );
                })}
                <OwnPlansOfDay date={day} rows={rows} />
              </section>
            );
          })}
    </aside>
  );
}

/**
 * Una clase para el personal: antes de empezar, cómo va de plazas; en marcha o terminada, cuántos
 * han hecho check-in. Lo que ya pasó, apagado. Junto al nombre, si aún no tiene WOD y cuántos
 * vienen con plan propio; en el día, sus caras (ADR 0057).
 */
function StaffBlock({
  placed: { cls, past, live },
  view,
  to,
}: {
  placed: PlacedClass;
  view: "week" | "day";
  to: string;
}) {
  const s = useT("fitness.staff");
  const c = useT("fitness.common");
  const spots = useT("fitness.common.spots");
  const cal = useT("fitness.common.calendar");
  const p = useT("fitness.staff.inClasses");
  const time = useClassTime();
  const title = cls.team?.name ?? cls.title;
  const coach = cls.coach ? (cls.coach.name.split(" ")[0] ?? cls.coach.name) : c("noCoach");
  const started = past || live;
  const full = cls.capacity !== null && cls.booked >= cls.capacity;
  const people = cls.programming?.people ?? [];
  const own = ownPeople(people).length;
  const noWod = Boolean(cls.section && cls.programming && !cls.programming.workoutId && !past);

  let status: string;
  let detail: string | undefined;
  let icon = null;
  if (started && cls.booked > 0) {
    // El check-in: la cifra siempre, la palabra si cabe.
    status = `${cls.checkedIn}/${cls.booked}`;
    detail = cal("checkin");
    icon =
      cls.checkedIn >= cls.booked ? (
        <Icon.CheckCircle size={14} weight="fill" aria-hidden="true" />
      ) : (
        <Icon.ListChecks size={14} aria-hidden="true" />
      );
  } else if (cls.capacity === null) {
    status = spots("open");
  } else {
    status = spots("of", { booked: cls.booked, capacity: cls.capacity });
    const extra = [
      full ? spots("full") : null,
      cls.waitlist > 0 ? spots("waitlist", { count: cls.waitlist }) : null,
    ].filter(Boolean);
    detail = extra.length ? `· ${extra.join(" · ")}` : undefined;
  }

  return (
    <ClassBlock
      view={view}
      tone={past ? "muted" : "open"}
      live={live}
      title={title}
      when={view === "week" ? time.hour(cls.startsAt) : time.range(cls.startsAt, cls.endsAt)}
      meta={view === "week" ? coach : [coach, cls.facility?.name].filter(Boolean).join(" · ")}
      status={status}
      detail={detail}
      icon={icon}
      marker={
        noWod || own > 0 ? (
          <>
            {noWod ? <Icon.Warning size={14} className="text-warning" /> : null}
            {own > 0 ? (
              <span className="inline-flex items-center gap-0.5 font-mono">
                <Icon.Target size={14} />
                {own}
              </span>
            ) : null}
          </>
        ) : null
      }
      aside={
        view === "day" && (people.length > 0 || (!started && cls.capacity !== null)) ? (
          // Solo si sobra ancho: con dos clases a la vez, antes el nombre que la barra y las caras.
          <span className="hidden items-center gap-2 @min-[14rem]:flex">
            {people.length > 0 ? (
              <span className="hidden @min-[26rem]:flex">
                <FacePile people={people} max={4} size="xs" />
              </span>
            ) : null}
            {!started && cls.capacity !== null ? (
              <SpotsBar booked={cls.booked} capacity={cls.capacity} />
            ) : null}
          </span>
        ) : null
      }
      label={[
        title,
        time.day(cls.date),
        time.range(cls.startsAt, cls.endsAt),
        cls.coach?.name ?? c("noCoach"),
        cls.facility?.name,
        started && cls.booked > 0
          ? s("checkins", { checkedIn: cls.checkedIn, booked: cls.booked })
          : [status, detail].filter(Boolean).join(" "),
        noWod ? p("noWod") : null,
        own > 0 ? p("withOwn", { count: own }) : null,
      ]
        .filter(Boolean)
        .join(", ")}
      to={to}
    />
  );
}

/** Cómo se llena la clase, a la vista en el día (la cifra va en la línea de estado). */
function SpotsBar({ booked, capacity }: { booked: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  return (
    <span aria-hidden="true" className="block h-1.5 w-20 overflow-hidden rounded-full bg-raised">
      <span
        className={`block h-full rounded-full ${booked >= capacity ? "bg-danger" : "bg-club"}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
