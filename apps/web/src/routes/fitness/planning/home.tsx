import {
  ATHLETE_PREVIEWS,
  PlanningSettingsResponseSchema,
  WORKOUT_LEVELS,
  type AthletePreview,
  type PlanSummary,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { CycleMap, usePlanNames, WeekRoles } from "@/components/fitness/planning-ui";
import { useHas, useStaffError } from "@/components/fitness/staff-ui";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { usePlan, usePlanningSettings, usePlans } from "@/lib/planning";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Field,
  Icon,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
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
 * Planificación del box (ADR 0053): el plan activo de cada disciplina con su punto del ciclo, los
 * borradores y los terminados. Sin plan, cómo se empieza: una plantilla o lo que proponga la IA.
 */
export function PlanningHomePage() {
  const t = useT("fitness.planning.home");
  const has = useHas();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  const plans = usePlans();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const list = plans.data?.plans ?? [];
  const active = list.filter((p) => p.status === "active");
  const others = list.filter((p) => p.status !== "active");
  const canProgram = has("org.training.write") || has("org.training.write_own");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {canProgram ? (
              <ButtonLink to={paths.planningNew} action="add">
                {t("newPlan")}
              </ButtonLink>
            ) : null}
            <Menu
              label={t("more")}
              trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
              triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
            >
              <MenuItem
                icon={<Icon.Barbell size={20} aria-hidden="true" />}
                onClick={() => void navigate(paths.equipment)}
              >
                {t("equipment")}
              </MenuItem>
              <MenuItem
                icon={<Icon.SlidersHorizontal size={20} aria-hidden="true" />}
                onClick={() => setSettingsOpen(true)}
              >
                {t("settings")}
              </MenuItem>
              <MenuItem
                icon={<Icon.CalendarBlank size={20} aria-hidden="true" />}
                onClick={() => void navigate(paths.programming)}
              >
                {t("programming")}
              </MenuItem>
            </Menu>
          </>
        }
      />

      {plans.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {plans.isPending ? <div className="h-56 animate-pulse rounded-card bg-raised" /> : null}

      {!plans.isPending && list.length === 0 ? (
        <section className="flex flex-col gap-5 rounded-card bg-ink p-6 text-surface sm:p-8">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="text-label uppercase tracking-wide opacity-70">
              {t("emptyEyebrow")}
            </span>
            <h2 className="text-title1 lg:text-title1-lg">{t("emptyTitle")}</h2>
            <p className="text-body opacity-80">{t("emptyBody")}</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {(["choose", "configure", "expect"] as const).map((k, i) => (
              <li key={k} className="flex flex-col gap-1 rounded-control bg-surface/10 p-4">
                <span className="font-mono text-title2">{i + 1}</span>
                <span className="font-semibold">{t(`emptyStep.${k}.title`)}</span>
                <span className="text-secondary opacity-80">{t(`emptyStep.${k}.body`)}</span>
              </li>
            ))}
          </ol>
          {canProgram ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={paths.planningNew} action="add" variant="secondary">
                {t("emptyCta")}
              </ButtonLink>
            </div>
          ) : null}
        </section>
      ) : null}

      {active.map((p) => (
        <ActivePlanCard key={p.id} summary={p} />
      ))}

      {others.length > 0 ? (
        <Card title={t("others")} padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {others.map((p) => (
              <PlanRow key={p.id} plan={p} />
            ))}
          </ul>
        </Card>
      ) : null}

      <PlanningSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanSummary }) {
  const t = useT("fitness.planning.home");
  const names = usePlanNames();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        onClick={() => void navigate(paths.planningPlan(plan.id))}
        className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left hover:bg-raised"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-ink">{plan.name}</span>
          <span className="truncate text-secondary text-muted">
            {`${plan.section.name} · ${names.shortDate(plan.startsOn)} – ${names.shortDate(plan.endsOn)} · ${t("weeks", { weeks: plan.weeks })}`}
          </span>
        </span>
        <StatusChip kind={STATUS_KIND[plan.status]}>{t(`status.${plan.status}`)}</StatusChip>
        <Icon.CaretRight size={18} aria-hidden="true" className="text-muted" />
      </button>
    </li>
  );
}

/** El plan activo de una disciplina: dónde está, qué toca esta semana y el mapa entero. */
function ActivePlanCard({ summary }: { summary: PlanSummary }) {
  const t = useT("fitness.planning.home");
  const names = usePlanNames();
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  const plan = usePlan(summary.id);
  const view = plan.data?.plan;
  const n = summary.currentWeek;
  const week = view && n ? view.structure.weeks[n - 1] : undefined;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {summary.name}
          <StatusChip kind="success">{t("status.active")}</StatusChip>
        </span>
      }
      description={
        n && week && view
          ? t("position", {
              section: summary.section.name,
              n,
              weeks: summary.weeks,
              block: names.blockOf(view.structure, week.block),
            })
          : summary.startsOn > time.today
            ? t("startsOn", {
                section: summary.section.name,
                date: names.shortDate(summary.startsOn),
              })
            : t("ended", { section: summary.section.name })
      }
      actions={
        <>
          {n ? (
            <ButtonLink to={paths.planningWeek(summary.id, n)} variant="secondary" size="sm">
              {t("thisWeek")}
            </ButtonLink>
          ) : null}
          <ButtonLink to={paths.planningPlan(summary.id)} size="sm" action="open">
            {t("open")}
          </ButtonLink>
        </>
      }
    >
      {view ? (
        <div className="flex flex-col gap-4">
          {week && n ? (
            <div className="flex flex-col gap-2">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("weekRoles")}
              </span>
              <WeekRoles
                roles={week.roles}
                closed={week.closed}
                monday={view.structure.weeks[n - 1] ? addWeeks(view.startsOn, n - 1) : undefined}
                today={time.today}
              />
            </div>
          ) : null}
          <CycleMap
            structure={view.structure}
            startsOn={view.startsOn}
            current={n}
            compact
            onWeek={(w) => void navigate(paths.planningWeek(summary.id, w))}
          />
        </div>
      ) : (
        <div className="h-24 animate-pulse rounded-card bg-raised" />
      )}
    </Card>
  );
}

const addWeeks = (date: string, weeks: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

/** Los nombres de los niveles del box y lo que ve el atleta por adelantado. */
function PlanningSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT("fitness.planning.settings");
  const c = useT("fitness.common");
  const levels = useT("fitness.common.levels");
  const settings = usePlanningSettings(open);
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const current = settings.data?.settings;
  const [names, setNames] = useState<Record<WorkoutLevel, string> | null>(null);
  const [preview, setPreview] = useState<AthletePreview | null>(null);
  const [saving, setSaving] = useState(false);
  const shownNames =
    names ??
    (Object.fromEntries(WORKOUT_LEVELS.map((l) => [l, current?.levelNames[l] ?? ""])) as Record<
      WorkoutLevel,
      string
    >);
  const shownPreview = preview ?? current?.athletePreview ?? "roles";
  const canWrite = settings.data?.canWrite ?? false;

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/org/planning/settings", {
        method: "PUT",
        body: {
          levelNames: Object.fromEntries(
            WORKOUT_LEVELS.map((l) => [l, shownNames[l].trim() || null]),
          ),
          athletePreview: shownPreview,
        },
        schema: PlanningSettingsResponseSchema,
      });
      await invalidate();
      toast("success", t("saved"));
      onClose();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setSaving(false);
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
        canWrite ? (
          <>
            <Button variant="tertiary" onClick={onClose}>
              {c("cancel")}
            </Button>
            <Button action="save" loading={saving} onClick={() => void save()}>
              {c("save")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKOUT_LEVELS.map((l) => (
            <Field key={l} label={levels(l)} hint={t(`levelHint.${l}`)}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  maxLength={30}
                  readOnly={!canWrite}
                  aria-describedby={describedBy}
                  placeholder={levels(l)}
                  value={shownNames[l]}
                  onChange={(e) => setNames({ ...shownNames, [l]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-secondary font-medium text-ink">{t("preview")}</span>
          <Segmented<AthletePreview>
            label={t("preview")}
            value={shownPreview}
            onChange={(v) => canWrite && setPreview(v)}
            options={ATHLETE_PREVIEWS.map((p) => ({ key: p, label: t(`previewOption.${p}`) }))}
          />
          <span className="text-label text-muted">{t(`previewHint.${shownPreview}`)}</span>
        </div>
      </div>
    </Sheet>
  );
}
