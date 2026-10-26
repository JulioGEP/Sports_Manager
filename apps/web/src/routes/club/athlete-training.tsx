import {
  addDays,
  AthletePlanResponseSchema,
  type AthletePlanItem,
  type AthletePlanResponse,
  type AthletePlanSession,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { DrillBoard } from "@/components/drill-board";
import { AvailabilityChip, useLoadFormat, useSessionBlocks } from "@/components/training-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  StatusChip,
  type StatusKind,
} from "@/ui";

const statusKind: Record<AthletePlanSession["status"], StatusKind> = {
  unplanned: "neutral",
  planned: "club",
  done: "success",
  cancelled: "danger",
};

/** El plan del deportista, con la misma clave de consulta en el inicio y en la página. */
export function useAthletePlan(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: ["org", slug, "me", "athlete", "plan"],
    queryFn: () => apiFetch("/api/org/me/athlete/plan", { schema: AthletePlanResponseSchema }),
    enabled,
    retry: false,
  });
}

/**
 * Lo que entrena el deportista con cuenta propia (ADR 0046): sus entrenamientos y clases de estos
 * días con el plan que ha publicado el cuerpo técnico. Solo lo suyo: las tareas del grupo y las que
 * le asignan, con el aviso cuando una choca con su restricción de hoy. Pensado para mirarlo en el
 * móvil antes de salir de casa.
 */
export function AthleteTrainingPage() {
  const t = useT("athleteTraining");
  const c = useT("common");
  const errors = useT("errors");
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const timezone = org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
  const plan = useAthletePlan();

  if (plan.isError) return <Alert kind="error">{errors(errorKey(plan.error))}</Alert>;
  if (!plan.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = plan.data;
  if (!data.player) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} />
        <Card>
          <EmptyState
            icon={<Icon.Barbell weight="duotone" />}
            title={t("noPlayer.title")}
            description={t("noPlayer.description")}
          />
        </Card>
      </div>
    );
  }

  // Hoy es el día del club (lo da la API); cada sesión cae en el suyo en la zona del club.
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const sessions = data.sessions;
  const todayList = sessions.filter((s) => dayOf.format(new Date(s.startsAt)) === data.today);
  const upcoming = sessions.filter((s) => dayOf.format(new Date(s.startsAt)) > data.today);
  // Del pasado, solo lo que tenía plan: lo que hizo y el esfuerzo que dio.
  const past = sessions
    .filter((s) => dayOf.format(new Date(s.startsAt)) < data.today)
    .filter((s) => s.status === "planned" || s.status === "done")
    .reverse();
  /** El esfuerzo se da hasta dos días después (como en "Mi bienestar"). */
  const rpeOpen = (s: AthletePlanSession) =>
    dayOf.format(new Date(s.startsAt)) >= addDays(data.today, -2);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={data.player.name}
        title={t("title")}
        description={t("description")}
        actions={
          <ButtonLink action="open" to={paths.athlete} variant="secondary" size="sm">
            {t("wellness")}
          </ButtonLink>
        }
      />
      <AvailabilityAlert availability={data.availability} />
      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CalendarBlank weight="duotone" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </Card>
      ) : null}
      <Group title={t("groups.today")} sessions={todayList} rpeOpen={rpeOpen} />
      <Group title={t("groups.upcoming")} sessions={upcoming} rpeOpen={rpeOpen} />
      <Group title={t("groups.past")} sessions={past} rpeOpen={rpeOpen} />
    </div>
  );
}

/** Su disponibilidad de hoy, sin diagnóstico: lo que le dice el cuerpo técnico, en una línea. */
function AvailabilityAlert({
  availability,
}: {
  availability: AthletePlanResponse["availability"];
}) {
  const t = useT("athleteTraining.availability");
  const dates = useDates();
  if (!availability) return null;
  return (
    <Alert
      kind={availability.status === "out" ? "error" : "warning"}
      title={t(availability.status)}
    >
      <span className="flex flex-col gap-1">
        <AvailabilityChip value={availability} />
        <span>{t("hint")}</span>
        {availability.expectedReturnOn ? (
          <span>{t("expectedReturn", { date: dates.day(availability.expectedReturnOn) })}</span>
        ) : null}
      </span>
    </Alert>
  );
}

function Group({
  title,
  sessions,
  rpeOpen,
}: {
  title: string;
  sessions: AthletePlanSession[];
  rpeOpen: (s: AthletePlanSession) => boolean;
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label uppercase tracking-wide text-muted">{title}</h2>
      {sessions.map((s) => (
        <SessionCard key={s.eventId} session={s} rpeOpen={rpeOpen(s)} />
      ))}
    </section>
  );
}

function SessionCard({ session, rpeOpen }: { session: AthletePlanSession; rpeOpen: boolean }) {
  const t = useT("athleteTraining");
  const status = useT("athleteTraining.status");
  const intl = useIntl();
  const fmt = useLoadFormat();
  const blocks = useSessionBlocks(session.sportCode);
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const timezone = org.organization.view === "full" ? org.organization.timezone : undefined;
  const when = `${intl.formatDate(new Date(session.startsAt), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  })} · ${intl.formatTime(new Date(session.startsAt), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  })}`;
  const place = session.facility?.name ?? session.location;
  const done = Date.parse(session.endsAt) < Date.now() && session.status !== "cancelled";
  /** Las clases de una actividad no se planifican: son la clase de siempre, no un plan pendiente. */
  const plainClass = session.kind === "activity" && session.status === "unplanned";

  return (
    <Card
      title={
        <span className="flex flex-col gap-0.5">
          <span className="text-label uppercase tracking-wide text-muted">
            {[session.team.name, place].filter(Boolean).join(" · ")}
          </span>
          {session.title}
        </span>
      }
      description={when}
      actions={
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip kind={plainClass ? "neutral" : statusKind[session.status]}>
            {plainClass ? status("class") : status(session.status)}
          </StatusChip>
          <StatusChip kind="neutral">{fmt.minutes(session.minutes)}</StatusChip>
          {session.targetRpe !== null ? (
            <StatusChip kind="neutral">{t("targetRpe", { rpe: session.targetRpe })}</StatusChip>
          ) : null}
        </span>
      }
      footer={
        done && session.rpe !== null ? (
          <span className="text-secondary text-muted">{t("rpeGiven", { rpe: session.rpe })}</span>
        ) : done && rpeOpen && !plainClass ? (
          <ButtonLink action="open" to={paths.athlete} variant="secondary" size="sm">
            {t("giveRpe")}
          </ButtonLink>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {session.objective ? (
          <p className="text-body text-ink">
            <span className="font-medium">{t("objective")}:</span> {session.objective}
          </p>
        ) : null}
        {plainClass ? null : session.status === "unplanned" ? (
          <p className="text-body text-muted">{t("unplanned")}</p>
        ) : session.blocks.length === 0 && session.status !== "cancelled" ? (
          <p className="text-body text-muted">{t("noItems")}</p>
        ) : null}
        {session.blocks.map((b) => (
          <div key={b.block} className="flex flex-col gap-2">
            <h3 className="text-label uppercase tracking-wide text-muted">
              {blocks.label(b.block)}
            </h3>
            <ol className="flex flex-col gap-2">
              {b.items.map((item) => (
                <PlanItem key={item.id} item={item} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Una tarea: qué, cuánto y cómo; con la pizarra si la tiene y el aviso si choca con lo suyo. */
function PlanItem({ item }: { item: AthletePlanItem }) {
  const t = useT("athleteTraining");
  const it = useT("session.item");
  const r = useT("restrictions");
  const fmt = useLoadFormat();
  const facts: string[] = [];
  if (item.sets && item.reps) facts.push(it("setsReps", { sets: item.sets, reps: item.reps }));
  else if (item.sets) facts.push(it("sets", { sets: item.sets }));
  if (item.restSec) facts.push(it("rest", { seconds: item.restSec }));
  if (item.targetRpe !== null) facts.push(it("rpe", { rpe: item.targetRpe }));
  if (item.groupLabel) facts.push(item.groupLabel);
  return (
    <li className="flex flex-col gap-3 rounded-field border border-border p-3 sm:flex-row">
      {item.diagram ? (
        <div className="w-full shrink-0 sm:w-40">
          <DrillBoard diagram={item.diagram} label={item.title} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-body font-semibold text-ink">{item.title}</span>
          <span className="font-mono text-secondary text-ink">{fmt.minutes(item.minutes)}</span>
        </div>
        {facts.length > 0 ? <p className="text-secondary text-muted">{facts.join(" · ")}</p> : null}
        {item.conflicts.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip kind="warning">{t("conflict")}</StatusChip>
            <span className="text-secondary text-muted">
              {item.conflicts.map((tag) => r(tag)).join(" · ")}
            </span>
          </span>
        ) : null}
        {item.description ? (
          <p className="whitespace-pre-line text-secondary text-ink">{item.description}</p>
        ) : null}
        {item.coachingPoints ? (
          <p className="whitespace-pre-line text-secondary text-muted">
            <span className="font-medium text-ink">{t("keys")}:</span> {item.coachingPoints}
          </p>
        ) : null}
      </div>
    </li>
  );
}
