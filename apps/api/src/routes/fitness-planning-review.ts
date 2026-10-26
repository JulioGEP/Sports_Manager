import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import {
  addDays,
  AdjustmentDecisionSchema,
  averageFrequency,
  CAPACITIES,
  domainOfMinutes,
  MOVEMENT_PATTERNS,
  planEndsOn,
  planWeekStart,
  PlanHealthResponseSchema,
  PlanReviewResponseSchema,
  TIME_DOMAINS,
  type Capacity,
  type Locale,
  type MovementPattern,
  type TimeDomain,
} from "@sportsmanager/shared";
import { instantOf, type BoxPlanRecord, type DataLayer } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { notFound } from "../http/errors.ts";
import { auditOf, body, errors, json, orgOf, type Ctx } from "./fitness-common.ts";
import {
  blockFacts,
  clubToday,
  currentWeekOf,
  loadWeek,
  planSummaryDto,
  requirePlan,
  requireWritablePlan,
  trainsCapacity,
  weekLimitsOf,
} from "./planning-common.ts";
import { applyAdjustment, computeReview } from "./planning-review.ts";

/**
 * La revisión del domingo y la salud de la programación (ADR 0053). La revisión compara lo previsto
 * con lo que pasó y propone ajustes para la semana siguiente; la salud junta todo el plan: si se
 * cumple, si la gente mejora y viene más, el equilibrio real frente al del plan y lo que cuesta la IA.
 * Van en la misma app que los planes (y con su cadena de /api/org/plans/*).
 */
export function addPlanningReviewRoutes(app: OpenAPIHono<AppEnv>, data: DataLayer) {
  const audit = auditOf(data);
  const read = requirePermission("org.training.read");

  /** Semanas que se pueden revisar: las ya empezadas. */
  function reviewable(plan: BoxPlanRecord, today: string): number[] {
    return Array.from({ length: plan.weeks }, (_, i) => i + 1).filter(
      (n) => planWeekStart(plan.startsOn, n) <= today,
    );
  }

  /** La semana que se revisa por defecto: la última terminada; si no, la que va. */
  function defaultWeek(plan: BoxPlanRecord, today: string): number {
    const done = reviewable(plan, today).filter(
      (n) => addDays(planWeekStart(plan.startsOn, n), 6) < today,
    );
    return done.at(-1) ?? currentWeekOf(plan, today) ?? 1;
  }

  const statusOf = (
    s: "accepted" | "discarded" | undefined,
  ): "pending" | "accepted" | "discarded" => s ?? "pending";

  async function reviewDto(c: Ctx, plan: BoxPlanRecord, n: number, canWrite: boolean) {
    const tenant = orgOf(c);
    const today = clubToday(c);
    const [{ review, ctx, prs }, decided] = await Promise.all([
      computeReview(data, tenant.scope, tenant.organization.timezone, plan, n),
      data.planning.adjustments.of(tenant.scope, plan.id, n),
    ]);
    return {
      plan: planSummaryDto(plan, today),
      week: n,
      startsOn: ctx.monday,
      weeks: reviewable(plan, today),
      rows: review.rows.map((r) => ({ ...r, title: ctx.workouts.get(r.date)?.title ?? null })),
      kpis: { ...review.kpis, prs },
      adjustments: review.adjustments.map((a) => ({
        ...a,
        status: statusOf(decided.get(a.key)),
      })),
      learned: review.learned.map((l) => ({ ...l, value: Math.round(l.value * 10) / 10 })),
      canWrite,
    };
  }

  const reviewParams = z.object({ id: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plans/{id}/review",
      tags: ["Planificación"],
      summary:
        "La revisión del domingo: lo previsto frente a lo que pasó, lo aprendido y los ajustes para la semana siguiente",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: reviewParams,
        query: z.object({ week: z.coerce.number().int().min(1).max(60).optional() }),
      },
      responses: { 200: json("Revisión", PlanReviewResponseSchema), ...errors },
    }),
    async (c) => {
      const { plan, canWrite } = await requirePlan(data, c, c.req.valid("param").id);
      const today = clubToday(c);
      const wanted = c.req.valid("query").week;
      const n =
        wanted && reviewable(plan, today).includes(wanted) ? wanted : defaultWeek(plan, today);
      return c.json(await reviewDto(c, plan, n, canWrite), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/plans/{id}/review/{n}/decide",
      tags: ["Planificación"],
      summary:
        "Acepta o descarta un ajuste de la revisión. Aceptar lo escribe en el WOD de la semana siguiente",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(1).max(60) }),
        ...body(AdjustmentDecisionSchema),
      },
      responses: { 200: json("Revisión", PlanReviewResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id, n } = c.req.valid("param");
      const { plan, canWrite } = await requirePlan(data, c, id);
      requireWritablePlan(canWrite);
      if (!reviewable(plan, clubToday(c)).includes(n))
        throw notFound("Esa semana no se puede revisar.");
      const input = c.req.valid("json");
      const { review, next } = await computeReview(
        data,
        tenant.scope,
        tenant.organization.timezone,
        plan,
        n,
      );
      const adj = review.adjustments.find((a) => a.key === input.key);
      if (!adj) throw notFound("Ese ajuste ya no está en la revisión.");
      if (input.decision === "accept") {
        const w = next
          ? [...next.workouts.values()].find((x) => x.id === adj.workoutId)
          : undefined;
        const upsert = w
          ? applyAdjustment(adj, w, tenant.organization.defaultLocale as Locale)
          : null;
        if (w && upsert) {
          const saved = await data.workouts.upsert(
            tenant.scope,
            upsert,
            c.get("sessionUser").id,
            w.id,
          );
          if (saved.outcome !== "saved") throw notFound("Ese WOD ya no existe.");
        }
      }
      await data.planning.adjustments.decide(
        tenant.scope,
        plan.id,
        n,
        adj.key,
        input.decision === "accept" ? "accepted" : "discarded",
        c.get("sessionUser").id,
      );
      await audit(c, "plan.adjusted", `${plan.name} · ${n}`, {
        kind: adj.kind,
        date: adj.date,
        decision: input.decision,
      });
      return c.json(await reviewDto(c, plan, n, true), 200);
    },
  );

  // --- Salud de la programación ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/plans/{id}/health",
      tags: ["Planificación"],
      summary:
        "La salud del plan: cumplimiento, marcas, frecuencia, equilibrio real frente al plan, duraciones, patrones por semana, límites y coste de la IA",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: reviewParams },
      responses: { 200: json("Salud", PlanHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const tz = tenant.organization.timezone;
      const { plan } = await requirePlan(data, c, c.req.valid("param").id);
      const today = clubToday(c);
      const current = currentWeekOf(plan, today);
      const endsOn = planEndsOn(plan.startsOn, plan.weeks);
      const last = today > endsOn ? plan.weeks : current ? Math.min(plan.weeks, current + 1) : 1;
      const weeks = Array.from({ length: last }, (_, i) => i + 1);
      const started = weeks.filter((n) => planWeekStart(plan.startsOn, n) <= today);

      const [contexts, reviews, prs, athletes, during, beforeAtt, tally, usage, ahead] =
        await Promise.all([
          Promise.all(weeks.map((n) => loadWeek(data, tenant.scope, tz, plan, n))),
          Promise.all(started.map((n) => computeReview(data, tenant.scope, tz, plan, n))),
          data.planning.prCount(tenant.scope, plan.startsOn, today < endsOn ? today : endsOn),
          data.planning.activeAthletes(tenant.scope, plan.section.id, instantOf(tz, plan.startsOn)),
          data.planning.attendance(
            tenant.scope,
            plan.section.id,
            instantOf(tz, plan.startsOn),
            instantOf(tz, addDays(today < endsOn ? today : endsOn, 1)),
            tz,
          ),
          data.planning.attendance(
            tenant.scope,
            plan.section.id,
            instantOf(tz, addDays(plan.startsOn, -56)),
            instantOf(tz, plan.startsOn),
            tz,
          ),
          data.planning.adjustments.tally(tenant.scope, plan.id),
          data.planning.aiUsage(tenant.scope, plan.createdAt),
          data.workouts.list(tenant.scope, addDays(today, 1), endsOn, {
            sectionIds: [plan.section.id],
          }),
        ]);

      // Cumplimiento: días medidos que salieron como se planearon.
      const rows = reviews.flatMap((r) => r.review.rows);
      const measured = rows.filter((r) => r.verdict !== "no_data");
      const fulfilled = measured.length
        ? Math.round(
            (measured.filter((r) => r.verdict === "as_planned").length / measured.length) * 100,
          )
        : 0;

      // Equilibrio real: minutos programados por capacidad en las semanas empezadas.
      const minutes = Object.fromEntries(CAPACITIES.map((x) => [x, 0])) as Record<Capacity, number>;
      for (const ctx of contexts.filter((x) => started.includes(x.n)))
        for (const date of ctx.dates) {
          const w = ctx.workouts.get(date);
          if (!w) continue;
          for (const b of w.blocks)
            if (trainsCapacity(b)) minutes[b.capacity!] += b.plannedMinutes!;
        }
      const total = CAPACITIES.reduce((s, x) => s + minutes[x], 0);

      // Duraciones: el dominio previsto frente al real de los WODs por tiempo.
      const planned = Object.fromEntries(TIME_DOMAINS.map((d) => [d, 0])) as Record<
        TimeDomain,
        number
      >;
      const real = { ...planned };
      for (const r of rows.filter((x) => x.metric === "minutes")) {
        planned[domainOfMinutes((r.low + r.high) / 2)] += 1;
        if (r.value !== null) real[domainOfMinutes(r.value)] += 1;
      }
      const plannedTotal = TIME_DOMAINS.reduce((s, d) => s + planned[d], 0);
      const realTotal = TIME_DOMAINS.reduce((s, d) => s + real[d], 0);
      const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

      // Patrones de movimiento por semana: cuántos días tocan cada uno.
      const heat = MOVEMENT_PATTERNS.map((pattern: MovementPattern) => ({
        pattern,
        weeks: contexts.map(
          (ctx) =>
            ctx.dates.filter((date) => {
              const w = ctx.workouts.get(date);
              return !!w?.blocks.some(
                (b) =>
                  b.track === "class" && blockFacts(b, ctx.exercises).patterns.includes(pattern),
              );
            }).length,
        ),
      }));

      const freqNow = averageFrequency(during);
      const freqBefore = averageFrequency(beforeAtt);
      const currentCtx = contexts.find((x) => x.n === (current ?? last)) ?? contexts.at(-1)!;
      const ai = usage.map((u) => ({ kind: u.kind, count: u.count, costMicros: u.costMicros }));
      return c.json(
        {
          plan: planSummaryDto(plan, today),
          weeks,
          kpis: {
            fulfilled,
            athletesWithPr: prs.athletes,
            athletes,
            frequency: freqNow === null ? null : Math.round(freqNow * 10) / 10,
            frequencyBefore: freqBefore === null ? null : Math.round(freqBefore * 10) / 10,
            aiAccepted:
              tally.decided > 0 ? Math.round((tally.accepted / tally.decided) * 100) : null,
            planned: contexts.reduce(
              (s, ctx) =>
                s + ctx.dates.filter((d) => ctx.workouts.get(d)?.plan?.id === plan.id).length,
              0,
            ),
            scheduledAhead: ahead.length,
          },
          balance: CAPACITIES.map((capacity) => ({
            capacity,
            plan: plan.emphasis[capacity],
            real: total > 0 ? Math.round((minutes[capacity] / total) * 100) : 0,
          })),
          durations: TIME_DOMAINS.map((domain) => ({
            domain,
            plan: pct(planned[domain], plannedTotal),
            real: pct(real[domain], realTotal),
          })),
          heat,
          limits: weekLimitsOf(currentCtx),
          ai: { byKind: ai, totalMicros: ai.reduce((s, x) => s + x.costMicros, 0) },
        },
        200,
      );
    },
  );
}
