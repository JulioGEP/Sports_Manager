import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import {
  addDays,
  AI_PLAN_WEEKLY_LIMIT,
  AiPlanApplyResponseSchema,
  AiPlanApplySchema,
  AiPlanArchitectRequestSchema,
  AiPlanCopilotRequestSchema,
  AiPlanGenerationResponseSchema,
  AiPlanWeekRequestSchema,
  aiQuotaResetsOn,
  blockLabel,
  COMPLEMENTS,
  DAY_ROLE_INFO,
  DAY_ROLE_NAMES,
  engineMinutesFor,
  movementName,
  planEndsOn,
  PLAN_TEMPLATES,
  planWeekOf,
  prescriptionFor,
  weekStartOf,
  type AiPlanDay,
  type AiPlanKind,
  type AiPlanSession,
  type AiPlanWeekContext,
  type DayRole,
  type Locale,
  type PlanStructure,
  type ReviewLearned,
  type WorkoutUpsert,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { AiPlanRecord, BoxPlanRecord, DataLayer, WorkoutRecord } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { aiUnavailable, badRequest, conflict, notFound, quotaExceeded } from "../http/errors.ts";
import { dispatchGeneration } from "../services/ai-drafts.ts";
import {
  boxContextOf,
  exerciseIndex,
  loadBoxFacts,
  type StoredPlanContext,
} from "../services/ai-plans.ts";
import {
  auditOf,
  body,
  errorResponse,
  errors,
  idParam,
  json,
  orgOf,
  type Ctx,
} from "./fitness-common.ts";
import {
  clubToday,
  disciplineFor,
  loadWeek,
  planSections,
  requirePlan,
  requireWritablePlan,
  upsertFrom,
  weekCoverage,
} from "./planning-common.ts";
import { computeReview } from "./planning-review.ts";

/**
 * La IA de la planificación del box (ADR 0052): el arquitecto propone el plan a partir de un
 * objetivo, el programador escribe las sesiones de una semana dentro de lo que manda el plan y el
 * copiloto cambia la programación cuando pasa algo ("el jueves no hay remos"). Todo se genera en
 * segundo plano con su propio límite semanal y el coach decide qué se aplica: nada se publica solo.
 */
export function addPlanningAiRoutes(app: OpenAPIHono<AppEnv>, config: ApiConfig, data: DataLayer) {
  const audit = auditOf(data);
  const read = requirePermission("org.training.read");

  const isAvailable = () => config.ai.configured && data.aiModel !== null;
  const localeOfClub = (c: Ctx) => orgOf(c).organization.defaultLocale as Locale;

  async function quotaOf(c: Ctx) {
    const tenant = orgOf(c);
    const from = weekStartOf(clubToday(c));
    const used = await data.ai.planUsedThisWeek(tenant.scope, from);
    return {
      limit: AI_PLAN_WEEKLY_LIMIT,
      used,
      remaining: Math.max(0, AI_PLAN_WEEKLY_LIMIT - used),
      resetsOn: aiQuotaResetsOn(from),
    };
  }

  async function responseOf(c: Ctx, g: AiPlanRecord) {
    const request = g.request as { week?: number; message?: string };
    return {
      generation: {
        id: g.id,
        kind: g.kind,
        status: g.status,
        failure: g.failure,
        planId: g.planId,
        week: request.week ?? null,
        message: request.message ?? null,
        proposal: g.status === "ready" ? g.proposal : null,
        appliedAt: g.appliedAt?.toISOString() ?? null,
        quota: await quotaOf(c),
      },
    };
  }

  /** Reserva, apunta y lanza una generación; devuelve su estado (en cola o ya lista). */
  async function launch(
    c: Ctx,
    input: {
      kind: AiPlanKind;
      sectionId: string;
      planId: string | null;
      request: Record<string, unknown>;
      stored: StoredPlanContext;
      target: string;
    },
  ) {
    const tenant = orgOf(c);
    const reserved = await data.ai.reservePlan(tenant.scope, {
      kind: input.kind,
      sectionId: input.sectionId,
      planId: input.planId,
      requestedBy: c.get("sessionUser").id,
      weekStart: weekStartOf(clubToday(c)),
      model: config.ai.model,
      request: input.request,
      context: input.stored,
    });
    if (reserved === "quota_exceeded") throw quotaExceeded();
    await audit(c, "plan_ai.requested", input.target, { kind: input.kind, ...input.request });
    const dispatched = await dispatchGeneration(
      config,
      data,
      reserved.id,
      new URL(c.req.url).origin,
    );
    if (!dispatched) await data.ai.markFailed(tenant.scope, reserved.id, "model_error");
    const generation = await data.ai.planById(tenant.scope, reserved.id);
    if (!generation) throw notFound();
    return responseOf(c, generation);
  }

  const aiResponses = {
    201: json("Propuesta pedida", AiPlanGenerationResponseSchema),
    429: errorResponse("Límite semanal de la planificación gastado"),
    503: errorResponse("La IA no está disponible en este club"),
    ...errors,
  };

  // --- Arquitecto ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plan-ai/architect",
      tags: ["Planificación"],
      summary:
        "Pide a la IA la estructura de un plan a partir de un objetivo en palabras, con lo que sabe del box",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: body(AiPlanArchitectRequestSchema),
      responses: aiResponses,
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const sections = await planSections(data, c);
      // Que la disciplina sea del box se mira con todas; planificar en ella, con las suyas.
      const section = (await data.fitness.fitnessSections(orgOf(c).scope)).find(
        (s) => s.id === input.sectionId,
      );
      if (!section)
        throw badRequest("Esa disciplina no es de este box o no tiene clases abiertas.");
      requireWritablePlan(sections.writable.includes(section.id));
      if (!isAvailable()) throw aiUnavailable();
      const locale = localeOfClub(c);
      const [facts, discipline] = await Promise.all([
        loadBoxFacts(data, tenant.scope, tenant.organization.timezone, locale, section.id),
        disciplineFor(data, tenant.scope, section),
      ]);
      const stored: StoredPlanContext = {
        kind: "plan_architect",
        locale,
        exerciseIds: exerciseIndex(facts),
        context: {
          box: boxContextOf(facts, {
            locale,
            sport: discipline.sport ?? discipline.discipline,
            section: section.name,
            date: clubToday(c),
          }),
          goal: input.goal,
          startsOn: weekStartOf(input.startsOn),
          templates: PLAN_TEMPLATES.map((t) => ({
            code: t.code,
            weeks: `${t.weeks.default} (${t.weeks.min}-${t.weeks.max})`,
            emphasis: Object.entries(t.emphasis)
              .map(([k, v]) => `${k} ${v}`)
              .join(", "),
            tests: t.tests.join(", "),
          })),
        },
      };
      return c.json(
        await launch(c, {
          kind: "plan_architect",
          sectionId: section.id,
          planId: null,
          request: { sectionId: section.id, goal: input.goal, startsOn: input.startsOn },
          stored,
          target: section.name,
        }),
        201,
      );
    },
  );

  // --- Programador de la semana ---

  const withName = (p: ReturnType<typeof prescriptionFor>, locale: Locale) =>
    p ? { ...p, movementName: movementName(p.movementCode, locale) } : null;

  const learnedText: Record<ReviewLearned["code"], (v: number, n: number) => string> = {
    time_run: (v, n) =>
      `Los WODs con carrera salen un ${Math.round(v)} % más largos de lo previsto (${n} WODs).`,
    time_row: (v, n) =>
      `Los WODs con remo salen un ${Math.round(v)} % más largos de lo previsto (${n} WODs).`,
    time_other: (v, n) =>
      `El resto de WODs por tiempo sale un ${Math.round(v)} % respecto a lo previsto (${n} WODs).`,
    effort_long_engine: (v) =>
      `El motor largo se va ${v.toFixed(1)} puntos de esfuerzo por encima del objetivo.`,
    attendance_saturday: (v) =>
      `El sábado viene un ${Math.round(v)} % de gente respecto a la media del resto de días.`,
  };

  function planFacts(plan: BoxPlanRecord, n: number, locale: Locale): AiPlanWeekContext["plan"] {
    const week = plan.structure.weeks[n - 1]!;
    const block = plan.structure.blocks[week.block]!;
    return {
      name: plan.name,
      goal: plan.goal,
      week: n,
      weeks: plan.weeks,
      block: blockLabel(plan.structure, week.block, locale),
      blockKind: block.kind,
      blockFocus: block.focus,
      volume: week.volume,
      intensity: week.intensity,
      emphasis: block.emphasis,
    };
  }

  const weekParams = z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(1).max(60) });

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans/{id}/weeks/{n}/ai",
      tags: ["Planificación"],
      summary:
        "Pide a la IA las sesiones de los días sin WOD de una semana del plan, dentro de su papel, su intención y su progresión",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: weekParams, ...body(AiPlanWeekRequestSchema) },
      responses: { ...aiResponses, 409: errorResponse("La semana ya está toda programada") },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id, n } = c.req.valid("param");
      const { plan, canWrite } = await requirePlan(data, c, id);
      requireWritablePlan(canWrite);
      if (n > plan.weeks) throw notFound("Esa semana no es del plan.");
      if (!isAvailable()) throw aiUnavailable();
      const input = c.req.valid("json");
      const locale = localeOfClub(c);
      const tz = tenant.organization.timezone;
      const [ctx, facts, discipline, recent, previous] = await Promise.all([
        loadWeek(data, tenant.scope, tz, plan, n),
        loadBoxFacts(data, tenant.scope, tz, locale, plan.section.id),
        disciplineFor(data, tenant.scope, plan.section),
        data.workouts.list(
          tenant.scope,
          addDays(plan.startsOn, (n - 2) * 7),
          addDays(plan.startsOn, (n - 1) * 7 - 1),
          { sectionIds: [plan.section.id] },
        ),
        n > 1 && addDays(plan.startsOn, (n - 1) * 7) <= clubToday(c)
          ? computeReview(data, tenant.scope, tz, plan, n - 1)
          : Promise.resolve(null),
      ]);
      const structureWeek = plan.structure.weeks[n - 1]!;
      const complements = weekCoverage(ctx).flatMap((cov) =>
        cov.missing.map((m) => ({ weekday: m.addTo, capacity: m.capacity })),
      );
      const days: AiPlanDay[] = ctx.dates.flatMap((date, i) => {
        const role = structureWeek.roles[i] ?? null;
        if (!role || structureWeek.closed.includes(i + 1)) return [];
        const info = DAY_ROLE_INFO[role];
        return [
          {
            date,
            weekday: i + 1,
            role,
            roleName: DAY_ROLE_NAMES[role][locale],
            domain: info.domain,
            effort: info.effort,
            prescription: withName(prescriptionFor(plan.structure, n, role), locale),
            engineMinutes: role === "long_engine" ? engineMinutesFor(plan.structure, n) : null,
            complements: complements
              .filter((x) => x.weekday === i + 1)
              .map((x) => COMPLEMENTS[x.capacity][locale]),
            taken: ctx.workouts.has(date),
          },
        ];
      });
      if (days.every((d) => d.taken))
        throw conflict("Esa semana ya tiene WOD todos los días con clase.");
      const stored: StoredPlanContext = {
        kind: "plan_week",
        locale,
        exerciseIds: exerciseIndex(facts),
        context: {
          box: boxContextOf(facts, {
            locale,
            sport: discipline.sport ?? discipline.discipline,
            section: plan.section.name,
            date: ctx.monday,
          }),
          plan: planFacts(plan, n, locale),
          days,
          recent: recent.map((w) => ({
            date: w.onDate,
            title: w.title,
            blocks: w.blocks.filter((b) => b.track === "class").map((b) => b.title),
          })),
          learned: (previous?.review.learned ?? [])
            .filter((l) => Math.abs(l.value) >= 5 || l.code === "effort_long_engine")
            .map((l) => learnedText[l.code](l.value, l.samples)),
          focus: input.focus?.trim() || null,
          plus: input.plus ?? false,
        },
      };
      return c.json(
        await launch(c, {
          kind: "plan_week",
          sectionId: plan.section.id,
          planId: plan.id,
          request: { week: n, focus: input.focus ?? null, plus: input.plus ?? false },
          stored,
          target: `${plan.name} · ${n}`,
        }),
        201,
      );
    },
  );

  // --- Copiloto ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans/{id}/copilot",
      tags: ["Planificación"],
      summary:
        "Pide al copiloto un cambio en la programación en palabras: responde y propone cambios concretos para aceptar o no",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, ...body(AiPlanCopilotRequestSchema) },
      responses: aiResponses,
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { plan, canWrite } = await requirePlan(data, c, c.req.valid("param").id);
      requireWritablePlan(canWrite);
      if (!isAvailable()) throw aiUnavailable();
      const input = c.req.valid("json");
      const locale = localeOfClub(c);
      const tz = tenant.organization.timezone;
      const today = clubToday(c);
      const n = Math.min(
        plan.weeks,
        Math.max(1, input.week ?? planWeekOf(plan.startsOn, plan.weeks, today) ?? 1),
      );
      const weeks = n < plan.weeks ? [n, n + 1] : [n];
      const [contexts, facts, discipline] = await Promise.all([
        Promise.all(weeks.map((w) => loadWeek(data, tenant.scope, tz, plan, w))),
        loadBoxFacts(data, tenant.scope, tz, locale, plan.section.id),
        disciplineFor(data, tenant.scope, plan.section),
      ]);
      const days = contexts.flatMap((ctx) => {
        const sw = plan.structure.weeks[ctx.n - 1]!;
        return ctx.dates.map((date, i) => {
          const role = sw.roles[i] ?? null;
          const w = ctx.workouts.get(date);
          return {
            date,
            weekday: i + 1,
            week: ctx.n,
            role,
            roleName: role ? DAY_ROLE_NAMES[role][locale] : null,
            blockKind: plan.structure.blocks[sw.block]!.kind,
            workout: w
              ? {
                  title: w.title,
                  blocks: w.blocks.map(
                    (b) =>
                      `${b.title}${b.description ? `: ${b.description.replace(/\n/g, " / ")}` : ""}`,
                  ),
                }
              : null,
            prescription: role
              ? withName(prescriptionFor(plan.structure, ctx.n, role), locale)
              : null,
          };
        });
      });
      const stored: StoredPlanContext = {
        kind: "plan_copilot",
        locale,
        exerciseIds: exerciseIndex(facts),
        context: {
          box: boxContextOf(facts, {
            locale,
            sport: discipline.sport ?? discipline.discipline,
            section: plan.section.name,
            date: today,
          }),
          plan: {
            ...planFacts(plan, n, locale),
            startsOn: plan.startsOn,
            endsOn: planEndsOn(plan.startsOn, plan.weeks),
          },
          today,
          days,
          message: input.message,
        },
      };
      return c.json(
        await launch(c, {
          kind: "plan_copilot",
          sectionId: plan.section.id,
          planId: plan.id,
          request: { week: n, message: input.message },
          stored,
          target: plan.name,
        }),
        201,
      );
    },
  );

  // --- Estado y aplicar ---

  /** Una generación del club que quien pregunta puede ver (la de su disciplina, la del plan). */
  async function requireGeneration(c: Ctx, id: string) {
    const g = await data.ai.planById(orgOf(c).scope, id);
    if (!g) throw notFound("Esa propuesta no existe.");
    if (g.planId) {
      const { plan, canWrite } = await requirePlan(data, c, g.planId);
      return { g, plan, canWrite };
    }
    const sections = await planSections(data, c);
    if (!sections.visible.some((s) => s.id === g.sectionId))
      throw notFound("Esa propuesta no existe.");
    return { g, plan: null, canWrite: sections.writable.includes(g.sectionId) };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plan-ai/{id}",
      tags: ["Planificación"],
      summary:
        "Estado de una propuesta de la IA de la planificación y, cuando está lista, la propuesta",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Propuesta", AiPlanGenerationResponseSchema), ...errors },
    }),
    async (c) => {
      const { g } = await requireGeneration(c, c.req.valid("param").id);
      return c.json(await responseOf(c, g), 200);
    },
  );

  /** El WOD que sale de una sesión de la IA en un día del plan. */
  function sessionUpsert(
    plan: BoxPlanRecord,
    structure: PlanStructure,
    session: AiPlanSession,
    existing: WorkoutRecord | null,
  ): WorkoutUpsert {
    const n = planWeekOf(plan.startsOn, plan.weeks, session.date);
    const weekday = ((new Date(`${session.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const role: DayRole | null = n ? (structure.weeks[n - 1]?.roles[weekday - 1] ?? null) : null;
    const info = role ? DAY_ROLE_INFO[role] : null;
    const why = session.why.join("\n").slice(0, 1200) || null;
    if (existing)
      return upsertFrom(existing, {
        title: session.title || existing.title,
        blocks: session.blocks,
        intentFeel: session.intentFeel ?? existing.intentFeel,
        why: why ?? existing.why,
      });
    return {
      sectionId: plan.section.id,
      teamId: null,
      onDate: session.date,
      title: session.title || null,
      notes: null,
      status: "draft",
      publishAt: null,
      blocks: session.blocks,
      planId: plan.id,
      planWeek: n,
      dayRole: role,
      intentDomain: info?.domain ?? null,
      intentEffort: info?.effort ?? null,
      intentFeel: session.intentFeel,
      why,
    };
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plan-ai/{id}/apply",
      tags: ["Planificación"],
      summary:
        "Aplica lo elegido de una propuesta: las sesiones de la semana como borradores o los cambios del copiloto. Nada se publica",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, ...body(AiPlanApplySchema) },
      responses: {
        200: json("Aplicada", AiPlanApplyResponseSchema),
        409: errorResponse("La propuesta no está lista o ya se aplicó"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { g, plan, canWrite } = await requireGeneration(c, c.req.valid("param").id);
      requireWritablePlan(canWrite);
      if (g.status !== "ready" || !g.proposal) throw conflict("Esa propuesta no está lista.");
      if (g.appliedAt) throw conflict("Esa propuesta ya se aplicó.");
      const wanted = c.req.valid("json").indexes;
      const pick = <T>(items: readonly T[]) =>
        items.filter((_, i) => !wanted || wanted.includes(i));
      const userId = c.get("sessionUser").id;
      let applied = 0;
      let skipped = 0;
      const proposal = g.proposal;

      if (proposal.kind === "plan_architect") {
        // El asistente lleva la propuesta al formulario del plan: aquí solo queda apuntada.
        applied = 1;
      } else if (plan) {
        const from =
          proposal.kind === "plan_week"
            ? proposal.sessions.map((s) => s.date)
            : proposal.changes.flatMap((x) => [x.date, x.toDate ?? x.date]);
        const dates = from.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        const existing = dates.length
          ? await data.workouts.list(tenant.scope, dates[0]!, dates.at(-1)!, {
              sectionIds: [plan.section.id],
            })
          : [];
        const onDay = (date: string) =>
          existing.find((w) => w.onDate === date && !w.team) ??
          existing.find((w) => w.onDate === date) ??
          null;

        if (proposal.kind === "plan_week") {
          for (const s of pick(proposal.sessions)) {
            // El programador no pisa lo que ya ha escrito el coach.
            if (onDay(s.date)) {
              skipped += 1;
              continue;
            }
            const saved = await data.workouts.upsert(
              tenant.scope,
              sessionUpsert(plan, plan.structure, s, null),
              userId,
            );
            if (saved.outcome === "saved") applied += 1;
            else skipped += 1;
          }
        } else {
          for (const change of pick(proposal.changes)) {
            const current = onDay(change.date);
            if (change.op === "note") {
              applied += 1;
              continue;
            }
            if (change.op === "update" && change.session) {
              const saved = await data.workouts.upsert(
                tenant.scope,
                sessionUpsert(plan, plan.structure, change.session, current),
                userId,
                current?.id ?? null,
              );
              if (saved.outcome === "saved") applied += 1;
              else skipped += 1;
              continue;
            }
            if (change.op === "clear") {
              if (current && (await data.workouts.remove(tenant.scope, current.id))) applied += 1;
              else skipped += 1;
              continue;
            }
            if (change.op === "move" && change.toDate) {
              if (!current || onDay(change.toDate)) {
                skipped += 1;
                continue;
              }
              const n = planWeekOf(plan.startsOn, plan.weeks, change.toDate);
              const saved = await data.workouts.upsert(
                tenant.scope,
                upsertFrom(current, { onDate: change.toDate, planWeek: n }),
                userId,
                current.id,
              );
              if (saved.outcome === "saved") applied += 1;
              else skipped += 1;
              continue;
            }
            skipped += 1;
          }
        }
      }
      await data.ai.markApplied(tenant.scope, g.id, userId, applied);
      await audit(c, "plan_ai.applied", plan?.name ?? g.kind, { kind: g.kind, applied, skipped });
      return c.json({ applied, skipped }, 200);
    },
  );
}
