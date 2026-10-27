import {
  addDays,
  AiPlanGenerationResponseSchema,
  buildPlanStructure,
  CAPACITIES,
  missingEquipment,
  normalizeEmphasis,
  PLAN_AUDIENCES,
  PLAN_FREQUENCY_MAX,
  PLAN_FREQUENCY_MIN,
  PLAN_TEMPLATES,
  PLAN_TESTS,
  PlanResponseSchema,
  planEndsOn,
  planTemplateByCode,
  projectPlan,
  weekStartOf,
  WORKOUT_LEVELS,
  type BoxEquipmentKind,
  type Capacity,
  type Emphasis,
  type PlanBlockKind,
  type PlanDiscipline,
  type PlanAudience,
  type PlanTemplateCode,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PlanMembersEditor } from "@/components/fitness/planning-members";
import { AutoTextarea } from "@/components/fitness/programming-blocks";
import { ProjectionView } from "@/components/fitness/planning-projection";
import {
  CAPACITY_COLOR,
  CapacityDot,
  CycleMap,
  EmphasisBar,
  usePlanNames,
} from "@/components/fitness/planning-ui";
import { useStaffError } from "@/components/fitness/staff-ui";
import { ApiClientError, apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { fitnessKey, useClassTime, useClassTypes, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  useAiPlanGeneration,
  useLevelName,
  usePlanningCandidates,
  usePlanningContext,
} from "@/lib/planning";
import {
  Alert,
  Button,
  Card,
  Field,
  Icon,
  Input,
  PageHeader,
  Segmented,
  StatusChip,
  useToast,
} from "@/ui";

const STEPS = ["audience", "goal", "calendar", "emphasis", "tests", "box", "summary"] as const;
type Step = (typeof STEPS)[number];

interface WizardState {
  templateCode: PlanTemplateCode;
  name: string;
  goal: string;
  eventName: string;
  eventDate: string;
  startsOn: string;
  weeks: number;
  emphasis: Emphasis;
  tests: string[];
  closures: string[];
  /** Días de entreno (1 = lunes … 7 = domingo); vacío, los días con clase de la disciplina. */
  weekdays: number[];
  frequency: number;
  activate: boolean;
  /** Todo el box con otro plan activo: terminar ese y activar este. */
  replaceActive: boolean;
  /** Bloques del arquitecto con IA, si se aceptó su propuesta. */
  phases: { kind: PlanBlockKind; weeks: number; focus: string | null }[] | null;
  rationale: string | null;
}

const MAX_TESTS = 6;

function fromTemplate(code: PlanTemplateCode, startsOn: string, name: string): WizardState {
  const t = planTemplateByCode(code)!;
  return {
    templateCode: code,
    name,
    goal: "",
    eventName: "",
    eventDate: "",
    startsOn,
    weeks: t.weeks.default,
    emphasis: { ...t.emphasis },
    tests: [...t.tests],
    closures: [],
    weekdays: [],
    frequency: 3,
    activate: true,
    replaceActive: false,
    phases: null,
    rationale: null,
  };
}

/** Para quién es el plan (ADR 0054): todo el box, un nivel, un grupo o una persona. */
interface Audience {
  audience: PlanAudience;
  level: WorkoutLevel | null;
  /** El nombre del grupo. */
  name: string;
  members: string[];
  /** Los que ya siguen otro plan propio y pasan a este: se les anula el suyo. */
  replace: string[];
}

const AUDIENCE_ICON: Record<PlanAudience, ReactNode> = {
  section: <Icon.Buildings size={20} aria-hidden="true" />,
  level: <Icon.ChartBar size={20} aria-hidden="true" />,
  group: <Icon.UsersThree size={20} aria-hidden="true" />,
  athlete: <Icon.UserCircle size={20} aria-hidden="true" />,
};

/** Semanas entre el lunes de inicio y el evento (la semana del evento incluida). */
const weeksUntil = (startsOn: string, eventDate: string) =>
  Math.floor(
    (Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / (7 * 86_400_000),
  ) + 1;

/**
 * Crear un plan (ADR 0053) en siete pasos: para quién (todo el box, un nivel, un grupo o una persona,
 * ADR 0054), el objetivo (una plantilla o lo que proponga la IA), el calendario con los días de
 * entreno, el reparto de los 100 puntos, los tests, lo que ya sabe el box y el resumen. A la derecha,
 * todo el rato, lo que se puede esperar: se mueve al tocar cualquier cosa.
 */
export function PlanWizardPage() {
  const t = useT("fitness.planning.wizard");
  const tpl = useT("fitness.planning.templates");
  const names = usePlanNames();
  const levelName = useLevelName();
  const time = useClassTime();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params] = useSearchParams();
  const classTypes = useClassTypes();
  const sections = classTypes.data?.sections ?? [];
  const [sectionId, setSectionId] = useState<string | null>(params.get("section"));
  const context = usePlanningContext(sectionId);
  const ctx = context.data ?? null;
  useEffect(() => {
    if (!sectionId && ctx) setSectionId(ctx.section.id);
  }, [ctx, sectionId]);

  const nextMonday =
    weekStartOf(time.today) === time.today ? time.today : addDays(weekStartOf(time.today), 7);
  const [state, setState] = useState<WizardState>(() => fromTemplate("continuous", nextMonday, ""));
  const [picked, setPicked] = useState(false);
  const [step, setStep] = useState<Step>("audience");
  const [who, setWho] = useState<Audience>({
    audience: "section",
    level: null,
    name: "",
    members: [],
    replace: [],
  });
  const specific = who.audience !== "section";
  const candidates = usePlanningCandidates(ctx?.section.id ?? null, undefined, specific);
  const pool = candidates.data?.athletes ?? [];
  const chosen = pool.filter((a) => who.members.includes(a.playerId));
  const unresolved = chosen.filter((a) => a.plan && !who.replace.includes(a.playerId)).length;
  const levelCount = (level: WorkoutLevel) => pool.filter((a) => a.level === level).length;
  const chooseAudience = (audience: PlanAudience) =>
    setWho((w) => ({ ...w, audience, members: [], replace: [], level: null }));
  // Un nivel arranca con todos los de ese nivel: luego se quita o se añade a quien sea.
  const chooseLevel = (level: WorkoutLevel) =>
    setWho((w) => ({
      ...w,
      level,
      members: pool.filter((a) => a.level === level).map((a) => a.playerId),
      replace: [],
    }));
  const [creating, setCreating] = useState(false);
  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  // Frecuencia de referencia: la del box, redondeada entre 1 y 7. Días de entreno: los de clase.
  const frequencySet = useRef(false);
  useEffect(() => {
    if (!ctx || frequencySet.current) return;
    frequencySet.current = true;
    const avg = ctx.frequency.average;
    setState((s) => ({
      ...s,
      weekdays: ctx.classWeekdays.length > 0 ? [...ctx.classWeekdays] : [1, 2, 3, 4, 5],
      ...(avg !== null
        ? {
            frequency: Math.max(PLAN_FREQUENCY_MIN, Math.min(PLAN_FREQUENCY_MAX, Math.round(avg))),
          }
        : {}),
    }));
  }, [ctx]);
  // En un plan propio, los días de entreno son su frecuencia.
  const toggleWeekday = (d: number) =>
    setState((s) => {
      const weekdays = s.weekdays.includes(d)
        ? s.weekdays.filter((x) => x !== d)
        : [...s.weekdays, d].sort((a, b) => a - b);
      if (weekdays.length === 0) return s;
      return {
        ...s,
        weekdays,
        frequency: specific ? weekdays.length : Math.min(s.frequency, weekdays.length),
      };
    });

  const template = planTemplateByCode(state.templateCode)!;
  const inventory = useMemo(() => {
    const m = new Map<BoxEquipmentKind, number>();
    for (const l of ctx?.inventory ?? []) m.set(l.kind as BoxEquipmentKind, l.available);
    return m;
  }, [ctx]);

  // El nombre lleva para quién es: "Carla Prieto · Base de fuerza", "RX · Camino al Open".
  const audienceLabel =
    who.audience === "athlete"
      ? (chosen[0]?.name ?? "")
      : who.audience === "level" && who.level
        ? levelName(who.level)
        : who.audience === "group"
          ? who.name.trim()
          : "";
  const nameFor = (code: PlanTemplateCode) =>
    audienceLabel ? `${audienceLabel} · ${tpl(`${code}.name`)}` : tpl(`${code}.name`);
  const pickTemplate = (code: PlanTemplateCode) => {
    setState((s) => ({
      ...fromTemplate(code, s.startsOn, nameFor(code)),
      frequency: s.frequency,
      closures: s.closures,
      weekdays: s.weekdays,
    }));
    setPicked(true);
  };

  // Semanas: con evento, hasta el evento; si no, las que se elijan dentro de la plantilla.
  const weeks = state.phases
    ? state.phases.reduce((s, p) => s + p.weeks, 0)
    : template.untilEvent && state.eventDate && state.eventDate > state.startsOn
      ? Math.max(
          template.weeks.min,
          Math.min(template.weeks.max, weeksUntil(state.startsOn, state.eventDate)),
        )
      : state.weeks;
  const endsOn = planEndsOn(state.startsOn, weeks);
  const closuresInRange = (ctx?.suggestedClosures ?? []).filter(
    (d) => d >= state.startsOn && d <= endsOn,
  );

  const total = CAPACITIES.reduce((s, k) => s + state.emphasis[k], 0);
  const discipline: PlanDiscipline =
    template.discipline !== "crossfit"
      ? template.discipline
      : ((ctx?.discipline as PlanDiscipline | undefined) ?? "crossfit");
  const structure = useMemo(
    () =>
      buildPlanStructure({
        template,
        discipline,
        startsOn: state.startsOn,
        weeks,
        classWeekdays:
          state.weekdays.length > 0
            ? state.weekdays
            : ctx && ctx.classWeekdays.length > 0
              ? ctx.classWeekdays
              : [1, 2, 3, 4, 5],
        closures: state.closures,
        emphasis: total === 100 ? state.emphasis : normalizeEmphasis(state.emphasis),
        tests: state.tests,
        ...(state.phases ? { phases: state.phases } : {}),
        eventDate: state.eventDate || null,
      }),
    [template, discipline, state, weeks, ctx, total],
  );
  // La proyección de un plan propio se hace con los niveles de su gente; la del box, con todo el box.
  const memberLevels = useMemo(() => {
    const mix: Partial<Record<WorkoutLevel, number>> = {};
    for (const a of pool)
      if (who.members.includes(a.playerId) && a.level) mix[a.level] = (mix[a.level] ?? 0) + 1;
    return mix;
  }, [pool, who.members]);
  const levelMix =
    specific && Object.keys(memberLevels).length > 0 ? memberLevels : (ctx?.levels ?? {});
  const projection = useMemo(
    () =>
      projectPlan({
        emphasis: total === 100 ? state.emphasis : normalizeEmphasis(state.emphasis),
        weeks,
        frequency: state.frequency,
        levelMix,
        tests: state.tests,
        ...(ctx?.calibration ? { calibration: ctx.calibration } : {}),
      }),
    [state.emphasis, state.frequency, state.tests, weeks, ctx, total, levelMix],
  );

  // --- El arquitecto con IA ---
  const [aiGoal, setAiGoal] = useState("");
  const [aiId, setAiId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const ai = useAiPlanGeneration(aiId);
  const aiGen = ai.data?.generation ?? null;
  const aiWorking = aiGen !== null && (aiGen.status === "queued" || aiGen.status === "running");
  const aiApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!aiGen || aiApplied.current === aiGen.id) return;
    if (aiGen.status === "failed") {
      aiApplied.current = aiGen.id;
      setAiError(t("ai.failed"));
    }
    if (aiGen.status === "ready" && aiGen.proposal?.kind === "plan_architect") {
      aiApplied.current = aiGen.id;
      const p = aiGen.proposal;
      setState((s) => ({
        ...s,
        templateCode: p.templateCode,
        name:
          audienceLabel && !p.name.includes(audienceLabel)
            ? `${audienceLabel} · ${p.name}`
            : p.name,
        goal: aiGoal,
        weeks: p.weeks,
        emphasis: p.emphasis,
        tests: p.tests,
        phases: p.phases,
        rationale: p.rationale,
      }));
      setPicked(true);
    }
  }, [aiGen, aiGoal, t, audienceLabel]);

  async function askArchitect(e: FormEvent) {
    e.preventDefault();
    if (!ctx || aiGoal.trim().length < 5) return;
    setAsking(true);
    setAiError(null);
    try {
      const res = await apiFetch("/api/org/plan-ai/architect", {
        method: "POST",
        body: { sectionId: ctx.section.id, goal: aiGoal.trim(), startsOn: state.startsOn },
        schema: AiPlanGenerationResponseSchema,
      });
      client.setQueryData(fitnessKey(slug, "planning", "ai", res.generation.id), res);
      setAiId(res.generation.id);
    } catch (err) {
      setAiError(
        err instanceof ApiClientError && err.status === 429
          ? t("ai.quota")
          : err instanceof ApiClientError && err.status === 503
            ? t("ai.unavailable")
            : errorText(err),
      );
    } finally {
      setAsking(false);
    }
  }

  async function create() {
    if (!ctx) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/org/plans", {
        method: "POST",
        body: {
          sectionId: ctx.section.id,
          templateCode: state.templateCode,
          name: state.name.trim() || tpl(`${state.templateCode}.name`),
          goal: state.goal.trim() || null,
          eventName: state.eventName.trim() || null,
          eventDate: state.eventDate || null,
          startsOn: state.startsOn,
          weeks,
          emphasis: total === 100 ? state.emphasis : normalizeEmphasis(state.emphasis),
          frequency: state.frequency,
          tests: state.tests,
          closures: state.closures,
          weekdays: state.weekdays,
          audience: who.audience,
          ...(specific
            ? {
                audienceLevel: who.audience === "level" ? who.level : null,
                audienceName: who.audience === "group" ? who.name.trim() || null : null,
                members: who.members,
                replace: who.replace,
              }
            : {}),
          ...(state.phases ? { phases: state.phases } : {}),
          // Todo el box con otro plan activo: o se sustituye, o el nuevo va en borrador.
          activate: specific || !ctx.active ? state.activate : state.replaceActive,
          ...(!specific && ctx.active && state.replaceActive ? { replaceActive: true } : {}),
        },
        schema: PlanResponseSchema,
      });
      await invalidate();
      toast("success", t("created", { name: res.plan.name }));
      void navigate(paths.planningPlan(res.plan.id));
    } catch (err) {
      toast(
        "error",
        err instanceof ApiClientError && err.status === 409 && !specific
          ? t("activeTaken")
          : errorText(err),
      );
    } finally {
      setCreating(false);
    }
  }

  const index = STEPS.indexOf(step);
  const audienceReady =
    who.audience === "section" ||
    (who.members.length > 0 &&
      unresolved === 0 &&
      (who.audience !== "level" || who.level !== null) &&
      (who.audience !== "group" || who.name.trim().length > 0) &&
      (who.audience !== "athlete" || who.members.length === 1));
  const canNext =
    step === "audience"
      ? audienceReady
      : step === "goal"
        ? picked
        : step === "calendar"
          ? state.name.trim().length > 0 &&
            state.weekdays.length > 0 &&
            (!template.untilEvent || !state.eventDate || state.eventDate > state.startsOn)
          : step === "emphasis"
            ? total === 100
            : true;

  if (context.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.planning} backLabel={t("back")} title={t("title")} />
        <Alert kind="info">{t("noSection")}</Alert>
      </div>
    );
  }

  const month = Number(time.today.slice(5, 7));
  const featured = PLAN_TEMPLATES.filter((x) => x.code !== "custom");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planning}
        backLabel={t("back")}
        eyebrow={ctx ? ctx.section.name : null}
        title={t("title")}
        description={t("description")}
      />

      {sections.length > 1 ? (
        <Segmented<string>
          label={t("section")}
          value={sectionId ?? ""}
          onChange={(id) => setSectionId(id)}
          options={sections.map((s) => ({ key: s.id, label: s.name }))}
        />
      ) : null}

      {ctx && !ctx.canWrite ? <Alert kind="info">{t("readOnly")}</Alert> : null}
      {ctx?.active && !specific ? (
        <Alert kind="info">{t("hasActive", { name: ctx.active.name })}</Alert>
      ) : null}

      <ol className="grid grid-cols-7 gap-1.5" aria-label={t("steps")}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > index && !(i === index + 1 && canNext)}
              onClick={() => setStep(s)}
              aria-current={s === step ? "step" : undefined}
              className="flex w-full flex-col items-start gap-1 text-left disabled:cursor-not-allowed"
            >
              <span
                className={`h-1.5 w-full rounded-full ${i <= index ? "bg-club" : "bg-line"}`}
                aria-hidden="true"
              />
              <span
                className={`hidden text-label sm:block ${s === step ? "font-semibold text-ink" : "text-muted"}`}
              >
                {`${i + 1}. ${t(`step.${s}`)}`}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-secondary font-medium text-ink sm:hidden">
        {t("stepOf", { n: index + 1, total: STEPS.length, name: t(`step.${step}`) })}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {step === "audience" ? (
            <Card title={t("audience.title")} description={t("audience.hint")}>
              <div className="flex flex-col gap-5">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {PLAN_AUDIENCES.map((a) => {
                    const selected = who.audience === a;
                    return (
                      <li key={a}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => chooseAudience(a)}
                          className={`flex h-full w-full items-start gap-3 rounded-card border-2 bg-surface p-4 text-left transition-colors ${
                            selected
                              ? "border-club"
                              : "border-transparent shadow-card hover:border-line"
                          }`}
                        >
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-full ${
                              selected ? "bg-club text-on-club" : "bg-raised text-ink"
                            }`}
                          >
                            {AUDIENCE_ICON[a]}
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-title3 text-ink">{t(`audience.${a}.name`)}</span>
                            <span className="text-secondary text-muted">
                              {t(`audience.${a}.body`, { section: ctx?.section.name ?? "" })}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {who.audience === "level" && !candidates.data ? (
                  <div className="h-16 animate-pulse rounded-card bg-raised" />
                ) : null}
                {who.audience === "level" && candidates.data ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-secondary font-medium text-ink">
                      {t("audience.whichLevel")}
                    </span>
                    <div className="max-w-full overflow-x-auto">
                      <Segmented<string>
                        label={t("audience.whichLevel")}
                        value={who.level ?? ""}
                        onChange={(l) => chooseLevel(l as WorkoutLevel)}
                        options={WORKOUT_LEVELS.map((l) => ({
                          key: l,
                          label: `${levelName(l)} · ${levelCount(l)}`,
                        }))}
                      />
                    </div>
                    <span className="text-label text-muted">{t("audience.levelHint")}</span>
                  </div>
                ) : null}

                {who.audience === "group" ? (
                  <Field label={t("audience.groupName")} hint={t("audience.groupNameHint")}>
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        maxLength={80}
                        aria-describedby={describedBy}
                        value={who.name}
                        placeholder={t("audience.groupPlaceholder")}
                        onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))}
                      />
                    )}
                  </Field>
                ) : null}

                {!specific ? (
                  <p className="rounded-control bg-raised p-3 text-secondary text-ink">
                    {t("audience.sectionNote", { section: ctx?.section.name ?? "" })}
                  </p>
                ) : who.audience === "level" && who.level === null ? null : candidates.data ? (
                  <PlanMembersEditor
                    candidates={pool}
                    members={who.members}
                    replace={who.replace}
                    single={who.audience === "athlete"}
                    onChange={(members, replace) => setWho((w) => ({ ...w, members, replace }))}
                  />
                ) : (
                  <div className="h-40 animate-pulse rounded-card bg-raised" />
                )}
              </div>
            </Card>
          ) : null}

          {step === "goal" ? (
            <>
              <Card title={t("ai.title")} description={t("ai.description")}>
                <form className="flex flex-col gap-3" onSubmit={(e) => void askArchitect(e)}>
                  <Field label={t("ai.goal")} hint={t("ai.goalHint")}>
                    {(id, describedBy) => (
                      <AutoTextarea
                        id={id}
                        rows={2}
                        maxLength={500}
                        aria-describedby={describedBy}
                        value={aiGoal}
                        placeholder={t("ai.placeholder")}
                        onChange={(e) => setAiGoal(e.target.value)}
                      />
                    )}
                  </Field>
                  {aiError ? <Alert kind="error">{aiError}</Alert> : null}
                  {aiGen?.status === "ready" && aiGen.proposal?.kind === "plan_architect" ? (
                    <Alert kind="success" title={t("ai.readyTitle", { name: aiGen.proposal.name })}>
                      {aiGen.proposal.rationale}
                    </Alert>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-label text-muted">
                      {ctx?.ai.available
                        ? t("ai.remaining", {
                            remaining: aiGen?.quota.remaining ?? ctx.ai.quota.remaining,
                          })
                        : t("ai.unavailable")}
                    </span>
                    <Button
                      type="submit"
                      action="propose"
                      loading={asking || aiWorking}
                      disabled={!ctx?.ai.available || !ctx.canWrite || aiGoal.trim().length < 5}
                    >
                      {aiWorking ? t("ai.working") : t("ai.send")}
                    </Button>
                  </div>
                </form>
              </Card>

              <section className="flex flex-col gap-3" aria-labelledby="templates-title">
                <div className="flex flex-col gap-0.5">
                  <h2 id="templates-title" className="text-title2 text-ink">
                    {t("templatesTitle")}
                  </h2>
                  <p className="text-secondary text-muted">{t("templatesHint")}</p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[...featured, planTemplateByCode("custom")!].map((x) => {
                    const missing = missingEquipment(x, inventory);
                    const selected = picked && state.templateCode === x.code && !state.phases;
                    return (
                      <li key={x.code}>
                        <button
                          type="button"
                          onClick={() => pickTemplate(x.code)}
                          aria-pressed={selected}
                          className={`flex h-full w-full flex-col gap-3 rounded-card border-2 bg-surface p-4 text-left transition-colors ${
                            selected
                              ? "border-club"
                              : "border-transparent shadow-card hover:border-line"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="flex flex-col gap-0.5">
                              <span className="text-title3 text-ink">{tpl(`${x.code}.name`)}</span>
                              <span className="text-secondary text-muted">
                                {tpl(`${x.code}.pitch`)}
                              </span>
                            </span>
                            {x.featuredMonths.includes(month) ? (
                              <StatusChip kind="club">{t("featured")}</StatusChip>
                            ) : null}
                          </span>
                          <EmphasisBar emphasis={x.emphasis} legend={false} height={8} />
                          <span className="flex flex-wrap gap-x-3 gap-y-1 text-label text-muted">
                            <span>
                              {x.continuous
                                ? t("continuous")
                                : t("weeksRange", { min: x.weeks.min, max: x.weeks.max })}
                            </span>
                            {x.untilEvent ? <span>{t("untilEvent")}</span> : null}
                            {x.tests.length > 0 ? (
                              <span>{x.tests.map(names.test).join(" · ")}</span>
                            ) : null}
                          </span>
                          {missing.length > 0 ? (
                            <span className="inline-flex items-start gap-1.5 text-label text-warning">
                              <Icon.Warning
                                size={14}
                                aria-hidden="true"
                                className="mt-0.5 shrink-0"
                              />
                              {t("missingEquipment", { count: missing.length })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          ) : null}

          {step === "calendar" ? (
            <Card title={t("step.calendar")} description={t("calendarHint")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("name")}>
                  {(id) => (
                    <Input
                      id={id}
                      maxLength={80}
                      value={state.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("startsOn")} hint={t("startsOnHint")}>
                  {(id, describedBy) => (
                    <Input
                      id={id}
                      type="date"
                      aria-describedby={describedBy}
                      value={state.startsOn}
                      onChange={(e) =>
                        e.target.value && set("startsOn", weekStartOf(e.target.value))
                      }
                    />
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t("goal")} hint={t("goalHint")}>
                    {(id, describedBy) => (
                      <AutoTextarea
                        id={id}
                        rows={2}
                        maxLength={400}
                        aria-describedby={describedBy}
                        value={state.goal}
                        onChange={(e) => set("goal", e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                {template.untilEvent ? (
                  <>
                    <Field label={t("eventName")}>
                      {(id) => (
                        <Input
                          id={id}
                          maxLength={80}
                          value={state.eventName}
                          placeholder={t("eventPlaceholder")}
                          onChange={(e) => set("eventName", e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label={t("eventDate")} hint={t("eventDateHint")}>
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          type="date"
                          aria-describedby={describedBy}
                          value={state.eventDate}
                          min={addDays(state.startsOn, 7 * template.weeks.min - 7)}
                          onChange={(e) => set("eventDate", e.target.value)}
                        />
                      )}
                    </Field>
                  </>
                ) : null}
                {state.phases ? null : (
                  <Field
                    label={t("weeks")}
                    hint={t("weeksHint", { min: template.weeks.min, max: template.weeks.max })}
                  >
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        aria-describedby={describedBy}
                        min={template.weeks.min}
                        max={template.weeks.max}
                        disabled={template.untilEvent && Boolean(state.eventDate)}
                        value={weeks}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n))
                            set(
                              "weeks",
                              Math.max(template.weeks.min, Math.min(template.weeks.max, n)),
                            );
                        }}
                      />
                    )}
                  </Field>
                )}
                <div className="flex flex-col justify-end gap-1 text-secondary text-muted">
                  <span>{t("endsOn", { date: names.shortDate(endsOn), weeks })}</span>
                </div>
              </div>
              {closuresInRange.length > 0 ? (
                <div className="mt-5 flex flex-col gap-2">
                  <span className="text-secondary font-medium text-ink">{t("closures")}</span>
                  <span className="text-secondary text-muted">{t("closuresHint")}</span>
                  <ul className="flex flex-wrap gap-2">
                    {closuresInRange.map((d) => {
                      const on = state.closures.includes(d);
                      return (
                        <li key={d}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              set(
                                "closures",
                                on
                                  ? state.closures.filter((x) => x !== d)
                                  : [...state.closures, d].sort(),
                              )
                            }
                            className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip border px-3 text-secondary ${
                              on
                                ? "border-ink bg-ink text-surface"
                                : "border-line bg-surface text-ink"
                            }`}
                          >
                            {on ? <Icon.Check size={14} aria-hidden="true" /> : null}
                            {time.weekday(d, "short")} {names.shortDate(d)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="mt-5 flex flex-col gap-2">
                <span className="text-secondary font-medium text-ink" id="training-days">
                  {t("weekdays")}
                </span>
                <span className="text-secondary text-muted">
                  {specific ? t("weekdaysHintOwn") : t("weekdaysHint")}
                </span>
                <ul className="flex flex-wrap gap-2" aria-labelledby="training-days">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const on = state.weekdays.includes(d);
                    return (
                      <li key={d}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={names.weekday(d)}
                          onClick={() => toggleWeekday(d)}
                          className={`inline-flex size-11 items-center justify-center rounded-full border text-secondary font-semibold ${
                            on
                              ? "border-club bg-club text-on-club"
                              : "border-line bg-surface text-ink"
                          }`}
                        >
                          {names.weekdayShort(d)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
          ) : null}

          {step === "emphasis" ? (
            <Card title={t("step.emphasis")} description={t("emphasisHint")}>
              <div className="flex flex-col gap-5">
                <EmphasisBar emphasis={state.emphasis} legend={false} height={14} />
                <p
                  className={`text-secondary font-medium ${total === 100 ? "text-success" : "text-warning"}`}
                  role="status"
                >
                  {total === 100
                    ? t("pointsOk")
                    : total > 100
                      ? t("pointsOver", { total, over: total - 100 })
                      : t("points", { total, left: 100 - total })}
                </p>
                <ul className="flex flex-col gap-4">
                  {CAPACITIES.map((cap: Capacity) => (
                    <li
                      key={cap}
                      className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-3"
                    >
                      <label
                        htmlFor={`emphasis-${cap}`}
                        className="inline-flex items-center gap-2 text-body text-ink"
                      >
                        <CapacityDot capacity={cap} />
                        {names.capacity(cap)}
                      </label>
                      <input
                        id={`emphasis-${cap}`}
                        type="range"
                        min={0}
                        max={60}
                        step={5}
                        value={state.emphasis[cap]}
                        onChange={(e) =>
                          set("emphasis", { ...state.emphasis, [cap]: Number(e.target.value) })
                        }
                        style={{ accentColor: CAPACITY_COLOR[cap] }}
                        className="w-full"
                      />
                      <span className="text-right font-mono text-body text-ink">
                        {state.emphasis[cap]}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => set("emphasis", { ...template.emphasis })}
                  >
                    {t("resetEmphasis")}
                  </Button>
                  {total !== 100 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => set("emphasis", normalizeEmphasis(state.emphasis))}
                    >
                      {t("normalize")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-label text-muted">{t("emphasisRule")}</p>
              </div>
            </Card>
          ) : null}

          {step === "tests" ? (
            <Card title={t("step.tests")} description={t("testsHint", { max: MAX_TESTS })}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PLAN_TESTS.map((test) => {
                  const on = state.tests.includes(test.code);
                  const full = !on && state.tests.length >= MAX_TESTS;
                  return (
                    <li key={test.code}>
                      <label
                        className={`flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 ${
                          on ? "border-club bg-club-soft" : "border-line bg-surface"
                        } ${full ? "opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={full}
                          onChange={() =>
                            set(
                              "tests",
                              on
                                ? state.tests.filter((x) => x !== test.code)
                                : [...state.tests, test.code],
                            )
                          }
                          className="size-4"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-medium text-ink">{names.test(test.code)}</span>
                          <span className="text-label text-muted">
                            {t(`testKind.${test.kind}`)}
                          </span>
                        </span>
                        <span className="flex gap-1" aria-hidden="true">
                          {Object.keys(test.weights).map((cap) => (
                            <CapacityDot key={cap} capacity={cap as Capacity} size={8} />
                          ))}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-label text-muted">{t("testsWhen")}</p>
            </Card>
          ) : null}

          {step === "box" ? (
            <BoxFacts
              ctx={ctx}
              frequency={state.frequency}
              own={specific}
              onFrequency={(f) => set("frequency", f)}
              levelName={levelName}
              missing={missingEquipment(template, inventory)}
            />
          ) : null}

          {step === "summary" ? (
            <Card
              title={state.name || tpl(`${state.templateCode}.name`)}
              description={state.goal || tpl(`${state.templateCode}.pitch`)}
            >
              <div className="flex flex-col gap-5">
                <p className="text-secondary text-muted">
                  {t("summaryLine", {
                    from: names.shortDate(state.startsOn),
                    to: names.shortDate(endsOn),
                    weeks,
                    blocks: structure.blocks.length,
                  })}
                </p>
                {state.rationale ? (
                  <Alert kind="info" title={t("ai.why")}>
                    {state.rationale}
                  </Alert>
                ) : null}
                <CycleMap structure={structure} startsOn={state.startsOn} current={null} />
                <EmphasisBar emphasis={structure.blocks[0]?.emphasis ?? state.emphasis} />
                {specific ? (
                  <p className="text-secondary text-ink">
                    {t("summaryWho", {
                      who: audienceLabel || t(`audience.${who.audience}.name`),
                      count: who.members.length,
                      moving: who.replace.length,
                    })}
                  </p>
                ) : null}
                {!specific && ctx?.active ? (
                  <label className="flex items-start gap-3 rounded-control bg-raised p-3">
                    <input
                      type="checkbox"
                      checked={state.replaceActive}
                      onChange={(e) => set("replaceActive", e.target.checked)}
                      className="mt-1 size-4"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">
                        {t("replaceActive", { name: ctx.active.name })}
                      </span>
                      <span className="text-secondary text-muted">
                        {t("replaceActiveHint", { name: ctx.active.name })}
                      </span>
                    </span>
                  </label>
                ) : (
                  <label className="flex items-start gap-3 rounded-control bg-raised p-3">
                    <input
                      type="checkbox"
                      checked={state.activate}
                      onChange={(e) => set("activate", e.target.checked)}
                      className="mt-1 size-4"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">{t("activate")}</span>
                      <span className="text-secondary text-muted">
                        {specific ? t("activateHintOwn") : t("activateHint")}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </Card>
          ) : null}

          <div className="sticky bottom-24 z-20 flex items-center justify-between gap-2 rounded-card bg-surface p-3 shadow-float lg:bottom-4 precisa:border precisa:border-border">
            <Button
              variant="tertiary"
              disabled={index === 0}
              onClick={() => setStep(STEPS[index - 1]!)}
            >
              {t("prev")}
            </Button>
            <span className="text-secondary text-muted">
              {t("stepOf", { n: index + 1, total: STEPS.length, name: t(`step.${step}`) })}
            </span>
            {step === "summary" ? (
              <Button
                action="add"
                loading={creating}
                disabled={!ctx?.canWrite || total !== 100}
                onClick={() => void create()}
              >
                {t("create")}
              </Button>
            ) : (
              <Button disabled={!canNext} onClick={() => setStep(STEPS[index + 1]!)}>
                {t("next")}
              </Button>
            )}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label={t("expect")}>
          <Card title={t("expect")} description={picked ? t("expectHint") : t("expectEmpty")}>
            {picked ? (
              <ProjectionView
                projection={projection}
                frequency={state.frequency}
                calibrated={ctx?.calibration ?? null}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-control border-2 border-dashed border-line p-4 text-secondary text-muted">
                <Icon.ChartBar size={20} aria-hidden="true" className="shrink-0" />
                {t("expectPending")}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** El paso de "lo que ya sabe el box": de dónde sale cada dato, y la frecuencia de referencia. */
function BoxFacts({
  ctx,
  frequency,
  own,
  onFrequency,
  levelName,
  missing,
}: {
  ctx: ReturnType<typeof usePlanningContext>["data"] | null;
  frequency: number;
  /** Plan propio: la frecuencia es la de su gente, no la media del box. */
  own: boolean;
  onFrequency: (f: number) => void;
  levelName: ReturnType<typeof useLevelName>;
  missing: readonly string[];
}) {
  const t = useT("fitness.planning.wizard.box");
  const equipment = useT("fitness.exercises.equipment");
  const names = usePlanNames();
  if (!ctx) return <div className="h-64 animate-pulse rounded-card bg-raised" />;
  const levelsTotal = Object.values(ctx.levels).reduce((s, v) => s + v, 0);
  const row = (icon: ReactNode, title: string, body: ReactNode, source: string) => (
    <li className="flex gap-3 border-b border-line py-3 last:border-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raised text-ink">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium text-ink">{title}</span>
        <span className="text-secondary text-ink">{body}</span>
        <span className="text-label text-muted">{source}</span>
      </span>
    </li>
  );
  return (
    <Card title={t("title")} description={t("description")}>
      <ul className="flex flex-col">
        {row(
          <Icon.CalendarBlank size={18} aria-hidden="true" />,
          t("schedule"),
          ctx.classWeekdays.length > 0
            ? t("scheduleBody", {
                days: ctx.classWeekdays.map(names.weekdayShort).join(" · "),
                minutes: ctx.classMinutes,
                size: ctx.classSize,
              })
            : t("scheduleEmpty"),
          t("scheduleSource"),
        )}
        {row(
          <Icon.UsersThree size={18} aria-hidden="true" />,
          t("people"),
          levelsTotal > 0
            ? t("peopleBody", {
                athletes: ctx.athletes,
                levels: (["foundations", "scaled", "rx", "rx_plus"] as const)
                  .map(
                    (l) => `${levelName(l)} ${Math.round((ctx.levels[l] / levelsTotal) * 100)} %`,
                  )
                  .join(" · "),
              })
            : t("peopleNoLevels", { athletes: ctx.athletes }),
          t("peopleSource"),
        )}
        {row(
          <Icon.Pulse size={18} aria-hidden="true" />,
          t("frequency"),
          ctx.frequency.average !== null ? (
            <span className="flex flex-col gap-2">
              <span>
                {t("frequencyBody", {
                  average: ctx.frequency.average.toFixed(1).replace(".", ","),
                })}
              </span>
              {ctx.frequency.combos.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {ctx.frequency.combos.slice(0, 4).map((combo) => (
                    <StatusChip key={combo.days.join("")} kind="neutral">
                      {`${combo.days.map(names.weekdayShort).join(" · ")} · ${Math.round(combo.share * 100)} %`}
                    </StatusChip>
                  ))}
                </span>
              ) : null}
            </span>
          ) : (
            t("frequencyEmpty")
          ),
          t("frequencySource"),
        )}
        {row(
          <Icon.Barbell size={18} aria-hidden="true" />,
          t("equipment"),
          ctx.inventory.length > 0 ? (
            <span className="flex flex-col gap-1.5">
              <span>
                {ctx.inventory
                  .slice(0, 8)
                  .map((l) => `${l.available} ${l.name}`)
                  .join(" · ")}
              </span>
              {missing.length > 0 ? (
                <span className="text-warning">
                  {t("missing", { kinds: missing.map((k) => equipment(k)).join(", ") })}
                </span>
              ) : null}
            </span>
          ) : (
            t("equipmentEmpty")
          ),
          t("equipmentSource"),
        )}
        {row(
          <Icon.Target size={18} aria-hidden="true" />,
          t("library"),
          t("libraryBody", { total: ctx.exercises.total }),
          t("librarySource"),
        )}
        {ctx.previous.length > 0
          ? row(
              <Icon.ClockCounterClockwise size={18} aria-hidden="true" />,
              t("previous"),
              ctx.previous[0]!.headline
                ? t("previousBody", {
                    name: ctx.previous[0]!.name,
                    test: names.test(ctx.previous[0]!.headline.code),
                    real: ctx.previous[0]!.headline.realPct,
                    low: ctx.previous[0]!.headline.low,
                    high: ctx.previous[0]!.headline.high,
                  })
                : ctx.previous[0]!.name,
              t("previousSource"),
            )
          : null}
      </ul>
      <div className="mt-4 flex flex-col gap-2">
        <span className="text-secondary font-medium text-ink">{t("reference")}</span>
        <div className="max-w-full overflow-x-auto">
          <Segmented<string>
            label={t("reference")}
            value={String(frequency)}
            onChange={(v) => onFrequency(Number(v))}
            options={Array.from(
              { length: PLAN_FREQUENCY_MAX - PLAN_FREQUENCY_MIN + 1 },
              (_, i) => PLAN_FREQUENCY_MIN + i,
            ).map((d) => ({ key: String(d), label: String(d) }))}
          />
        </div>
        <span className="text-label text-muted">
          {t("referenceDays", { days: frequency })}
          {" · "}
          {own ? t("referenceHintOwn") : t("referenceHint")}
        </span>
      </div>
    </Card>
  );
}
