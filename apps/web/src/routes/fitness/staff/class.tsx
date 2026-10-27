import {
  BookingResultSchema,
  CancelResultSchema,
  ClassDetailResponseSchema,
  type Attendee,
  type ClassDetailResponse,
  type ClassPerson,
  type WorkoutBlockView,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FacePile,
  ProgrammingSplit,
  useSessionState,
} from "@/components/fitness/class-programming";
import { BOOKING_TONE, SpotsMeter } from "@/components/fitness/class-row";
import { RoleChip } from "@/components/fitness/planning-ui";
import { useWorkoutName, useWorkoutState } from "@/components/fitness/programming-week";
import {
  AthletePicker,
  Figure,
  RestrictionChip,
  useStaffError,
} from "@/components/fitness/staff-ui";
import { useMovementName, WorkoutBlocks } from "@/components/fitness/workout-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import {
  fitnessKey,
  useClassDetail,
  useClassTime,
  useInvalidateFitness,
  useKg,
  useLeaderboard,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  PageHeader,
  Segmented,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/** Qué lista enseñar: todos, quien hace el WOD del box o quien hace la sesión de su plan. */
type Doing = "all" | "box" | "own";

/**
 * La sesión de su plan propio que hace hoy un atleta (ADR 0055): la de su plan, si ya la ve. Con
 * ella en borrador, o sin sesión ese día, hace el WOD del box.
 */
function sessionOf(a: Attendee, sessions: readonly WorkoutView[]) {
  return a.ownPlanId ? (sessions.find((s) => s.plan?.id === a.ownPlanId) ?? null) : null;
}
const doesOwn = (a: Attendee, sessions: readonly WorkoutView[]) =>
  sessionOf(a, sessions)?.visible === true;

/** Lo que responde cerrar la clase: cuántos no vinieron. */
const CloseResultSchema = { parse: (data: unknown) => data as { noShows: number } };

/**
 * La clase para su coach (ADR 0049): quién viene, lo que conviene saber antes de empezar (nuevos,
 * restricciones, quién vuelve, sus kilos), el check-in con un toque por atleta, la espera, añadir
 * a alguien que llega sin reserva y cerrar la clase. El dueño la ve igual; el resto del personal,
 * sin los controles.
 */
export function StaffClassPage({ id }: { id: string }) {
  const t = useT("fitness.staff.class");
  const s = useT("fitness.staff");
  const c = useT("fitness.common");
  const status = useT("fitness.common.bookingStatus");
  const nav = useT("fitness.common.nav");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const detail = useClassDetail(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Attendee | null>(null);
  const [closing, setClosing] = useState(false);
  const [board, setBoard] = useState<WorkoutBlockView | null>(null);
  const [doing, setDoing] = useState<Doing>("all");

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.classes} backLabel={nav("classes")} title={nav("classes")} />
        <Alert kind="error">{t("notFound")}</Alert>
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-32 animate-pulse rounded-card bg-raised" />
        <div className="h-48 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }

  const data = detail.data;
  const cls = data.class;
  const manage = data.canCheckIn;
  const started = Date.parse(cls.startsAt) <= Date.now();
  const active = data.attendees.filter(
    (a) => a.status === "booked" || a.status === "attended" || a.status === "no_show",
  );
  const dropped = data.attendees.filter(
    (a) => a.status === "cancelled" || a.status === "late_cancel",
  );
  const pending = active.filter((a) => a.status === "booked").length;
  const present = new Set([...active, ...data.waitlist].map((a) => a.playerId));
  // Quién hace qué hoy (ADR 0055): el WOD del box o la sesión de su plan propio.
  const sessions = data.sessions;
  const ownToday = active.filter((a) => doesOwn(a, sessions));
  const boxToday = active.filter((a) => !doesOwn(a, sessions));
  const split = ownToday.length > 0 || active.some((a) => a.ownPlanId);
  const listed = doing === "own" ? ownToday : doing === "box" ? boxToday : active;

  /** Guarda la clase que devuelve la API sin esperar a volver a pedirla. */
  function put(next: ClassDetailResponse) {
    client.setQueryData(fitnessKey(slug, "class", id), next);
  }

  async function checkIn(a: Attendee, presentNow: boolean) {
    setBusy(a.playerId);
    try {
      put(
        await apiFetch(`/api/org/classes/${id}/check-in`, {
          method: "POST",
          body: { playerId: a.playerId, present: presentNow },
          schema: ClassDetailResponseSchema,
        }),
      );
      toast(
        "success",
        presentNow ? t("checkedIn", { name: a.name }) : t("checkInUndone", { name: a.name }),
      );
      void invalidate();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function add(playerId: string, name: string) {
    setBusy(playerId);
    try {
      if (started) {
        put(
          await apiFetch(`/api/org/classes/${id}/check-in`, {
            method: "POST",
            body: { playerId, present: true },
            schema: ClassDetailResponseSchema,
          }),
        );
        toast("success", t("checkedIn", { name }));
      } else {
        const result = await apiFetch(`/api/org/classes/${id}/bookings`, {
          method: "POST",
          body: { playerId },
          schema: BookingResultSchema,
        });
        toast(
          "success",
          result.booking.status === "waitlist"
            ? t("add.waitlisted", { name })
            : t("add.booked", { name }),
        );
      }
      setAdding(false);
      await invalidate();
    } catch (err) {
      toast("error", errorText(err, t("add.conflict")));
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Attendee) {
    setBusy(a.playerId);
    try {
      const result = await apiFetch(`/api/org/classes/${id}/bookings/${a.playerId}`, {
        method: "DELETE",
        schema: CancelResultSchema,
      });
      toast("success", result.promoted ? `${t("removed")} ${c("action.promoted")}` : t("removed"));
      setRemoving(null);
      await invalidate();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("close");
    try {
      const result = await apiFetch(`/api/org/classes/${id}/close`, {
        method: "POST",
        schema: CloseResultSchema,
      });
      toast("success", t("close.done", { count: result.noShows }));
      setClosing(false);
      await invalidate();
    } catch (err) {
      toast("error", errorText(err, t("close.notStarted")));
    } finally {
      setBusy(null);
    }
  }

  const programLink = cls.section
    ? `${paths.workoutNew}?date=${cls.date}&section=${cls.section.id}${cls.team ? `&team=${cls.team.id}` : ""}`
    : paths.programming;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.classes}
        backLabel={nav("classes")}
        eyebrow={`${time.day(cls.date)} · ${time.range(cls.startsAt, cls.endsAt)}`}
        title={cls.team?.name ?? cls.title}
        description={[
          cls.coach ? c("coachOf", { name: cls.coach.name }) : c("noCoach"),
          cls.facility?.name,
          cls.section?.name,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          manage ? (
            <>
              <Button action="add" variant="secondary" onClick={() => setAdding(true)}>
                {t("add.button")}
              </Button>
              {started && pending > 0 ? (
                <Button action="finish" variant="primary" onClick={() => setClosing(true)}>
                  {t("close.button")}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col justify-center rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
          <span className="text-secondary text-muted">{t("booked")}</span>
          <SpotsMeter cls={cls} />
        </div>
        <Figure value={cls.checkedIn} label={t("checkIns")} />
        <Figure value={data.waitlist.length} label={t("waitlistCount")} />
        <Figure value={dropped.length} label={t("droppedCount")} />
      </div>

      {!manage ? <Alert kind="info">{t("readOnly")}</Alert> : null}
      {manage && started && pending === 0 && active.length > 0 ? (
        <Alert kind="success">{t("close.closed")}</Alert>
      ) : null}

      <ProgrammingCard
        workout={data.workout}
        split={split ? { box: boxToday.length, own: ownToday.length } : null}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card
            padded={false}
            title={t("list.title")}
            description={t("list.count", { count: active.length })}
            actions={
              split ? (
                <Segmented<Doing>
                  label={t("doing.label")}
                  value={doing}
                  onChange={setDoing}
                  options={[
                    { key: "all", label: t("doing.all", { count: active.length }) },
                    { key: "box", label: t("doing.box", { count: boxToday.length }) },
                    { key: "own", label: t("doing.own", { count: ownToday.length }) },
                  ]}
                />
              ) : null
            }
          >
            {active.length > 0 && listed.length === 0 ? (
              <p className="px-5 pb-5 text-secondary text-muted">{t("doing.empty")}</p>
            ) : null}
            {active.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={<Icon.Users size={28} weight="duotone" aria-hidden="true" />}
                  title={t("list.empty")}
                  action={
                    manage ? (
                      <Button
                        action="add"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAdding(true)}
                      >
                        {t("add.button")}
                      </Button>
                    ) : null
                  }
                />
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {listed.map((a) => (
                  <AttendeeRow
                    key={a.playerId}
                    attendee={a}
                    session={sessionOf(a, sessions)}
                    manage={manage}
                    busy={busy === a.playerId}
                    onToggle={() => void checkIn(a, a.status !== "attended")}
                    onRemove={
                      manage && a.status === "booked" && !started ? () => setRemoving(a) : undefined
                    }
                  />
                ))}
              </ul>
            )}
            {dropped.length > 0 ? (
              <details className="border-t border-line px-5 py-3">
                <summary className="cursor-pointer text-secondary font-medium text-muted">
                  {t("list.dropped", { count: dropped.length })}
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {dropped.map((a) => (
                    <li key={a.playerId} className="flex items-center gap-3">
                      <Avatar name={a.name} src={a.photoUrl} size="sm" />
                      <span className="flex-1 text-body text-ink">{a.name}</span>
                      {a.status ? (
                        <StatusChip kind={BOOKING_TONE[a.status]}>{status(a.status)}</StatusChip>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>

          {data.waitlist.length > 0 ? (
            <Card padded={false} title={t("waitlist.title")} description={t("waitlist.hint")}>
              <ol className="flex flex-col divide-y divide-line">
                {data.waitlist.map((a, i) => (
                  <li key={a.playerId} className="flex min-h-16 items-center gap-3 px-5 py-2">
                    <span className="w-6 font-mono text-body text-muted">{i + 1}</span>
                    <Avatar name={a.name} src={a.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.name}</span>
                    {manage && started ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busy === a.playerId}
                        icon={<Icon.Check size={16} aria-hidden="true" />}
                        onClick={() => void checkIn(a, true)}
                      >
                        {t("checkIn")}
                      </Button>
                    ) : null}
                    {manage && !started ? (
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        iconOnly
                        action="delete"
                        onClick={() => setRemoving(a)}
                      >
                        {t("waitlist.remove", { name: a.name })}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {data.brief ? <BriefCard brief={data.brief} /> : null}

          <Card
            title={t("wod.title")}
            actions={
              data.workout ? (
                <ButtonLink
                  action="edit"
                  to={paths.workoutEdit(data.workout.id)}
                  variant="tertiary"
                  size="sm"
                >
                  {t("wod.edit")}
                </ButtonLink>
              ) : null
            }
          >
            {data.workout ? (
              <WorkoutBlocks
                workout={data.workout}
                blockFooter={(block) =>
                  block.scoreType === "none" ? null : (
                    <>
                      <span className="text-secondary text-muted">
                        {t("wod.results", { count: block.results })}
                      </span>
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={<Icon.Trophy size={16} aria-hidden="true" />}
                        onClick={() => setBoard(block)}
                      >
                        {t("wod.leaderboard")}
                      </Button>
                    </>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={<Icon.Barbell size={28} weight="duotone" aria-hidden="true" />}
                title={t("wod.empty")}
                action={
                  <ButtonLink action="add" to={programLink} variant="secondary" size="sm">
                    {t("wod.program")}
                  </ButtonLink>
                }
              />
            )}
          </Card>

          <OwnSessionsCard attendees={active} sessions={sessions} />
        </div>
      </div>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        closeLabel={c("close")}
        title={t("add.title")}
        description={started ? t("add.descriptionStarted") : t("add.description")}
      >
        {adding ? (
          <AthletePicker
            label={t("add.search")}
            exclude={[...present]}
            action={(a) => (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === a.playerId}
                onClick={() => void add(a.playerId, a.name)}
              >
                {started ? t("checkIn") : t("add.book")}
              </Button>
            )}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? t("remove.title", { name: removing.name }) : ""}
        body={t("remove.body")}
        confirmLabel={t("remove.confirm")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={closing}
        title={t("close.title")}
        body={t("close.body", { count: pending })}
        confirmLabel={t("close.button")}
        confirmAction="finish"
        cancelLabel={c("cancel")}
        tone="default"
        onConfirm={() => void close()}
        onCancel={() => setClosing(false)}
      />

      {board ? (
        <ClassLeaderboard
          block={board}
          classId={id}
          onClose={() => setBoard(null)}
          title={s("class.wod.leaderboard")}
        />
      ) : null}
    </div>
  );
}

/**
 * Un atleta de la lista: su estado y un toque grande para el check-in. Si sigue un plan propio,
 * qué hace hoy (ADR 0055): su sesión, o el WOD si su sesión aún no se ve o no tiene ese día.
 */
function AttendeeRow({
  attendee,
  session,
  manage,
  busy,
  onToggle,
  onRemove,
}: {
  attendee: Attendee;
  session: WorkoutView | null;
  manage: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove?: (() => void) | undefined;
}) {
  const t = useT("fitness.staff.class");
  const status = useT("fitness.common.bookingStatus");
  const nameOf = useWorkoutName();
  const arrived = attendee.status === "attended";
  return (
    <li className="flex min-h-18 items-center gap-3 px-5 py-2">
      <span
        className={`inline-flex shrink-0 rounded-full ${attendee.ownPlan ? "ring-2 ring-club ring-offset-2 ring-offset-surface" : ""}`}
      >
        <Avatar name={attendee.name} src={attendee.photoUrl} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-ink">{attendee.name}</span>
        {(attendee.status && attendee.status !== "booked") || attendee.ownPlan ? (
          <span className="flex flex-wrap gap-1.5">
            {attendee.status && attendee.status !== "booked" ? (
              <StatusChip kind={BOOKING_TONE[attendee.status]}>
                {status(attendee.status)}
              </StatusChip>
            ) : null}
            {/* Sigue un plan propio: hoy hace su sesión, no el WOD de la clase. */}
            {attendee.ownPlan ? (
              <StatusChip kind="club">{t("ownPlan", { plan: attendee.ownPlan })}</StatusChip>
            ) : null}
          </span>
        ) : null}
        {attendee.ownPlan ? (
          <span className="text-secondary text-muted">
            {session?.visible
              ? t("today.session", { title: nameOf(session) })
              : session
                ? t("today.notYet")
                : t("today.noSession")}
          </span>
        ) : null}
      </span>
      {onRemove ? (
        <Button variant="ghost-danger" size="sm" iconOnly action="delete" onClick={onRemove}>
          {t("remove.label", { name: attendee.name })}
        </Button>
      ) : null}
      {manage ? (
        <button
          type="button"
          aria-pressed={arrived}
          aria-label={
            arrived
              ? t("undoLabel", { name: attendee.name })
              : t("checkInLabel", { name: attendee.name })
          }
          disabled={busy}
          onClick={onToggle}
          className={`flex h-12 min-w-28 items-center justify-center gap-2 rounded-control px-4 text-body font-semibold transition-colors disabled:opacity-60 ${
            arrived
              ? "bg-success text-white"
              : "border border-control bg-surface text-ink hover:bg-raised"
          }`}
        >
          {arrived ? (
            <Icon.CheckCircle size={20} weight="fill" aria-hidden="true" />
          ) : (
            <Icon.Check size={20} aria-hidden="true" />
          )}
          {arrived ? t("arrived") : t("checkIn")}
        </button>
      ) : null}
    </li>
  );
}

/**
 * La programación de la clase (ADR 0055), arriba del todo: el WOD con su papel y su estado, el plan
 * al que sirve (semana y bloque, con su semana a un toque) y quién hace qué hoy.
 */
function ProgrammingCard({
  workout,
  split,
}: {
  workout: WorkoutView | null;
  split: { box: number; own: number } | null;
}) {
  const t = useT("fitness.staff.class.programming");
  const nameOf = useWorkoutName();
  const stateOf = useWorkoutState();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const state = workout ? stateOf(workout) : null;
  return (
    <section
      aria-label={t("label")}
      className="flex flex-col gap-4 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border lg:flex-row lg:items-center lg:gap-6"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-field ${
            workout ? "bg-club-soft text-club-soft-text" : "bg-warning-soft text-warning"
          }`}
        >
          {workout ? <Icon.Barbell size={22} /> : <Icon.Warning size={22} />}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {workout ? (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{nameOf(workout)}</span>
                {workout.dayRole ? <RoleChip role={workout.dayRole} /> : null}
                {state ? <StatusChip kind={state.kind}>{state.label}</StatusChip> : null}
              </span>
              <span className="text-secondary text-muted">
                {workout.plan
                  ? t("plan", {
                      plan: workout.plan.name,
                      week: workout.plan.week,
                      weeks: workout.plan.weeks,
                      block: workout.plan.blockLabel,
                    })
                  : t("loose")}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{t("none")}</span>
              <span className="text-secondary text-muted">{t("noneHint")}</span>
            </>
          )}
        </div>
      </div>
      {split ? (
        <div className="w-full lg:w-80">
          <ProgrammingSplit box={split.box} own={split.own} />
        </div>
      ) : null}
      {workout?.plan ? (
        <ButtonLink
          to={paths.planningWeek(workout.plan.id, workout.plan.week)}
          variant="tertiary"
          size="sm"
          action="open"
        >
          {t("openWeek")}
        </ButtonLink>
      ) : null}
    </section>
  );
}

/**
 * Los planes propios de quien viene (ADR 0055): cada plan con su gente en la clase y su sesión de
 * hoy, que se despliega entera. Con la sesión en borrador o sin sesión, esa gente hace el WOD.
 */
function OwnSessionsCard({
  attendees,
  sessions,
}: {
  attendees: readonly Attendee[];
  sessions: readonly WorkoutView[];
}) {
  const t = useT("fitness.staff.class.sessions");
  const nameOf = useWorkoutName();
  const stateOf = useSessionState();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plans = new Map<string, { id: string; name: string; people: ClassPerson[] }>();
  for (const a of attendees) {
    if (!a.ownPlanId || !a.ownPlan) continue;
    const plan = plans.get(a.ownPlanId) ?? { id: a.ownPlanId, name: a.ownPlan, people: [] };
    plan.people.push({
      playerId: a.playerId,
      name: a.name,
      initials: a.initials,
      photoUrl: a.photoUrl,
      status: a.status ?? "booked",
      ownPlan: { id: a.ownPlanId, name: a.ownPlan },
    });
    plans.set(a.ownPlanId, plan);
  }
  if (plans.size === 0) return null;
  return (
    <Card title={t("title")} description={t("hint")}>
      <ul className="flex flex-col gap-3">
        {[...plans.values()].map((plan) => {
          const session = sessions.find((w) => w.plan?.id === plan.id) ?? null;
          const state = session ? stateOf(session) : null;
          return (
            <li key={plan.id} className="flex flex-col gap-2 rounded-field bg-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{plan.name}</span>
                  <span className="text-secondary text-muted">
                    {session ? t("session", { title: nameOf(session) }) : t("none")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {state ? <StatusChip kind={state.kind}>{state.label}</StatusChip> : null}
                  <FacePile people={plan.people} max={4} size="xs" />
                </span>
              </div>
              {session && !session.visible ? (
                <p className="text-secondary text-warning">{t("notYet")}</p>
              ) : null}
              {session ? (
                <details>
                  <summary className="cursor-pointer text-secondary font-medium text-club-text">
                    {t("see")}
                  </summary>
                  <div className="mt-3">
                    <WorkoutBlocks workout={session} />
                  </div>
                </details>
              ) : null}
              <div>
                <ButtonLink
                  to={
                    session?.plan
                      ? paths.planningWeek(session.plan.id, session.plan.week)
                      : paths.planningPlan(plan.id)
                  }
                  variant="tertiary"
                  size="sm"
                  action="open"
                >
                  {t("openWeek")}
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Lo que el coach conviene que sepa antes de empezar. */
function BriefCard({ brief }: { brief: NonNullable<ClassDetailResponse["brief"]> }) {
  const t = useT("fitness.staff.class.brief");
  const kg = useKg();
  const movementName = useMovementName();
  const empty =
    brief.newcomers.length +
      brief.restrictions.length +
      brief.returning.length +
      brief.loads.length ===
    0;
  return (
    <Card title={t("title")}>
      {empty ? (
        <p className="text-secondary text-muted">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {brief.restrictions.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-label uppercase tracking-wide text-muted">{t("restrictions")}</h3>
              <ul className="flex flex-col gap-2">
                {brief.restrictions.map((r) => (
                  <li key={r.playerId} className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{r.name}</span>
                      <RestrictionChip status={r.status} />
                    </span>
                    {r.note ? <span className="text-secondary text-muted">{r.note}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {brief.newcomers.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-label uppercase tracking-wide text-muted">{t("newcomers")}</h3>
              <ul className="flex flex-col gap-1">
                {brief.newcomers.map((n) => (
                  <li key={n.playerId} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{n.name}</span>
                    <StatusChip kind="info">
                      {n.visits === 0 ? t("firstClass") : t("visits", { count: n.visits })}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {brief.returning.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-label uppercase tracking-wide text-muted">{t("returning")}</h3>
              <ul className="flex flex-col gap-1">
                {brief.returning.map((r) => (
                  <li key={r.playerId} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="text-secondary text-muted">
                      {t("daysAway", { days: r.daysAway })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {brief.loads.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-label uppercase tracking-wide text-muted">
                {t("loads", {
                  movement: movementName(brief.loads[0]!.movement),
                  percent: brief.loads[0]!.percent,
                })}
              </h3>
              <ul className="flex flex-col gap-1">
                {brief.loads.map((l) => (
                  <li key={l.playerId} className="flex items-center justify-between gap-2">
                    <span className="text-ink">{l.name}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold text-ink">{kg(l.loadKg)}</span>
                      <span className="text-label text-muted">1RM {kg(l.oneRmKg)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** La clasificación de un bloque solo con quienes vinieron a esta clase. */
function ClassLeaderboard({
  block,
  classId,
  title,
  onClose,
}: {
  block: WorkoutBlockView;
  classId: string;
  title: string;
  onClose: () => void;
}) {
  const t = useT("fitness.staff.class.wod");
  const c = useT("fitness.common");
  const levels = useT("fitness.common.levels");
  const board = useLeaderboard(block.id, { classId });
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={title}
      description={`${block.label} · ${block.title}`}
    >
      {board.isPending ? (
        <div className="h-24 animate-pulse rounded-card bg-raised" />
      ) : !board.data || board.data.entries.length === 0 ? (
        <p className="text-secondary text-muted">{t("leaderboardEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {board.data.entries.map((e) => (
            <li key={e.playerId} className="flex min-h-12 items-center gap-3 py-2">
              <span className="w-6 font-mono text-body text-muted">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
              <StatusChip kind={e.level === "scaled" ? "neutral" : "club"}>
                {levels(e.level)}
              </StatusChip>
              <span className="font-mono font-semibold text-ink">{e.display}</span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
