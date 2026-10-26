import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  FitnessAthleteDetailResponseSchema,
  FitnessAthletesResponseSchema,
  FitnessMetricsResponseSchema,
  isAdultOn,
  LibraryResponseSchema,
  planExpiresOn,
  RankingResponseSchema,
  weeklyStreaks,
  type FitnessAthleteRow,
  type FitnessMetricsResponse,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  entitlementOf,
  playerPhotoUrlFor,
  type AthleteRowRecord,
  type DataLayer,
  type SubscriptionRecord,
} from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { forbidden, notFound } from "../http/errors.ts";
import { benchmarksOf, movementsOf } from "./fitness-workouts.ts";
import {
  classDto,
  errors,
  fitnessChain,
  idParam,
  json,
  localeOf,
  orgOf,
  personName,
  selfPlayer,
  subscriptionDto,
  todayIn,
  visibleAthleteIds,
  type Ctx,
} from "./fitness-common.ts";

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** La tarifa que se enseña de un atleta: la activa o en pausa, si no, la última. */
function currentOf(subs: SubscriptionRecord[]): SubscriptionRecord | null {
  return (
    subs.find((s) => s.status === "active") ??
    subs.find((s) => s.status === "paused") ??
    subs[0] ??
    null
  );
}

/** Lo que una tarifa recurrente suma al mes. */
function monthlyCents(s: SubscriptionRecord): number {
  switch (s.plan.period) {
    case "monthly":
      return s.plan.amountCents;
    case "quarterly":
      return Math.round(s.plan.amountCents / 3);
    case "yearly":
      return Math.round(s.plan.amountCents / 12);
    default:
      return 0;
  }
}

/**
 * Lo que el box mira de un vistazo (ADR 0049): sus atletas con su tarifa y su última visita
 * (`org.players.read`, en el ámbito de quien pregunta), la ficha de un atleta para su coach, las
 * cifras y avisos del negocio (`org.fees.read`), el ranking de constancia del mes y la librería.
 */
export function createFitnessInsightRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  for (const path of ["/api/org/athletes", "/api/org/fitness"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }

  async function rowsOf(c: Ctx, onlyIds: string[] | null) {
    const tenant = orgOf(c);
    const today = todayIn(tenant.organization.timezone);
    const [athletes, subs] = await Promise.all([
      data.fitness.athletes(tenant.scope, tenant.organization.timezone, new Date(), onlyIds),
      data.bookings.subscriptions.list(tenant.scope, today),
    ]);
    const used = await data.fitness.consumedBySubscription(
      tenant.scope,
      subs.filter((s) => s.plan.entitlement === "pack").map((s) => s.id),
    );
    const counted = await data.bookings.countedByPlayer(
      tenant.scope,
      athletes.map((a) => a.playerId),
      tenant.organization.timezone,
    );
    const byPlayer = new Map<string, SubscriptionRecord[]>();
    for (const s of subs) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s]);
    return athletes.map((a) => {
      const current = currentOf(byPlayer.get(a.playerId) ?? []);
      const dto = current
        ? subscriptionDto(current, { counted: counted.get(a.playerId) ?? [] }, today)
        : null;
      return {
        row: a,
        subscriptions: byPlayer.get(a.playerId) ?? [],
        dto: {
          playerId: a.playerId,
          personId: a.personId,
          name: personName(a),
          photoUrl: playerPhotoUrlFor(a.photoBlobKey, tenant.organization.slug, a.playerId),
          email: a.email,
          hasAccess: a.hasAccess,
          plan:
            current && dto
              ? {
                  id: current.id,
                  name: current.plan.name,
                  status: current.status,
                  remaining:
                    current.plan.entitlement === "pack" && current.plan.sessions
                      ? Math.max(0, current.plan.sessions - (used.get(current.id) ?? 0))
                      : dto.usage.remaining,
                  expiresOn: planExpiresOn(entitlementOf(current)),
                }
              : null,
          lastVisit: a.lastVisit,
          visits30: a.visits30,
          joinedOn: a.joinedOn,
          restriction: a.restriction,
        } satisfies FitnessAthleteRow,
      };
    });
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/athletes",
      tags: ["Fitness"],
      summary:
        "Atletas del box con su tarifa, lo que les queda, su última visita y si tienen una restricción. En el ámbito de quien pregunta",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.players.read")],
      responses: { 200: json("Atletas", FitnessAthletesResponseSchema), ...errors },
    }),
    async (c) => {
      const visible = await visibleAthleteIds(data, c);
      const rows = await rowsOf(c, visible);
      return c.json({ athletes: rows.map((r) => r.dto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/athletes/{id}",
      tags: ["Fitness"],
      summary:
        "Ficha de un atleta para el box: tarifas, reservas recientes, marcas, benchmarks y, si las comparte, sus medidas",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.players.read")],
      request: { params: idParam },
      responses: { 200: json("Atleta", FitnessAthleteDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const visible = await visibleAthleteIds(data, c);
      if (visible && !visible.includes(id)) throw notFound("Ese atleta no existe.");
      const [row] = await rowsOf(c, [id]);
      if (!row) throw notFound("Ese atleta no existe.");
      const timezone = tenant.organization.timezone;
      const today = todayIn(timezone);
      const now = new Date();
      const policy = await data.bookings.policy(tenant.scope);
      const [bookings, trained, records, benchmarks, preferences, counted] = await Promise.all([
        data.bookings.ofPlayer(tenant.scope, id, timezone, {
          from: new Date(now.getTime() - 60 * DAY),
          to: new Date(now.getTime() + 30 * DAY),
        }),
        data.bookings.trainedDates(tenant.scope, id, timezone, now),
        data.workouts.records.list(tenant.scope, [id]),
        data.workouts.benchmarks.list(tenant.scope, id),
        data.workouts.preferences.get(tenant.scope, id),
        data.bookings.countedByPlayer(tenant.scope, [id], timezone),
      ]);
      const body = preferences.shareBodyWithCoach
        ? await data.workouts.body.list(tenant.scope, id)
        : null;
      const r: AthleteRowRecord = row.row;
      return c.json(
        {
          athlete: {
            ...row.dto,
            phone: r.phone,
            birthDate: r.birthDate,
            adult: isAdultOn(r.birthDate, today),
          },
          plans: row.subscriptions.map((s) =>
            subscriptionDto(s, { counted: counted.get(id) ?? [] }, today),
          ),
          bookings: bookings
            .slice()
            .reverse()
            .map((b) => classDto(b.cls, policy, { my: b.booking })),
          movements: movementsOf(records.get(id) ?? []),
          benchmarks: benchmarksOf(benchmarks, localeOf(c)),
          body,
          streak: weeklyStreaks(trained, today),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fitness/metrics",
      tags: ["Fitness"],
      summary:
        "Cifras del box: atletas activos, altas y bajas, ocupación, ingresos recurrentes, pruebas, avisos de hoy, ocupación por franja y programación de la semana",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.fees.read")],
      responses: { 200: json("Métricas", FitnessMetricsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const timezone = tenant.organization.timezone;
      const now = new Date();
      const today = todayIn(timezone, now);
      const monthStart = `${today.slice(0, 7)}-01`;
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      const monday = addDays(today, -weekday);
      const at = (date: string) => new Date(`${date}T00:00:00Z`);
      const [subs, athletes, upcoming, thisWeek, lastWeek, fourWeeks, trials, overdue] =
        await Promise.all([
          data.bookings.subscriptions.list(tenant.scope, today),
          data.fitness.athletes(tenant.scope, timezone, now),
          data.fitness.withUpcoming(tenant.scope, now),
          data.fitness.occupancy(tenant.scope, at(monday), at(addDays(monday, 7)), timezone),
          data.fitness.occupancy(tenant.scope, at(addDays(monday, -7)), at(monday), timezone),
          data.fitness.occupancy(tenant.scope, at(addDays(monday, -28)), at(monday), timezone),
          data.fitness.trials(tenant.scope, at(monday), at(addDays(monday, 7)), at(monthStart)),
          data.fitness.overdueFitnessCharges(tenant.scope),
        ]);

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
      const trained30 = athletes
        .filter((a) => activePlayers.has(a.playerId))
        .reduce((sum, a) => sum + a.visits30, 0);

      const alerts: FitnessMetricsResponse["alerts"] = [];
      const nameOf = new Map(athletes.map((a) => [a.playerId, personName(a)]));
      const inactive = athletes.filter(
        (a) =>
          activePlayers.has(a.playerId) &&
          !upcoming.has(a.playerId) &&
          (!a.lastVisit || a.lastVisit < addDays(today, -14)),
      );
      if (inactive.length > 0)
        alerts.push({
          kind: "inactive_athletes",
          count: inactive.length,
          date: null,
          sample: inactive.slice(0, 3).map((a) => personName(a)),
        });
      const used = await data.fitness.consumedBySubscription(
        tenant.scope,
        active.filter((s) => s.plan.entitlement === "pack").map((s) => s.id),
      );
      const packs = active.filter((s) => {
        if (s.plan.entitlement !== "pack") return false;
        const expires = planExpiresOn(entitlementOf(s));
        const left = (s.plan.sessions ?? 0) - (used.get(s.id) ?? 0);
        return (expires !== null && expires <= addDays(today, 7)) || left <= 1;
      });
      if (packs.length > 0)
        alerts.push({
          kind: "packs_expiring",
          count: packs.length,
          date: null,
          sample: packs.slice(0, 3).map((s) => nameOf.get(s.playerId) ?? s.playerName),
        });
      if (trials.pending.length > 0)
        alerts.push({
          kind: "trials_pending",
          count: trials.pending.length,
          date: null,
          sample: trials.pending.slice(0, 3),
        });
      // Programación de la semana: qué días con clase tienen WOD publicado, en borrador o nada.
      const horizon = addDays(today, 6);
      const [classDays, workouts, sectionNames] = await Promise.all([
        data.fitness.classDays(tenant.scope, at(today), at(addDays(horizon, 1)), timezone),
        data.workouts.list(tenant.scope, today, horizon),
        data.fitness.fitnessSections(tenant.scope),
      ]);
      const sectionName = new Map(sectionNames.map((s) => [s.id, s.name]));
      const programming: FitnessMetricsResponse["programming"] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(today, i);
        const daySections = classDays.filter((d) => d.date === date).map((d) => d.sectionId);
        const dayWorkouts = workouts.filter((w) => w.onDate === date);
        if (daySections.length === 0 && dayWorkouts.length === 0) continue;
        const published = dayWorkouts.filter((w) => w.status === "published");
        const missing = daySections.filter((s) => !dayWorkouts.some((w) => w.section.id === s));
        programming.push({
          date,
          status:
            dayWorkouts.length === 0
              ? "missing"
              : published.length < dayWorkouts.length
                ? "draft"
                : missing.length > 0
                  ? "partial"
                  : "published",
          title:
            dayWorkouts[0]?.title ??
            dayWorkouts[0]?.blocks.find((b) => b.kind === "wod")?.title ??
            null,
          missing: [...new Set(missing)].map((id) => sectionName.get(id) ?? "").filter(Boolean),
        });
      }
      const tomorrow = addDays(today, 1);
      const notReady = programming.filter(
        (p) => (p.date === today || p.date === tomorrow) && p.status !== "published",
      );
      if (notReady.length > 0)
        alerts.push({
          kind: "workout_missing",
          count: notReady.length,
          date: notReady[0]!.date,
          sample: notReady[0]!.missing.slice(0, 3),
        });
      if (overdue.length > 0)
        alerts.push({
          kind: "charges_failed",
          count: overdue.length,
          date: null,
          sample: overdue.slice(0, 3),
        });
      const pauses = active.filter(
        (s) => s.status === "paused" && s.pausedUntil && s.pausedUntil <= addDays(today, 7),
      );
      if (pauses.length > 0)
        alerts.push({
          kind: "plans_paused_ending",
          count: pauses.length,
          date: null,
          sample: pauses.slice(0, 3).map((s) => s.playerName),
        });

      const ratio = (o: { offered: number; taken: number }) =>
        o.offered > 0 ? Math.min(1, o.taken / o.offered) : null;
      return c.json(
        {
          activeAthletes: activePlayers.size,
          joinedThisMonth: joined,
          leftThisMonth: left,
          occupancyWeek: ratio(thisWeek),
          occupancyLastWeek: ratio(lastWeek),
          recurringMonthlyCents: active
            .filter((s) => s.status === "active")
            .reduce((sum, s) => sum + monthlyCents(s), 0),
          trialsThisWeek: trials.thisWeek,
          trialsConvertedThisMonth: trials.convertedThisMonth,
          visitsPerAthlete30:
            activePlayers.size > 0 ? Math.round((trained30 / activePlayers.size) * 10) / 10 : 0,
          alerts,
          byHour: [...fourWeeks.byHour.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, v]) => ({ hour, offered: v.offered, taken: v.taken })),
          programming,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fitness/ranking",
      tags: ["Fitness"],
      summary:
        "Ranking de constancia de un mes (clases hechas), sin quien prefiere no salir. Para atletas y personal",
      security: [{ sessionCookie: [] }],
      request: {
        query: z.object({
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        }),
      },
      responses: { 200: json("Ranking", RankingResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const actor = c.get("actor");
      const player = actor.permissions.has("org.family.read") ? await selfPlayer(data, c) : null;
      const staff = actor.permissions.has("org.events.read");
      if (!staff && !player) throw forbidden();
      const policy = await data.bookings.policy(tenant.scope);
      if (!staff && !policy.showLeaderboards)
        throw forbidden("El club no publica clasificaciones.");
      const today = todayIn(tenant.organization.timezone);
      const month = c.req.valid("query").month ?? today.slice(0, 7);
      const from = new Date(`${month}-01T00:00:00Z`);
      const to = new Date(from);
      to.setUTCMonth(to.getUTCMonth() + 1);
      const now = new Date();
      const [counts, hidden] = await Promise.all([
        data.fitness.trainedCounts(tenant.scope, from, to, now),
        data.fitness.hiddenFromLeaderboards(tenant.scope),
      ]);
      const ids = [...counts.keys()];
      const athletes = await data.fitness.athletes(
        tenant.scope,
        tenant.organization.timezone,
        now,
        ids,
      );
      const nameOf = new Map(athletes.map((a) => [a.playerId, personName(a)]));
      const visible = ids.filter((id) => staff || !hidden.has(id) || id === player?.id);
      const sorted = visible
        .map((id) => ({ playerId: id, classes: counts.get(id) ?? 0 }))
        .sort(
          (a, b) =>
            b.classes - a.classes ||
            (nameOf.get(a.playerId) ?? "").localeCompare(nameOf.get(b.playerId) ?? ""),
        );
      let rank = 0;
      let prev = -1;
      return c.json(
        {
          month,
          consistency: sorted.map((r, i) => {
            if (r.classes !== prev) {
              rank = i + 1;
              prev = r.classes;
            }
            return {
              rank,
              playerId: r.playerId,
              name: nameOf.get(r.playerId) ?? "",
              classes: r.classes,
              isMe: r.playerId === player?.id,
            };
          }),
          hiddenCount: ids.length - visible.length,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fitness/library",
      tags: ["Fitness"],
      summary:
        "Librería de movimientos del club: las tareas de la biblioteca del club y de sus disciplinas, con su vídeo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      responses: { 200: json("Librería", LibraryResponseSchema), ...errors },
    }),
    async (c) => c.json({ items: await data.fitness.library(orgOf(c).scope) }, 200),
  );

  return app;
}
