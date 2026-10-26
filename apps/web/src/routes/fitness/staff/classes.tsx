import { useMemo } from "react";
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
import { useHas } from "@/components/fitness/staff-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, useClasses, useClassTime, useFitnessRole } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, ButtonLink, Card, EmptyState, Icon, PageHeader, Segmented } from "@/ui";

type Scope = "mine" | "all";

/**
 * Las clases del box para el personal (ADR 0049, en calendario desde ADR 0051): la semana en
 * columnas con cada clase en su hora, sus plazas y, cuando ya ha empezado, el check-in. El coach
 * empieza por las suyas y el dueño por todo el box. Cada clase abre su ficha para pasar lista.
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
          <span className="text-secondary text-muted">
            {t("summary", { classes: shown.length, booked })}
            {capacity > 0
              ? ` · ${t("occupancy", { percent: Math.round((booked / capacity) * 100) })}`
              : null}
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
          <ClassCalendar
            view={state.view}
            days={state.view === "week" ? state.week : [day]}
            classes={shown}
            today={state.today}
            label={t("title")}
            onOpenDay={state.openDay}
            renderBlock={(placed) => (
              <StaffBlock placed={placed} view={state.view} to={paths.classDetail(placed.cls.id)} />
            )}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Una clase para el personal: antes de empezar, cómo va de plazas; en marcha o terminada, cuántos
 * han hecho check-in. Lo que ya pasó, apagado.
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
  const time = useClassTime();
  const title = cls.team?.name ?? cls.title;
  const coach = cls.coach ? (cls.coach.name.split(" ")[0] ?? cls.coach.name) : c("noCoach");
  const started = past || live;
  const full = cls.capacity !== null && cls.booked >= cls.capacity;

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
      aside={
        view === "day" && !started && cls.capacity !== null ? (
          // Solo si sobra ancho: con dos clases a la vez, antes el nombre que la barra.
          <span className="hidden @min-[14rem]:block">
            <SpotsBar booked={cls.booked} capacity={cls.capacity} />
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
