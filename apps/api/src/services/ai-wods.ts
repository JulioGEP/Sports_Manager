import {
  addDays,
  AI_WOD_DEFAULT_MINUTES,
  AI_WOD_JSON_SCHEMA,
  aiCostMicros,
  aiWodCatalogs,
  aiWodSystemPrompt,
  aiWodUserPrompt,
  AiWodOutputSchema,
  movementByCode,
  redactNames,
  resolveWodProposal,
  type AiFailure,
  type AiUsage,
  type AiWodContext,
  type AiWodContextWorkout,
  type AiWodOutput,
  type AiWodRequest,
  type Locale,
} from "@sportsmanager/shared";
import type { AiModelResult, AiWodRecord, DataLayer, OrgScope } from "../data/index.ts";

/**
 * Propuesta de WOD con IA (ADR 0049): reunir el contexto y generar en segundo plano, como la
 * propuesta de sesiones (ADR 0044). El modelo ve la disciplina, lo programado alrededor del día,
 * el material y el foco del coach; nunca a los atletas. Si el coach nombra a alguien en el foco,
 * el nombre se cambia por «[atleta]».
 */

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;

/** Días de alrededor que mira el modelo: dos semanas antes y una después. */
export const AI_WOD_DAYS_BEFORE = 14;
export const AI_WOD_DAYS_AFTER = 7;

export interface WodContextInput {
  data: DataLayer;
  scope: OrgScope;
  timezone: string;
  locale: Locale;
  section: { id: string; name: string };
  sport: string;
  team: { id: string; name: string } | null;
  request: AiWodRequest;
}

/** El contexto exacto que verá el modelo. Se guarda con la propuesta. */
export async function buildWodContext(input: WodContextInput): Promise<AiWodContext> {
  const { data, scope, request } = input;
  const date = request.onDate;
  const [workouts, equipment, athletes, exercises] = await Promise.all([
    data.workouts.list(
      scope,
      addDays(date, -AI_WOD_DAYS_BEFORE),
      addDays(date, AI_WOD_DAYS_AFTER),
      {
        sectionIds: [input.section.id],
      },
    ),
    data.ai.equipmentOf(scope, input.section.id),
    request.focus?.trim()
      ? data.fitness.athletes(scope, input.timezone, new Date())
      : Promise.resolve([]),
    data.exercises.names(scope, [input.section.id]),
  ]);
  const people = athletes.map((a) => ({
    ref: "[atleta]",
    names: [`${a.firstName} ${a.lastName}`, a.firstName, a.lastName],
  }));
  const focus = request.focus?.trim() ? redactNames(request.focus.trim(), people) : null;
  const toContext = (w: (typeof workouts)[number]): AiWodContextWorkout => ({
    date: w.onDate,
    weekday: weekdayOf(w.onDate),
    title: w.title,
    classType: w.team?.name ?? null,
    blocks: w.blocks.map((b) => ({
      kind: b.kind,
      title: b.title,
      scoreType: b.scoreType,
      movement: movementByCode(b.movementCode)?.name[input.locale] ?? null,
      timeCapSeconds: b.timeCapSeconds,
    })),
  });
  const published = workouts
    .filter((w) => w.status === "published" && w.onDate !== date)
    .sort((a, b) => a.onDate.localeCompare(b.onDate));
  return {
    locale: input.locale,
    sport: input.sport,
    section: input.section.name,
    classType: input.team?.name ?? null,
    date,
    weekday: weekdayOf(date),
    minutes: request.durationMinutes ?? AI_WOD_DEFAULT_MINUTES,
    focus,
    recent: published.filter((w) => w.onDate < date).map(toContext),
    upcoming: published.filter((w) => w.onDate > date).map(toContext),
    equipment: equipment.map((e) => ({ name: e.name, quantity: e.quantity })),
    ...aiWodCatalogs(input.locale),
    exercises,
  };
}

const sumUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});
const ZERO: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function parseOutput(text: string): AiWodOutput | null {
  try {
    const parsed = AiWodOutputSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Genera una propuesta de WOD ya tomada por el trabajo en segundo plano: llama al modelo, lee la
 * salida y la valida con el formato del editor. Una salida truncada o que no vale se reintenta una
 * vez. Si falla, la plaza de la cuota vuelve al club.
 */
export async function runWodGeneration(
  data: DataLayer,
  scope: OrgScope,
  record: AiWodRecord,
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
    const system = aiWodSystemPrompt(record.context);
    const user = aiWodUserPrompt(record.context);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result: AiModelResult = await data.aiModel.generate({
        model: record.model,
        system,
        user,
        schema: AI_WOD_JSON_SCHEMA,
      });
      if (result.kind === "error") return await fail(result.failure);
      usage = sumUsage(usage, result.usage);
      model = result.model;
      if (result.kind === "refused") return await fail("refused");
      if (result.kind === "truncated") continue;
      const output = parseOutput(result.text);
      if (!output) continue;
      const proposal = resolveWodProposal(output);
      if (!proposal) continue;
      await data.ai.markWodReady(scope, record.id, { model, output, proposal, ...spent() });
      return;
    }
    await fail("invalid_output");
  } catch (error) {
    console.error("[ai] wod generation failed", error);
    await fail("model_error");
  }
}
