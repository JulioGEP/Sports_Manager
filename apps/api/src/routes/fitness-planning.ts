import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  AI_PLAN_WEEKLY_LIMIT,
  aiQuotaResetsOn,
  averageFrequency,
  blockLabel,
  buildPlanStructure,
  calibrationOf,
  draftWeek,
  EquipmentItemInputSchema,
  EquipmentItemResponseSchema,
  EquipmentResponseSchema,
  EXERCISE_CATEGORIES,
  frequencyDistribution,
  frequentCombos,
  improvementPct,
  inventoryOn,
  planEndsOn,
  PlanCreateSchema,
  PlanDraftsResponseSchema,
  PlanningContextResponseSchema,
  PlanningSettingsResponseSchema,
  PlanningSettingsUpdateSchema,
  PlanResponseSchema,
  PlansResponseSchema,
  planTemplateByCode,
  planTestByCode,
  PlanUpdateSchema,
  planWeekStart,
  PlanWeekResponseSchema,
  projectPlan,
  suggestedClosures,
  weekStartOf,
  WorkoutsPublishedResponseSchema,
  type Locale,
  type PlanStructure,
  type Projection,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer, NewBoxPlan } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  auditOf,
  body,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  json,
  localeOf,
  orgOf,
  todayIn,
  workoutDto,
  type Ctx,
} from "./fitness-common.ts";
import {
  analyseDays,
  blockEmphasisOf,
  clubToday,
  disciplineFor,
  loadWeek,
  planSections,
  planSummaryDto,
  planViewDto,
  requirePlan,
  requireWritablePlan,
  weekBalance,
  weekCoverage,
  weekLimitsOf,
} from "./planning-common.ts";
import { addPlanningAiRoutes } from "./fitness-planning-ai.ts";
import { addPlanningReviewRoutes } from "./fitness-planning-review.ts";

/**
 * Planificación del box (ADR 0052): el material de la sala, los ajustes de la programación, lo que
 * el box ya sabe para planificar, el plan con sus bloques y semanas, la semana con su validación,
 * logística, equilibrio y cobertura, y los borradores que el plan escribe solo. Planifica quien
 * programa la disciplina (toda la programación, o la de sus clases); el material lo cuida cualquiera
 * que programe.
 */
export function createFitnessPlanningRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  for (const path of [
    "/api/org/equipment",
    "/api/org/equipment/*",
    "/api/org/planning/*",
    "/api/org/plans",
    "/api/org/plans/*",
    "/api/org/plan-ai",
    "/api/org/plan-ai/*",
  ])
    app.use(path, ...chain);
  const audit = auditOf(data);
  const read = requirePermission("org.training.read");

  const canProgram = (c: Ctx) => {
    const p = c.get("actor").permissions;
    return p.has("org.training.write") || p.has("org.training.write_own");
  };
  const requireProgrammer = (c: Ctx) => {
    if (!canProgram(c)) throw forbidden();
  };

  // --- Material ---

  async function equipmentDto(c: Ctx, id?: string) {
    const tenant = orgOf(c);
    const today = clubToday(c);
    const list = await data.planning.equipment.list(tenant.scope);
    return list
      .filter((x) => !id || x.id === id)
      .map((x) => ({
        ...x,
        availableToday:
          x.quantity -
          (x.outOfService > 0 && (!x.repairUntil || today < x.repairUntil) ? x.outOfService : 0),
      }));
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/equipment",
      tags: ["Planificación"],
      summary: "El material del box: cuántas unidades, pesos, sala y lo que está en reparación",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Material", EquipmentResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const facilities = await data.facilities.list(
        tenant.scope,
        tenant.organization.timezone,
        new Date(),
        null,
        null,
      );
      return c.json(
        {
          items: await equipmentDto(c),
          facilities: facilities.map((f) => ({ id: f.id, name: f.name })),
          canWrite: canProgram(c),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/equipment",
      tags: ["Planificación"],
      summary: "Añade material al inventario del box",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: body(EquipmentItemInputSchema),
      responses: { 201: json("Material", EquipmentItemResponseSchema), ...errors },
    }),
    async (c) => {
      requireProgrammer(c);
      const input = c.req.valid("json");
      const created = await data.planning.equipment.create(orgOf(c).scope, input);
      if (created === "unknown_facility") throw badRequest("Esa sala no es de este box.");
      await audit(c, "equipment.created", created.name, {
        kind: created.kind,
        quantity: created.quantity,
      });
      return c.json({ item: (await equipmentDto(c, created.id))[0]! }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/equipment/{id}",
      tags: ["Planificación"],
      summary: "Cambia una línea del material (unidades, pesos, reparación)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, ...body(EquipmentItemInputSchema) },
      responses: { 200: json("Material", EquipmentItemResponseSchema), ...errors },
    }),
    async (c) => {
      requireProgrammer(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const updated = await data.planning.equipment.update(orgOf(c).scope, id, input);
      if (updated === "unknown_facility") throw badRequest("Esa sala no es de este box.");
      if (!updated) throw notFound("Ese material no existe.");
      await audit(c, "equipment.updated", updated.name, {
        quantity: updated.quantity,
        outOfService: updated.outOfService,
      });
      return c.json({ item: (await equipmentDto(c, id))[0]! }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/equipment/{id}",
      tags: ["Planificación"],
      summary: "Quita una línea del material",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 204: { description: "Quitado" }, ...errors },
    }),
    async (c) => {
      requireProgrammer(c);
      const { id } = c.req.valid("param");
      const item = await data.planning.equipment.byId(orgOf(c).scope, id);
      if (!item || !(await data.planning.equipment.remove(orgOf(c).scope, id)))
        throw notFound("Ese material no existe.");
      await audit(c, "equipment.removed", item.name);
      return c.body(null, 204);
    },
  );

  // --- Ajustes de la programación ---

  const canWriteSettings = (c: Ctx) => {
    const p = c.get("actor").permissions;
    return p.has("org.settings.write") || p.has("org.training.write");
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/planning/settings",
      tags: ["Planificación"],
      summary: "Nombres de los niveles del box y qué ve el atleta por adelantado",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      responses: { 200: json("Ajustes", PlanningSettingsResponseSchema), ...errors },
    }),
    async (c) =>
      c.json(
        {
          settings: await data.planning.settings.get(orgOf(c).scope),
          canWrite: canWriteSettings(c),
        },
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/planning/settings",
      tags: ["Planificación"],
      summary: "Cambia los nombres de los niveles y lo que ve el atleta por adelantado",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: body(PlanningSettingsUpdateSchema),
      responses: { 200: json("Ajustes", PlanningSettingsResponseSchema), ...errors },
    }),
    async (c) => {
      if (!canWriteSettings(c)) throw forbidden();
      const input = c.req.valid("json");
      const settings = await data.planning.settings.update(orgOf(c).scope, {
        ...(input.levelNames ? { levelNames: input.levelNames } : {}),
        ...(input.athletePreview ? { athletePreview: input.athletePreview } : {}),
      });
      await audit(c, "planning.settings_updated", settings.athletePreview);
      return c.json({ settings, canWrite: true }, 200);
    },
  );

  // --- Lo que el box ya sabe ---

  const DAY = 86_400_000;

  /** Calibración y resumen de los planes terminados de una disciplina. */
  async function previousPlans(c: Ctx, sectionId: string) {
    const tenant = orgOf(c);
    const plans = (await data.planning.plans.list(tenant.scope, [sectionId])).filter(
      (p) => p.status === "finished",
    );
    const out = [];
    for (const plan of plans.slice(0, 3)) {
      const endsOn = planEndsOn(plan.startsOn, plan.weeks);
      const marks = await data.planning.testMarks(tenant.scope, plan.tests);
      const pairs: { predictedPct: number; realPct: number }[] = [];
      let headline: { code: string; realPct: number; low: number; high: number } | null = null;
      const improvedPlayers = new Set<string>();
      const athletes = new Set<string>();
      for (const code of plan.tests) {
        const range = plan.projection?.tests.find((t) => t.code === code);
        const lower = planTestByCode(code)?.lowerIsBetter ?? false;
        const before = new Map<string, number>();
        const during = new Map<string, number>();
        for (const m of marks) {
          if (m.code !== code) continue;
          const target =
            m.date < plan.startsOn ? before : m.date <= addDays(endsOn, 7) ? during : null;
          if (!target) continue;
          const cur = target.get(m.playerId);
          if (cur === undefined || (lower ? m.value < cur : m.value > cur))
            target.set(m.playerId, m.value);
        }
        const deltas: number[] = [];
        for (const [player, from] of before) {
          const to = during.get(player);
          if (to === undefined) continue;
          athletes.add(player);
          const pct = improvementPct(code, from, to);
          deltas.push(pct);
          if (pct > 0) improvedPlayers.add(player);
        }
        if (deltas.length === 0 || !range || range.unit !== "percent") continue;
        const realPct = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        pairs.push({ predictedPct: (range.low + range.high) / 2, realPct });
        if (!headline)
          headline = {
            code,
            realPct: Math.round(realPct * 10) / 10,
            low: Math.round(range.low * 10) / 10,
            high: Math.round(range.high * 10) / 10,
          };
      }
      out.push({
        id: plan.id,
        name: plan.name,
        endsOn,
        calibration: calibrationOf(pairs),
        improved: improvedPlayers.size,
        athletes: athletes.size,
        headline,
      });
    }
    return out;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/planning/context",
      tags: ["Planificación"],
      summary:
        "Lo que el box ya sabe para planificar una disciplina: horario, gente, niveles, material, biblioteca, festivos y planes anteriores",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ section: z.string().uuid().optional() }) },
      responses: { 200: json("Contexto", PlanningContextResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const sections = await planSections(data, c);
      const wanted = c.req.valid("query").section;
      const section = wanted ? sections.visible.find((s) => s.id === wanted) : sections.visible[0];
      if (!section) throw notFound("Esa disciplina no existe.");
      const now = new Date();
      const today = todayIn(tenant.organization.timezone, now);
      const since = new Date(now.getTime() - 56 * DAY);
      const [
        schedule,
        attendance,
        levels,
        inventory,
        exercises,
        athletes,
        active,
        discipline,
        used,
      ] = await Promise.all([
        data.planning.schedule(tenant.scope, section.id),
        data.planning.attendance(
          tenant.scope,
          section.id,
          since,
          now,
          tenant.organization.timezone,
        ),
        data.planning.levelMix(tenant.scope, section.id, addDays(today, -56)),
        data.planning.equipment.lines(tenant.scope),
        data.exercises.list(tenant.scope),
        data.planning.activeAthletes(tenant.scope, section.id, since),
        data.planning.plans.active(tenant.scope, [section.id]),
        disciplineFor(data, tenant.scope, section),
        data.ai.planUsedThisWeek(tenant.scope, weekStartOf(today)),
      ]);
      const previous = await previousPlans(c, section.id);
      const available = inventoryOn(inventory, today);
      const byCategory = EXERCISE_CATEGORIES.map((category) => ({
        category,
        count: exercises.filter((e) => e.category === category).length,
      })).filter((x) => x.count > 0);
      return c.json(
        {
          section,
          discipline: discipline.discipline,
          sport: discipline.sport,
          classWeekdays: schedule.weekdays,
          classMinutes: schedule.minutes,
          classSize: schedule.capacity,
          athletes,
          levels,
          frequency: {
            average: averageFrequency(attendance),
            distribution: frequencyDistribution(attendance),
            combos: frequentCombos(attendance),
          },
          inventory: inventory.map((l) => ({
            kind: l.kind,
            name: l.name,
            available: available.get(l.kind) ?? 0,
            weights: l.weights,
          })),
          exercises: { total: exercises.length, byCategory, missing: [] },
          suggestedClosures: suggestedClosures(today, addDays(today, 365)),
          calibration: previous.find((p) => p.calibration !== null)?.calibration ?? null,
          previous,
          active: active[0] ? { id: active[0].id, name: active[0].name } : null,
          ai: {
            available: config.ai.configured && data.aiModel !== null,
            quota: {
              limit: AI_PLAN_WEEKLY_LIMIT,
              used,
              remaining: Math.max(0, AI_PLAN_WEEKLY_LIMIT - used),
              resetsOn: aiQuotaResetsOn(weekStartOf(today)),
            },
          },
          canWrite: sections.writable.includes(section.id),
        },
        200,
      );
    },
  );

  // --- Planes ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plans",
      tags: ["Planificación"],
      summary: "Planes de las disciplinas que se ven (o de una)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ section: z.string().uuid().optional() }) },
      responses: { 200: json("Planes", PlansResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const sections = await planSections(data, c);
      const wanted = c.req.valid("query").section;
      const ids = sections.visible.map((s) => s.id).filter((id) => !wanted || id === wanted);
      const plans = await data.planning.plans.list(tenant.scope, ids);
      const today = clubToday(c);
      return c.json({ plans: plans.map((p) => planSummaryDto(p, today)) }, 200);
    },
  );

  /** La estructura y la proyección de un plan con lo que se le pide y lo que sabe el box. */
  async function buildPlan(
    c: Ctx,
    input: {
      templateCode: NewBoxPlan["templateCode"];
      section: { id: string; name: string };
      startsOn: string;
      weeks: number;
      emphasis: NewBoxPlan["emphasis"];
      frequency: number;
      tests: string[];
      closures: string[];
      eventDate: string | null;
      phases?:
        | { kind: PlanStructure["blocks"][number]["kind"]; weeks: number; focus: string | null }[]
        | undefined;
    },
  ): Promise<{ structure: PlanStructure; projection: Projection }> {
    const tenant = orgOf(c);
    const template = planTemplateByCode(input.templateCode);
    if (!template) throw badRequest("Esa plantilla no existe.");
    const [schedule, discipline, levels, previous] = await Promise.all([
      data.planning.schedule(tenant.scope, input.section.id),
      disciplineFor(data, tenant.scope, input.section),
      data.planning.levelMix(tenant.scope, input.section.id, addDays(clubToday(c), -56)),
      previousPlans(c, input.section.id),
    ]);
    const structure = buildPlanStructure({
      template,
      discipline: template.discipline !== "crossfit" ? template.discipline : discipline.discipline,
      startsOn: weekStartOf(input.startsOn),
      weeks: input.weeks,
      classWeekdays: schedule.weekdays.length > 0 ? schedule.weekdays : [1, 2, 3, 4, 5],
      closures: input.closures,
      emphasis: input.emphasis,
      tests: input.tests,
      ...(input.phases && input.phases.length > 0 ? { phases: input.phases } : {}),
      eventDate: input.eventDate,
    });
    const calibration = previous.find((p) => p.calibration !== null)?.calibration;
    const projection = projectPlan({
      emphasis: input.emphasis,
      weeks: input.weeks,
      frequency: input.frequency,
      levelMix: levels,
      tests: input.tests,
      ...(calibration ? { calibration } : {}),
    });
    return { structure, projection };
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans",
      tags: ["Planificación"],
      summary:
        "Crea un plan desde una plantilla (o con los bloques que propuso el arquitecto con IA): estructura, ola, papeles y proyección",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: body(PlanCreateSchema),
      responses: {
        201: json("Plan", PlanResponseSchema),
        409: errorResponse("Ya hay un plan activo en esa disciplina"),
        ...errors,
      },
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
      const startsOn = weekStartOf(input.startsOn);
      const { structure, projection } = await buildPlan(c, {
        templateCode: input.templateCode,
        section,
        startsOn,
        weeks: input.phases?.length ? input.phases.reduce((s, p) => s + p.weeks, 0) : input.weeks,
        emphasis: input.emphasis,
        frequency: input.frequency,
        tests: input.tests,
        closures: input.closures,
        eventDate: input.eventDate ?? null,
        phases: input.phases?.map((p) => ({ kind: p.kind, weeks: p.weeks, focus: p.focus })),
      });
      const created = await data.planning.plans.create(
        tenant.scope,
        {
          sectionId: section.id,
          name: input.name,
          templateCode: input.templateCode,
          goal: input.goal?.trim() || null,
          eventName: input.eventName?.trim() || null,
          eventDate: input.eventDate ?? null,
          startsOn,
          weeks: structure.weeks.length,
          emphasis: input.emphasis,
          frequency: input.frequency,
          tests: input.tests,
          closures: [...new Set(input.closures)].sort(),
          structure,
          projection,
          status: input.activate ? "active" : "draft",
        },
        c.get("sessionUser").id,
      );
      if (created === "active_taken")
        throw conflict("Ya hay un plan activo en esa disciplina. Termínalo o archívalo antes.");
      await audit(c, "plan.created", created.name, {
        sectionId: section.id,
        template: created.templateCode,
        weeks: created.weeks,
        status: created.status,
      });
      return c.json(
        { plan: await planViewDto(data, tenant.scope, created, clubToday(c), true) },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plans/{id}",
      tags: ["Planificación"],
      summary: "Un plan con su estructura, su proyección y las marcas de partida",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Plan", PlanResponseSchema), ...errors },
    }),
    async (c) => {
      const { plan, canWrite } = await requirePlan(data, c, c.req.valid("param").id);
      return c.json(
        { plan: await planViewDto(data, orgOf(c).scope, plan, clubToday(c), canWrite) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/plans/{id}",
      tags: ["Planificación"],
      summary:
        "Cambia un plan: nombre, objetivo, énfasis, tests, cierres, estado o su estructura editada a mano",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, ...body(PlanUpdateSchema) },
      responses: {
        200: json("Plan", PlanResponseSchema),
        409: errorResponse("Ya hay un plan activo en esa disciplina"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { plan, canWrite } = await requirePlan(data, c, c.req.valid("param").id);
      requireWritablePlan(canWrite);
      const input = c.req.valid("json");
      const patch: Partial<NewBoxPlan> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.goal !== undefined) patch.goal = input.goal?.trim() || null;
      if (input.eventName !== undefined) patch.eventName = input.eventName?.trim() || null;
      if (input.eventDate !== undefined) patch.eventDate = input.eventDate;
      if (input.status !== undefined) patch.status = input.status;
      if (input.frequency !== undefined) patch.frequency = input.frequency;
      if (input.tests !== undefined) patch.tests = input.tests;
      if (input.emphasis !== undefined) patch.emphasis = input.emphasis;
      if (input.structure) {
        patch.structure = input.structure;
        patch.weeks = input.structure.weeks.length;
      }
      // Cambiar el énfasis, los tests o los cierres rehace la estructura con los mismos bloques.
      if (!input.structure && (input.emphasis || input.tests || input.closures)) {
        const phases = plan.structure.blocks.map((b) => ({
          kind: b.kind,
          weeks: b.weeks,
          focus: b.focus,
        }));
        const rebuilt = await buildPlan(c, {
          templateCode: plan.templateCode,
          section: plan.section,
          startsOn: plan.startsOn,
          weeks: plan.weeks,
          emphasis: input.emphasis ?? plan.emphasis,
          frequency: input.frequency ?? plan.frequency,
          tests: input.tests ?? plan.tests,
          closures: input.closures ?? plan.closures,
          eventDate: input.eventDate !== undefined ? input.eventDate : plan.eventDate,
          phases,
        });
        patch.structure = rebuilt.structure;
        patch.projection = rebuilt.projection;
      }
      if (input.closures !== undefined) patch.closures = [...new Set(input.closures)].sort();
      const updated = await data.planning.plans.update(tenant.scope, plan.id, patch);
      if (updated === "active_taken")
        throw conflict("Ya hay un plan activo en esa disciplina. Termínalo o archívalo antes.");
      if (!updated) throw notFound("Ese plan no existe.");
      await audit(c, "plan.updated", updated.name, {
        fields: Object.keys(input),
        status: updated.status,
      });
      return c.json(
        { plan: await planViewDto(data, tenant.scope, updated, clubToday(c), true) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/plans/{id}",
      tags: ["Planificación"],
      summary: "Borra un plan. Sus WODs se quedan, fuera del plan",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 204: { description: "Borrado" }, ...errors },
    }),
    async (c) => {
      const { plan, canWrite } = await requirePlan(data, c, c.req.valid("param").id);
      requireWritablePlan(canWrite);
      await data.planning.plans.remove(orgOf(c).scope, plan.id);
      await audit(c, "plan.removed", plan.name);
      return c.body(null, 204);
    },
  );

  // --- La semana del plan ---

  const weekParams = z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(1).max(60) });

  async function requireWeek(c: Ctx, id: string, n: number) {
    const ctx = await requirePlan(data, c, id);
    if (n > ctx.plan.weeks) throw notFound("Esa semana no es del plan.");
    return ctx;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plans/{id}/weeks/{n}",
      tags: ["Planificación"],
      summary:
        "Una semana del plan: cada día con su papel, su WOD, su validación y su logística; el equilibrio, la cobertura por frecuencia y los límites",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: weekParams },
      responses: { 200: json("Semana", PlanWeekResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id, n } = c.req.valid("param");
      const { plan, canWrite } = await requireWeek(c, id, n);
      const locale = localeOf(c);
      const ctx = await loadWeek(data, tenant.scope, tenant.organization.timezone, plan, n);
      const days = analyseDays(ctx);
      const ids = days.flatMap((d) => (d.workout ? d.workout.blocks.map((b) => b.id) : []));
      const counts = await data.workouts.results.counts(tenant.scope, ids);
      const now = new Date();
      const week = plan.structure.weeks[n - 1]!;
      const pending = (await data.ai.latestForPlan(tenant.scope, plan.id, "plan_week")).find(
        (g) =>
          (g.request as { week?: number }).week === n &&
          !g.appliedAt &&
          (g.status === "queued" || g.status === "running" || g.status === "ready"),
      );
      return c.json(
        {
          plan: planSummaryDto(plan, clubToday(c)),
          week: {
            n,
            startsOn: ctx.monday,
            kind: week.kind,
            block: week.block,
            blockLabel: blockLabel(plan.structure, week.block, locale),
            blockFocus: plan.structure.blocks[week.block]?.focus ?? null,
            volume: week.volume,
            intensity: week.intensity,
            tags: week.tags,
          },
          days: days.map((d) => ({
            date: d.date,
            weekday: d.weekday,
            role: d.role,
            closed: d.closed,
            classes: d.classes,
            classSize: d.classSize,
            workout: d.workout ? workoutDto(d.workout, now, locale, { counts }) : null,
            validation: d.validation,
            logistics: d.logistics,
            prescription: d.prescription,
          })),
          balance: { block: blockEmphasisOf(plan, n), week: weekBalance(ctx) },
          coverage: weekCoverage(ctx),
          limits: weekLimitsOf(ctx),
          pendingAi: pending?.id ?? null,
          canWrite,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans/{id}/weeks/{n}/drafts",
      tags: ["Planificación"],
      summary:
        "Escribe sin IA los borradores de los días con clase que aún no tienen WOD: papel, intención, levantamiento del plan, motor, huecos y complementos de cobertura",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: weekParams },
      responses: { 200: json("Borradores", PlanDraftsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id, n } = c.req.valid("param");
      const { plan, canWrite } = await requireWeek(c, id, n);
      requireWritablePlan(canWrite);
      const ctx = await loadWeek(data, tenant.scope, tenant.organization.timezone, plan, n);
      const coverage = weekCoverage(ctx);
      const complements = coverage.flatMap((cov) =>
        cov.missing.map((m) => ({ weekday: m.addTo, capacity: m.capacity, days: cov.days })),
      );
      const unique = complements.filter(
        (x, i) =>
          complements.findIndex((y) => y.weekday === x.weekday && y.capacity === x.capacity) === i,
      );
      const exerciseByMovement = new Map<string, string>();
      for (const e of ctx.exercises.values())
        if (e.movementCode && e.status === "active" && !exerciseByMovement.has(e.movementCode))
          exerciseByMovement.set(e.movementCode, e.id);
      const drafts = draftWeek({
        plan: { id: plan.id, startsOn: plan.startsOn, weeks: plan.weeks },
        structure: plan.structure,
        week: n,
        sectionId: plan.section.id,
        locale: orgOf(c).organization.defaultLocale as Locale,
        taken: [...ctx.workouts.keys()],
        complements: unique,
        exerciseByMovement,
        tests: plan.tests,
      });
      let created = 0;
      let skipped = 0;
      for (const d of drafts) {
        const result = await data.workouts.upsert(tenant.scope, d, c.get("sessionUser").id);
        if (result.outcome === "saved") created += 1;
        else skipped += 1;
      }
      if (created > 0) await audit(c, "plan.drafted", `${plan.name} · ${n}`, { created, skipped });
      return c.json({ created, skipped }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans/{id}/weeks/{n}/publish",
      tags: ["Planificación"],
      summary: "Publica ya los borradores de una semana del plan",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: weekParams },
      responses: { 200: json("Publicados", WorkoutsPublishedResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id, n } = c.req.valid("param");
      const { plan, canWrite } = await requireWeek(c, id, n);
      requireWritablePlan(canWrite);
      const monday = planWeekStart(plan.startsOn, n);
      const published = await data.workouts.publishRange(tenant.scope, monday, addDays(monday, 6), [
        plan.section.id,
      ]);
      if (published > 0)
        await audit(c, "workout.updated", `${monday} – ${addDays(monday, 6)}`, {
          action: "publish_week",
          published,
          planId: plan.id,
        });
      return c.json({ published }, 200);
    },
  );

  addPlanningReviewRoutes(app, data);
  addPlanningAiRoutes(app, config, data);
  return app;
}
