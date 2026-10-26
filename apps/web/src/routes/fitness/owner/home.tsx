import type { FitnessMetricsResponse } from "@sportsmanager/shared";
import { ClassRow } from "@/components/fitness/class-row";
import { MeterBar, usePercent } from "@/components/fitness/owner-ui";
import { money } from "@/components/fees";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, useClasses, useClassTime, useFitnessMetrics } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Stat,
  StatusChip,
  type StatusKind,
} from "@/ui";

type AlertKind = FitnessMetricsResponse["alerts"][number]["kind"];
type ProgrammingStatus = FitnessMetricsResponse["programming"][number]["status"];

const PROGRAMMING_TONE: Record<ProgrammingStatus, StatusKind> = {
  published: "success",
  partial: "warning",
  draft: "warning",
  missing: "danger",
};

/**
 * El inicio del dueño de un box (ADR 0049): primero lo que pide atención, luego las cifras que
 * mueven el negocio (atletas, ocupación, recurrente y captación), las clases de hoy y la
 * programación de la semana. Todo con su botón a donde se resuelve.
 */
export function OwnerFitnessHome() {
  const t = useT("fitness.owner.home");
  const a = useT("fitness.owner.alerts");
  const { me, slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const percent = usePercent();
  const canMetrics = org.actor.permissions.includes("org.fees.read");
  const metrics = useFitnessMetrics(canMetrics);
  const classes = useClasses(dayRange(time.timezone, time.today));
  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  const m = metrics.data;

  const alertTarget: Record<AlertKind, string> = {
    inactive_athletes: paths.athletes,
    packs_expiring: `${paths.plans}?tab=athletes`,
    trials_pending: paths.leads,
    workout_missing: paths.programming,
    charges_failed: `${paths.fees}?status=overdue`,
    plans_paused_ending: `${paths.plans}?tab=athletes`,
  };
  const occupancyDelta =
    m && m.occupancyWeek !== null && m.occupancyLastWeek !== null
      ? Math.round((m.occupancyWeek - m.occupancyLastWeek) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={time.day(time.today)}
        title={t("greeting", { name: firstName })}
        description={t("description")}
        actions={
          <>
            <ButtonLink to={paths.classes} variant="secondary" action="open">
              {t("openClasses")}
            </ButtonLink>
            <ButtonLink
              to={paths.tv}
              variant="secondary"
              icon={<Icon.CornersOut size={20} aria-hidden="true" />}
            >
              {t("openTv")}
            </ButtonLink>
          </>
        }
      />

      {metrics.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}

      {m ? (
        <Card title={t("alertsTitle")} padded={m.alerts.length === 0}>
          {m.alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-body text-success">
              <Icon.CheckCircle size={20} weight="duotone" aria-hidden="true" />
              {t("allClear")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {m.alerts.map((alert) => (
                <li key={alert.kind} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className={`grid size-9 shrink-0 place-items-center rounded-full ${
                      alert.kind === "charges_failed" || alert.kind === "workout_missing"
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                    }`}
                  >
                    <Icon.Warning size={20} weight="duotone" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink">
                      {a(alert.kind, {
                        count: alert.count,
                        date: alert.date ? time.day(alert.date) : "",
                      })}
                    </span>
                    {alert.sample.length > 0 ? (
                      <span className="truncate text-secondary text-muted">
                        {alert.sample.join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <ButtonLink
                    to={
                      alert.kind === "workout_missing" && alert.date
                        ? `${paths.workoutNew}?date=${alert.date}`
                        : alertTarget[alert.kind]
                    }
                    variant="secondary"
                    size="sm"
                    action="open"
                  >
                    {a(`action.${alert.kind}`)}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {m ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={<Icon.UsersThree weight="duotone" />}
            value={m.activeAthletes}
            label={
              <span className="flex flex-col">
                <span>{t("stats.active")}</span>
                <span className="text-label">
                  {t("stats.activeHint", { joined: m.joinedThisMonth, left: m.leftThisMonth })}
                </span>
              </span>
            }
          />
          <Stat
            icon={<Icon.ChartBar weight="duotone" />}
            value={m.occupancyWeek === null ? "–" : percent(m.occupancyWeek)}
            label={
              <span className="flex flex-col gap-1">
                <span>{t("stats.occupancy")}</span>
                {m.occupancyWeek !== null ? <MeterBar ratio={m.occupancyWeek} /> : null}
                <span className="text-label">
                  {occupancyDelta === null
                    ? t("stats.noComparison")
                    : t("stats.occupancyDelta", {
                        delta: occupancyDelta > 0 ? `+${occupancyDelta}` : String(occupancyDelta),
                      })}
                </span>
              </span>
            }
          />
          <Stat
            icon={<Icon.Coins weight="duotone" />}
            value={money(m.recurringMonthlyCents)}
            label={
              <span className="flex flex-col">
                <span>{t("stats.recurring")}</span>
                <span className="text-label">{t("stats.recurringHint")}</span>
              </span>
            }
          />
          <Stat
            icon={<Icon.UserPlus weight="duotone" />}
            value={m.trialsThisWeek}
            label={
              <span className="flex flex-col">
                <span>{t("stats.trials")}</span>
                <span className="text-label">
                  {t("stats.trialsHint", { count: m.trialsConvertedThisMonth })}
                </span>
              </span>
            }
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          padded={false}
          title={t("todayTitle")}
          actions={
            <ButtonLink to={paths.classes} variant="tertiary" size="sm" action="open">
              {t("allClasses")}
            </ButtonLink>
          }
        >
          {classes.isError ? (
            <div className="px-5 pb-5">
              <Alert kind="error">{t("loadError")}</Alert>
            </div>
          ) : (classes.data?.classes ?? []).length === 0 && !classes.isPending ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={<Icon.CalendarBlank weight="duotone" />}
                title={t("todayEmpty")}
                description={t("todayEmptyHint")}
                action={
                  <ButtonLink to={paths.classTypes} variant="secondary" action="open">
                    {t("setUpSchedule")}
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {(classes.data?.classes ?? []).map((cls) => (
                <ClassRow key={cls.id} cls={cls} to={paths.classDetail(cls.id)} showMine={false} />
              ))}
            </ul>
          )}
        </Card>

        {m ? (
          <Card
            padded={false}
            title={t("programmingTitle")}
            description={t("programmingHint")}
            actions={
              <ButtonLink to={paths.programming} variant="tertiary" size="sm" action="open">
                {t("openProgramming")}
              </ButtonLink>
            }
          >
            {m.programming.length === 0 ? (
              <p className="px-5 pb-5 text-body text-muted">{t("programmingEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {m.programming.map((p) => (
                  <li key={p.date} className="flex min-h-14 items-center gap-3 px-5 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink first-letter:uppercase">
                        {p.date === time.today ? t("today") : time.day(p.date)}
                      </span>
                      <span className="truncate text-secondary text-muted">
                        {p.title ?? t("noTitle")}
                      </span>
                    </span>
                    <StatusChip kind={PROGRAMMING_TONE[p.status]}>
                      {t(`programmingStatus.${p.status}`, { sections: p.missing.join(", ") })}
                    </StatusChip>
                    {p.status !== "published" ? (
                      <ButtonLink
                        to={`${paths.workoutNew}?date=${p.date}`}
                        variant="secondary"
                        size="sm"
                      >
                        {t("program")}
                      </ButtonLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      <Card title={t("shortcuts")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              [paths.classTypes, t("links.schedule"), Icon.Clock],
              [paths.plans, t("links.plans"), Icon.Ticket],
              [paths.leads, t("links.leads"), Icon.UserPlus],
              [paths.metrics, t("links.metrics"), Icon.Pulse],
              [paths.ranking, t("links.ranking"), Icon.Trophy],
              [paths.announcements, t("links.announcements"), Icon.Info],
            ] as const
          ).map(([to, label, LinkIcon]) => (
            <ButtonLink
              key={to}
              to={to}
              variant="secondary"
              icon={<LinkIcon size={20} aria-hidden="true" />}
            >
              {label}
            </ButtonLink>
          ))}
        </div>
      </Card>
    </div>
  );
}
