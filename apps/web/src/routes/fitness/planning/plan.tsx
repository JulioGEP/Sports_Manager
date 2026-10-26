import {
  addDays,
  DAY_ROLE_INFO,
  PLAN_STATUSES,
  PlanResponseSchema,
  type PlanStatus,
  type PlanView,
} from "@sportsmanager/shared";
import { useState } from "react";
import { useIntl } from "react-intl";
import { useNavigate, useParams } from "react-router";
import { CopilotSheet } from "@/components/fitness/planning-ai";
import { PlanTabs } from "@/components/fitness/planning-nav";
import { ProjectionView } from "@/components/fitness/planning-projection";
import {
  CAPACITY_COLOR,
  CycleMap,
  EmphasisBar,
  RoleChip,
  usePlanNames,
  WeekRoles,
} from "@/components/fitness/planning-ui";
import { useStaffError } from "@/components/fitness/staff-ui";
import { AutoTextarea } from "@/components/fitness/programming-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlan } from "@/lib/planning";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

const STATUS_KIND = {
  active: "success",
  draft: "neutral",
  finished: "info",
  archived: "neutral",
} as const;

/**
 * Un plan (ADR 0053): dónde está el box, el mapa del ciclo con sus bloques y sus semanas, el
 * reparto de los 100 puntos, las marcas de partida y lo que se puede esperar. El copiloto está a
 * un botón para cualquier cambio.
 */
export function PlanPage() {
  const { id } = useParams();
  const t = useT("fitness.planning.plan");
  const home = useT("fitness.planning.home");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plan = usePlan(id);
  if (!id) return null;
  if (plan.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.planning} backLabel={home("title")} title={t("notFoundTitle")} />
        <Alert kind="error">{t("notFound")}</Alert>
      </div>
    );
  if (!plan.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <PlanView plan={plan.data.plan} />;
}

function PlanView({ plan }: { plan: PlanView }) {
  const t = useT("fitness.planning.plan");
  const home = useT("fitness.planning.home");
  const names = usePlanNames();
  const intl = useIntl();
  const time = useClassTime();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [copilot, setCopilot] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const n = plan.currentWeek;
  const week = n ? plan.structure.weeks[n - 1] : undefined;
  const block = week ? plan.structure.blocks[week.block] : undefined;
  const monday = n ? addDays(plan.startsOn, (n - 1) * 7) : null;
  const openWeek = n ?? (plan.startsOn > time.today ? 1 : plan.weeks);

  async function setStatus(status: PlanStatus) {
    try {
      await apiFetch(`/api/org/plans/${plan.id}`, {
        method: "PUT",
        body: { status },
        schema: PlanResponseSchema,
      });
      await invalidate();
      toast("success", t(`statusDone.${status}`));
    } catch (err) {
      toast("error", errorText(err, t("activeTaken")));
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/org/plans/${plan.id}`, { method: "DELETE" });
      await invalidate();
      toast("success", t("deleted"));
      void navigate(paths.planning, { replace: true });
    } catch (err) {
      toast("error", errorText(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planning}
        backLabel={home("title")}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {plan.section.name}
            <StatusChip kind={STATUS_KIND[plan.status]}>{home(`status.${plan.status}`)}</StatusChip>
          </span>
        }
        title={plan.name}
        description={plan.goal ?? undefined}
        actions={
          plan.canWrite ? (
            <>
              <Button action="propose" onClick={() => setCopilot(true)}>
                {t("copilot")}
              </Button>
              <Menu
                label={t("more")}
                trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
                triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
              >
                <MenuItem
                  icon={<Icon.PencilSimple size={20} aria-hidden="true" />}
                  onClick={() => setEditing(true)}
                >
                  {t("edit")}
                </MenuItem>
                {plan.status === "draft" ? (
                  <MenuItem
                    icon={<Icon.Play size={20} aria-hidden="true" />}
                    onClick={() => void setStatus("active")}
                  >
                    {t("activate")}
                  </MenuItem>
                ) : null}
                {plan.status === "active" ? (
                  <MenuItem
                    icon={<Icon.FlagCheckered size={20} aria-hidden="true" />}
                    onClick={() => void setStatus("finished")}
                  >
                    {t("finish")}
                  </MenuItem>
                ) : null}
                {plan.status !== "archived" ? (
                  <MenuItem
                    icon={<Icon.Package size={20} aria-hidden="true" />}
                    onClick={() => void setStatus("archived")}
                  >
                    {t("archive")}
                  </MenuItem>
                ) : null}
                <MenuItem
                  tone="danger"
                  icon={<Icon.Trash size={20} aria-hidden="true" />}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("delete")}
                </MenuItem>
              </Menu>
            </>
          ) : null
        }
      />

      <PlanTabs planId={plan.id} current="map" week={openWeek} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-card bg-ink p-5 text-surface sm:p-6">
          <span className="text-label uppercase tracking-wide opacity-70">
            {n
              ? t("nowWeek", { n, weeks: plan.weeks })
              : plan.startsOn > time.today
                ? t("startsOn", { date: names.shortDate(plan.startsOn) })
                : t("ended", { date: names.shortDate(plan.endsOn) })}
          </span>
          {block && week ? (
            <>
              <h2 className="text-title1">{names.blockOf(plan.structure, week.block)}</h2>
              <p className="text-body opacity-80">{block.focus ?? t(`blockFocus.${block.kind}`)}</p>
              <div className="grid grid-cols-2 gap-3">
                <Meter label={t("volume")} value={week.volume} />
                <Meter label={t("intensity")} value={week.intensity} />
              </div>
            </>
          ) : (
            <h2 className="text-title1">{plan.name}</h2>
          )}
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={paths.planningWeek(plan.id, openWeek)}
              variant="secondary"
              action="open"
            >
              {n ? t("openThisWeek") : t("openWeek", { n: openWeek })}
            </ButtonLink>
            <ButtonLink to={paths.planningReview(plan.id)} variant="ghost" className="text-surface">
              {t("review")}
            </ButtonLink>
          </div>
        </div>
        <Card title={week ? t("thisWeekRoles") : t("emphasis")}>
          {week && monday ? (
            <div className="flex flex-col gap-4">
              <WeekRoles
                roles={week.roles}
                closed={week.closed}
                monday={monday}
                today={time.today}
              />
              <ul className="flex flex-col gap-1.5">
                {week.roles.map((r, i) =>
                  r ? (
                    <li key={i} className="flex items-center justify-between gap-3 text-secondary">
                      <span className="text-muted first-letter:uppercase">
                        {time.weekday(addDays(monday, i), "short")}
                      </span>
                      <RoleChip role={r} />
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : (
            <EmphasisBar emphasis={plan.emphasis} />
          )}
        </Card>
      </section>

      <Card title={t("map")} description={t("mapHint")}>
        <CycleMap
          structure={plan.structure}
          startsOn={plan.startsOn}
          current={n}
          onWeek={(w) => void navigate(paths.planningWeek(plan.id, w))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("emphasis")} description={t("emphasisHint")}>
          <div className="flex flex-col gap-5">
            <EmphasisBar emphasis={plan.emphasis} />
            <ul className="flex flex-col gap-3">
              {plan.structure.blocks.map((b, i) => (
                <li key={i} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2 text-secondary">
                    <span className="font-medium text-ink">{names.blockOf(plan.structure, i)}</span>
                    <span className="text-muted">
                      {t("blockWeeks", { from: b.startWeek, to: b.startWeek + b.weeks - 1 })}
                    </span>
                  </span>
                  <EmphasisBar emphasis={b.emphasis} legend={false} height={6} />
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title={t("expect")} description={t("expectHint")}>
          {plan.projection ? (
            <ProjectionView
              projection={plan.projection}
              frequency={plan.frequency}
              baselines={plan.baselines}
            />
          ) : (
            <p className="text-secondary text-muted">{t("noProjection")}</p>
          )}
        </Card>
      </div>

      <Card title={t("tests")} description={t("testsHint")}>
        {plan.tests.length === 0 ? (
          <p className="text-secondary text-muted">{t("noTests")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {plan.tests.map((code) => (
              <li
                key={code}
                className="flex items-center justify-between gap-3 rounded-control bg-raised px-3 py-2"
              >
                <span className="font-medium text-ink">{names.test(code)}</span>
                <span className="font-mono text-secondary text-ink">
                  {plan.baselines[code] !== undefined
                    ? intl.formatNumber(plan.baselines[code], { maximumFractionDigits: 1 })
                    : t("noBaseline")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-label text-muted">
          {t("summary", {
            workouts: plan.workouts,
            closures: plan.closures.length,
          })}
        </p>
      </Card>

      <section className="flex flex-col gap-2">
        <span className="text-label uppercase tracking-wide text-muted">{t("legend")}</span>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
          {[...new Set(plan.structure.weeks.flatMap((w) => w.roles).filter((r) => r !== null))].map(
            (r) => (
              <li key={r} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: CAPACITY_COLOR[DAY_ROLE_INFO[r].capacity] }}
                />
                {names.role(r)}
              </li>
            ),
          )}
        </ul>
      </section>

      {plan.canWrite ? (
        <>
          <CopilotSheet
            open={copilot}
            onClose={() => setCopilot(false)}
            planId={plan.id}
            week={n}
          />
          <EditPlanSheet plan={plan} open={editing} onClose={() => setEditing(false)} />
          <ConfirmDialog
            open={confirmDelete}
            title={t("deleteTitle", { name: plan.name })}
            body={t("deleteBody")}
            confirmLabel={t("delete")}
            confirmAction="delete"
            cancelLabel={t("cancel")}
            onConfirm={() => {
              setConfirmDelete(false);
              void remove();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      ) : null}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between text-secondary">
        <span className="opacity-80">{label}</span>
        <span className="font-mono">{value}</span>
      </span>
      <span className="h-1.5 rounded-full bg-surface/20">
        <span className="block h-full rounded-full bg-surface" style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

/** Nombre, objetivo, evento y estado del plan. */
function EditPlanSheet({
  plan,
  open,
  onClose,
}: {
  plan: PlanView;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT("fitness.planning.plan");
  const home = useT("fitness.planning.home");
  const c = useT("fitness.common");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState(plan.goal ?? "");
  const [eventName, setEventName] = useState(plan.eventName ?? "");
  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/org/plans/${plan.id}`, {
        method: "PUT",
        body: {
          name: name.trim() || plan.name,
          goal: goal.trim() || null,
          eventName: eventName.trim() || null,
          status,
        },
        schema: PlanResponseSchema,
      });
      await invalidate();
      toast("success", t("saved"));
      onClose();
    } catch (err) {
      toast("error", errorText(err, t("activeTaken")));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("edit")}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" loading={saving} onClick={() => void save()}>
            {c("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("name")}>
          {(id) => (
            <Input id={id} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label={t("goal")}>
          {(id) => (
            <AutoTextarea
              id={id}
              rows={2}
              maxLength={400}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("eventName")}>
          {(id) => (
            <Input
              id={id}
              maxLength={80}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("status")}>
          {(id) => (
            <Select
              id={id}
              value={status}
              onChange={(e) => setStatus(e.target.value as PlanStatus)}
            >
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {home(`status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
