import {
  addDays,
  AiPlanGenerationResponseSchema,
  buildPlanStructure,
  CAPACITIES,
  missingEquipment,
  normalizeEmphasis,
  PLAN_TEMPLATES,
  PLAN_TESTS,
  PlanResponseSchema,
  planEndsOn,
  planTemplateByCode,
  projectPlan,
  weekStartOf,
  type BoxEquipmentKind,
  type Capacity,
  type Emphasis,
  type PlanBlockKind,
  type PlanDiscipline,
  type PlanTemplateCode,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
import { useAiPlanGeneration, useLevelName, usePlanningContext } from "@/lib/planning";
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

const STEPS = ["goal", "calendar", "emphasis", "tests", "box", "summary"] as const;
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
  frequency: number;
  activate: boolean;
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
    frequency: 3,
    activate: true,
    phases: null,
    rationale: null,
  };
}

/** Semanas entre el lunes de inicio y el evento (la semana del evento incluida). */
const weeksUntil = (startsOn: string, eventDate: string) =>
  Math.floor(
    (Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / (7 * 86_400_000),
  ) + 1;

/**
 * Crear un plan (ADR 0053) en seis pasos: el objetivo (una plantilla o lo que proponga la IA), el
 * calendario, el reparto de los 100 puntos, los tests, lo que ya sabe el box y el resumen. A la
 * derecha, todo el rato, lo que se puede esperar: se mueve al tocar cualquier cosa.
 */
export function PlanWizardPage() {
  const t = useT("fitness.planning.wizard");
  const tpl = useT("fitness.planning.templates");
  const c = useT("fitness.common");
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
  const [step, setStep] = useState<Step>("goal");
  const [creating, setCreating] = useState(false);
  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  // Frecuencia de referencia: la del box, redondeada entre 2 y 4.
  const frequencySet = useRef(false);
  useEffect(() => {
    if (!ctx || frequencySet.current) return;
    frequencySet.current = true;
    const avg = ctx.frequency.average;
    if (avg !== null) set("frequency", Math.max(2, Math.min(4, Math.round(avg))));
  }, [ctx]);

  const template = planTemplateByCode(state.templateCode)!;
  const inventory = useMemo(() => {
    const m = new Map<BoxEquipmentKind, number>();
    for (const l of ctx?.inventory ?? []) m.set(l.kind as BoxEquipmentKind, l.available);
    return m;
  }, [ctx]);

  const pickTemplate = (code: PlanTemplateCode) => {
    setState((s) => ({
      ...fromTemplate(code, s.startsOn, tpl(`${code}.name`)),
      frequency: s.frequency,
      closures: s.closures,
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
        classWeekdays: ctx && ctx.classWeekdays.length > 0 ? ctx.classWeekdays : [1, 2, 3, 4, 5],
        closures: state.closures,
        emphasis: total === 100 ? state.emphasis : normalizeEmphasis(state.emphasis),
        tests: state.tests,
        ...(state.phases ? { phases: state.phases } : {}),
        eventDate: state.eventDate || null,
      }),
    [template, discipline, state, weeks, ctx, total],
  );
  const projection = useMemo(
    () =>
      projectPlan({
        emphasis: total === 100 ? state.emphasis : normalizeEmphasis(state.emphasis),
        weeks,
        frequency: state.frequency,
        levelMix: ctx?.levels ?? {},
        tests: state.tests,
        ...(ctx?.calibration ? { calibration: ctx.calibration } : {}),
      }),
    [state.emphasis, state.frequency, state.tests, weeks, ctx, total],
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
        name: p.name,
        goal: aiGoal,
        weeks: p.weeks,
        emphasis: p.emphasis,
        tests: p.tests,
        phases: p.phases,
        rationale: p.rationale,
      }));
      setPicked(true);
    }
  }, [aiGen, aiGoal, t]);

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
          ...(state.phases ? { phases: state.phases } : {}),
          activate: state.activate && !ctx.active,
        },
        schema: PlanResponseSchema,
      });
      await invalidate();
      toast("success", t("created", { name: res.plan.name }));
      void navigate(paths.planningPlan(res.plan.id));
    } catch (err) {
      toast(
        "error",
        err instanceof ApiClientError && err.status === 409 ? t("activeTaken") : errorText(err),
      );
    } finally {
      setCreating(false);
    }
  }

  const index = STEPS.indexOf(step);
  const canNext =
    step === "goal"
      ? picked
      : step === "calendar"
        ? state.name.trim().length > 0 &&
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
      {ctx?.active ? <Alert kind="info">{t("hasActive", { name: ctx.active.name })}</Alert> : null}

      <ol className="grid grid-cols-6 gap-1.5" aria-label={t("steps")}>
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
                <label className="flex items-start gap-3 rounded-control bg-raised p-3">
                  <input
                    type="checkbox"
                    checked={state.activate && !ctx?.active}
                    disabled={Boolean(ctx?.active)}
                    onChange={(e) => set("activate", e.target.checked)}
                    className="mt-1 size-4"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">{t("activate")}</span>
                    <span className="text-secondary text-muted">
                      {ctx?.active
                        ? t("activateTaken", { name: ctx.active.name })
                        : t("activateHint")}
                    </span>
                  </span>
                </label>
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
              <p className="text-secondary text-muted">{c("loading")}</p>
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
  onFrequency,
  levelName,
  missing,
}: {
  ctx: ReturnType<typeof usePlanningContext>["data"] | null;
  frequency: number;
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
        <Segmented<string>
          label={t("reference")}
          value={String(frequency)}
          onChange={(v) => onFrequency(Number(v))}
          options={[2, 3, 4].map((d) => ({ key: String(d), label: t("days", { days: d }) }))}
        />
        <span className="text-label text-muted">{t("referenceHint")}</span>
      </div>
    </Card>
  );
}
