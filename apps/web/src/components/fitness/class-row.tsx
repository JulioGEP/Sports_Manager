import type { BookingStatus, ClassSummary } from "@sportsmanager/shared";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { FacePile, ownPeople } from "@/components/fitness/class-programming";
import { useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Icon, StatusChip, type StatusKind } from "@/ui";

/** Color de cada estado de reserva (DESIGN.md 0.5): la reserva en el del club, la espera en aviso. */
export const BOOKING_TONE: Record<BookingStatus, StatusKind> = {
  booked: "club",
  waitlist: "warning",
  attended: "success",
  no_show: "danger",
  late_cancel: "danger",
  cancelled: "neutral",
};

/**
 * Plazas ocupadas sobre el aforo, siempre con la cifra al lado (DESIGN.md 0.5). `inline`: en una
 * línea, para el móvil, debajo del nombre de la clase.
 */
export function SpotsMeter({
  cls,
  inline = false,
}: {
  cls: Pick<ClassSummary, "booked" | "capacity" | "waitlist">;
  inline?: boolean;
}) {
  const t = useT("fitness.common.spots");
  if (cls.capacity === null) return <span className="text-secondary text-muted">{t("open")}</span>;
  const pct = Math.min(100, Math.round((cls.booked / cls.capacity) * 100));
  const full = cls.booked >= cls.capacity;
  const figure = (
    <span className={`font-mono text-secondary ${full ? "text-danger" : "text-ink"}`}>
      {t("of", { booked: cls.booked, capacity: cls.capacity })}
    </span>
  );
  const bar = (
    <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <span
        className={`block h-full rounded-full ${full ? "bg-danger" : "bg-club"}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
  const waiting =
    cls.waitlist > 0 ? (
      <span className="shrink-0 text-label text-warning">
        {t("waitlist", { count: cls.waitlist })}
      </span>
    ) : null;
  if (inline)
    return (
      <span className="flex max-w-56 items-center gap-2">
        {figure}
        {bar}
        {waiting}
      </span>
    );
  return (
    <span className="flex min-w-24 flex-col items-end gap-1">
      {figure}
      {bar}
      {waiting}
    </span>
  );
}

/**
 * Una clase en una lista (ADR 0049): la hora manda, luego el tipo de clase y el coach, las plazas y
 * la reserva propia. Con `to`, toda la fila abre la clase; `trailing` pone la acción (reservar).
 */
export function ClassRow({
  cls,
  to,
  trailing,
  showMine = true,
}: {
  cls: ClassSummary;
  to?: string | undefined;
  trailing?: ReactNode;
  showMine?: boolean;
}) {
  const time = useClassTime();
  const c = useT("fitness.common");
  const status = useT("fitness.common.bookingStatus");
  const p = useT("fitness.staff.inClasses");
  const past = Date.parse(cls.endsAt) < Date.now();
  // Para el personal (ADR 0057): su WOD, quién viene y cuántos con plan propio.
  const programming = cls.programming;
  const own = programming ? ownPeople(programming.people).length : 0;
  const body = (
    <>
      <span className="flex w-14 shrink-0 flex-col">
        <span className="font-mono text-body font-semibold text-ink">
          {time.hour(cls.startsAt)}
        </span>
        <span className="font-mono text-label text-muted">{time.hour(cls.endsAt)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-ink">{cls.team?.name ?? cls.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-secondary text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon.UserCircle size={14} aria-hidden="true" />
            {cls.coach ? cls.coach.name.split(" ")[0] : c("noCoach")}
          </span>
          {cls.facility ? (
            <span className="inline-flex items-center gap-1">
              <Icon.MapPin size={14} aria-hidden="true" />
              {cls.facility.name}
            </span>
          ) : null}
          {programming && cls.section && !programming.workoutId && !past ? (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <Icon.Warning size={14} aria-hidden="true" />
              {p("noWod")}
            </span>
          ) : programming?.workoutId && !cls.hasWorkout ? (
            <span className="inline-flex items-center gap-1">
              <Icon.Barbell size={14} aria-hidden="true" />
              {p("draftWod")}
            </span>
          ) : cls.hasWorkout ? (
            <span className="inline-flex items-center gap-1">
              <Icon.Barbell size={14} aria-hidden="true" />
              WOD
            </span>
          ) : null}
          {own > 0 ? (
            <span className="inline-flex items-center gap-1 text-club-text">
              <Icon.Target size={14} aria-hidden="true" />
              {p("withOwn", { count: own })}
            </span>
          ) : null}
        </span>
        <span className="sm:hidden">
          <SpotsMeter cls={cls} inline />
        </span>
        {showMine && cls.my && cls.my.status !== "cancelled" ? (
          <span>
            <StatusChip kind={BOOKING_TONE[cls.my.status]}>
              {cls.my.status === "waitlist" && cls.my.position
                ? `${status("waitlist")} · ${cls.my.position}`
                : status(cls.my.status)}
            </StatusChip>
          </span>
        ) : null}
      </span>
      <span className="hidden items-center gap-4 sm:flex">
        {programming ? <FacePile people={programming.people} max={5} size="xs" /> : null}
        <SpotsMeter cls={cls} />
      </span>
    </>
  );
  return (
    <li
      className={`flex min-h-18 items-center gap-3 px-5 py-3 ${past ? "opacity-60" : ""}`}
      data-class-id={cls.id}
    >
      {to ? (
        <Link
          to={to}
          className="flex min-w-0 flex-1 items-start gap-3 text-inherit no-underline sm:items-center"
        >
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">{body}</span>
      )}
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </li>
  );
}

/** Tira de días para elegir (hoy y los siguientes), en móvil se desliza en horizontal. */
export function DayStrip({
  days,
  selected,
  onSelect,
  label,
}: {
  days: string[];
  selected: string;
  onSelect: (day: string) => void;
  label: string;
}) {
  const time = useClassTime();
  const c = useT("fitness.common");
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {days.map((day) => {
        const active = day === selected;
        const [weekday, number] = time.weekday(day, "short").split(" ");
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(day)}
            className={`flex min-w-14 shrink-0 flex-col items-center rounded-field px-3 py-2 ${
              active ? "bg-club text-on-club" : "bg-surface text-ink shadow-card hover:bg-raised"
            }`}
          >
            <span className="text-label uppercase">
              {day === time.today ? c("today") : (weekday ?? "").replace(/[.,]/g, "")}
            </span>
            <span className="font-mono text-title3">{number ?? day.slice(8)}</span>
          </button>
        );
      })}
    </div>
  );
}
