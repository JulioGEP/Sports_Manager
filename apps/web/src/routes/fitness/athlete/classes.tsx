import type { ClassSummary } from "@sportsmanager/shared";
import { useMemo, useState } from "react";
import { BookingButton, PlanLine, useBookingActions } from "@/components/fitness/athlete-ui";
import {
  ClassBlock,
  ClassCalendar,
  SectionFilter,
  ToneSwatch,
  ViewToggle,
  WeekNav,
  WeekStrip,
  useCalendarState,
  useSections,
  type BlockTone,
  type PlacedClass,
} from "@/components/fitness/class-calendar";
import { BOOKING_TONE, SpotsMeter } from "@/components/fitness/class-row";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, useClassTime, useClasses } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  ButtonLink,
  Card,
  Definitions,
  EmptyState,
  Icon,
  PageHeader,
  Sheet,
  StatusChip,
} from "@/ui";

/** Lo que el atleta tiene en una clase (sin contar lo cancelado). */
const mineOf = (cls: ClassSummary) =>
  cls.my && cls.my.status !== "cancelled" ? cls.my.status : null;

/**
 * Reservar (ADR 0049, en calendario desde ADR 0051): la semana con cada clase en su hora y su
 * color según lo que puedes hacer en ella. Tocar una clase abre su panel con las plazas, el coach
 * y el botón de reservar, sin perder la semana de vista.
 */
export function AthleteClassesPage() {
  const t = useT("fitness.athlete.classes");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const state = useCalendarState();
  const classes = useClasses(dayRange(time.timezone, state.monday, 7));
  const actions = useBookingActions();
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => classes.data?.classes ?? [], [classes.data]);
  const policy = classes.data?.policy;
  // La disciplina filtra en escritorio, donde la semana entera se ve de golpe.
  const sections = useSections(all, state.desktop ? state.params.get("section") : null);
  const week = useMemo(
    () => (sections.selected ? all.filter((x) => x.section?.id === sections.selected) : all),
    [all, sections.selected],
  );
  const day = state.dayOf(week);
  const shown = state.view === "week" ? week : week.filter((x) => x.date === day);
  const mineThisWeek = all.filter((x) => {
    const mine = mineOf(x);
    return mine === "booked" || mine === "waitlist";
  }).length;
  // Siempre la versión fresca: tras reservar, la lista se recarga y el panel lo refleja.
  const selected = all.find((x) => x.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        description={policy ? t("description", { days: policy.opensDaysBefore }) : undefined}
      />

      {classes.data && !classes.data.plan ? (
        <Alert
          kind="info"
          title={t("noPlanTitle")}
          actions={
            <ButtonLink action="open" to={paths.myPlan} variant="secondary" size="sm">
              {t("noPlanAction")}
            </ButtonLink>
          }
        >
          {t("noPlanBody")}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav
          monday={state.monday}
          today={state.today}
          onWeek={(monday) => state.goWeek(monday, day)}
          onToday={state.goToday}
        />
        {state.desktop ? (
          <div className="flex flex-wrap items-center gap-2">
            <SectionFilter
              sections={sections.list}
              value={sections.selected}
              onChange={(id) => state.set({ section: id })}
            />
            <ViewToggle view={state.view} onChange={state.setView} />
          </div>
        ) : null}
      </div>

      {classes.data ? (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          {classes.data.plan ? (
            <div className="min-w-0 max-w-md">
              <PlanLine plan={classes.data.plan} compact />
            </div>
          ) : null}
          <span className="text-secondary text-muted">
            {t("mineThisWeek", { count: mineThisWeek })}
          </span>
        </div>
      ) : null}

      {classes.isPending ? (
        <div className="h-[32rem] animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : classes.isError ? (
        <Alert kind="error">{errors("unknown")}</Alert>
      ) : week.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyHint")}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            {state.view === "day" ? (
              <WeekStrip
                days={state.week}
                selected={day}
                today={state.today}
                onSelect={state.setDay}
                marked={(d) => all.some((x) => x.date === d && mineOf(x) !== null)}
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
                <AthleteBlock placed={placed} view={state.view} onOpen={setOpenId} />
              )}
            />
          </div>
          <Legend />
        </div>
      )}

      {policy ? (
        <p className="text-secondary text-muted">
          {t("policy", { hours: policy.cancelHoursBefore })}
        </p>
      ) : null}

      <ClassSheet
        cls={selected}
        onClose={() => setOpenId(null)}
        actions={actions}
        detailTo={selected ? paths.classDetail(selected.id) : ""}
      />
    </div>
  );
}

/**
 * Qué pasa con una clase para el atleta: su tono y la línea de estado, corta (el motivo largo va en
 * el panel y en la etiqueta para el lector de pantalla).
 */
function useAthleteStatus() {
  const status = useT("fitness.common.bookingStatus");
  const spots = useT("fitness.common.spots");
  const cal = useT("fitness.common.calendar");
  return (cls: ClassSummary, past: boolean): { tone: BlockTone; text: string } => {
    const mine = mineOf(cls);
    if (mine === "attended") return { tone: "done", text: status("attended") };
    if (mine === "no_show" || mine === "late_cancel") return { tone: "missed", text: status(mine) };
    if (mine === "booked") return { tone: "mine", text: status("booked") };
    if (mine === "waitlist")
      return {
        tone: "waiting",
        text: cls.my?.position ? `${status("waitlist")} · ${cls.my.position}` : status("waitlist"),
      };
    if (past) return { tone: "muted", text: "" };
    if (cls.action === "book")
      return {
        tone: "open",
        text:
          cls.capacity === null
            ? spots("open")
            : cal("left", { count: Math.max(0, cls.capacity - cls.booked) }),
      };
    if (cls.action === "waitlist") return { tone: "open", text: cal("waitlistOpen") };
    if (cls.block && cls.block !== "already_booked")
      return { tone: "muted", text: cal(`blockShort.${cls.block}`) };
    return { tone: "muted", text: "" };
  };
}

function AthleteBlock({
  placed: { cls, past, live },
  view,
  onOpen,
}: {
  placed: PlacedClass;
  view: "week" | "day";
  onOpen: (id: string) => void;
}) {
  const time = useClassTime();
  const c = useT("fitness.common");
  const spots = useT("fitness.common.spots");
  const blocks = useT("fitness.common.block");
  const statusOf = useAthleteStatus();
  const { tone, text } = statusOf(cls, past);
  const title = cls.team?.name ?? cls.title;
  const coach = cls.coach ? (cls.coach.name.split(" ")[0] ?? cls.coach.name) : c("noCoach");
  const figure =
    cls.capacity === null ? null : spots("of", { booked: cls.booked, capacity: cls.capacity });
  const reason =
    !past && !mineOf(cls) && cls.action === null && cls.block && cls.block !== "already_booked"
      ? blocks(cls.block)
      : null;
  return (
    <ClassBlock
      view={view}
      tone={tone}
      live={live}
      dim={past}
      title={title}
      when={view === "week" ? time.hour(cls.startsAt) : time.range(cls.startsAt, cls.endsAt)}
      meta={view === "week" ? coach : [coach, cls.facility?.name].filter(Boolean).join(" · ")}
      status={text}
      icon={
        tone === "mine" ? <Icon.CheckCircle size={14} weight="fill" aria-hidden="true" /> : null
      }
      iconOnlyWhenNarrow
      aside={figure ? <span className="font-mono text-secondary">{figure}</span> : null}
      label={[
        title,
        time.day(cls.date),
        time.range(cls.startsAt, cls.endsAt),
        cls.coach?.name ?? c("noCoach"),
        figure,
        reason ?? text,
      ]
        .filter(Boolean)
        .join(", ")}
      onClick={() => onOpen(cls.id)}
    />
  );
}

/** Qué quiere decir cada color, una vez y debajo: el color nunca va solo, pero se lee antes. */
function Legend() {
  const t = useT("fitness.common.calendar.legend");
  const items: { tone: BlockTone; label: string }[] = [
    { tone: "mine", label: t("mine") },
    { tone: "open", label: t("open") },
    { tone: "waiting", label: t("waiting") },
    { tone: "muted", label: t("muted") },
  ];
  return (
    <ul aria-label={t("title")} className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map((item) => (
        <li key={item.tone} className="flex items-center gap-2 text-secondary text-muted">
          <ToneSwatch tone={item.tone} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * El panel de una clase: cuándo, con quién, cuántas plazas quedan, tu reserva y el botón para
 * reservar o cancelar. Para ver quién viene y el WOD, la ficha de la clase.
 */
function ClassSheet({
  cls,
  onClose,
  actions,
  detailTo,
}: {
  cls: ClassSummary | null;
  onClose: () => void;
  actions: ReturnType<typeof useBookingActions>;
  detailTo: string;
}) {
  const t = useT("fitness.athlete.class");
  const tc = useT("fitness.athlete.classes");
  const c = useT("fitness.common");
  const status = useT("fitness.common.bookingStatus");
  const blocks = useT("fitness.common.block");
  const time = useClassTime();
  const mine = cls ? mineOf(cls) : null;
  const started = cls ? Date.parse(cls.startsAt) <= Date.now() : false;
  const actionable =
    cls !== null &&
    (cls.action !== null || ((mine === "booked" || mine === "waitlist") && !started));
  return (
    <Sheet
      open={cls !== null}
      title={cls ? (cls.team?.name ?? cls.title) : ""}
      description={
        cls ? (
          <span className="first-letter:uppercase">
            {time.day(cls.date)} · {time.range(cls.startsAt, cls.endsAt)}
          </span>
        ) : null
      }
      onClose={onClose}
      closeLabel={c("close")}
      footer={
        cls ? (
          <>
            <ButtonLink action="open" to={detailTo} variant="secondary">
              {tc("seeClass")}
            </ButtonLink>
            {actionable ? <BookingButton cls={cls} actions={actions} size="md" /> : null}
          </>
        ) : null
      }
    >
      {cls ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            {mine && cls.my ? (
              <StatusChip kind={BOOKING_TONE[mine]}>
                {mine === "waitlist" && cls.my.position
                  ? t("position", { position: cls.my.position })
                  : status(mine)}
              </StatusChip>
            ) : (
              <span className="text-secondary text-muted">
                {cls.block && cls.block !== "already_booked" && !started
                  ? blocks(cls.block)
                  : t("notBooked")}
              </span>
            )}
            <SpotsMeter cls={cls} />
          </div>
          <Definitions
            items={[
              { term: t("coach"), detail: cls.coach?.name ?? c("noCoach") },
              ...(cls.facility ? [{ term: t("room"), detail: cls.facility.name }] : []),
              ...(cls.section ? [{ term: tc("discipline"), detail: cls.section.name }] : []),
              ...(!started && mine === "booked"
                ? [{ term: t("freeCancel"), detail: time.when(cls.freeCancelUntil) }]
                : []),
              ...(!started && !mine && cls.block === "not_open_yet"
                ? [{ term: t("opens"), detail: time.when(cls.opensAt) }]
                : []),
              { term: t("wod"), detail: cls.hasWorkout ? tc("wodReady") : t("noWod") },
            ]}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
