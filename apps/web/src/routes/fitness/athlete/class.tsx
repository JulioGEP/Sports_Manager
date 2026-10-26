import { BookingButton, useBookingActions } from "@/components/fitness/athlete-ui";
import { BOOKING_TONE, SpotsMeter } from "@/components/fitness/class-row";
import { WorkoutBlocks } from "@/components/fitness/workout-blocks";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassDetail, useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  ButtonLink,
  Card,
  Definitions,
  EmptyState,
  Icon,
  PageHeader,
  StatusChip,
} from "@/ui";

/**
 * Una clase para el atleta (ADR 0049): cuándo y con quién, sus plazas, su reserva con las ventanas
 * del box (cuándo abre, cuándo cierra, hasta cuándo se cancela gratis), quién viene y el WOD.
 */
export function AthleteClassPage({ id }: { id: string }) {
  const t = useT("fitness.athlete.class");
  const c = useT("fitness.common");
  const status = useT("fitness.common.bookingStatus");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const detail = useClassDetail(id);
  const actions = useBookingActions();

  if (detail.isPending) {
    return <div className="h-48 animate-pulse rounded-card bg-raised" aria-busy="true" />;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader backTo={paths.classes} backLabel={c("nav.book")} title={t("missing")} />
        <Alert kind="error">{errors("not_found")}</Alert>
      </div>
    );
  }
  const { class: cls, attendees, hiddenCount, workout } = detail.data;
  const my = cls.my && cls.my.status !== "cancelled" ? cls.my : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.classes}
        backLabel={c("nav.book")}
        eyebrow={<span className="first-letter:uppercase">{time.day(cls.date)}</span>}
        title={cls.team?.name ?? cls.title}
        description={`${time.range(cls.startsAt, cls.endsAt)}${cls.section ? ` · ${cls.section.name}` : ""}`}
        actions={<BookingButton cls={cls} actions={actions} size="md" />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t("details")}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="flex flex-col gap-1">
                {my ? (
                  <StatusChip kind={BOOKING_TONE[my.status]}>
                    {my.status === "waitlist" && my.position
                      ? t("position", { position: my.position })
                      : status(my.status)}
                  </StatusChip>
                ) : (
                  <span className="text-secondary text-muted">{t("notBooked")}</span>
                )}
              </span>
              <SpotsMeter cls={cls} />
            </div>
            <Definitions
              items={[
                { term: t("coach"), detail: cls.coach?.name ?? c("noCoach") },
                ...(cls.facility ? [{ term: t("room"), detail: cls.facility.name }] : []),
                { term: t("opens"), detail: time.when(cls.opensAt) },
                { term: t("closes"), detail: time.when(cls.closesAt) },
                { term: t("freeCancel"), detail: time.when(cls.freeCancelUntil) },
              ]}
            />
          </div>
        </Card>

        <Card
          padded={false}
          title={t("attendees", { count: attendees.length + hiddenCount })}
          description={hiddenCount > 0 ? t("hidden", { count: hiddenCount }) : undefined}
        >
          {attendees.length === 0 ? (
            <div className="px-5 pb-5">
              <p className="text-body text-muted">
                {hiddenCount > 0 ? t("onlyHidden") : t("noAttendees")}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {attendees.map((a) => (
                <li
                  key={a.playerId}
                  className={`flex min-h-14 items-center gap-3 px-5 py-2 ${a.isMe ? "bg-club-soft" : ""}`}
                >
                  <Avatar name={a.name} src={a.photoUrl} size="sm" />
                  <span className="flex-1 text-body text-ink">
                    {a.name}
                    {a.isMe ? <span className="text-muted"> · {t("you")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="class-wod">
        <h2 id="class-wod" className="text-title2 text-ink">
          {workout ? (workout.title ?? t("wod")) : t("wod")}
        </h2>
        {workout ? (
          <WorkoutBlocks
            workout={workout}
            blockFooter={(block) =>
              block.scoreType === "none" ? null : (
                <ButtonLink
                  to={`${paths.leaderboard(block.id)}?class=${cls.id}`}
                  variant="tertiary"
                  size="sm"
                  icon={<Icon.Trophy size={18} aria-hidden="true" />}
                >
                  {t("leaderboard")}
                </ButtonLink>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<Icon.Barbell size={28} weight="duotone" aria-hidden="true" />}
            title={t("noWod")}
            description={t("noWodHint")}
          />
        )}
      </section>
    </div>
  );
}
