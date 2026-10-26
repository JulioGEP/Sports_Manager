import {
  AI_ARCHITECT_JSON_SCHEMA,
  AI_COPILOT_JSON_SCHEMA,
  AI_WEEK_JSON_SCHEMA,
  aiArchitectSystemPrompt,
  aiArchitectUserPrompt,
  aiCopilotSystemPrompt,
  aiCopilotUserPrompt,
  aiCostMicros,
  AiArchitectOutputSchema,
  AiCopilotOutputSchema,
  AiWeekOutputSchema,
  aiWeekSystemPrompt,
  aiWeekUserPrompt,
  averageFrequency,
  comboLabel,
  frequentCombos,
  inventoryOn,
  MOVEMENTS,
  resolveArchitect,
  resolveCopilot,
  resolveWeek,
  type AiBoxContext,
  type AiFailure,
  type AiPlanArchitectContext,
  type AiPlanCopilotContext,
  type AiPlanProposal,
  type AiPlanWeekContext,
  type AiUsage,
  type Locale,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import type { AiModelResult, AiPlanRecord, DataLayer, OrgScope } from "../data/index.ts";

/**
 * La IA de la planificación del box (ADR 0052): el contexto del box en agregados (sin un solo
 * atleta), la generación en segundo plano con el mismo trabajo y el mismo modelo que la propuesta de
 * WOD, y la validación de lo que devuelve el modelo antes de que el coach lo vea.
 */

const DAY = 86_400_000;

/** Lo que el planificador sabe del box: horario, gente, material, biblioteca. */
export interface BoxFacts {
  schedule: { weekdays: number[]; minutes: number; capacity: number };
  attendance: { playerId: string; date: string; eventId: string }[];
  levels: Record<WorkoutLevel, number>;
  levelNames: Record<WorkoutLevel, string>;
  inventory: Awaited<ReturnType<DataLayer["planning"]["equipment"]["lines"]>>;
  exercises: Awaited<ReturnType<DataLayer["exercises"]["list"]>>;
  athletes: number;
}

const DEFAULT_LEVEL_NAMES: Record<Locale, Record<WorkoutLevel, string>> = {
  es: { foundations: "Iniciación", scaled: "Scaled", rx: "RX", rx_plus: "RX+" },
  ca: { foundations: "Iniciació", scaled: "Scaled", rx: "RX", rx_plus: "RX+" },
  en: { foundations: "Foundations", scaled: "Scaled", rx: "RX", rx_plus: "RX+" },
};

export async function loadBoxFacts(
  data: DataLayer,
  scope: OrgScope,
  timezone: string,
  locale: Locale,
  sectionId: string,
  now = new Date(),
): Promise<BoxFacts> {
  const since = new Date(now.getTime() - 56 * DAY);
  const sinceDate = since.toISOString().slice(0, 10);
  const [schedule, attendance, levels, settings, inventory, exercises, athletes] =
    await Promise.all([
      data.planning.schedule(scope, sectionId),
      data.planning.attendance(scope, sectionId, since, now, timezone),
      data.planning.levelMix(scope, sectionId, sinceDate),
      data.planning.settings.get(scope),
      data.planning.equipment.lines(scope),
      data.exercises.list(scope),
      data.planning.activeAthletes(scope, sectionId, since),
    ]);
  const defaults = DEFAULT_LEVEL_NAMES[locale];
  return {
    schedule,
    attendance,
    levels,
    levelNames: {
      foundations: settings.levelNames.foundations ?? defaults.foundations,
      scaled: settings.levelNames.scaled ?? defaults.scaled,
      rx: settings.levelNames.rx ?? defaults.rx,
      rx_plus: settings.levelNames.rx_plus ?? defaults.rx_plus,
    },
    inventory,
    exercises,
    athletes,
  };
}

/** El box en agregados para el modelo. */
export function boxContextOf(
  facts: BoxFacts,
  input: { locale: Locale; sport: string; section: string; date: string },
): AiBoxContext {
  const available = inventoryOn(facts.inventory, input.date);
  const combos = frequentCombos(facts.attendance);
  const frequency = averageFrequency(facts.attendance);
  return {
    locale: input.locale,
    sport: input.sport,
    section: input.section,
    classWeekdays: facts.schedule.weekdays,
    classMinutes: facts.schedule.minutes,
    classSize: facts.schedule.capacity,
    athletes: facts.athletes,
    levels: facts.levels,
    levelNames: facts.levelNames,
    frequency,
    combos: combos.map(
      (c) =>
        `${comboLabel(c.days, input.locale)}: ${Math.round(c.share * 100)} % de los de ${c.days.length} días`,
    ),
    equipment: facts.inventory.map((l) => ({
      kind: l.kind,
      name: l.name,
      available: available.get(l.kind) ?? 0,
      weights: l.weights,
    })),
    exercises: facts.exercises
      .filter((e) => e.status === "active")
      .map((e) => ({ name: e.name, equipment: e.equipment, scaling: e.scaling })),
    movements: MOVEMENTS.map((m) => ({ code: m.code, name: m.name[input.locale] })),
  };
}

/** Nombre del ejercicio en minúsculas → id: para leer lo que escribe el modelo. */
export function exerciseIndex(facts: BoxFacts): Record<string, string> {
  return Object.fromEntries(facts.exercises.map((e) => [e.name.trim().toLowerCase(), e.id]));
}

/** Lo que se guarda con cada generación: el contexto del modelo y el índice de ejercicios. */
export type StoredPlanContext =
  | {
      kind: "plan_architect";
      locale: Locale;
      exerciseIds: Record<string, string>;
      context: AiPlanArchitectContext;
    }
  | {
      kind: "plan_week";
      locale: Locale;
      exerciseIds: Record<string, string>;
      context: AiPlanWeekContext;
    }
  | {
      kind: "plan_copilot";
      locale: Locale;
      exerciseIds: Record<string, string>;
      context: AiPlanCopilotContext;
    };

const ZERO: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const sumUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** De la salida del modelo a la propuesta validada, según lo que se pidió. Nula si no vale. */
export function resolvePlanOutput(stored: StoredPlanContext, raw: unknown): AiPlanProposal | null {
  const index = new Map(Object.entries(stored.exerciseIds));
  if (stored.kind === "plan_architect") {
    const parsed = AiArchitectOutputSchema.safeParse(raw);
    if (!parsed.success) return null;
    const p = resolveArchitect(parsed.data);
    return p ? { kind: "plan_architect", ...p } : null;
  }
  if (stored.kind === "plan_week") {
    const parsed = AiWeekOutputSchema.safeParse(raw);
    if (!parsed.success) return null;
    const sessions = resolveWeek(parsed.data, stored.context, index);
    return sessions.length > 0 ? { kind: "plan_week", sessions } : null;
  }
  const parsed = AiCopilotOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = resolveCopilot(parsed.data, stored.context, index);
  return p ? { kind: "plan_copilot", ...p } : null;
}

function promptsOf(stored: StoredPlanContext) {
  switch (stored.kind) {
    case "plan_architect":
      return {
        system: aiArchitectSystemPrompt(stored.locale),
        user: aiArchitectUserPrompt(stored.context),
        schema: AI_ARCHITECT_JSON_SCHEMA as unknown as Record<string, unknown>,
      };
    case "plan_week":
      return {
        system: aiWeekSystemPrompt(stored.locale),
        user: aiWeekUserPrompt(stored.context),
        schema: AI_WEEK_JSON_SCHEMA as unknown as Record<string, unknown>,
      };
    case "plan_copilot":
      return {
        system: aiCopilotSystemPrompt(stored.locale),
        user: aiCopilotUserPrompt(stored.context),
        schema: AI_COPILOT_JSON_SCHEMA as unknown as Record<string, unknown>,
      };
  }
}

/**
 * Genera una petición de la planificación ya tomada por el trabajo en segundo plano. Una salida
 * truncada o que no se puede leer se reintenta una vez; si falla, la plaza vuelve al club.
 */
export async function runPlanGeneration(
  data: DataLayer,
  scope: OrgScope,
  record: AiPlanRecord,
): Promise<void> {
  const started = Date.now();
  let usage = ZERO;
  let model = record.model;
  const spent = () => ({
    usage,
    costMicros: aiCostMicros(model, usage),
    durationMs: Date.now() - started,
  });
  const fail = (failure: AiFailure) => data.ai.markFailed(scope, record.id, failure, spent());
  try {
    if (!data.aiModel) return await fail("not_configured");
    const stored = record.context as unknown as StoredPlanContext;
    const { system, user, schema } = promptsOf(stored);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result: AiModelResult = await data.aiModel.generate({
        model: record.model,
        system,
        user,
        schema,
      });
      if (result.kind === "error") return await fail(result.failure);
      usage = sumUsage(usage, result.usage);
      model = result.model;
      if (result.kind === "refused") return await fail("refused");
      if (result.kind === "truncated") continue;
      const raw = parse(result.text);
      const proposal = raw ? resolvePlanOutput(stored, raw) : null;
      if (!proposal) continue;
      await data.ai.markPlanReady(scope, record.id, {
        model,
        output: raw as Record<string, unknown>,
        proposal,
        ...spent(),
      });
      return;
    }
    await fail("invalid_output");
  } catch (error) {
    console.error("[ai] plan generation failed", error);
    await fail("model_error");
  }
}
