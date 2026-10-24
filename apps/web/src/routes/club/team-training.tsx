import {
  addDays,
  SessionDetailResponseSchema,
  TeamInsightsResponseSchema,
  TeamWeekResponseSchema,
  weekStartOf,
  type SessionSummary,
  type TeamWeekResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AiDraftAction } from "@/components/ai-draft";
import { ContentChips, InsightList, useLoadFormat, useShortDate } from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  Sheet,
  Stat,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

export const sessionStatusKind: Record<SessionSummary["status"], StatusKind> = {
  draft: "neutral",
  planned: "info",
  done: "success",
  cancelled: "neutral",
};

/** Zona horaria del club para las horas de la semana; la vista reducida no la trae. */
export function useClubTimezone() {
  const { org } = useReadyClub();
  return org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
}

/** Hoy en la zona del club, como `AAAA-MM-DD`. */
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/**
 * La semana de un equipo (Bloque 21): cada día con su etiqueta MD, sesiones, entrenamientos de la
 * agenda por planificar y partidos; quién está disponible, la carga de la semana frente a las
 * cuatro anteriores, el ciclo en curso y lo que hay que tener en cuenta.
 */
export function TeamTrainingPage() {
  const t = useT("training.week");
  const tt = useT("training");
  const c = useT("common");
  const errors = useT("errors");
  const { id = "" } = useParams();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const client = useQueryClient();
  const navigate = useNavigate();
  const dates = useDates();
  const fmt = useLoadFormat();
  const [params, setParams] = useSearchParams();
  const requested = params.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : null;
  const [copying, setCopying] = useState(false);
  const [applying, setApplying] = useState(false);
  const canSeeLoad = org.actor.permissions.includes("org.load.read");
  const timezone = useClubTimezone();

  const week = useQuery({
    queryKey: ["org", slug, "team", id, "training", "week", date ?? "current"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/training/week${date ? `?date=${date}` : ""}`, {
        schema: TeamWeekResponseSchema,
      }),
    retry: false,
  });
  const insights = useQuery({
    queryKey: ["org", slug, "team", id, "insights"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/insights`, { schema: TeamInsightsResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (week.isError) {
    const notFound = week.error instanceof ApiClientError && week.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(week.error))}</Alert>
    );
  }
  if (!week.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-24 animate-pulse rounded-card bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = week.data;
  const { team, availability, load, cycle, access } = data;
  const goTo = (start: string | null) => setParams(start ? { date: start } : {}, { replace: true });
  const thisWeek = weekStartOf(todayIn(timezone));
  const isThisWeek = data.week.start === thisWeek;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.team(id)}
        backLabel={tt("backToTeam")}
        eyebrow={`${team.name} · ${team.section.name}`}
        title={t("title")}
        description={dates.range(data.week.start, data.week.end)}
        actions={
          <>
            <ButtonLink
              to={paths.teamTrainingSeason(id)}
              variant="secondary"
              icon={<Icon.CalendarBlank size={18} aria-hidden="true" />}
            >
              {tt("links.season")}
            </ButtonLink>
            <ButtonLink
              to={paths.teamTrainingHistory(id)}
              variant="secondary"
              icon={<Icon.ClockCounterClockwise size={18} aria-hidden="true" />}
            >
              {tt("links.history")}
            </ButtonLink>
          </>
        }
      />

      <nav
        aria-label={t("navigation")}
        className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface p-2 shadow-card precisa:border precisa:border-border"
      >
        <div className="flex items-center gap-1">
          <IconButton label={t("previous")} onClick={() => goTo(addDays(data.week.start, -7))}>
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <span className="px-1 text-body font-medium text-ink" aria-live="polite">
            {dates.range(data.week.start, data.week.end)}
          </span>
          <IconButton label={t("next")} onClick={() => goTo(addDays(data.week.start, 7))}>
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isThisWeek ? (
            <Button size="sm" variant="tertiary" onClick={() => goTo(null)}>
              {t("today")}
            </Button>
          ) : null}
          {access.write ? (
            <>
              <AiDraftAction
                teamId={id}
                date={data.week.start}
                label={t("propose")}
                size="sm"
                onApplied={(result) =>
                  result.sessions.length === 1
                    ? void navigate(paths.session(result.sessions[0]!.sessionId))
                    : void reload()
                }
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon.Copy size={16} aria-hidden="true" />}
                onClick={() => setCopying(true)}
              >
                {t("copy.button")}
              </Button>
              {data.templates.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon.Rows size={16} aria-hidden="true" />}
                  onClick={() => setApplying(true)}
                >
                  {t("template.button")}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<Icon.Users />}
          value={`${availability.available}/${availability.total}`}
          label={t("available")}
        />
        <Stat
          icon={<Icon.Pulse />}
          value={fmt.load(load.planned)}
          label={
            load.baseline !== null
              ? t("plannedVsBaseline", { baseline: fmt.load(load.baseline) })
              : t("planned")
          }
        />
        <Stat icon={<Icon.CheckCircle />} value={fmt.load(load.actual)} label={t("actual")} />
      </div>
      {availability.limited + availability.rehab + availability.out > 0 ? (
        <AvailabilityBreakdown availability={availability} />
      ) : null}

      {cycle ? (
        <div className="flex flex-col gap-2 rounded-field bg-club-soft p-4">
          <p className="text-secondary font-medium text-club-soft-text">
            {t("cycle", { name: cycle.name })}
          </p>
          {cycle.focusContentIds.length > 0 ? (
            <ContentChips ids={cycle.focusContentIds} contents={data.contents} link />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card title={t("days")} padded={false}>
          <WeekDays data={data} teamId={id} onPlanned={() => void reload()} />
        </Card>
        <Card title={t("insights")} description={t("insightsHint")}>
          {insights.data ? (
            <InsightList
              insights={insights.data.insights}
              contents={insights.data.contents}
              players={insights.data.players}
              teamId={id}
              canAnswer={insights.data.access.answer}
              onAnswered={() =>
                void client.invalidateQueries({ queryKey: ["org", slug, "team", id, "insights"] })
              }
              limit={5}
            />
          ) : insights.isError ? (
            <Alert kind="error">{errors(errorKey(insights.error))}</Alert>
          ) : (
            <div className="h-32 animate-pulse rounded-field bg-raised" aria-busy="true" />
          )}
        </Card>
      </div>

      <Card title={t("more")}>
        <div className="flex flex-wrap gap-2">
          {canSeeLoad ? (
            <>
              <ButtonLink
                to={paths.teamLoad(id)}
                variant="secondary"
                icon={<Icon.Pulse size={18} aria-hidden="true" />}
              >
                {tt("links.load")}
              </ButtonLink>
              <ButtonLink
                to={paths.teamTests(id)}
                variant="secondary"
                icon={<Icon.Timer size={18} aria-hidden="true" />}
              >
                {tt("links.tests")}
              </ButtonLink>
            </>
          ) : null}
          <ButtonLink
            to={paths.drills}
            variant="secondary"
            icon={<Icon.ClipboardText size={18} aria-hidden="true" />}
          >
            {tt("links.drills")}
          </ButtonLink>
        </div>
      </Card>

      {access.write ? (
        <>
          <CopyWeekSheet
            open={copying}
            teamId={id}
            target={data.week.start}
            onClose={() => setCopying(false)}
            onDone={() => void reload()}
          />
          <TemplateSheet
            open={applying}
            teamId={id}
            week={data.week.start}
            templates={data.templates}
            onClose={() => setApplying(false)}
            onDone={() => void reload()}
          />
        </>
      ) : null}
    </div>
  );
}

/** Quién no está del todo: limitados, en readaptación y de baja. */
function AvailabilityBreakdown({
  availability,
}: {
  availability: TeamWeekResponse["availability"];
}) {
  const a = useT("availability");
  const t = useT("training.week");
  const items = (["limited", "rehab", "out"] as const).filter((k) => availability[k] > 0);
  return (
    <p className="flex flex-wrap items-center gap-2 text-secondary text-muted">
      <span>{t("notAvailable")}</span>
      {items.map((k) => (
        <StatusChip key={k} kind={k === "out" ? "danger" : k === "rehab" ? "info" : "warning"}>
          {`${a(`status.${k}`)} · ${availability[k]}`}
        </StatusChip>
      ))}
    </p>
  );
}

/** Los siete días: partidos, sesiones y entrenamientos de la agenda por planificar. */
function WeekDays({
  data,
  teamId,
  onPlanned,
}: {
  data: TeamWeekResponse;
  teamId: string;
  onPlanned: () => void;
}) {
  const t = useT("training.week");
  const tm = useT("matches");
  const st = useT("sessionStatus");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const intl = useIntl();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const short = useShortDate();
  const fmt = useLoadFormat();
  const timezone = useClubTimezone();
  const [planning, setPlanning] = useState<string | null>(null);
  const today = todayIn(timezone);
  const time = (iso: string) =>
    intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: timezone });

  async function plan(eventId: string) {
    setPlanning(eventId);
    try {
      const created = await apiFetch(`/api/org/teams/${teamId}/sessions`, {
        method: "POST",
        body: { eventId },
        schema: SessionDetailResponseSchema,
      });
      onPlanned();
      void navigate(paths.session(created.session.id));
    } catch (err) {
      toast("error", errors(errorKey(err)));
      onPlanned();
    } finally {
      setPlanning(null);
    }
  }

  return (
    <ol className="flex flex-col">
      {data.days.map((day) => {
        const empty =
          day.sessions.length === 0 && day.trainings.length === 0 && day.matches.length === 0;
        return (
          <li
            key={day.date}
            aria-current={day.date === today ? "date" : undefined}
            className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:flex-row sm:gap-5"
          >
            <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-1">
              <span className="text-body font-semibold capitalize text-ink">
                {short.weekday(day.date)}
              </span>
              {day.date === today ? <StatusChip kind="club">{t("todayLabel")}</StatusChip> : null}
              {day.mdLabel ? (
                <span className="rounded-chip bg-raised px-2 py-0.5 font-mono text-label font-semibold text-ink">
                  {day.mdLabel}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {empty ? <p className="text-secondary text-muted">{t("rest")}</p> : null}
              {day.matches.map((m, i) => (
                <div
                  key={m.matchId ?? m.eventId ?? i}
                  className="flex flex-wrap items-center gap-2 rounded-field border border-border px-3 py-2"
                >
                  <Icon.SportIcons.Balon size={18} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-body font-medium text-ink">
                    {m.opponent ? t("match", { opponent: m.opponent }) : t("matchNoOpponent")}
                    {m.homeAway ? (
                      <span className="text-secondary font-normal text-muted">
                        {" "}
                        · {m.homeAway === "home" ? tm("home") : tm("away")}
                      </span>
                    ) : null}
                    {m.startsAt ? (
                      <span className="text-secondary font-normal text-muted">
                        {" "}
                        · {time(m.startsAt)}
                      </span>
                    ) : null}
                  </span>
                  {m.status === "finished" && m.ownScore !== null && m.opponentScore !== null ? (
                    <span className="font-mono text-body font-semibold text-ink">
                      {`${m.ownScore}–${m.opponentScore}`}
                    </span>
                  ) : null}
                  {m.matchId ? (
                    <Link
                      to={
                        m.status === "finished"
                          ? paths.matchStats(m.matchId)
                          : paths.match(m.matchId)
                      }
                      className="text-secondary font-medium"
                    >
                      {m.status === "finished" ? t("openStats") : t("openMatch")}
                    </Link>
                  ) : null}
                </div>
              ))}
              {day.sessions.map((s) => (
                <Link
                  key={s.id}
                  to={paths.session(s.id)}
                  className="flex flex-col gap-1.5 rounded-field bg-raised px-3 py-2.5 text-ink no-underline transition-colors hover:bg-club-soft"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Icon.SportIcons.Silbato size={18} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-body font-medium">
                      {s.objective ?? s.title}
                    </span>
                    <StatusChip kind={sessionStatusKind[s.status]}>{st(s.status)}</StatusChip>
                  </span>
                  <span className="text-secondary text-muted">
                    {[
                      time(s.startsAt),
                      fmt.minutes(s.plannedMinutes),
                      s.plannedLoad > 0 ? fmt.load(s.plannedLoad) : null,
                      t("drills", { count: s.itemsCount }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {s.contentMinutes.length > 0 ? (
                    <ContentChips
                      ids={s.contentMinutes.map((cm) => cm.contentId)}
                      contents={data.contents}
                    />
                  ) : null}
                </Link>
              ))}
              {day.trainings.map((tr) => (
                <div
                  key={tr.eventId}
                  className="flex flex-wrap items-center gap-2 rounded-field border border-dashed border-border px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-body text-ink">
                    {tr.title}
                    <span className="text-secondary text-muted">
                      {" "}
                      · {time(tr.startsAt)}
                      {tr.facility ? ` · ${tr.facility.name}` : ""}
                    </span>
                  </span>
                  {data.access.write ? (
                    <Button
                      size="sm"
                      action="add"
                      loading={planning === tr.eventId}
                      onClick={() => void plan(tr.eventId)}
                    >
                      {t("plan")}
                    </Button>
                  ) : (
                    <span className="text-secondary text-muted">{t("notPlanned")}</span>
                  )}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Copiar la planificación de otra semana en esta: por etiqueta MD y, si no, por día. */
function CopyWeekSheet({
  open,
  teamId,
  target,
  onClose,
  onDone,
}: {
  open: boolean;
  teamId: string;
  target: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("training.week.copy");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const dates = useDates();
  const [from, setFrom] = useState(() => addDays(target, -7));
  const [busy, setBusy] = useState(false);
  const source = weekStartOf(from);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<{ sessions: number }>(
        `/api/org/teams/${teamId}/training/week/copy`,
        { method: "POST", body: { from: source, to: target } },
      );
      toast("success", t("done", { count: res.sessions }));
      onClose();
      onDone();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description", { week: dates.range(target, addDays(target, 6)) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            type="submit"
            form="copy-week-form"
            icon={<Icon.Copy size={18} aria-hidden="true" />}
            loading={busy}
            disabled={source === target}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="copy-week-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field
          label={t("from")}
          hint={t("fromHint", { week: dates.range(source, addDays(source, 6)) })}
        >
          {(id, describedBy) => (
            <Input
              id={id}
              type="date"
              required
              aria-describedby={describedBy}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          )}
        </Field>
        <p className="text-secondary text-muted">{t("rule")}</p>
      </form>
    </Sheet>
  );
}

/** Aplicar una semana tipo de la sección: una sesión por día contando desde el partido. */
function TemplateSheet({
  open,
  teamId,
  week,
  templates,
  onClose,
  onDone,
}: {
  open: boolean;
  teamId: string;
  week: string;
  templates: TeamWeekResponse["templates"];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("training.week.template");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const fmt = useLoadFormat();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const template = templates.find((tpl) => tpl.id === templateId);
  const offset = (n: number) => (n === 0 ? "MD" : n > 0 ? `MD+${n}` : `MD${n}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ sessions: number }>(
        `/api/org/teams/${teamId}/training/week/template`,
        { method: "POST", body: { templateId, date: week } },
      );
      toast("success", t("done", { count: res.sessions }));
      onClose();
      onDone();
    } catch (err) {
      const noMatch = err instanceof ApiClientError && err.status === 400;
      toast("error", noMatch ? t("noMatch") : errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="week-template-form" loading={busy} disabled={!templateId}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="week-template-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("template")}>
          {(id) => (
            <Select id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {template ? (
          <ul className="flex flex-col gap-1.5" aria-label={t("days")}>
            {[...template.days]
              .sort((a, b) => a.offset - b.offset)
              .map((d) => (
                <li
                  key={d.offset}
                  className="flex flex-wrap items-baseline gap-2 rounded-field bg-raised px-3 py-2"
                >
                  <span className="w-14 font-mono text-secondary font-semibold text-ink">
                    {offset(d.offset)}
                  </span>
                  <span className="min-w-0 flex-1 text-secondary text-ink">{d.objective}</span>
                  <span className="text-secondary text-muted">
                    {`${fmt.minutes(d.minutes)} · RPE ${d.targetRpe}`}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}
        <p className="text-secondary text-muted">{t("rule")}</p>
      </form>
    </Sheet>
  );
}
