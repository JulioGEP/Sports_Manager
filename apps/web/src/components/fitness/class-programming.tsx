import type { ClassPerson, ClassSummary, PlanSummary, WorkoutView } from "@sportsmanager/shared";
import { useIntl } from "react-intl";
import { Link } from "react-router";
import { useWorkoutName } from "@/components/fitness/programming-week";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Avatar, Icon, StatusChip, type StatusKind } from "@/ui";

/**
 * La programación dentro de las clases (ADR 0055): quién viene a cada clase, quién de ellos hace la
 * sesión de su plan propio en vez del WOD del box y en qué clases se hace cada WOD. Piezas comunes
 * de Programación, Clases y la ficha de la clase.
 */

/** Quien viene a hacer su plan propio: con plaza y sin falta. */
export function ownPeople(people: readonly ClassPerson[]): ClassPerson[] {
  return people.filter((p) => p.ownPlan && p.status !== "no_show");
}

/** Las personas de unas clases, una vez cada una (quien reserva dos clases el mismo día, una). */
export function peopleOf(classes: readonly ClassSummary[]): ClassPerson[] {
  const seen = new Map<string, ClassPerson>();
  for (const cls of classes)
    for (const p of cls.programming?.people ?? [])
      if (!seen.has(p.playerId)) seen.set(p.playerId, p);
  return [...seen.values()];
}

/** La semana del plan en que cae un día, o nula fuera de él. */
export function planWeekOf(plan: Pick<PlanSummary, "startsOn" | "weeks">, date: string) {
  const n =
    Math.floor(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${plan.startsOn}T00:00:00Z`)) /
        (7 * 86_400_000),
    ) + 1;
  return n >= 1 && n <= plan.weeks ? n : null;
}

/** Cómo está la sesión de un plan propio, en femenino y sin chocar con el estado del WOD. */
export function useSessionState() {
  const t = useT("fitness.staff.inClasses.session");
  const time = useClassTime();
  return (
    w: Pick<WorkoutView, "status" | "visible" | "publishAt">,
  ): {
    kind: StatusKind;
    label: string;
  } =>
    w.status === "draft"
      ? { kind: "warning", label: t("draft") }
      : !w.visible && w.publishAt
        ? { kind: "info", label: t("scheduled", { when: time.when(w.publishAt) }) }
        : { kind: "success", label: t("published") };
}

/**
 * Caras de quien viene, solapadas: las primeras `max` y "+N". Quien sigue un plan propio lleva aro
 * del color del club y quien no vino va apagado; la etiqueta lo dice con palabras.
 */
export function FacePile({
  people,
  max = 5,
  size = "sm",
}: {
  people: readonly ClassPerson[];
  max?: number;
  size?: "xs" | "sm";
}) {
  const t = useT("fitness.staff.inClasses");
  const intl = useIntl();
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const own = ownPeople(people).length;
  const label = [
    intl.formatList(
      [...shown.map((p) => p.name), ...(rest > 0 ? [t("more", { count: rest })] : [])],
      {
        type: "conjunction",
      },
    ),
    own > 0 ? t("withOwn", { count: own }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Solapadas lo justo para que las iniciales de cada cara se lean enteras.
  const overlap = size === "xs" ? "-ml-1" : "-ml-1.5";
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0 items-center">
      {shown.map((p) => (
        <span
          key={p.playerId}
          className={`${overlap} inline-flex rounded-full ring-2 first:ml-0 ${
            p.ownPlan ? "ring-club" : "ring-surface"
          } ${p.status === "no_show" ? "opacity-50" : ""}`}
        >
          <Avatar name={p.name} src={p.photoUrl} size={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          aria-hidden="true"
          className={`${overlap} inline-grid place-items-center rounded-full bg-raised font-mono text-label text-muted ring-2 ring-surface ${
            size === "xs" ? "size-7" : "size-8"
          }`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/** Cuántos vienen y cuántos con plan propio, en una línea con su icono. */
export function PeopleLine({ booked, own }: { booked: number; own: number }) {
  const t = useT("fitness.staff.inClasses");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-muted">
      <span className="inline-flex items-center gap-1">
        <Icon.Users size={16} aria-hidden="true" />
        {t("booked", { count: booked })}
      </span>
      {own > 0 ? (
        <span className="inline-flex items-center gap-1 text-club-text">
          <Icon.Target size={16} aria-hidden="true" />
          {t("withOwn", { count: own })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Las clases en que se hace un WOD (ADR 0055), debajo de su tarjeta en la semana: cuántas son,
 * cuánta gente viene, sus caras y una pastilla por clase con su hora y sus plazas que la abre.
 */
export function WodClasses({ classes }: { classes: readonly ClassSummary[] }) {
  const t = useT("fitness.staff.inClasses");
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  if (classes.length === 0) return null;
  const people = peopleOf(classes);
  const booked = classes.reduce((sum, cls) => sum + cls.booked, 0);
  return (
    <div className="relative z-10 flex flex-col gap-2.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-secondary font-medium text-ink">
            {t("classes", { count: classes.length })}
          </span>
          <PeopleLine booked={booked} own={ownPeople(people).length} />
        </span>
        <FacePile people={people} max={7} />
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {[...classes]
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((cls) => {
            const own = ownPeople(cls.programming?.people ?? []).length;
            const full = cls.capacity !== null && cls.booked >= cls.capacity;
            const hour = time.hour(cls.startsAt);
            return (
              <li key={cls.id}>
                <Link
                  to={paths.classDetail(cls.id)}
                  aria-label={t(cls.capacity === null ? "chipOpen" : "chip", {
                    hour,
                    booked: cls.booked,
                    capacity: cls.capacity ?? 0,
                    own,
                  })}
                  className="inline-flex min-h-12 items-center gap-2 rounded-chip border border-line bg-surface px-3 text-secondary text-ink no-underline transition-colors hover:bg-raised lg:min-h-11"
                >
                  <span className="font-mono font-semibold">{hour}</span>
                  <span className={`font-mono ${full ? "text-danger" : "text-muted"}`}>
                    {cls.capacity === null ? cls.booked : `${cls.booked}/${cls.capacity}`}
                  </span>
                  {own > 0 ? (
                    <span className="inline-flex items-center gap-0.5 font-mono text-club-text">
                      <Icon.Target size={14} aria-hidden="true" />
                      {own}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

/** Un plan propio en un día: su sesión (si la hay) y quién de su gente viene a clase. */
export interface OwnPlanDay {
  plan: Pick<PlanSummary, "id" | "name" | "members" | "startsOn" | "weeks">;
  session: WorkoutView | null;
  inClass: ClassPerson[];
}

/**
 * Los planes propios de un día (ADR 0055), debajo del WOD del box: cada uno con su sesión y su
 * estado, y quién de su gente viene a clase ese día. La fila abre la semana del plan, donde se
 * escribe y se publica la sesión.
 */
export function OwnPlansOfDay({ date, rows }: { date: string; rows: readonly OwnPlanDay[] }) {
  const t = useT("fitness.staff.inClasses");
  const nameOf = useWorkoutName();
  const stateOf = useSessionState();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={t("ownTitle")}
      className="flex flex-col gap-1 rounded-card border border-dashed border-control bg-surface p-2"
    >
      <h3 className="flex items-center gap-1.5 px-2 pt-1 text-label uppercase tracking-wide text-muted">
        <Icon.Target size={14} aria-hidden="true" />
        {t("ownTitle")}
      </h3>
      <ul className="flex flex-col">
        {rows.map(({ plan, session, inClass }) => {
          const week = session?.plan?.week ?? planWeekOf(plan, date);
          const state = session ? stateOf(session) : null;
          return (
            <li key={plan.id}>
              <Link
                to={week ? paths.planningWeek(plan.id, week) : paths.planningPlan(plan.id)}
                aria-label={t("ownOpen", { plan: plan.name })}
                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-field px-2 py-2 text-inherit no-underline transition-colors hover:bg-raised"
              >
                <span className="flex min-w-0 flex-1 basis-56 flex-col">
                  <span className="truncate font-medium text-ink">{plan.name}</span>
                  <span className="truncate text-secondary text-muted">
                    {session ? t("session.title", { title: nameOf(session) }) : t("session.none")}
                  </span>
                </span>
                {state ? <StatusChip kind={state.kind}>{state.label}</StatusChip> : null}
                <span className="flex items-center gap-2">
                  <FacePile people={inClass} max={4} size="xs" />
                  <span className="font-mono text-secondary text-muted">
                    {t("inClass", { count: inClass.length, members: plan.members })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Quién hace qué en una clase (ADR 0055): cuántos hacen el WOD del box y cuántos la sesión de su
 * plan propio, con una barra partida y las dos cifras al lado.
 */
export function ProgrammingSplit({ box, own }: { box: number; own: number }) {
  const t = useT("fitness.staff.inClasses.split");
  const total = box + own;
  if (total === 0) return null;
  const pct = Math.round((box / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      {/* El WOD del box en neutro y el plan propio en el color del club, con un corte entre los
          dos: se distinguen también con un club oscuro. */}
      <span aria-hidden="true" className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {box > 0 ? <span className="h-full bg-control" style={{ width: `${pct}%` }} /> : null}
        {own > 0 ? <span className="h-full flex-1 bg-club" /> : null}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-secondary">
        <span className="inline-flex items-center gap-1.5 text-ink">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-control" />
          {t("box", { count: box })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-club-text">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-club" />
          {t("own", { count: own })}
        </span>
      </span>
    </div>
  );
}
