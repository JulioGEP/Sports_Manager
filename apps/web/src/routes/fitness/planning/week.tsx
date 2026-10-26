import {
  CAPACITIES,
  DAY_ROLE_INFO,
  PlanDraftsResponseSchema,
  WorkoutsPublishedResponseSchema,
  type PlanWeekDay,
  type PlanWeekResponse,
} from "@sportsmanager/shared";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AiWeekSheet, CopilotSheet } from "@/components/fitness/planning-ai";
import { PlanTabs } from "@/components/fitness/planning-nav";
import {
  CAPACITY_COLOR,
  CompareBars,
  EffortMeter,
  RoleChip,
  usePlanNames,
  ValidationChip,
  ValidationList,
} from "@/components/fitness/planning-ui";
import { useWorkoutName } from "@/components/fitness/programming-week";
import { useStaffError } from "@/components/fitness/staff-ui";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlanWeek } from "@/lib/planning";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Icon,
  IconButton,
  Menu,
  MenuItem,
  PageHeader,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * Una semana del plan (ADR 0052): cada día con su papel, su intención y el levantamiento que manda
 * la progresión; su WOD con lo que dice el validador y cómo cabe en la sala. Al lado, el equilibrio
 * de la semana frente al del bloque, la cobertura de quien viene 2 o 3 días y los límites.
 */
export function PlanWeekPage() {
  const { id, n: raw } = useParams();
  const n = Number(raw);
  const t = useT("fitness.planning.week");
  const plans = useT("fitness.planning.home");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const week = usePlanWeek(id, Number.isInteger(n) && n > 0 ? n : null);
  if (!id) return null;
  if (week.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          backTo={paths.planningPlan(id)}
          backLabel={plans("title")}
          title={t("notFoundTitle")}
        />
        <Alert kind="error">{t("notFound")}</Alert>
      </div>
    );
  if (!week.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-96 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <WeekView data={week.data} />;
}

function WeekView({ data }: { data: PlanWeekResponse }) {
  const t = useT("fitness.planning.week");
  const names = usePlanNames();
  const time = useClassTime();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [busy, setBusy] = useState<"drafts" | "publish" | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const { plan, week, days } = data;
  const classDays = days.filter((d) => d.role && !d.closed);
  const missing = classDays.filter((d) => !d.workout && d.date >= time.today);
  const drafts = days.filter((d) => d.workout?.status === "draft").length;
  const programmed = classDays.filter((d) => d.workout).length;
  const issues = days.reduce(
    (s, d) => s + d.validation.filter((v) => v.status === "fail").length,
    0,
  );

  async function writeDrafts() {
    setBusy("drafts");
    try {
      const res = await apiFetch(`/api/org/plans/${plan.id}/weeks/${week.n}/drafts`, {
        method: "POST",
        schema: PlanDraftsResponseSchema,
      });
      await invalidate();
      toast(
        "success",
        res.created > 0 ? t("draftsDone", { count: res.created }) : t("draftsNothing"),
      );
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    try {
      const res = await apiFetch(`/api/org/plans/${plan.id}/weeks/${week.n}/publish`, {
        method: "POST",
        schema: WorkoutsPublishedResponseSchema,
      });
      await invalidate();
      toast("success", t("published", { count: res.published }));
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const go = (to: number) => void navigate(paths.planningWeek(plan.id, to));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planningPlan(plan.id)}
        backLabel={plan.name}
        eyebrow={`${plan.section.name} · ${t("weekOf", { n: week.n, weeks: plan.weeks })}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {week.blockLabel}
            {week.tags.includes("test") ? (
              <StatusChip kind="club">{t("tag.test")}</StatusChip>
            ) : null}
            {week.tags.includes("retest") ? (
              <StatusChip kind="club">{t("tag.retest")}</StatusChip>
            ) : null}
            {week.tags.includes("holiday") ? (
              <StatusChip kind="warning">{t("tag.holiday")}</StatusChip>
            ) : null}
          </span>
        }
        description={week.blockFocus ?? undefined}
        actions={
          data.canWrite ? (
            <>
              {missing.length > 0 ? (
                <Button action="propose" onClick={() => setAiOpen(true)}>
                  {t("aiWeek")}
                </Button>
              ) : null}
              {drafts > 0 ? (
                <Button
                  variant={missing.length > 0 ? "secondary" : "primary"}
                  action="send"
                  loading={busy === "publish"}
                  onClick={() => void publish()}
                >
                  {t("publish", { count: drafts })}
                </Button>
              ) : null}
              <Menu
                label={t("more")}
                trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
                triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
              >
                <MenuItem
                  icon={<Icon.ListChecks size={20} aria-hidden="true" />}
                  onClick={() => void writeDrafts()}
                >
                  {t("drafts")}
                </MenuItem>
                <MenuItem
                  icon={<Icon.Lightbulb size={20} aria-hidden="true" />}
                  onClick={() => setCopilot(true)}
                >
                  {t("copilot")}
                </MenuItem>
              </Menu>
            </>
          ) : null
        }
      />

      <PlanTabs planId={plan.id} current="week" week={week.n} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={t("prev")} disabled={week.n <= 1} onClick={() => go(week.n - 1)}>
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <span className="min-w-40 text-center font-semibold text-ink">
            {t("range", {
              from: names.shortDate(week.startsOn),
              to: names.shortDate(days[6]!.date),
            })}
          </span>
          <IconButton
            label={t("next")}
            disabled={week.n >= plan.weeks}
            onClick={() => go(week.n + 1)}
          >
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-secondary text-muted" role="status">
          <span>{t("programmed", { programmed, total: classDays.length })}</span>
          {drafts > 0 ? (
            <StatusChip kind="neutral">{t("draftsCount", { count: drafts })}</StatusChip>
          ) : null}
          {issues > 0 ? (
            <StatusChip kind="danger">{t("issues", { count: issues })}</StatusChip>
          ) : null}
        </p>
      </div>

      {missing.length > 0 && data.canWrite ? (
        <Alert
          kind="info"
          title={t("missingTitle", { count: missing.length })}
          actions={
            <Button
              variant="secondary"
              size="sm"
              action="add"
              loading={busy === "drafts"}
              onClick={() => void writeDrafts()}
            >
              {t("drafts")}
            </Button>
          }
        >
          {t("missingBody")}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ol className="flex flex-col gap-3">
          {days.map((d) => (
            <DayRow
              key={d.date}
              day={d}
              planId={plan.id}
              sectionId={plan.section.id}
              week={week.n}
              canWrite={data.canWrite}
            />
          ))}
        </ol>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card title={t("balance")} description={t("balanceHint")}>
            <CompareBars
              planLabel={t("balanceBlock")}
              realLabel={t("balanceWeek")}
              rows={CAPACITIES.map((cap) => ({
                key: cap,
                label: names.capacity(cap),
                color: CAPACITY_COLOR[cap],
                plan: data.balance.block[cap],
                real: data.balance.week[cap],
              }))}
            />
          </Card>
          <Card title={t("coverage")} description={t("coverageHint")}>
            {data.coverage.length === 0 ? (
              <p className="text-secondary text-muted">{t("coverageEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.coverage.slice(0, 5).map((cov) => (
                  <li key={cov.days.join("-")} className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2 text-secondary">
                      <span className="font-medium text-ink">
                        {cov.days.map(names.weekdayShort).join(" · ")}
                      </span>
                      <span className="text-muted">
                        {t("share", { share: Math.round(cov.share * 100) })}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {cov.covered.map((cap) => (
                        <span
                          key={cap}
                          className="inline-flex items-center gap-1 rounded-chip bg-success-soft px-2 py-0.5 text-label text-success"
                        >
                          <Icon.Check size={12} aria-hidden="true" />
                          {names.capacity(cap)}
                        </span>
                      ))}
                      {cov.missing.map((m) => (
                        <span
                          key={m.capacity}
                          className="inline-flex items-center gap-1 rounded-chip bg-warning-soft px-2 py-0.5 text-label text-warning"
                        >
                          <Icon.Warning size={12} aria-hidden="true" />
                          {t("missingCapacity", {
                            capacity: names.capacity(m.capacity),
                            day: names.weekdayShort(m.addTo),
                          })}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("limits")} description={t("limitsHint")}>
            <ul className="flex flex-col gap-2.5">
              {data.limits.map((l) => (
                <li key={l.code} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between text-secondary">
                    <span className="text-ink">{t(`limit.${l.code}`)}</span>
                    <span className={`font-mono ${l.value > l.max ? "text-danger" : "text-ink"}`}>
                      {l.value}/{l.max}
                    </span>
                  </span>
                  <span className="h-1.5 rounded-full bg-line">
                    <span
                      className={`block h-full rounded-full ${l.value > l.max ? "bg-danger" : "bg-ink"}`}
                      style={{ width: `${Math.min(100, (l.value / Math.max(1, l.max)) * 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("load")}>
            <div className="grid grid-cols-2 gap-3 text-secondary">
              <span className="flex flex-col">
                <span className="text-muted">{t("volume")}</span>
                <span className="font-mono text-title3 text-ink">{week.volume}</span>
              </span>
              <span className="flex flex-col">
                <span className="text-muted">{t("intensity")}</span>
                <span className="font-mono text-title3 text-ink">{week.intensity}</span>
              </span>
            </div>
          </Card>
        </aside>
      </div>

      {data.canWrite ? (
        <>
          <AiWeekSheet
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            planId={plan.id}
            week={week.n}
            missing={missing.length}
          />
          <CopilotSheet
            open={copilot}
            onClose={() => setCopilot(false)}
            planId={plan.id}
            week={week.n}
          />
        </>
      ) : null}
    </div>
  );
}

/** Un día de la semana del plan: papel e intención a la izquierda, su WOD y lo que dice el validador. */
function DayRow({
  day,
  planId,
  sectionId,
  week,
  canWrite,
}: {
  day: PlanWeekDay;
  planId: string;
  sectionId: string;
  week: number;
  canWrite: boolean;
}) {
  const t = useT("fitness.planning.week");
  const status = useT("fitness.common.workoutStatus");
  const names = usePlanNames();
  const time = useClassTime();
  const nameOf = useWorkoutName();
  const movementName = useMovementName();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [open, setOpen] = useState(false);
  const w = day.workout;
  const role = day.role;
  const info = role ? DAY_ROLE_INFO[role] : null;
  const isToday = day.date === time.today;
  const past = day.date < time.today;
  const quiet = !role && !w;
  return (
    <li
      className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5rem_minmax(0,1fr)] ${quiet ? "opacity-70" : ""}`}
      aria-label={time.day(day.date)}
    >
      <div
        className={`flex flex-col items-center rounded-card py-3 ${
          isToday ? "bg-club text-on-club" : quiet ? "text-muted" : "bg-raised text-ink"
        }`}
        style={
          info && !isToday
            ? { boxShadow: `inset 0 -4px 0 ${CAPACITY_COLOR[info.capacity]}` }
            : undefined
        }
      >
        <span className="text-label font-semibold tracking-wide">
          {names.weekdayShort(day.weekday)}
        </span>
        <span className="font-mono text-title2">{Number(day.date.slice(8, 10))}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border">
        {quiet ? (
          <span className="text-secondary text-muted">
            {day.closed ? t("closed") : t("noClass")}
          </span>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {role ? <RoleChip role={role} /> : null}
                {info?.domain ? (
                  <span className="text-label text-muted">{names.domain(info.domain)}</span>
                ) : null}
                {info ? (
                  <EffortMeter value={info.effort} label={t("effort", { effort: info.effort })} />
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                {w ? (
                  <StatusChip kind={w.status === "published" ? "success" : "neutral"}>
                    {status(w.status)}
                  </StatusChip>
                ) : null}
                {w ? <ValidationChip results={day.validation} /> : null}
              </span>
            </div>
            {day.prescription ? (
              <p className="flex flex-wrap items-center gap-2 text-secondary text-ink">
                <Icon.Barbell size={16} aria-hidden="true" className="text-muted" />
                <span className="font-medium">{movementName(day.prescription.movementCode)}</span>
                <span className="font-mono">
                  {day.prescription.rmReps
                    ? t("findMax")
                    : `${day.prescription.sets}×${day.prescription.reps} · ${day.prescription.percent} %`}
                </span>
              </p>
            ) : null}
            {w ? (
              <div className="flex flex-col gap-2">
                <Link
                  to={paths.workoutEdit(w.id)}
                  className="text-title3 text-ink no-underline hover:underline"
                >
                  {nameOf(w)}
                </Link>
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {w.blocks.map((b) => (
                    <li
                      key={b.id}
                      className="inline-flex items-center gap-1.5 text-secondary text-muted"
                    >
                      {b.capacity ? (
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ background: CAPACITY_COLOR[b.capacity] }}
                        />
                      ) : null}
                      <span className="text-ink">{b.title}</span>
                      {b.plannedMinutes ? (
                        <span className="font-mono">{`${b.plannedMinutes}'`}</span>
                      ) : null}
                      {b.track === "plus" ? <StatusChip kind="club">{t("plus")}</StatusChip> : null}
                    </li>
                  ))}
                </ul>
                {w.intent?.feel ? (
                  <p className="text-secondary italic text-muted">{w.intent.feel}</p>
                ) : null}
                {day.logistics
                  .filter((l) => l.mode !== "ok")
                  .map((l) => (
                    <p key={l.label} className="flex items-start gap-2 text-secondary text-ink">
                      <Icon.UsersThree
                        size={16}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-muted"
                      />
                      {t(`logistics.${l.mode}`, {
                        block: l.label,
                        available: l.available,
                        needed: l.needed,
                        waves: l.waves,
                        size: day.classSize,
                      })}
                    </p>
                  ))}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                  className="inline-flex w-fit items-center gap-1.5 text-secondary font-medium text-club-text"
                >
                  <Icon.CaretDown
                    size={14}
                    aria-hidden="true"
                    className={`transition-transform ${open ? "" : "-rotate-90"}`}
                  />
                  {t("checks")}
                </button>
                {open ? <ValidationList results={day.validation} /> : null}
              </div>
            ) : role && !day.closed ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border-2 border-dashed border-line px-3 py-2">
                <span className="text-secondary text-muted">
                  {past ? t("pastEmpty") : t("empty", { classes: day.classes })}
                </span>
                {canWrite && !past ? (
                  <ButtonLink
                    to={`${paths.workoutNew}?date=${day.date}&section=${sectionId}&plan=${planId}&week=${week}&role=${role}`}
                    variant="tertiary"
                    size="sm"
                    action="add"
                  >
                    {t("write")}
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
