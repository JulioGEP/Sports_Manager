import {
  BookingResultSchema,
  CancelResultSchema,
  ClassDetailResponseSchema,
  type Attendee,
  type ClassDetailResponse,
  type WorkoutBlockView,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BOOKING_TONE, SpotsMeter } from "@/components/fitness/class-row";
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
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card
            padded={false}
            title={t("list.title")}
            description={t("list.count", { count: active.length })}
          >
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
                {active.map((a) => (
                  <AttendeeRow
                    key={a.playerId}
                    attendee={a}
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

/** Un atleta de la lista: su estado y un toque grande para el check-in. */
function AttendeeRow({
  attendee,
  manage,
  busy,
  onToggle,
  onRemove,
}: {
  attendee: Attendee;
  manage: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove?: (() => void) | undefined;
}) {
  const t = useT("fitness.staff.class");
  const status = useT("fitness.common.bookingStatus");
  const arrived = attendee.status === "attended";
  return (
    <li className="flex min-h-18 items-center gap-3 px-5 py-2">
      <Avatar name={attendee.name} src={attendee.photoUrl} />
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
