import { useSearchParams } from "react-router";
import { BookingButton, PlanLine, useBookingActions } from "@/components/fitness/athlete-ui";
import { ClassRow, DayStrip } from "@/components/fitness/class-row";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, daysFrom, useClassTime, useClasses } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, EmptyState, Icon, PageHeader } from "@/ui";

/**
 * Reservar (ADR 0049): los siete días que vienen, las clases de cada uno con sus plazas y, en cada
 * clase, lo que el atleta puede hacer ahora. Si no puede, el motivo en su sitio.
 */
export function AthleteClassesPage() {
  const t = useT("fitness.athlete.classes");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const [params, setParams] = useSearchParams();
  const days = daysFrom(time.today, 7);
  const requested = params.get("day");
  const day = requested && days.includes(requested) ? requested : time.today;
  const classes = useClasses(dayRange(time.timezone, day));
  const actions = useBookingActions();
  const list = classes.data?.classes ?? [];
  const policy = classes.data?.policy;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={policy ? t("description", { days: policy.opensDaysBefore }) : undefined}
      />

      {classes.data ? (
        classes.data.plan ? (
          <Card>
            <PlanLine plan={classes.data.plan} compact />
          </Card>
        ) : (
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
        )
      ) : null}

      <DayStrip
        days={days}
        selected={day}
        onSelect={(d) => setParams(d === time.today ? {} : { day: d }, { replace: true })}
        label={t("days")}
      />

      <Card padded={false} title={<span className="first-letter:uppercase">{time.day(day)}</span>}>
        {classes.isPending ? (
          <div className="flex flex-col gap-2 px-5 pb-5" aria-busy="true">
            <div className="h-16 animate-pulse rounded-field bg-raised" />
            <div className="h-16 animate-pulse rounded-field bg-raised" />
          </div>
        ) : classes.isError ? (
          <div className="px-5 pb-5">
            <Alert kind="error">{errors("unknown")}</Alert>
          </div>
        ) : list.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyHint")}
            />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {list.map((cls) => (
              <ClassRow
                key={cls.id}
                cls={cls}
                to={paths.classDetail(cls.id)}
                trailing={<BookingButton cls={cls} actions={actions} />}
              />
            ))}
          </ul>
        )}
      </Card>

      {policy ? (
        <p className="text-secondary text-muted">
          {t("policy", {
            hours: policy.cancelHoursBefore,
          })}
        </p>
      ) : null}
    </div>
  );
}
