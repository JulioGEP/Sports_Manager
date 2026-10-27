import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  blockLabel,
  DAY_ROLE_INFO,
  essentialCapacities,
  frequencyFactor,
  MyCycleResponseSchema,
  MyCycleSummaryResponseSchema,
  MyLevelsResponseSchema,
  MyLevelUpdateSchema,
  PLAN_BLOCK_NAMES,
  PLAN_FREQUENCY_MAX,
  PLAN_FREQUENCY_MIN,
  planEndsOn,
  planTestByCode,
  planWeekOf,
  planWeekStart,
  projectedValue,
  weekStartOf,
  type Capacity,
  type Locale,
  type MyCycleResponse,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { instantOf, type BoxPlanRecord, type DataLayer, type OrgScope } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { notFound } from "../http/errors.ts";
import {
  auditOf,
  body,
  errors,
  fitnessChain,
  json,
  localeOf,
  orgOf,
  requireSelfPlayer,
} from "./fitness-common.ts";
import { athleteLevels, mainPlanOf } from "./planning-athlete.ts";
import { clubToday } from "./planning-common.ts";

/**
 * La planificación vista por el atleta (ADR 0053): en qué punto del ciclo está, sus marcas de
 * partida y lo que puede esperar con su frecuencia, su constancia, lo que le falta esta semana y su
 * nivel en cada capacidad (que puede fijar él). Y el resumen del ciclo para compartir.
 */
export function createFitnessPlanningMeRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  for (const path of ["/api/org/me/cycle", "/api/org/me/cycle/*", "/api/org/me/levels"])
    app.use(path, ...chain);
  const audit = auditOf(data);
  const DAY = 86_400_000;
  /** Días por semana que entrena de verdad (en 8 semanas), de 1 a 7; sin datos, 2. */
  const usualFrequency = (sessions: number) =>
    Math.max(PLAN_FREQUENCY_MIN, Math.min(PLAN_FREQUENCY_MAX, Math.round(sessions / 8) || 2));

  /** Las marcas del atleta en los tests del plan: la de partida, la última y su rango. */
  async function testsOf(
    scope: OrgScope,
    plan: BoxPlanRecord,
    playerId: string,
    frequency: number,
  ): Promise<MyCycleResponse["tests"]> {
    const marks = await data.planning.testMarks(scope, plan.tests, playerId);
    const scale = frequencyFactor(frequency) / frequencyFactor(plan.frequency);
    return plan.tests.map((code) => {
      const lower = planTestByCode(code)?.lowerIsBetter ?? false;
      const better = (a: number, b: number) => (lower ? a < b : a > b);
      let baseline: number | null = null;
      let latest: number | null = null;
      let latestDate = "";
      for (const m of marks) {
        if (m.code !== code) continue;
        if (m.date < plan.startsOn) {
          if (baseline === null || better(m.value, baseline)) baseline = m.value;
        } else if (m.date >= latestDate) {
          latest = m.value;
          latestDate = m.date;
        }
      }
      const range = plan.projection?.tests.find((t) => t.code === code);
      let low: number | null = null;
      let high: number | null = null;
      if (baseline !== null && range) {
        const r = projectedValue(code, baseline, {
          ...range,
          low: range.low * scale,
          high: range.high * scale,
        });
        low = Math.round(r.low * 10) / 10;
        high = Math.round(r.high * 10) / 10;
      }
      return { code, baseline, latest, low, high };
    });
  }

  /** Hitos del ciclo: cambios de bloque, descargas, tests, el evento y el final. */
  function milestonesOf(plan: BoxPlanRecord, locale: Locale): MyCycleResponse["milestones"] {
    const out: MyCycleResponse["milestones"] = [];
    plan.structure.blocks.forEach((b, i) => {
      if (i === 0) return;
      const date = planWeekStart(plan.startsOn, b.startWeek);
      if (b.kind === "deload")
        out.push({ date, kind: "deload", label: PLAN_BLOCK_NAMES.deload[locale] });
      else if (b.kind !== "test")
        out.push({ date, kind: "block", label: blockLabel(plan.structure, i, locale) });
    });
    for (const w of plan.structure.weeks) {
      const date = planWeekStart(plan.startsOn, w.n);
      if (w.tags.includes("test"))
        out.push({ date, kind: "test", label: PLAN_BLOCK_NAMES.test[locale] });
      if (w.tags.includes("retest"))
        out.push({ date, kind: "retest", label: PLAN_BLOCK_NAMES.test[locale] });
    }
    if (plan.eventDate)
      out.push({ date: plan.eventDate, kind: "event", label: plan.eventName ?? plan.name });
    out.push({ date: planEndsOn(plan.startsOn, plan.weeks), kind: "end", label: plan.name });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/cycle",
      tags: ["Planificación"],
      summary:
        "Mi ciclo: en qué punto del plan estoy, mis marcas y lo que puedo esperar, mi constancia, lo que me falta esta semana y mis niveles",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Mi ciclo", MyCycleResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const tz = tenant.organization.timezone;
      const player = await requireSelfPlayer(data, c);
      const today = clubToday(c);
      const locale = localeOf(c);
      const now = new Date();
      const [plan, levels, settings] = await Promise.all([
        mainPlanOf(data, tenant.scope, player.id, tz, now),
        athleteLevels(data, tenant.scope, player.id, today),
        data.planning.settings.get(tenant.scope),
      ]);
      const recent = await data.planning.attendance(
        tenant.scope,
        plan?.section.id ?? null,
        new Date(now.getTime() - 56 * DAY),
        now,
        tz,
        player.id,
      );
      const frequency = usualFrequency(recent.length);
      if (!plan) {
        return c.json(
          {
            plan: null,
            milestones: [],
            tests: [],
            frequency,
            constancy: { sessions: 0, weeks: [], perWeek: 0 },
            week: [],
            nudge: null,
            levels,
            athletePreview: settings.athletePreview,
          },
          200,
        );
      }
      const endsOn = planEndsOn(plan.startsOn, plan.weeks);
      const n = planWeekOf(plan.startsOn, plan.weeks, today);
      const structureWeek = n ? plan.structure.weeks[n - 1] : undefined;
      const block = structureWeek ? plan.structure.blocks[structureWeek.block] : undefined;
      const monday = weekStartOf(today);
      const [attended, bookings, tests] = await Promise.all([
        data.planning.attendance(
          tenant.scope,
          plan.section.id,
          instantOf(tz, plan.startsOn),
          instantOf(tz, addDays(today < endsOn ? today : endsOn, 1)),
          tz,
          player.id,
        ),
        data.planning.bookingsOf(
          tenant.scope,
          player.id,
          instantOf(tz, monday),
          instantOf(tz, addDays(monday, 7)),
          tz,
        ),
        testsOf(tenant.scope, plan, player.id, frequency),
      ]);

      // Constancia: sesiones por semana del plan hasta hoy.
      const lastWeek = n ?? (today > endsOn ? plan.weeks : 0);
      const weeks = Array.from({ length: lastWeek }, (_, i) => {
        const start = planWeekStart(plan.startsOn, i + 1);
        const end = addDays(start, 6);
        return {
          n: i + 1,
          sessions: attended.filter((a) => a.date >= start && a.date <= end).length,
        };
      });

      // Esta semana: papel de cada día, lo reservado y lo hecho.
      const ownBookings = bookings.filter((b) => b.sectionId === plan.section.id);
      const week = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const wn = planWeekOf(plan.startsOn, plan.weeks, date);
        const role = wn ? (plan.structure.weeks[wn - 1]?.roles[i] ?? null) : null;
        return {
          date,
          role: settings.athletePreview === "none" && date > today ? null : role,
          booked: ownBookings.some((b) => b.date === date && b.status !== "attended"),
          attended: ownBookings.some((b) => b.date === date && b.status === "attended"),
        };
      });

      // Lo que le falta esta semana para tocar lo esencial del bloque, y el día que lo cubre.
      let nudge: MyCycleResponse["nudge"] = null;
      if (block && settings.athletePreview !== "none") {
        const covered = new Set<Capacity>(
          week
            .filter((d) => (d.booked || d.attended) && d.role)
            .flatMap((d) => DAY_ROLE_INFO[d.role!].covers),
        );
        const missing = essentialCapacities(block.emphasis).find((cap) => !covered.has(cap));
        if (missing) {
          const day = week.find(
            (d) =>
              d.date > today &&
              !d.booked &&
              d.role &&
              DAY_ROLE_INFO[d.role].covers.includes(missing),
          );
          if (day && day.role)
            nudge = {
              capacity: missing,
              date: day.date,
              role: day.role,
              classId: null,
              time: null,
              free: null,
            };
        }
      }

      const sessions = attended.length;
      return c.json(
        {
          plan: {
            id: plan.id,
            name: plan.name,
            section: plan.section,
            startsOn: plan.startsOn,
            endsOn,
            weeks: plan.weeks,
            week: n,
            blockKind: block?.kind ?? null,
            blockLabel: structureWeek
              ? blockLabel(plan.structure, structureWeek.block, locale)
              : null,
            blockFocus: block?.focus ?? null,
            structure: plan.structure,
            finished: plan.status === "finished" || today > endsOn,
          },
          milestones: milestonesOf(plan, locale),
          tests,
          frequency,
          constancy: {
            sessions,
            weeks,
            perWeek: weeks.length > 0 ? Math.round((sessions / weeks.length) * 10) / 10 : 0,
          },
          week,
          nudge,
          levels,
          athletePreview: settings.athletePreview,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/me/levels",
      tags: ["Planificación"],
      summary: "Fija mi nivel en una capacidad (o vuelve al sugerido con mis resultados)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(MyLevelUpdateSchema),
      responses: { 200: json("Mis niveles", MyLevelsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      const input = c.req.valid("json");
      await data.planning.levels.set(tenant.scope, player.id, input.capacity, input.level);
      await audit(c, "athlete_level.updated", `${player.firstName} ${player.lastName}`, {
        capacity: input.capacity,
        level: input.level,
      });
      return c.json(
        { levels: await athleteLevels(data, tenant.scope, player.id, clubToday(c)) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/cycle/summary",
      tags: ["Planificación"],
      summary: "Mi ciclo en cifras: sesiones, marcas y tests de un plan, para compartir",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { query: z.object({ plan: z.string().uuid().optional() }) },
      responses: { 200: json("Mi ciclo en cifras", MyCycleSummaryResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const tz = tenant.organization.timezone;
      const player = await requireSelfPlayer(data, c);
      const wanted = c.req.valid("query").plan;
      const plan = wanted
        ? await data.planning.plans.byId(tenant.scope, wanted)
        : await mainPlanOf(data, tenant.scope, player.id, tz);
      if (!plan || plan.status === "draft") throw notFound("Ese plan no existe.");
      const today = clubToday(c);
      const endsOn = planEndsOn(plan.startsOn, plan.weeks);
      const until = today < endsOn ? today : endsOn;
      const [attended, prs, recent] = await Promise.all([
        data.planning.attendance(
          tenant.scope,
          plan.section.id,
          instantOf(tz, plan.startsOn),
          instantOf(tz, addDays(until, 1)),
          tz,
          player.id,
        ),
        data.planning.prCount(tenant.scope, plan.startsOn, until, player.id),
        data.planning.attendance(
          tenant.scope,
          plan.section.id,
          instantOf(tz, addDays(until, -56)),
          instantOf(tz, addDays(until, 1)),
          tz,
          player.id,
        ),
      ]);
      const frequency = usualFrequency(recent.length);
      return c.json(
        {
          plan: {
            id: plan.id,
            name: plan.name,
            startsOn: plan.startsOn,
            endsOn,
            weeks: plan.weeks,
            structure: plan.structure,
          },
          athlete: { firstName: player.firstName, lastName: player.lastName },
          club: tenant.organization.name,
          sessions: attended.length,
          prs: prs.total,
          tests: await testsOf(tenant.scope, plan, player.id, frequency),
          finished: plan.status === "finished" || today > endsOn,
        },
        200,
      );
    },
  );

  return app;
}
