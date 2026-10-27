import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  BOX_DASHBOARD_MAX_KPIS,
  BoxDashboardResponseSchema,
  BoxDashboardSchema,
  BoxDashboardUpdateSchema,
  dashboardKpis,
  eligibleKpis,
  planExpiresOn,
  readDashboardsConfig,
  visibleKpis,
  type BoxKpi,
  type BoxKpiValue,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { entitlementOf, type DataLayer } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import {
  auditOf,
  body,
  errors,
  fitnessChain,
  json,
  orgOf,
  personName,
  todayIn,
  visibleAthleteIds,
  type Ctx,
} from "./fitness-common.ts";
import { monthlyCents, programmingWeek } from "./fitness-insights.ts";

const DAY = 86_400_000;
const at = (date: string) => new Date(`${date}T00:00:00Z`);

type Figure = Omit<BoxKpiValue, "id">;
const figure = (f: Partial<Figure> & Pick<Figure, "value">): Figure => ({
  total: null,
  delta: null,
  label: null,
  params: {},
  sample: [],
  tone: "neutral",
  ...f,
});

/** Una consulta que comparten varios KPIs se hace una sola vez por petición. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load());
}

/**
 * Lo que necesitan los KPIs, cargado solo si alguno lo pide. Las cifras de atletas siguen el
 * ámbito de quien pregunta (un coach con ámbito ve las de los suyos); el resto son del club.
 */
function sourcesOf(data: DataLayer, c: Ctx) {
  const tenant = orgOf(c);
  const scope = tenant.scope;
  const timezone = tenant.organization.timezone;
  const now = new Date();
  const today = todayIn(timezone, now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));

  const visible = once(() => visibleAthleteIds(data, c));
  const subscriptions = once(async () => {
    const [subs, ids] = await Promise.all([
      data.bookings.subscriptions.list(scope, today),
      visible(),
    ]);
    return ids ? subs.filter((s) => ids.includes(s.playerId)) : subs;
  });
  /** Tarifas activas o en pausa, quién las tiene y las altas y bajas del mes. */
  const members = once(async () => {
    const subs = await subscriptions();
    const active = subs.filter((s) => s.status === "active" || s.status === "paused");
    const activePlayers = new Set(active.map((s) => s.playerId));
    const firstStart = new Map<string, string>();
    for (const s of subs) {
      const prev = firstStart.get(s.playerId);
      if (!prev || s.startsOn < prev) firstStart.set(s.playerId, s.startsOn);
    }
    const joined = [...firstStart.entries()].filter(
      ([player, start]) => start >= monthStart && start <= today && activePlayers.has(player),
    ).length;
    const left = new Set(
      subs
        .filter(
          (s) =>
            (s.status === "cancelled" || s.status === "expired") &&
            !activePlayers.has(s.playerId) &&
            ((s.endsOn ?? planExpiresOn(entitlementOf(s)) ?? "") >= monthStart ||
              s.status === "cancelled"),
        )
        .map((s) => s.playerId),
    ).size;
    return { active, activePlayers, joined, left };
  });
  const athletes = once(async () => data.fitness.athletes(scope, timezone, now, await visible()));
  const occupancy = (from: string, to: string) =>
    data.fitness.occupancy(scope, at(from), at(to), timezone);
  const leads = once(() => data.community.leads.list(scope));

  return {
    scope,
    today,
    now,
    monthStart,
    visible,
    members,
    athletes,
    leads,
    upcoming: once(() => data.fitness.withUpcoming(scope, now)),
    classesToday: once(() => occupancy(today, addDays(today, 1))),
    thisWeek: once(() => occupancy(monday, addDays(monday, 7))),
    lastWeek: once(() => occupancy(addDays(monday, -7), monday)),
    fourWeeks: once(() => occupancy(addDays(monday, -28), monday)),
    trials: once(() =>
      data.fitness.trials(scope, at(monday), at(addDays(monday, 7)), at(monthStart)),
    ),
    programming: once(() => programmingWeek(data, scope, timezone, today)),
    slots: once(async () =>
      [...(await occupancy(addDays(monday, -28), monday)).byHour.entries()]
        .filter(([, v]) => v.offered > 0)
        .map(([hour, v]) => ({ hour, ...v, ratio: v.taken / v.offered }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
    ),
  };
}

type Sources = ReturnType<typeof sourcesOf>;

/** Hasta tres nombres, para que un aviso se entienda sin abrirlo. */
const sampleOf = (names: string[]) => names.slice(0, 3);

/**
 * Cómo se calcula cada KPI del catálogo (`BOX_KPIS`). La fórmula es del producto, no del club: así
 * dos boxes que miran "Ocupación" miran lo mismo.
 */
function calculators(data: DataLayer, c: Ctx): Record<BoxKpi, (s: Sources) => Promise<Figure>> {
  return {
    // --- Entrenamiento ---
    classes_today: async (s) => {
      const day = await s.classesToday();
      return figure({
        value: day.classes,
        params: { booked: day.taken, free: Math.max(0, day.offered - day.taken) },
      });
    },
    occupancy_week: async (s) => {
      const [week, last] = await Promise.all([s.thisWeek(), s.lastWeek()]);
      const ratio = (o: { offered: number; taken: number }) =>
        o.offered > 0 ? Math.min(1, o.taken / o.offered) : null;
      const now = ratio(week);
      const before = ratio(last);
      return figure({
        value: now,
        delta: now !== null && before !== null ? Math.round((now - before) * 100) : null,
      });
    },
    programming_ready: async (s) => {
      const week = await s.programming();
      const ready = week.filter((p) => p.status === "published").length;
      const soon = week.filter(
        (p) => p.date <= addDays(s.today, 1) && p.status !== "published",
      ).length;
      return figure({
        value: ready,
        total: week.length,
        params: {
          drafts: week.filter((p) => p.status === "draft").length,
          missing: week.filter((p) => p.status === "missing" || p.status === "partial").length,
        },
        tone:
          week.length === 0
            ? "neutral"
            : ready === week.length
              ? "success"
              : soon > 0
                ? "danger"
                : "warning",
      });
    },
    active_athletes: async (s) => {
      const m = await s.members();
      return figure({
        value: m.activePlayers.size,
        params: { joined: m.joined, left: m.left },
      });
    },
    inactive_athletes: async (s) => {
      const [m, athletes, upcoming] = await Promise.all([s.members(), s.athletes(), s.upcoming()]);
      const inactive = athletes.filter(
        (a) =>
          m.activePlayers.has(a.playerId) &&
          !upcoming.has(a.playerId) &&
          (!a.lastVisit || a.lastVisit < addDays(s.today, -14)),
      );
      return figure({
        value: inactive.length,
        sample: sampleOf(inactive.map((a) => personName(a))),
        tone: inactive.length > 0 ? "warning" : "success",
      });
    },
    visits_per_athlete: async (s) => {
      const [m, athletes] = await Promise.all([s.members(), s.athletes()]);
      const trained = athletes
        .filter((a) => m.activePlayers.has(a.playerId))
        .reduce((sum, a) => sum + a.visits30, 0);
      return figure({
        value:
          m.activePlayers.size > 0 ? Math.round((trained / m.activePlayers.size) * 10) / 10 : null,
      });
    },
    prs_week: async (s) => {
      const ids = await s.visible();
      const prs = await data.planning.prCount(
        s.scope,
        addDays(s.today, -6),
        s.today,
        ids ?? undefined,
      );
      return figure({
        value: prs.total,
        params: { athletes: prs.athletes },
        tone: prs.total > 0 ? "success" : "neutral",
      });
    },
    active_plans: async (s) => {
      const [plans, sections] = await Promise.all([
        data.planning.plans.list(s.scope),
        data.fitness.fitnessSections(s.scope),
      ]);
      const active = plans.filter((p) => p.status === "active");
      const covered = new Set(
        active.filter((p) => p.audience === "section").map((p) => p.section.id),
      );
      return figure({
        value: active.length,
        params: { uncovered: sections.filter((x) => !covered.has(x.id)).length },
      });
    },
    exercises_library: async (s) => {
      const exercises = await data.exercises.list(s.scope);
      return figure({
        value: exercises.length,
        params: { noVideo: exercises.filter((e) => !e.videoUrl).length },
      });
    },

    // --- Negocio ---
    recurring_revenue: async (s) => {
      const m = await s.members();
      return figure({
        value: m.active
          .filter((x) => x.status === "active")
          .reduce((sum, x) => sum + monthlyCents(x), 0),
      });
    },
    members_net: async (s) => {
      const m = await s.members();
      const net = m.joined - m.left;
      return figure({
        value: net,
        params: { joined: m.joined, left: m.left },
        tone: net > 0 ? "success" : net < 0 ? "danger" : "neutral",
      });
    },
    packs_expiring: async (s) => {
      const m = await s.members();
      const packs = m.active.filter((x) => x.plan.entitlement === "pack");
      const used = await data.fitness.consumedBySubscription(
        s.scope,
        packs.map((x) => x.id),
      );
      const ending = packs.filter((x) => {
        const expires = planExpiresOn(entitlementOf(x));
        const left = (x.plan.sessions ?? 0) - (used.get(x.id) ?? 0);
        return (expires !== null && expires <= addDays(s.today, 7)) || left <= 1;
      });
      return figure({
        value: ending.length,
        sample: sampleOf(ending.map((x) => x.playerName)),
        tone: ending.length > 0 ? "warning" : "neutral",
      });
    },
    paused_plans: async (s) => {
      const m = await s.members();
      const paused = m.active.filter((x) => x.status === "paused");
      return figure({
        value: paused.length,
        params: {
          ending: paused.filter((x) => x.pausedUntil && x.pausedUntil <= addDays(s.today, 7))
            .length,
        },
        sample: sampleOf(paused.map((x) => x.playerName)),
      });
    },
    overdue_charges: async (s) => {
      const overdue = await data.fitness.overdueCharges(s.scope);
      return figure({
        value: overdue.outstandingCents,
        params: { count: overdue.count },
        sample: sampleOf(overdue.names),
        tone: overdue.count > 0 ? "danger" : "success",
      });
    },
    collected_month: async (s) => {
      const collected = await data.fitness.collectedSince(s.scope, s.monthStart);
      return figure({ value: collected.cents, params: { payments: collected.count } });
    },
    open_leads: async (s) => {
      const leads = await s.leads();
      const open = leads.filter(
        (l) => l.status === "new" || l.status === "trial_booked" || l.status === "trial_done",
      );
      const fresh = open.filter((l) => l.status === "new");
      return figure({
        value: open.length,
        params: { fresh: fresh.length },
        sample: sampleOf(fresh.map((l) => `${l.firstName} ${l.lastName}`.trim())),
      });
    },
    trials_week: async (s) => {
      const trials = await s.trials();
      return figure({
        value: trials.thisWeek,
        params: { converted: trials.convertedThisMonth },
      });
    },
    lead_conversion: async (s) => {
      const since = new Date(s.now.getTime() - 90 * DAY);
      const recent = (await s.leads()).filter((l) => l.createdAt >= since);
      const converted = recent.filter((l) => l.status === "converted").length;
      return figure({
        value: recent.length > 0 ? converted / recent.length : null,
        params: { converted, total: recent.length },
      });
    },
    store_sales_month: async (s) => {
      const [sales, alerts] = await Promise.all([
        data.fitness.storeSalesSince(s.scope, at(s.monthStart)),
        data.store.alerts(s.scope),
      ]);
      return figure({
        value: sales.cents,
        params: { orders: sales.orders, toPrepare: alerts.ordersToPrepare },
      });
    },
    announcements_month: async (s) => {
      const since = new Date(s.now.getTime() - 30 * DAY);
      const list = await data.community.announcements.list(s.scope, c.get("actor").userId, {
        all: true,
      });
      const recent = list.filter((a) => a.publishedAt >= since && a.publishedAt <= s.now);
      return figure({
        value: recent.length,
        params: { reads: recent.reduce((sum, a) => sum + (a.readCount ?? 0), 0) },
      });
    },

    // --- El box ---
    classes_week: async (s) => {
      const week = await s.thisWeek();
      return figure({ value: week.classes, params: { seats: week.offered, booked: week.taken } });
    },
    peak_slot: async (s) => {
      const slots = await s.slots();
      const peak = slots.reduce<(typeof slots)[number] | null>(
        (best, x) => (best === null || x.ratio > best.ratio ? x : best),
        null,
      );
      return figure({
        value: peak ? Math.min(1, peak.ratio) : null,
        label: peak?.hour ?? null,
        params: peak ? { taken: peak.taken, offered: peak.offered } : {},
      });
    },
    quiet_slot: async (s) => {
      const slots = await s.slots();
      const quiet = slots.reduce<(typeof slots)[number] | null>(
        (worst, x) => (worst === null || x.ratio < worst.ratio ? x : worst),
        null,
      );
      return figure({
        value: quiet ? Math.min(1, quiet.ratio) : null,
        label: quiet?.hour ?? null,
        params: quiet ? { taken: quiet.taken, offered: quiet.offered } : {},
      });
    },
    classes_without_coach: async (s) => {
      const count = await data.fitness.classesWithoutCoach(
        s.scope,
        s.now,
        new Date(s.now.getTime() + 7 * DAY),
      );
      return figure({ value: count, params: { count }, tone: count > 0 ? "warning" : "success" });
    },
    unread_messages: async (s) => {
      const threads = await data.community.messages.threads(s.scope, await s.visible());
      const waiting = threads.filter((t) => t.unread > 0);
      return figure({
        value: waiting.length,
        params: { messages: waiting.reduce((sum, t) => sum + t.unread, 0) },
        sample: sampleOf(waiting.map((t) => personName(t))),
        tone: waiting.length > 0 ? "warning" : "success",
      });
    },
    equipment_out: async (s) => {
      const items = await data.planning.equipment.list(s.scope);
      const broken = items.filter((x) => x.outOfService > 0);
      return figure({
        value: broken.reduce((sum, x) => sum + x.outOfService, 0),
        params: { kinds: broken.length, total: items.length },
        sample: sampleOf(broken.map((x) => x.name)),
        tone: broken.length > 0 ? "warning" : "neutral",
      });
    },
  };
}

const dashboardParam = z.object({ dashboard: BoxDashboardSchema });

/**
 * Cuadros de mando del box (ADR 0055): Hoy y la portada de cada área (Entrenamiento, Negocio y El
 * box). Los lee el personal, cada uno con lo que puede ver; los elige quien lleva los ajustes del
 * club, y la elección vale para todo el equipo.
 */
export function createFitnessDashboardRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  const audit = auditOf(data);
  app.use("/api/org/dashboards/*", ...chain);

  async function respond(c: Ctx, dashboard: z.infer<typeof BoxDashboardSchema>, preview: boolean) {
    const tenant = orgOf(c);
    const actor = c.get("actor");
    const saved = readDashboardsConfig(tenant.organization.dashboards);
    const kpis = visibleKpis(dashboardKpis(saved, dashboard), actor.permissions);
    const available = visibleKpis(eligibleKpis(dashboard), actor.permissions);
    const sources = sourcesOf(data, c);
    const calc = calculators(data, c);
    const values = await Promise.all(
      (preview ? available : kpis).map(async (id) => ({ id, ...(await calc[id](sources)) })),
    );
    const byHour =
      dashboard === "box"
        ? [...(await sources.fourWeeks()).byHour.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, v]) => ({ hour, offered: v.offered, taken: v.taken }))
        : null;
    return c.json(
      {
        dashboard,
        kpis,
        values,
        available,
        custom: saved[dashboard] !== undefined,
        canEdit: actor.permissions.has("org.settings.write"),
        byHour,
      },
      200,
    );
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/dashboards/{dashboard}",
      tags: ["Fitness"],
      summary:
        "Un cuadro de mando del box (Hoy o la portada de un área): los KPIs que el club ha elegido y sus cifras, solo con lo que quien pregunta puede ver. Con `preview=all`, las cifras de todos los que se pueden elegir",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: {
        params: dashboardParam,
        query: z.object({ preview: z.literal("all").optional() }),
      },
      responses: { 200: json("Cuadro de mando", BoxDashboardResponseSchema), ...errors },
    }),
    async (c) => {
      const { dashboard } = c.req.valid("param");
      return respond(c, dashboard, c.req.valid("query").preview === "all");
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/dashboards/{dashboard}",
      tags: ["Fitness"],
      summary:
        "Elegir los KPIs de un cuadro de mando para todo el club, en orden (como mucho ocho). Nulo vuelve a los de serie",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: { params: dashboardParam, ...body(BoxDashboardUpdateSchema) },
      responses: { 200: json("Cuadro de mando", BoxDashboardResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const actor = c.get("actor");
      const { dashboard } = c.req.valid("param");
      const { kpis } = c.req.valid("json");
      const saved = readDashboardsConfig(tenant.organization.dashboards);
      const next = { ...saved };
      if (kpis === null) {
        delete next[dashboard];
      } else {
        const eligible = new Set<BoxKpi>(eligibleKpis(dashboard));
        const chosen = [...new Set(kpis)].filter((id) => eligible.has(id));
        // Lo que quien guarda no puede ver se queda como estaba: no lo ha quitado él.
        const unseen = dashboardKpis(saved, dashboard).filter(
          (id) => !visibleKpis([id], actor.permissions).length && !chosen.includes(id),
        );
        next[dashboard] = [...chosen, ...unseen].slice(0, BOX_DASHBOARD_MAX_KPIS);
      }
      await data.organizations.setDashboards(tenant.scope, next);
      tenant.organization.dashboards = next;
      await audit(c, "organization.dashboards_updated", tenant.organization.name, {
        dashboard,
        kpis: next[dashboard] ?? null,
      });
      return respond(c, dashboard, false);
    },
  );

  return app;
}
