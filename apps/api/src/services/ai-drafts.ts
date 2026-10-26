import { createHmac, timingSafeEqual } from "node:crypto";
import {
  addDays,
  AI_LIBRARY_LIMIT,
  AI_PROPOSAL_JSON_SCHEMA,
  aiCostMicros,
  aiProfileFor,
  aiSystemPrompt,
  aiUserPrompt,
  AiProposalSchema,
  ageOn,
  medianAge,
  playerDisplayName,
  redactNames,
  resolveProposal,
  type AiContext,
  type AiDraftRequest,
  type AiEmphasis,
  type AiFailure,
  type AiProposalOutput,
  type AiUsage,
  type Insight,
  type Locale,
  type TrainingSettings,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  instantOf,
  localDate,
  type AiModelResult,
  type DataLayer,
  type DrillRecord,
  type OrgScope,
  type TeamRecord,
  type TrainingContentRecord,
} from "../data/index.ts";
import { runPlanGeneration } from "./ai-plans.ts";
import { runWodGeneration } from "./ai-wods.ts";

/**
 * Propuesta de sesión con IA (ADR 0044): reunir el contexto, generar en segundo plano y validar.
 * La API arma el contexto con lo que ya sabe el club, sin datos personales: los jugadores van como
 * J1, J2…, y los nombres que alguien escriba en el texto libre se cambian por su referencia.
 */

/** Función en segundo plano de Netlify (hasta 15 minutos) que genera la propuesta. */
export const AI_WORKER_PATH = "/.netlify/functions/ai-draft-background";

/** Firma del id de la propuesta: solo la API puede pedir al trabajo en segundo plano que la genere. */
export function signGeneration(secret: string, id: string): string {
  return createHmac("sha256", secret).update(`ai-draft:${id}`).digest("hex");
}

export function verifyGeneration(secret: string, id: string, signature: string): boolean {
  const expected = Buffer.from(signGeneration(secret, id), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;

/** Grupo en formación: lo dice la sección o, si no, la mediana de edad (menos de 16). */
export function isFormativeTeam(settings: TrainingSettings, ages: readonly (number | null)[]) {
  if (settings.formative !== null) return settings.formative;
  const median = medianAge(ages);
  return median !== null && median < 16;
}

export interface ContextInput {
  data: DataLayer;
  scope: OrgScope;
  timezone: string;
  locale: Locale;
  team: TeamRecord;
  sport: { code: string; name: string };
  settings: TrainingSettings;
  formative: boolean;
  request: AiDraftRequest;
  emphasis: AiEmphasis;
  events: Awaited<ReturnType<DataLayer["ai"]["trainingEvents"]>>;
  /** Recomendaciones ya filtradas por lo que quien pide puede ver. */
  insights: readonly Insight[];
  contents: readonly TrainingContentRecord[];
  library: readonly DrillRecord[];
}

/** El contexto exacto que verá el modelo. Se guarda con la propuesta. */
export async function buildAiContext(input: ContextInput): Promise<AiContext> {
  const { data, scope, timezone: tz, team, settings } = input;
  const profile = aiProfileFor(input.sport.code, input.formative);
  const firstDate = localDate(tz, input.events[0]!.startsAt);
  const roster = (await data.teams.roster(scope, team.id)).filter((r) => r.status === "active");
  const availability = await data.load.currentFor(
    scope,
    roster.map((r) => r.playerId),
  );
  const ages = roster.map((r) => ageOn(r.birthDate, new Date(`${firstDate}T12:00:00Z`)));
  const known = ages.filter((a): a is number => a !== null);
  const refOf = new Map(roster.map((r, i) => [r.playerId, `J${i + 1}`]));
  const people = roster.map((r) => ({
    ref: refOf.get(r.playerId)!,
    names: [playerDisplayName(r), r.firstName, r.lastName],
  }));
  const redact = (text: string | null | undefined) =>
    text?.trim() ? redactNames(text.trim(), people) : null;

  const contents = input.contents.filter((c) => c.status === "active");
  const contentRef = new Map(contents.map((c, i) => [c.id, `C${i + 1}`]));
  const contentRefs = (ids: readonly string[]) =>
    ids.map((id) => contentRef.get(id)).filter((r): r is string => !!r);

  const library = [...input.library]
    .filter((d) => d.status === "active")
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.uses - a.uses)
    .slice(0, AI_LIBRARY_LIMIT);

  const [cycles, matches, recent] = await Promise.all([
    data.training.cyclesOfTeam(scope, team.id),
    data.matches.listForTeam(scope, team.id),
    data.training.teamSessions(
      scope,
      team.id,
      instantOf(tz, addDays(firstDate, -14)),
      instantOf(tz, firstDate),
    ),
  ]);
  const recentItems = await data.training.itemsOf(
    scope,
    recent.map((s) => s.id),
  );
  const cycle = cycles.find((cy) => cy.startsOn <= firstDate && cy.endsOn >= firstDate) ?? null;
  const previous = matches
    .filter((m) => m.status === "finished" && m.playedOn < firstDate)
    .sort((a, b) => b.playedOn.localeCompare(a.playedOn))[0];
  const upcoming = await data.training.teamEvents(
    scope,
    team.id,
    instantOf(tz, firstDate),
    instantOf(tz, addDays(firstDate, 15)),
  );
  const next = upcoming.find((e) => e.kind === "match");
  const equipment = (await data.ai.equipmentOf(scope, team.section.id)).filter(
    (e) => !input.request.equipmentIds || input.request.equipmentIds.includes(e.id),
  );
  const nameOf = new Map(contents.map((c) => [c.id, c.name]));

  return {
    locale: input.locale,
    profile,
    sport: input.sport.name,
    section: team.section.name,
    team: team.name,
    category: team.category,
    formative: input.formative,
    ages:
      known.length > 0
        ? { median: medianAge(known)!, min: Math.min(...known), max: Math.max(...known) }
        : null,
    methodologyNotes: redact(settings.methodologyNotes),
    sessions: input.events.map((e, i) => {
      const date = localDate(tz, e.startsAt);
      const start = new Intl.DateTimeFormat("es-ES", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(e.startsAt);
      return {
        ref: `S${i + 1}`,
        eventId: e.id,
        date,
        weekday: weekdayOf(date),
        start,
        minutes: Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
        facility: e.facility
          ? { name: e.facility.name, kind: e.facility.kind, description: e.facility.description }
          : null,
        mdLabel: e.session?.mdLabel ?? null,
        objective: redact(e.session?.objective),
      };
    }),
    roster: roster.map((r) => {
      const a = availability.get(r.playerId);
      return {
        ref: refOf.get(r.playerId)!,
        playerId: r.playerId,
        position: r.position,
        goalkeeper: r.position ? /port|keeper|goalie/i.test(r.position) : false,
        status: a?.status ?? "available",
        restrictions: a?.restrictions ?? [],
        maxMinutes: a?.maxMinutes ?? null,
      };
    }),
    cycle: cycle
      ? {
          name: cycle.name,
          focus: cycle.focusContentIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n),
          targetWeeklyLoad: cycle.targetWeeklyLoad,
        }
      : null,
    previousMatch: previous
      ? {
          date: previous.playedOn,
          opponent: previous.opponent,
          result: `${previous.ownScore}-${previous.opponentScore}`,
        }
      : null,
    nextMatch: next ? { date: localDate(tz, next.startsAt), opponent: next.opponent } : null,
    recentSessions: recent.map((s) => ({
      date: localDate(tz, s.startsAt),
      objective: redact(s.objective),
      items: recentItems
        .filter((i) => i.sessionId === s.id)
        .map((i) => `${i.title} (${i.minutes} min)`),
    })),
    insights: input.insights.slice(0, 15).map((i) => {
      // Las cifras de una recomendación de jugador llevan su nombre: va su referencia.
      const ref = i.playerId ? (refOf.get(i.playerId) ?? null) : null;
      const values = Object.fromEntries(
        Object.entries(i.values).map(([k, v]) => [
          k,
          k === "name" && ref ? ref : typeof v === "string" ? redactNames(v, people) : v,
        ]),
      );
      return {
        rule: i.rule,
        level: i.level,
        player: ref,
        values,
        contents: contentRefs(i.contentIds),
      };
    }),
    contents: contents.map((c) => ({
      ref: contentRef.get(c.id)!,
      id: c.id,
      name: c.name,
      kind: c.kind,
    })),
    library: library.map((d, i) => ({
      ref: `T${i + 1}`,
      id: d.id,
      name: d.name,
      description: d.description ? d.description.slice(0, 240) : null,
      contents: contentRefs(d.contents.map((c) => c.id)),
      format: d.format,
      space: d.space,
      playersMin: d.playersMin,
      playersMax: d.playersMax,
      durationMin: d.durationMin,
      targetRpe: d.targetRpe,
      material: d.material,
      restrictionTags: d.restrictionTags,
      rating: d.rating,
      uses: d.uses,
    })),
    equipment: equipment.map((e) => ({ name: e.name, quantity: e.quantity })),
    request: {
      objective: redact(input.request.objective),
      emphasis: input.emphasis,
      intensity: input.request.intensity,
      extraEquipment: redact(input.request.extraEquipment),
      context: redact(input.request.context),
      libraryOnly: input.request.libraryOnly ?? false,
      includeVariants: input.request.includeVariants ?? true,
    },
  };
}

const sumUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});
const ZERO: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function parseOutput(text: string): AiProposalOutput | null {
  try {
    const parsed = AiProposalSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Genera la propuesta: toma la que está en cola (si otra llamada ya la tomó, no hace nada), llama
 * al modelo, lee la salida y la valida contra el contexto. Una salida truncada o que no se puede
 * leer se reintenta una vez. Si falla, la plaza de la cuota vuelve al club.
 */
export async function runGeneration(data: DataLayer, id: string): Promise<void> {
  const claimed = await data.ai.claim(id);
  if (!claimed) return;
  // El WOD de un box (ADR 0049) usa el mismo registro, la misma cuota y el mismo trabajo.
  if (claimed.kind === "wod") return runWodGeneration(data, claimed.scope, claimed.record);
  // La planificación del box (ADR 0052), también.
  if (claimed.kind === "plan") return runPlanGeneration(data, claimed.scope, claimed.record);
  const { scope, record } = claimed;
  const started = Date.now();
  let usage = ZERO;
  let model = record.model;
  const spent = () => ({
    usage,
    costMicros: aiCostMicros(model, usage),
    durationMs: Date.now() - started,
  });
  const fail = (failure: AiFailure) => data.ai.markFailed(scope, id, failure, spent());
  try {
    if (!data.aiModel) return await fail("not_configured");
    const system = aiSystemPrompt(record.context);
    const user = aiUserPrompt(record.context);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result: AiModelResult = await data.aiModel.generate({
        model: record.model,
        system,
        user,
        schema: AI_PROPOSAL_JSON_SCHEMA,
      });
      if (result.kind === "error") return await fail(result.failure);
      usage = sumUsage(usage, result.usage);
      model = result.model;
      if (result.kind === "refused") return await fail("refused");
      if (result.kind === "truncated") continue;
      const output = parseOutput(result.text);
      if (!output) continue;
      const proposal = resolveProposal(output, record.context);
      if (proposal.sessions.length === 0) continue;
      await data.ai.markReady(scope, id, { model, output, proposal, ...spent() });
      return;
    }
    await fail("invalid_output");
  } catch (error) {
    console.error("[ai] generation failed", error);
    await fail("model_error");
  }
}

/**
 * Pone a generar una propuesta reservada. En Netlify la manda a la función en segundo plano, que
 * responde enseguida y sigue trabajando; en local sin Netlify y en tests la genera aquí mismo.
 */
export async function dispatchGeneration(
  config: ApiConfig,
  data: DataLayer,
  id: string,
  origin: string,
): Promise<boolean> {
  if (config.ai.runner === "inline") {
    await runGeneration(data, id);
    return true;
  }
  try {
    const response = await fetch(new URL(AI_WORKER_PATH, origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, signature: signGeneration(config.authSecret, id) }),
    });
    return response.ok;
  } catch (error) {
    console.error("[ai] dispatch failed", error);
    return false;
  }
}
