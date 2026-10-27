import { FacePile, ownPeople } from "@/components/fitness/class-programming";
import { ClassRow } from "@/components/fitness/class-row";
import { useHas } from "@/components/fitness/staff-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, useClasses, useClassTime, useMessageThreads, useWorkouts } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, EmptyState, Icon, PageHeader, StatusChip } from "@/ui";

/**
 * El inicio del coach (ADR 0049): lo que da hoy, la clase que viene, si el WOD de hoy está
 * publicado y lo que le han escrito. Pensado para mirarlo con el móvil al llegar al box.
 */
export function CoachFitnessHome() {
  const t = useT("fitness.staff.home");
  const s = useT("fitness.staff");
  const p = useT("fitness.staff.inClasses");
  const nav = useT("fitness.common.nav");
  const status = useT("fitness.common.workoutStatus");
  const { me, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const has = useHas();
  const time = useClassTime();
  const today = time.today;
  const classes = useClasses(dayRange(time.timezone, today), { mine: true });
  const workouts = useWorkouts({ from: today, to: today });
  const canMessages = has("org.community.write");
  const threads = useMessageThreads(canMessages);

  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  const now = Date.now();
  const mine = classes.data?.classes ?? [];
  const next = mine.find((c) => Date.parse(c.endsAt) > now) ?? null;
  const live = next !== null && Date.parse(next.startsAt) <= now;
  const unread = (threads.data?.threads ?? []).reduce((sum, th) => sum + th.unread, 0);
  const todays = workouts.data?.workouts ?? [];
  const writable = workouts.data?.writableSections ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={time.day(today)}
        title={t("greeting", { name: firstName })}
        description={classes.data ? t("classesToday", { count: mine.length }) : undefined}
      />

      {next ? (
        <section
          aria-labelledby="coach-next"
          className="flex flex-col gap-4 rounded-card bg-club p-5 text-on-club shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-label uppercase tracking-wide opacity-80">
                {live ? t("next.live") : t("next.title")}
              </span>
              <h2 id="coach-next" className="text-title1">
                {next.team?.name ?? next.title}
              </h2>
              <span className="font-mono text-body">
                {time.range(next.startsAt, next.endsAt)}
                {next.facility ? ` · ${next.facility.name}` : ""}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 font-mono">
              <span className="text-title2">
                {next.capacity !== null ? `${next.booked}/${next.capacity}` : next.booked}
              </span>
              <span className="text-label opacity-80">
                {s("checkins", { checkedIn: next.checkedIn, booked: next.booked })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ButtonLink action="open" to={paths.classDetail(next.id)} variant="secondary" size="sm">
              {t("next.open")}
            </ButtonLink>
            {/* Quién viene y cuántos hacen su plan propio (ADR 0055). */}
            {next.programming && next.programming.people.length > 0 ? (
              <span className="flex items-center gap-2">
                <FacePile people={next.programming.people} max={6} />
                {ownPeople(next.programming.people).length > 0 ? (
                  <span className="text-label opacity-80">
                    {p("withOwn", { count: ownPeople(next.programming.people).length })}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          padded={false}
          title={t("mine.title")}
          actions={
            <ButtonLink action="open" to={paths.classes} variant="tertiary" size="sm">
              {t("mine.all")}
            </ButtonLink>
          }
        >
          {classes.isPending ? (
            <div className="mx-5 mb-5 h-24 animate-pulse rounded-card bg-raised" />
          ) : mine.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
                title={t("mine.empty")}
              />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mine.map((cls) => (
                <ClassRow
                  key={cls.id}
                  cls={cls}
                  to={paths.classDetail(cls.id)}
                  showMine={false}
                  trailing={
                    Date.parse(cls.startsAt) <= now ? (
                      <StatusChip kind={cls.checkedIn > 0 ? "success" : "neutral"}>
                        {s("checkins", { checkedIn: cls.checkedIn, booked: cls.booked })}
                      </StatusChip>
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t("wod.title")}
          actions={
            <ButtonLink action="open" to={paths.programming} variant="tertiary" size="sm">
              {nav("programming")}
            </ButtonLink>
          }
        >
          {workouts.isPending ? (
            <div className="h-24 animate-pulse rounded-card bg-raised" />
          ) : todays.length === 0 ? (
            <Alert
              kind="warning"
              title={t("wod.missing")}
              actions={
                writable.length > 0 ? (
                  <ButtonLink
                    action="add"
                    to={`${paths.workoutNew}?date=${today}${writable.length === 1 ? `&section=${writable[0]}` : ""}`}
                    variant="secondary"
                    size="sm"
                  >
                    {t("wod.program")}
                  </ButtonLink>
                ) : null
              }
            >
              {t("wod.missingHint")}
            </Alert>
          ) : (
            <ul className="flex flex-col gap-3">
              {todays.map((w) => (
                <li key={w.id} className="flex flex-col gap-2 rounded-field bg-raised p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label uppercase tracking-wide text-muted">
                        {w.team ? `${w.section.name} · ${w.team.name}` : w.section.name}
                      </span>
                      <span className="truncate font-medium text-ink">
                        {w.title ?? t("wod.untitled")}
                      </span>
                    </span>
                    <StatusChip kind={w.visible ? "success" : "warning"}>
                      {w.status === "published" && !w.visible
                        ? s("programming.scheduledShort")
                        : status(w.status)}
                    </StatusChip>
                  </div>
                  <ol className="flex flex-col gap-0.5 text-secondary text-muted">
                    {w.blocks.map((b) => (
                      <li key={b.id}>
                        <span className="font-mono font-semibold text-ink">{b.label}</span>{" "}
                        {b.title}
                      </li>
                    ))}
                  </ol>
                  <div>
                    <ButtonLink
                      action="open"
                      to={paths.workoutEdit(w.id)}
                      variant="tertiary"
                      size="sm"
                    >
                      {t("wod.open")}
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {canMessages ? (
          <Card
            title={nav("messages")}
            description={unread > 0 ? t("messages.unread", { count: unread }) : t("messages.none")}
            actions={
              <ButtonLink
                action="open"
                to={paths.messages}
                variant={unread > 0 ? "primary" : "tertiary"}
                size="sm"
              >
                {t("messages.open")}
              </ButtonLink>
            }
          />
        ) : null}
        <Card title={t("shortcuts")}>
          <div className="grid grid-cols-2 gap-2">
            {has("org.training.read") ? (
              <ButtonLink
                to={paths.programming}
                variant="secondary"
                icon={<Icon.Barbell size={18} aria-hidden="true" />}
              >
                {nav("programming")}
              </ButtonLink>
            ) : null}
            {has("org.players.read") ? (
              <ButtonLink
                to={paths.athletes}
                variant="secondary"
                icon={<Icon.UsersThree size={18} aria-hidden="true" />}
              >
                {nav("athletes")}
              </ButtonLink>
            ) : null}
            <ButtonLink
              to={paths.timer}
              variant="secondary"
              icon={<Icon.Timer size={18} aria-hidden="true" />}
            >
              {nav("timer")}
            </ButtonLink>
            <ButtonLink
              to={paths.tv}
              variant="secondary"
              icon={<Icon.CornersOut size={18} aria-hidden="true" />}
            >
              {nav("tv")}
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
