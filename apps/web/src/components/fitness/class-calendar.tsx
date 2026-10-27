import { addDays, type ClassSummary } from "@sportsmanager/shared";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link, useSearchParams } from "react-router";
import { mondayOf } from "@/components/fitness/staff-workout";
import { minutesOfDay } from "@/lib/agenda";
import { buildTimeline, layoutColumns } from "@/lib/class-calendar";
import { daysFrom, useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import { DESKTOP_QUERY } from "@/lib/theme";
import { Button, Icon, IconButton, Segmented } from "@/ui";

/**
 * Las clases del box en calendario (ADR 0051): la semana en columnas o un día, con las horas en
 * vertical y cada clase en su sitio y con su duración. Las que coinciden van una al lado de otra y
 * los huecos largos sin clases se pliegan en una franja para que el día quepa sin desplazarse.
 */

export type CalendarView = "week" | "day";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Medidas de cada vista: la semana es densa; el día, para el dedo. */
const SIZES = {
  week: { hourHeight: 60, gapHeight: 28, gutter: "3.5rem" },
  day: { hourHeight: 84, gapHeight: 32, gutter: "3rem" },
} as const;

/** La hora de ahora, al minuto: mueve la línea de "ahora" y apaga las clases que terminan. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Lo que se mira, en la URL (para volver de una clase al mismo sitio): el día elegido, la vista y
 * los filtros. La semana es la del día. En el móvil, siempre el día: siete columnas no caben.
 */
export function useCalendarState() {
  const time = useClassTime();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [params, setParams] = useSearchParams();
  const rawDay = params.get("day");
  const chosen = rawDay && DATE.test(rawDay) ? rawDay : null;
  const day = chosen ?? time.today;
  const view: CalendarView = desktop && params.get("view") !== "day" ? "week" : "day";
  const monday = mondayOf(day);

  const set = (next: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v === null) sp.delete(k);
          else sp.set(k, v);
        }
        return sp;
      },
      { replace: true },
    );

  return {
    view,
    desktop,
    monday,
    week: daysFrom(monday, 7),
    today: time.today,
    params,
    set,
    /**
     * El día que se enseña. Si nadie ha elegido y hoy ya no queda ninguna clase por terminar, el
     * siguiente día con clases de la semana: a las diez de la noche se reserva para mañana.
     */
    dayOf: (classes: readonly ClassSummary[], now = Date.now()) => {
      if (chosen) return chosen;
      if (classes.some((x) => x.date === day && Date.parse(x.endsAt) > now)) return day;
      return (
        classes
          .map((x) => x.date)
          .filter((d) => d > day)
          .sort()[0] ?? day
      );
    },
    setDay: (d: string) => set({ day: d }),
    setView: (v: CalendarView) => set({ view: v === "week" ? null : "day" }),
    /**
     * Otra semana, el mismo día de la semana que se está viendo (`from`, el que dio `dayOf`): el
     * miércoles sigue siendo miércoles.
     */
    goWeek: (otherMonday: string, from = day) =>
      set({ day: addDays(otherMonday, (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7) }),
    goToday: () => set({ day: null }),
    /** Desde la cabecera de la semana: ese día, en la vista de día. */
    openDay: (d: string) => set({ day: d, view: "day" }),
  };
}

/** Semana anterior y siguiente, con su nombre ("Esta semana") y la vuelta a hoy. */
export function WeekNav({
  monday,
  today,
  onWeek,
  onToday,
}: {
  monday: string;
  today: string;
  /** El lunes de la semana a la que se va. */
  onWeek: (monday: string) => void;
  onToday: () => void;
}) {
  const t = useT("fitness.common.calendar");
  const intl = useIntl();
  const current = mondayOf(today);
  const short = (d: string) =>
    intl.formatDate(new Date(`${d}T12:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const when =
    monday === current
      ? "current"
      : monday === addDays(current, 7)
        ? "next"
        : monday === addDays(current, -7)
          ? "previous"
          : "other";
  return (
    <div className="flex items-center gap-1">
      <IconButton label={t("prev")} onClick={() => onWeek(addDays(monday, -7))}>
        <Icon.ArrowLeft size={20} aria-hidden="true" />
      </IconButton>
      <div className="flex min-w-36 flex-col items-center px-1 text-center" aria-live="polite">
        <span className="font-semibold text-ink">{t("weekOf", { day: short(monday) })}</span>
        <span className="text-label text-muted">
          {t("range", { when, to: short(addDays(monday, 6)) })}
        </span>
      </div>
      <IconButton label={t("next")} onClick={() => onWeek(addDays(monday, 7))}>
        <Icon.ArrowRight size={20} aria-hidden="true" />
      </IconButton>
      {monday !== current ? (
        <Button variant="tertiary" size="sm" onClick={onToday}>
          {t("today")}
        </Button>
      ) : null}
    </div>
  );
}

/** Semana o día, solo donde caben las dos (escritorio). */
export function ViewToggle({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  const t = useT("fitness.common.calendar");
  return (
    <Segmented<CalendarView>
      label={t("view")}
      value={view}
      onChange={onChange}
      options={[
        { key: "week", label: t("week"), icon: <Icon.Rows size={16} aria-hidden="true" /> },
        { key: "day", label: t("day"), icon: <Icon.CalendarBlank size={16} aria-hidden="true" /> },
      ]}
    />
  );
}

/** Las disciplinas de unas clases, para filtrar (solo si hay más de una). */
export function useSections(classes: readonly ClassSummary[], selected: string | null) {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of classes) if (cls.section) map.set(cls.section.id, cls.section.name);
    const list = [...map].map(([id, name]) => ({ id, name }));
    return { list, selected: list.some((x) => x.id === selected) ? selected : null };
  }, [classes, selected]);
}

const ALL = "all";

/** Disciplina: todas o una. */
export function SectionFilter({
  sections,
  value,
  onChange,
}: {
  sections: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useT("fitness.common.calendar");
  if (sections.length < 2) return null;
  return (
    <Segmented<string>
      label={t("sections")}
      value={value ?? ALL}
      onChange={(key) => onChange(key === ALL ? null : key)}
      options={[
        { key: ALL, label: t("allSections") },
        ...sections.map((x) => ({ key: x.id, label: x.name })),
      ]}
    />
  );
}

/**
 * Los siete días de la semana para elegir uno (vista de día), pegados arriba al desplazarse. Cabe
 * entera en un móvil; hoy lleva aro y el elegido, el color del club. `marked`: un punto debajo (el
 * día tiene algo tuyo).
 */
export function WeekStrip({
  days,
  selected,
  today,
  onSelect,
  marked,
  empty,
}: {
  days: string[];
  selected: string;
  today: string;
  onSelect: (day: string) => void;
  marked?: (day: string) => boolean;
  /** Días sin ninguna clase: el número va apagado. */
  empty?: (day: string) => boolean;
}) {
  const t = useT("fitness.common.calendar");
  const time = useClassTime();
  return (
    <div className="sticky top-16 z-20 -mx-5 bg-page px-5 py-2 lg:top-0 lg:-mx-8 lg:px-8">
      <div role="tablist" aria-label={t("days")} className="grid grid-cols-7 gap-1 lg:max-w-xl">
        {days.map((day) => {
          const active = day === selected;
          const [weekday, number] = time.weekday(day, "short").split(" ");
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={time.day(day)}
              onClick={() => onSelect(day)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-field py-1.5 transition-colors ${
                active
                  ? "bg-club text-on-club"
                  : `bg-surface hover:bg-raised ${isToday ? "text-club-text ring-1 ring-club-text ring-inset" : "text-ink"}`
              }`}
            >
              <span className="text-label uppercase">
                {isToday ? t("today") : (weekday ?? "").replace(/[.,]/g, "")}
              </span>
              <span
                className={`font-mono text-body font-semibold ${!active && empty?.(day) ? "text-muted" : ""}`}
              >
                {number ?? day.slice(8)}
              </span>
              <span
                aria-hidden="true"
                className={`size-1 rounded-full ${
                  marked?.(day) ? (active ? "bg-on-club" : "bg-club-text") : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** El sitio de una clase en el calendario. */
export interface PlacedClass {
  cls: ClassSummary;
  /** Ya terminó, está en marcha. */
  past: boolean;
  live: boolean;
}

/**
 * La rejilla: una columna por día y las horas en vertical, de la primera clase a la última de lo
 * que se enseña. `renderBlock` pinta cada clase y ocupa todo su hueco.
 */
export function ClassCalendar({
  view,
  days,
  classes,
  today,
  label,
  renderBlock,
  onOpenDay,
}: {
  view: CalendarView;
  days: string[];
  classes: ClassSummary[];
  today: string;
  label: string;
  renderBlock: (placed: PlacedClass) => ReactNode;
  /** Semana: tocar la cabecera de un día lo abre en la vista de día. */
  onOpenDay?: (day: string) => void;
}) {
  const t = useT("fitness.common.calendar");
  const intl = useIntl();
  const time = useClassTime();
  const now = useNow();
  const zone = time.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const size = SIZES[view];

  const spanOf = useMemo(
    () => (cls: ClassSummary) => {
      const start = minutesOfDay(zone, new Date(cls.startsAt));
      const minutes = (Date.parse(cls.endsAt) - Date.parse(cls.startsAt)) / 60_000;
      return { start, end: Math.min(24 * 60, start + Math.max(20, minutes)) };
    },
    [zone],
  );
  const timeline = useMemo(
    () =>
      buildTimeline(classes.map(spanOf), {
        hourHeight: size.hourHeight,
        gapHeight: size.gapHeight,
        minGapHours: 2,
        fallback: [7, 21],
      }),
    [classes, spanOf, size.hourHeight, size.gapHeight],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, ClassSummary[]>();
    for (const cls of [...classes].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      map.set(cls.date, [...(map.get(cls.date) ?? []), cls]);
    }
    return map;
  }, [classes]);

  const hourLabel = (hour: number) =>
    intl.formatTime(new Date(Date.UTC(2000, 0, 1, hour)), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  const nowMinute = minutesOfDay(zone, new Date(now));
  const first = timeline.segments[0];
  const last = timeline.segments.at(-1);
  const showNow =
    days.includes(today) && first && last && nowMinute >= first.from && nowMinute <= last.to;
  const columns = { gridTemplateColumns: `${size.gutter} repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <section aria-label={label} className="rounded-card border border-border bg-surface">
      {view === "week" ? (
        <div
          className="sticky top-0 z-20 grid rounded-t-card border-b border-line bg-surface"
          style={columns}
        >
          <span aria-hidden="true" />
          {days.map((day) => {
            const [weekday, number] = time.weekday(day, "short").split(" ");
            const isToday = day === today;
            const head = (
              <>
                <span
                  className={`text-label uppercase ${isToday ? "text-club-text" : "text-muted"}`}
                >
                  {(weekday ?? "").replace(/[.,]/g, "")}
                </span>
                <span
                  className={`inline-flex size-8 items-center justify-center rounded-full font-mono text-title2 ${
                    isToday ? "bg-club text-on-club" : "text-ink"
                  }`}
                >
                  {number ?? day.slice(8)}
                </span>
              </>
            );
            return onOpenDay ? (
              <button
                key={day}
                type="button"
                onClick={() => onOpenDay(day)}
                aria-label={t("openDay", { day: time.day(day) })}
                className="flex min-h-11 flex-col items-center gap-0.5 border-l border-line py-2 transition-colors hover:bg-raised"
              >
                {head}
              </button>
            ) : (
              <div
                key={day}
                className="flex flex-col items-center gap-0.5 border-l border-line py-2"
              >
                {head}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="relative grid" style={{ ...columns, height: timeline.height + 1 }}>
        {/* Horas: etiqueta en el canal y línea fina a lo ancho. */}
        {timeline.hours.map(({ hour, top }) => (
          <div
            key={hour}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 flex border-t border-line"
            style={{ top }}
          >
            <span
              className="shrink-0 pt-1 pr-2 text-right font-mono text-label text-muted"
              style={{ width: size.gutter }}
            >
              {hourLabel(hour)}
            </span>
          </div>
        ))}
        {/* Huecos plegados: horas seguidas sin ninguna clase. */}
        {timeline.segments
          .filter((s) => s.collapsed)
          .map((s) => (
            <div
              key={s.from}
              className="pointer-events-none absolute inset-x-0 flex items-center border-y border-dashed border-control bg-raised"
              style={{ top: s.top, height: s.height }}
            >
              <span className="shrink-0" style={{ width: size.gutter }} aria-hidden="true" />
              <span className="truncate text-label text-muted">
                {t("gap", { from: hourLabel(s.from / 60), to: hourLabel(s.to / 60) })}
              </span>
            </div>
          ))}

        {/* El canal de las horas; ahora, en una píldora a su altura. */}
        <div aria-hidden="true" className="relative">
          {showNow ? (
            <span
              className="absolute right-1 -translate-y-1/2 rounded-full bg-club px-1.5 font-mono text-label text-on-club"
              style={{ top: timeline.y(nowMinute) }}
            >
              {time.hour(new Date(now).toISOString())}
            </span>
          ) : null}
        </div>
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const laid = layoutColumns(list.map((cls) => ({ cls, ...spanOf(cls) })));
          return (
            <ol key={day} aria-label={time.day(day)} className="relative border-l border-line">
              {list.length === 0 && view === "day" ? (
                <li className="absolute inset-x-0 top-6 text-center text-secondary text-muted">
                  {t("noClassesDay")}
                </li>
              ) : null}
              {/* Ahora: una línea por debajo de las clases, que no tacha la que está en marcha. */}
              {showNow && day === today ? (
                <li
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 flex items-center"
                  style={{ top: timeline.y(nowMinute) - 1 }}
                >
                  <span className="-ml-1 size-2 shrink-0 rounded-full bg-club" />
                  <span className="h-0.5 flex-1 bg-club" />
                </li>
              ) : null}
              {laid.map(({ item, column, columns: count }) => {
                const top = timeline.y(item.start);
                const height = Math.max(timeline.y(item.end) - top, 22);
                const past = Date.parse(item.cls.endsAt) <= now;
                const live = !past && Date.parse(item.cls.startsAt) <= now;
                return (
                  <li
                    key={item.cls.id}
                    data-class-id={item.cls.id}
                    className="absolute flex p-0.5"
                    style={{
                      top,
                      height,
                      left: `${(column / count) * 100}%`,
                      width: `${100 / count}%`,
                    }}
                  >
                    {renderBlock({ cls: item.cls, past, live })}
                  </li>
                );
              })}
            </ol>
          );
        })}
      </div>
    </section>
  );
}

/**
 * El color de una clase dice qué puedes hacer con ella, nunca de qué tipo es (DESIGN.md 3.5), en
 * tres niveles que se leen con cualquier color de club: rellena, la tuya; blanca con borde, la que
 * está abierta; gris y plana, la que ya pasó o no se puede reservar. La espera, en aviso. Siempre
 * con su texto al lado.
 */
export type BlockTone = "mine" | "open" | "waiting" | "done" | "missed" | "muted";

const BLOCK_TONE: Record<BlockTone, string> = {
  mine: "bg-club text-on-club border-club-edge",
  open: "bg-surface text-ink border border-control border-l-club",
  waiting: "bg-warning-soft text-warning border-warning",
  done: "bg-success-soft text-success border-success",
  missed: "bg-danger-soft text-danger border-danger",
  muted: "bg-raised text-muted border-control",
};

/** Lo que pone una clase en el calendario, según la vista: denso en la semana, holgado en el día. */
export function ClassBlock({
  view,
  tone,
  live,
  dim = false,
  title,
  when,
  meta,
  status,
  detail,
  icon,
  iconOnlyWhenNarrow = false,
  aside,
  marker,
  label,
  ...target
}: {
  view: CalendarView;
  tone: BlockTone;
  live: boolean;
  /** Ya pasó: se ve, pero apagada. */
  dim?: boolean;
  title: string;
  /** Hora: el inicio en la semana, el tramo en el día. */
  when: string;
  /** Coach y sala. En la semana, solo si la clase tiene ancho. */
  meta: string | null;
  /** La línea de estado: plazas, tu reserva, el check-in o por qué no se puede. */
  status: string;
  /** Lo que sigue al estado si hay sitio ("check-in", "· 2 en espera"). */
  detail?: string | undefined;
  icon?: ReactNode;
  /** En la semana y sin ancho, solo el icono (tu reserva: relleno y marca bastan). */
  iconOnlyWhenNarrow?: boolean;
  /** En el día, arriba a la derecha (la cifra de plazas). */
  aside?: ReactNode;
  /**
   * Junto al nombre, lo que hay que ver de un vistazo (sin WOD, cuántos con plan propio: ADR 0055).
   * Siempre con su texto en `label`: un icono solo no basta.
   */
  marker?: ReactNode;
  /** Todo lo de la clase, para el lector de pantalla y el ratón. */
  label: string;
} & ({ to: string } | { onClick: () => void })) {
  const week = view === "week";
  const className = `@container flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[6px] border-l-[3px] text-left no-underline transition-[filter] hover:brightness-95 ${BLOCK_TONE[tone]} ${
    live ? "ring-2 ring-club ring-offset-1 ring-offset-surface" : ""
  } ${dim ? "opacity-60" : ""} ${week ? "px-1.5 py-1" : "gap-0.5 px-3 py-1.5"}`;
  const accent = tone === "open" ? "text-club-text" : "";
  const statusLine =
    status || icon ? (
      <span className={`flex min-w-0 items-center gap-1 ${accent}`}>
        {icon}
        <span
          className={`truncate ${week && iconOnlyWhenNarrow ? "hidden @min-[5.5rem]:inline" : ""}`}
        >
          {status}
          {detail ? (
            <span className={week ? "hidden @min-[7rem]:inline" : ""}> {detail}</span>
          ) : null}
        </span>
      </span>
    ) : null;
  const body = week ? (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-label font-semibold">{title}</span>
        {/* Sin ancho, antes el nombre: la marca sigue en la etiqueta y el tooltip. */}
        {marker ? (
          <span
            aria-hidden="true"
            className="hidden shrink-0 items-center gap-1 text-label @min-[6rem]:flex"
          >
            {marker}
          </span>
        ) : null}
      </span>
      <span className="truncate text-label">
        <span className="font-mono">{when}</span>
        {meta ? <span className="hidden opacity-80 @min-[6.5rem]:inline"> · {meta}</span> : null}
      </span>
      <span className="text-label">{statusLine}</span>
    </>
  ) : (
    <>
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body font-semibold">{title}</span>
          {marker ? (
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 text-secondary">
              {marker}
            </span>
          ) : null}
        </span>
        {aside ? <span className="shrink-0">{aside}</span> : null}
      </span>
      <span className="truncate text-secondary">
        <span className="font-mono">{when}</span>
        {meta ? <span className="opacity-80"> · {meta}</span> : null}
      </span>
      <span className="text-secondary">{statusLine}</span>
    </>
  );
  if ("to" in target) {
    return (
      <Link to={target.to} aria-label={label} title={label} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={target.onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      {body}
    </button>
  );
}

/** La muestra de un tono, para la leyenda. */
export function ToneSwatch({ tone }: { tone: BlockTone }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3.5 w-5 shrink-0 rounded-[3px] border-l-[3px] ${BLOCK_TONE[tone]}`}
    />
  );
}
