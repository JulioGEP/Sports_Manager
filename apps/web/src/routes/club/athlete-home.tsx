import { AthleteResponseSchema } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { useLoadFormat } from "@/components/training-ui";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, EmptyState, Icon, StatusChip } from "@/ui";
import { useAthletePlan } from "./athlete-training";

/**
 * El inicio del deportista con cuenta propia (ADR 0045): lo que tiene que hacer hoy (su bienestar
 * y el esfuerzo de lo que ya entrenó) y su próxima sesión con el plan. Lo de cada día, sin buscar.
 */
export function AthleteHomePanel() {
  const t = useT("home.athlete");
  const status = useT("athleteTraining.status");
  const intl = useIntl();
  const fmt = useLoadFormat();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const timezone = org.organization.view === "full" ? org.organization.timezone : undefined;
  const athlete = useQuery({
    queryKey: ["org", slug, "me", "athlete"],
    queryFn: () => apiFetch("/api/org/me/athlete", { schema: AthleteResponseSchema }),
    retry: false,
  });
  const plan = useAthletePlan();
  if (!athlete.data?.player || !plan.data) return null;

  const wellness = athlete.data.wellnessToday;
  const pendingRpe = athlete.data.pendingRpe.length;
  const now = Date.now();
  const next =
    plan.data.sessions.find((s) => Date.parse(s.endsAt) > now && s.status !== "cancelled") ?? null;
  const tasks = next ? next.blocks.reduce((a, b) => a + b.items.length, 0) : 0;
  const when = (iso: string) =>
    `${intl.formatDate(new Date(iso), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    })} · ${intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: timezone })}`;
  const availability = plan.data.availability;

  return (
    <div className="flex flex-col gap-6">
      {availability ? (
        <Alert
          kind={availability.status === "out" ? "error" : "warning"}
          title={t(`availability.${availability.status}`)}
          actions={
            <ButtonLink action="open" to={paths.athleteTraining} variant="secondary" size="sm">
              {t("availability.open")}
            </ButtonLink>
          }
        >
          {t("availability.hint")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          padded={false}
          title={
            <span className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("today.eyebrow")}
              </span>
              {t("today.title")}
            </span>
          }
        >
          <ul className="flex flex-col divide-y divide-line">
            <li className="flex min-h-16 items-center gap-3 px-5 py-3">
              <span
                aria-hidden="true"
                className={`grid size-9 shrink-0 place-items-center rounded-full ${wellness ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
              >
                <Icon.Heartbeat size={20} weight="duotone" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink">
                  {wellness ? t("today.wellnessDone") : t("today.wellnessPending")}
                </span>
                <span className="text-secondary text-muted">
                  {wellness
                    ? t("today.wellnessScore", { score: wellness.score })
                    : t("today.wellnessHint")}
                </span>
              </span>
              <ButtonLink
                action="open"
                to={paths.athlete}
                variant={wellness ? "tertiary" : "secondary"}
                size="sm"
              >
                {wellness ? t("today.review") : t("today.answer")}
              </ButtonLink>
            </li>
            <li className="flex min-h-16 items-center gap-3 px-5 py-3">
              <span
                aria-hidden="true"
                className={`grid size-9 shrink-0 place-items-center rounded-full ${pendingRpe === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
              >
                <Icon.Lightning size={20} weight="duotone" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink">
                  {pendingRpe === 0
                    ? t("today.rpeDone")
                    : t("today.rpePending", { count: pendingRpe })}
                </span>
                <span className="text-secondary text-muted">{t("today.rpeHint")}</span>
              </span>
              {pendingRpe > 0 ? (
                <ButtonLink action="open" to={paths.athlete} variant="secondary" size="sm">
                  {t("today.answer")}
                </ButtonLink>
              ) : null}
            </li>
          </ul>
        </Card>

        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("next.eyebrow")}
              </span>
              {next ? next.title : t("next.title")}
            </span>
          }
          description={next ? when(next.startsAt) : undefined}
          actions={
            next ? (
              <StatusChip kind="neutral">
                {next.kind === "activity" && next.status === "unplanned"
                  ? status("class")
                  : status(next.status)}
              </StatusChip>
            ) : null
          }
          footer={
            <ButtonLink action="open" to={paths.athleteTraining} variant="secondary" size="sm">
              {t("next.open")}
            </ButtonLink>
          }
        >
          {next ? (
            <div className="flex flex-col gap-2">
              <span className="text-secondary text-muted">
                {[next.team.name, next.facility?.name ?? next.location].filter(Boolean).join(" · ")}
              </span>
              {next.objective ? <p className="text-body text-ink">{next.objective}</p> : null}
              <span className="text-secondary text-muted">
                {next.status !== "unplanned"
                  ? t("next.summary", { tasks, minutes: fmt.minutes(next.minutes) })
                  : next.kind === "activity"
                    ? fmt.minutes(next.minutes)
                    : t("next.unplanned")}
              </span>
            </div>
          ) : (
            <EmptyState icon={<Icon.Barbell weight="duotone" />} title={t("next.empty")} />
          )}
        </Card>
      </div>
    </div>
  );
}
