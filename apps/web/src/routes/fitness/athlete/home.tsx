import { movementByCode } from "@sportsmanager/shared";
import { Link } from "react-router";
import { BookingButton, PlanLine, useBookingActions } from "@/components/fitness/athlete-ui";
import { ClassRow } from "@/components/fitness/class-row";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useKg, useMyFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, EmptyState, Icon, Stat, StatusChip } from "@/ui";

/**
 * El inicio del atleta (ADR 0049): lo de hoy sin buscar. Su próxima clase, el WOD con sus kilos,
 * su tarifa y su racha, su última marca y lo que el box le ha dicho. Los atajos del día abajo.
 */
export function AthleteFitnessHome() {
  const t = useT("fitness.athlete.home");
  const c = useT("fitness.common");
  const kinds = useT("fitness.common.blockKinds");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const kg = useKg();
  const movementName = useMovementName();
  const home = useMyFitness();
  const actions = useBookingActions();

  if (home.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-40 animate-pulse rounded-card bg-raised" />
        <div className="h-40 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  if (home.isError || !home.data) return <Alert kind="error">{errors("unknown")}</Alert>;
  const data = home.data;
  const next = data.nextClass;
  const wod = data.todayWorkout;
  const record = data.lastRecord;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-secondary text-muted first-letter:uppercase">
          {time.day(time.today)}
        </span>
        <h1 className="text-title1 text-ink lg:text-title1-lg">
          {t("greeting", { name: data.athlete.firstName })}
        </h1>
      </header>

      {data.restriction ? (
        <Alert kind="warning" title={t("restrictionTitle")}>
          {data.restriction.until
            ? t("restrictionUntil", { date: time.day(data.restriction.until) })
            : t("restrictionBody")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          padded={false}
          title={
            <span className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("next.eyebrow")}
              </span>
              {next ? time.day(next.date) : t("next.none")}
            </span>
          }
          actions={
            <ButtonLink action="open" to={paths.classes} variant="tertiary" size="sm">
              {t("next.schedule")}
            </ButtonLink>
          }
        >
          {next ? (
            <ul>
              <ClassRow
                cls={next}
                to={paths.classDetail(next.id)}
                trailing={<BookingButton cls={next} actions={actions} />}
              />
            </ul>
          ) : (
            <div className="px-5 pb-5">
              <EmptyState
                icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
                title={t("next.emptyTitle")}
                description={t("next.emptyHint")}
                action={
                  <ButtonLink to={paths.classes} size="sm">
                    {c("nav.book")}
                  </ButtonLink>
                }
              />
            </div>
          )}
        </Card>

        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("wod.eyebrow")}
              </span>
              {wod ? (wod.title ?? wod.section.name) : t("wod.none")}
            </span>
          }
          actions={
            wod ? (
              <ButtonLink action="open" to={paths.wod} variant="tertiary" size="sm">
                {t("wod.open")}
              </ButtonLink>
            ) : null
          }
        >
          {wod ? (
            <ul className="flex flex-col gap-2">
              {wod.blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-secondary text-club-soft-text"
                  >
                    {b.label}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-ink">{b.title}</span>
                    <span className="text-label uppercase tracking-wide text-muted">
                      {kinds(b.kind)}
                    </span>
                  </span>
                  {b.mine?.loadKg !== null && b.mine?.loadKg !== undefined && b.percent ? (
                    <span className="font-mono text-body font-semibold text-ink">
                      {kg(b.mine.loadKg)}
                    </span>
                  ) : null}
                  {b.mine?.result ? (
                    <StatusChip kind="success">{b.mine.result.display}</StatusChip>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">{t("wod.noneHint")}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Icon.Lightning weight="duotone" aria-hidden="true" />}
          value={data.streak.current}
          label={t("streak", { count: data.streak.current })}
        />
        <Stat
          icon={<Icon.CalendarBlank weight="duotone" aria-hidden="true" />}
          value={data.classesThisMonth}
          label={t("classesThisMonth", { count: data.classesThisMonth })}
        />
        <Link to={paths.progress} className="text-inherit no-underline">
          <Stat
            icon={<Icon.Medal weight="duotone" aria-hidden="true" />}
            value={record ? kg(record.loadKg) : "—"}
            label={
              record && movementByCode(record.movementCode)
                ? t("lastRecord", {
                    movement: movementName(record.movementCode),
                    reps: record.reps,
                  })
                : t("noRecord")
            }
          />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t("plan.title")}
          actions={
            <ButtonLink action="open" to={paths.myPlan} variant="tertiary" size="sm">
              {t("plan.open")}
            </ButtonLink>
          }
        >
          {data.plan ? (
            <PlanLine plan={data.plan} />
          ) : (
            <p className="text-body text-muted">{t("plan.none")}</p>
          )}
        </Card>

        <Card
          title={t("box.title")}
          actions={
            <ButtonLink action="open" to={paths.announcements} variant="tertiary" size="sm">
              {t("box.announcements")}
            </ButtonLink>
          }
        >
          <div className="flex flex-col gap-4">
            {data.announcement ? (
              <Link
                to={paths.announcements}
                className="flex flex-col gap-1 rounded-field bg-raised p-3 text-inherit no-underline"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-ink">{data.announcement.title}</span>
                  {data.announcement.read ? null : (
                    <StatusChip kind="club">{t("box.new")}</StatusChip>
                  )}
                </span>
                <span className="line-clamp-2 text-secondary text-muted">
                  {data.announcement.body}
                </span>
              </Link>
            ) : (
              <p className="text-body text-muted">{t("box.noAnnouncements")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {data.unreadAnnouncements > 0 ? (
                <StatusChip kind="info">
                  {t("box.unreadAnnouncements", { count: data.unreadAnnouncements })}
                </StatusChip>
              ) : null}
              <ButtonLink
                to={paths.messages}
                variant={data.unreadMessages > 0 ? "primary" : "secondary"}
                size="sm"
                icon={<Icon.Envelope size={18} aria-hidden="true" />}
              >
                {data.unreadMessages > 0
                  ? t("box.unreadMessages", { count: data.unreadMessages })
                  : t("box.messages")}
              </ButtonLink>
            </div>
          </div>
        </Card>
      </div>

      <nav aria-label={t("shortcuts")} className="grid grid-cols-3 gap-3">
        {[
          { to: paths.classes, label: c("nav.book"), icon: Icon.CalendarBlank },
          { to: paths.timer, label: c("nav.timer"), icon: Icon.Timer },
          { to: paths.progress, label: c("nav.progress"), icon: Icon.ChartBar },
        ].map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-card bg-surface text-body font-medium text-ink no-underline shadow-card hover:bg-raised precisa:border precisa:border-border"
          >
            <s.icon size={26} weight="duotone" aria-hidden="true" />
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
