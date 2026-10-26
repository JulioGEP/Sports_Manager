import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  AthletePlanResponseSchema,
  AthleteResponseSchema,
  AthleteRpeSchema,
  AvailabilitySetSchema,
  DEFAULT_INSIGHT_THRESHOLDS,
  ExtraLoadCreateSchema,
  FamilyTestsResponseSchema,
  InfirmaryResponseSchema,
  loadMetrics,
  MatchLoadSetSchema,
  PhysicalTestCreateSchema,
  PhysicalTestResultsSetSchema,
  PhysicalTestsResponseSchema,
  PhysicalTestUpdateSchema,
  playerDisplayName,
  PlayerFocusSetSchema,
  PlayerPerformanceResponseSchema,
  SESSION_BLOCKS,
  TeamLoadResponseSchema,
  TeamTestsResponseSchema,
  weekStartOf,
  WellnessEntrySchema,
  type DailyLoad,
  type TrainingSettings,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  instantOf,
  localDate,
  playerPhotoUrlFor,
  plannedOf,
  type DataLayer,
  type PhysicalTestRecord,
} from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  actorOf,
  audit,
  availabilityDto,
  body,
  buildTeamInsights,
  canWriteLoad,
  canWriteLoadOfPlayer,
  contentDto,
  error,
  errors,
  guardFor,
  idParam,
  insightDto,
  json,
  localeOf,
  matchLoads,
  requirePlayerVisible,
  restrictedOf,
  sessionAndExtraLoads,
  teamMatchStats,
  teamOr404,
  tenantOf,
  todayOf,
  withStats,
  type RouteCtx,
  type Tenant,
} from "./training-support.ts";

/**
 * Carga, bienestar, disponibilidad, tests físicos y rendimiento del jugador (bloques 22, 24, 25 y
 * 26, ADR 0039). Ver la carga pide `org.load.read`; registrarla, `org.load.write` o
 * `org.load.write_own` (sus equipos); la disponibilidad la ponen fisioterapia, preparación
 * física y la administración (`org.availability.write`) y la ve todo el cuerpo técnico. El
 * deportista adulto con cuenta propia responde su bienestar y su RPE (decisión 3).
 */
export function createLoadRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const guard = guardFor(config, data);
  for (const path of [
    "/api/org/teams/:id/load",
    "/api/org/teams/:id/physical-tests",
    "/api/org/teams/:id/physical-tests/*",
    "/api/org/players/:id/performance",
    "/api/org/players/:id/loads",
    "/api/org/players/:id/loads/*",
    "/api/org/players/:id/wellness",
    "/api/org/players/:id/availability",
    "/api/org/players/:id/focus",
    "/api/org/matches/:id/loads",
    "/api/org/physical-tests",
    "/api/org/physical-tests/*",
    "/api/org/infirmary",
    "/api/org/me/athlete",
    "/api/org/me/athlete/*",
    "/api/org/family/players/:id/physical-tests",
  ])
    app.use(path, guard);

  const loadRead = requirePermission("org.load.read");
  const trainingRead = requirePermission("org.training.read");

  async function requireLoadWriteOf(c: RouteCtx, tenant: Tenant, playerId: string) {
    await requirePlayerVisible(data, c, tenant, playerId);
    if (!(await canWriteLoadOfPlayer(data, c, tenant, playerId))) throw forbidden();
  }

  // --- Panel de carga de un equipo (preparación física) ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/load",
      tags: ["Carga"],
      summary:
        "Carga del equipo por jugador: aguda frente a crónica, monotonía, últimos 28 días y bienestar",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam },
      responses: { 200: json("Carga", TeamLoadResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const team = await teamOr404(data, c, tenant, c.req.valid("param").id);
      const today = todayOf(tenant);
      const roster = (await data.teams.roster(tenant.scope, team.id)).filter(
        (r) => r.status === "active",
      );
      const ids = roster.map((r) => r.playerId);
      const from = addDays(today, -55);
      const [loads, stats, availability, wellness, section, insights] = await Promise.all([
        data.load.loadsFor(tenant.scope, ids, from, today),
        teamMatchStats(data, tenant, team),
        data.load.currentFor(tenant.scope, ids),
        data.load.wellnessFor(tenant.scope, ids, addDays(today, -14), today),
        data.training.sectionTraining(tenant.scope, team.section.id),
        buildTeamInsights(data, c, tenant, team, today, { loadOnly: true }),
      ]);
      const daily = sessionAndExtraLoads(loads);
      const fromMatches = await matchLoads(
        data,
        tenant,
        stats.filter((s) => s.match.playedOn >= from),
      );
      const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
      return c.json(
        {
          team: { id: team.id, name: team.name },
          today,
          days,
          players: roster.map((r) => {
            const entries: DailyLoad[] = [
              ...(daily.get(r.playerId) ?? []),
              ...(fromMatches.get(r.playerId) ?? []),
            ];
            const byDay = new Map<string, number>();
            for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.load);
            const last = wellness.filter((w) => w.playerId === r.playerId).at(-1) ?? null;
            return {
              playerId: r.playerId,
              name: playerDisplayName(r),
              photoUrl: playerPhotoUrlFor(r.photoBlobKey, tenant.organization.slug, r.playerId),
              shirtNumber: r.shirtNumber,
              availability: availabilityDto(availability.get(r.playerId)!),
              metrics: loadMetrics(entries, today),
              daily: days.map((d) => byDay.get(d) ?? 0),
              lastWellness: last ? { ...last } : null,
            };
          }),
          insights: insights.insights.map(insightDto),
          tracking: section?.settings.tracking ?? "basic",
          acwr: acwrOf(section?.settings),
          access: { write: canWriteLoad(c.get("actor"), team) },
        },
        200,
      );
    },
  );

  // --- Rendimiento de un jugador ---

  /** Umbrales de la relación aguda:crónica: los de la sección o, sin sección, los del producto. */
  function acwrOf(settings: TrainingSettings | undefined) {
    const t = settings?.thresholds ?? DEFAULT_INSIGHT_THRESHOLDS;
    return { high: t.acwrHigh, low: t.acwrLow };
  }

  async function performance(c: RouteCtx, tenant: Tenant, playerId: string) {
    const today = todayOf(tenant);
    const player = await data.players.byId(tenant.scope, playerId);
    if (!player) throw notFound("Ese jugador no existe.");
    const teams = (await data.players.teamsOf(tenant.scope, playerId)).filter(
      (t) => t.seasonIsCurrent,
    );
    const team = teams[0] ? await data.teams.byId(tenant.scope, teams[0].teamId) : null;
    const from = addDays(today, -55);
    const [loads, entries, current, periods, wellness, focus, objectives, tests] =
      await Promise.all([
        data.load.loadsFor(tenant.scope, [playerId], from, today),
        data.matches.matchesOfPlayer(tenant.scope, playerId),
        data.load.currentFor(tenant.scope, [playerId]),
        data.load.periodsFor(tenant.scope, [playerId]),
        data.load.wellnessFor(tenant.scope, [playerId], addDays(today, -27), today),
        data.load.focusOf(tenant.scope, [playerId]),
        data.load.objectivesOf(tenant.scope, [playerId]),
        data.load.ensureTests(tenant.scope, localeOf(c, tenant)),
      ]);
    const stats = withStats(entries.filter((e) => e.match.playedOn >= from));
    const fromMatches = (await matchLoads(data, tenant, stats)).get(playerId) ?? [];
    const other = sessionAndExtraLoads(loads).get(playerId) ?? [];
    const all: DailyLoad[] = [...other, ...fromMatches];
    const days = Array.from({ length: 35 }, (_, i) => addDays(today, i - 34)).map((date) => ({
      date,
      session: other
        .filter((l) => l.date === date && l.source === "session")
        .reduce((a, l) => a + l.load, 0),
      extra: other
        .filter((l) => l.date === date && l.source === "extra")
        .reduce((a, l) => a + l.load, 0),
      match: fromMatches.filter((l) => l.date === date).reduce((a, l) => a + l.load, 0),
    }));
    // Minutos trabajados de los contenidos de su objetivo en las últimas tres semanas.
    let contents: Awaited<ReturnType<DataLayer["training"]["contentsOf"]>> = [];
    let minutes: { contentId: string; minutes: number }[] = [];
    const focusIds = focus.get(playerId) ?? [];
    let settings: TrainingSettings | undefined;
    if (team) {
      const section = await data.training.sectionTraining(tenant.scope, team.section.id);
      settings = section?.settings;
      if (section)
        contents = await data.training.ensureCatalog(
          tenant.scope,
          section.id,
          section.sportCode,
          localeOf(c, tenant),
        );
      const tz = tenant.organization.timezone;
      const sessions = (
        await data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, addDays(today, -20)),
          instantOf(tz, addDays(today, 1)),
        )
      ).filter((s) => s.status !== "cancelled");
      const [items, attendance] = await Promise.all([
        data.training.itemsOf(
          tenant.scope,
          sessions.map((s) => s.id),
        ),
        data.training.attendanceForTeam(
          tenant.scope,
          team.id,
          instantOf(tz, addDays(today, -20)),
          instantOf(tz, addDays(today, 1)),
        ),
      ]);
      const absent = new Set(
        attendance
          .filter((a) => a.playerId === playerId && a.status !== "present")
          .map((a) => a.eventId),
      );
      const counted = new Map<string, number>();
      for (const s of sessions) {
        if (absent.has(s.eventId)) continue;
        for (const i of items.filter((x) => x.sessionId === s.id)) {
          if (i.playerIds && !i.playerIds.includes(playerId)) continue;
          for (const cid of i.contentIds) counted.set(cid, (counted.get(cid) ?? 0) + i.minutes);
        }
      }
      minutes = [...counted.entries()].map(([contentId, m]) => ({ contentId, minutes: m }));
    }
    const results = await data.load.testResultsFor(tenant.scope, [playerId]);
    const insights = team
      ? (await buildTeamInsights(data, c, tenant, team, today, { playerId })).insights
      : [];
    const actor = c.get("actor");
    return {
      player: {
        id: player.id,
        name: playerDisplayName(player),
        photoUrl: playerPhotoUrlFor(player.photoBlobKey, tenant.organization.slug, player.id),
        team: team ? { id: team.id, name: team.name } : null,
        section: team ? { id: team.section.id, name: team.section.name } : null,
      },
      today,
      availability: {
        current: availabilityDto(current.get(playerId)!),
        history: periods.map((p) => ({
          id: p.id,
          status: p.status,
          restrictions: p.restrictions,
          maxMinutes: p.maxMinutes,
          fromOn: p.fromOn,
          expectedReturnOn: p.expectedReturnOn,
          endedOn: p.endedOn,
          note: p.note,
        })),
      },
      load: {
        metrics: loadMetrics(all, today),
        acwr: acwrOf(settings),
        days,
        extras: loads
          .filter((l) => l.source === "extra")
          .map((l) => ({
            id: l.id,
            date: l.date,
            minutes: l.minutes,
            rpe: l.rpe ?? 0,
            note: l.note,
          })),
      },
      wellness: wellness.map(({ playerId: _p, ...w }) => w),
      focus: {
        contentIds: focusIds,
        contents: contents.map(contentDto),
        minutes,
        objective: objectives.get(playerId) ?? null,
      },
      tests: tests
        .filter((t) => t.status === "active")
        .map((test) => ({
          test,
          results: results
            .filter((r) => r.testId === test.id)
            .map((r) => ({ date: r.date, value: r.value })),
        }))
        .filter((t) => t.results.length > 0),
      insights: insights.map(insightDto),
      access: {
        loadWrite: await canWriteLoadOfPlayer(data, c, tenant, playerId),
        availabilityWrite: actor.permissions.has("org.availability.write"),
        healthRead: actor.permissions.has("org.health.read"),
        focusWrite:
          actor.permissions.has("org.players.assess") ||
          (actor.permissions.has("org.players.assess_own") &&
            actor.kind === "member" &&
            (await data.players.isStaffOf(tenant.scope, actor.userId, playerId))),
      },
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/performance",
      tags: ["Carga"],
      summary:
        "Rendimiento de un jugador: disponibilidad, carga, bienestar, objetivo de trabajo, tests y recomendaciones",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam },
      responses: { 200: json("Rendimiento", PlayerPerformanceResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      return c.json(await performance(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/focus",
      tags: ["Carga"],
      summary:
        "Contenidos del objetivo de trabajo del jugador: los que la recomendación vigila que se entrenen",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam, body: body(PlayerFocusSetSchema) },
      responses: {
        200: json("Rendimiento", PlayerPerformanceResponseSchema),
        400: error("Contenido desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      const actor = actorOf(c);
      const canAssess =
        actor.permissions.has("org.players.assess") ||
        (actor.permissions.has("org.players.assess_own") &&
          (await data.players.isStaffOf(tenant.scope, actor.userId, id)));
      if (!canAssess) throw forbidden();
      const { contentIds } = c.req.valid("json");
      if (!(await data.training.validContentIds(tenant.scope, contentIds, null)))
        throw badRequest("Algún contenido no es del club.");
      await data.load.setFocus(tenant.scope, id, contentIds);
      await audit(data, c, tenant, "player.focus_updated", id, { contents: contentIds.length });
      return c.json(await performance(c, tenant, id), 200);
    },
  );

  // --- Carga extra, bienestar y disponibilidad ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players/{id}/loads",
      tags: ["Carga"],
      summary: "Añade una carga extra (gimnasio, trabajo individual): fecha, minutos y RPE",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam, body: body(ExtraLoadCreateSchema) },
      responses: { 201: json("Rendimiento", PlayerPerformanceResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requireLoadWriteOf(c, tenant, id);
      const input = c.req.valid("json");
      await data.load.addExtraLoad(tenant.scope, id, input, c.get("actor").userId);
      await audit(data, c, tenant, "load.recorded", id, {
        date: input.date,
        minutes: input.minutes,
        rpe: input.rpe,
      });
      return c.json(await performance(c, tenant, id), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/players/{id}/loads/{loadId}",
      tags: ["Carga"],
      summary: "Quita una carga extra",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: z.object({ id: z.string().uuid(), loadId: z.string().uuid() }) },
      responses: { 204: { description: "Quitada" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, loadId } = c.req.valid("param");
      await requireLoadWriteOf(c, tenant, id);
      if (!(await data.load.removeExtraLoad(tenant.scope, id, loadId)))
        throw notFound("Esa carga no existe.");
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/wellness",
      tags: ["Carga"],
      summary: "Registra el bienestar de un día (cinco preguntas de 1 a 5) por el jugador",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam, body: body(WellnessEntrySchema) },
      responses: { 200: json("Rendimiento", PlayerPerformanceResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requireLoadWriteOf(c, tenant, id);
      const input = c.req.valid("json");
      await data.load.setWellness(tenant.scope, id, input, c.get("actor").userId);
      await audit(data, c, tenant, "wellness.recorded", id, { date: input.date });
      return c.json(await performance(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/availability",
      tags: ["Carga"],
      summary:
        "Disponibilidad del jugador: disponible, limitado con restricciones, readaptación o baja. Nunca un diagnóstico",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.availability.write")],
      request: { params: idParam, body: body(AvailabilitySetSchema) },
      responses: {
        200: json("Rendimiento", PlayerPerformanceResponseSchema),
        204: { description: "Guardada (quien no ve la carga no recibe el rendimiento)" },
        400: error("Lesión desconocida"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      const input = c.req.valid("json");
      if (input.injuryId) {
        const injury = await data.health.injuryById(tenant.scope, input.injuryId);
        if (!injury || injury.playerId !== id)
          throw badRequest("Esa lesión no es de este jugador.");
      }
      await data.load.setAvailability(
        tenant.scope,
        id,
        input,
        todayOf(tenant),
        c.get("actor").userId,
      );
      await audit(data, c, tenant, "availability.updated", id, {
        status: input.status,
        restrictions: input.restrictions ?? [],
      });
      if (!c.get("actor").permissions.has("org.load.read")) return c.body(null, 204);
      return c.json(await performance(c, tenant, id), 200);
    },
  );

  // --- RPE de un partido ---

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/matches/{id}/loads",
      tags: ["Carga"],
      summary:
        "RPE del partido para el equipo y, si se quiere, por jugador. Los minutos salen de los eventos",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam, body: body(MatchLoadSetSchema) },
      responses: {
        200: json("RPE guardado", z.object({ rpe: z.number().int().nullable() })),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const match = await data.matches.byId(tenant.scope, id);
      if (!match) throw notFound("Ese partido no existe.");
      const team = await teamOr404(data, c, tenant, match.team.id);
      if (!canWriteLoad(c.get("actor"), team)) throw forbidden();
      const input = c.req.valid("json");
      const squad = new Set((await data.matches.squadOf(tenant.scope, id)).map((s) => s.playerId));
      if ((input.players ?? []).some((p) => !squad.has(p.playerId)))
        throw badRequest("Ese jugador no está convocado.");
      await data.load.setMatchLoads(
        tenant.scope,
        id,
        match.playedOn,
        input.rpe,
        input.players ?? [],
        c.get("actor").userId,
      );
      await audit(
        data,
        c,
        tenant,
        "match.loads_updated",
        `${match.team.name} · ${match.opponent}`,
        { rpe: input.rpe },
      );
      return c.json({ rpe: input.rpe }, 200);
    },
  );

  // --- Tests físicos ---

  const testDto = (t: PhysicalTestRecord) => t;

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/physical-tests",
      tags: ["Carga"],
      summary: "Catálogo de tests físicos del club",
      security: [{ sessionCookie: [] }],
      middleware: [trainingRead],
      responses: { 200: json("Tests", PhysicalTestsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const tests = await data.load.ensureTests(tenant.scope, localeOf(c, tenant));
      return c.json(
        {
          tests: tests.map(testDto),
          access: { manage: c.get("actor").permissions.has("org.training.library") },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/physical-tests",
      tags: ["Carga"],
      summary: "Añade un test al catálogo del club",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.library")],
      request: { body: body(PhysicalTestCreateSchema) },
      responses: {
        201: json("Tests", PhysicalTestsResponseSchema),
        409: error("Ya hay un test con esa clave"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      await data.load.ensureTests(tenant.scope, localeOf(c, tenant));
      const created = await data.load.createTest(tenant.scope, c.req.valid("json"));
      if (created === "code_taken") throw conflict("Ya hay un test con esa clave.");
      await audit(data, c, tenant, "physical_test.created", created.name);
      return c.json(
        { tests: (await data.load.listTests(tenant.scope)).map(testDto), access: { manage: true } },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/physical-tests/{id}",
      tags: ["Carga"],
      summary: "Edita o archiva un test del catálogo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.library")],
      request: { params: idParam, body: body(PhysicalTestUpdateSchema) },
      responses: { 200: json("Tests", PhysicalTestsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const updated = await data.load.updateTest(
        tenant.scope,
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      if (!updated) throw notFound("Ese test no existe.");
      await audit(data, c, tenant, "physical_test.updated", updated.name);
      return c.json(
        { tests: (await data.load.listTests(tenant.scope)).map(testDto), access: { manage: true } },
        200,
      );
    },
  );

  async function teamTests(c: RouteCtx, tenant: Tenant, teamId: string) {
    const team = await teamOr404(data, c, tenant, teamId);
    const roster = (await data.teams.roster(tenant.scope, team.id)).filter(
      (r) => r.status === "active",
    );
    const [tests, results] = await Promise.all([
      data.load.ensureTests(tenant.scope, localeOf(c, tenant)),
      data.load.testResultsFor(
        tenant.scope,
        roster.map((r) => r.playerId),
      ),
    ]);
    return {
      team: { id: team.id, name: team.name },
      tests: tests.map(testDto),
      players: roster.map((r) => ({
        playerId: r.playerId,
        name: playerDisplayName(r),
        shirtNumber: r.shirtNumber,
      })),
      results,
      access: { write: canWriteLoad(c.get("actor"), team) },
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/physical-tests",
      tags: ["Carga"],
      summary: "Tests físicos de la plantilla: cada resultado con su fecha",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam },
      responses: { 200: json("Tests del equipo", TeamTestsResponseSchema), ...errors },
    }),
    async (c) => c.json(await teamTests(c, tenantOf(c), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/physical-tests/results",
      tags: ["Carga"],
      summary: "Registra una sesión de medición: un test, una fecha y el valor de cada jugador",
      security: [{ sessionCookie: [] }],
      middleware: [loadRead],
      request: { params: idParam, body: body(PhysicalTestResultsSetSchema) },
      responses: {
        201: json("Tests del equipo", TeamTestsResponseSchema),
        400: error("Jugador o test desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await teamOr404(data, c, tenant, id);
      if (!canWriteLoad(c.get("actor"), team)) throw forbidden();
      const input = c.req.valid("json");
      const roster = new Set(
        (await data.teams.roster(tenant.scope, team.id)).map((r) => r.playerId),
      );
      if (input.results.some((r) => !roster.has(r.playerId)))
        throw badRequest("Algún jugador no es de la plantilla.");
      const outcome = await data.load.setTestResults(
        tenant.scope,
        input.testId,
        input.date,
        input.results,
        c.get("actor").userId,
      );
      if (outcome === "unknown_test") throw badRequest("Ese test no es del club.");
      await audit(data, c, tenant, "physical_test.results_recorded", team.name, {
        date: input.date,
        players: input.results.length,
      });
      return c.json(await teamTests(c, tenant, id), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family/players/{id}/physical-tests",
      tags: ["Carga"],
      summary:
        "Tests de uno de los suyos, para la familia: solo su evolución, nunca comparada con nadie",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam },
      responses: { 200: json("Tests", FamilyTestsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      if (!(await data.players.isGuardianOf(tenant.scope, c.get("actor").userId, id)))
        throw notFound("Ese jugador no está vinculado a tu cuenta.");
      const [tests, results] = await Promise.all([
        data.load.ensureTests(tenant.scope, localeOf(c, tenant)),
        data.load.testResultsFor(tenant.scope, [id]),
      ]);
      const used = new Set(results.map((r) => r.testId));
      return c.json(
        {
          tests: tests.filter((t) => used.has(t.id)).map(testDto),
          results: results.map(({ playerId: _p, ...r }) => r),
        },
        200,
      );
    },
  );

  // --- Enfermería ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/infirmary",
      tags: ["Carga"],
      summary:
        "Enfermería: bajas, limitados y readaptaciones del ámbito, con la lesión solo para quien ve Salud",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Enfermería", InfirmaryResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const actor = c.get("actor");
      const healthRead = actor.permissions.has("org.health.read");
      const availabilityWrite = actor.permissions.has("org.availability.write");
      if (!healthRead && !availabilityWrite) throw forbidden();
      const today = todayOf(tenant);
      const restricted = await restrictedOf(data, c);
      const open = await data.load.openPeriods(tenant.scope);
      const visible = await Promise.all(
        open.map(async (p) =>
          !restricted || (await data.access.isPlayerVisible(tenant.scope, restricted, p.playerId))
            ? p
            : null,
        ),
      );
      const periods = visible.filter((p): p is NonNullable<typeof p> => p !== null);
      const ids = periods.map((p) => p.playerId);
      const [injuries, wellness] = await Promise.all([
        healthRead ? data.health.openInjuries(tenant.scope, ids) : Promise.resolve([]),
        actor.permissions.has("org.load.read")
          ? (async () => {
              const season = await data.seasons.current(tenant.scope);
              const teams = season
                ? (await data.teams.list(tenant.scope, season.id)).filter(
                    (t) => !restricted || restricted.teamIds.includes(t.id),
                  )
                : [];
              const players = new Set<string>();
              for (const t of teams)
                for (const r of await data.teams.roster(tenant.scope, t.id))
                  players.add(r.playerId);
              if (restricted) for (const p of restricted.playerIds) players.add(p);
              return data.load.wellnessFor(tenant.scope, [...players], addDays(today, -1), today);
            })()
          : Promise.resolve([]),
      ]);
      const names = new Map<
        string,
        { name: string; photoUrl: string | null; team: { id: string; name: string } | null }
      >();
      for (const id of new Set([...ids, ...wellness.map((w) => w.playerId)])) {
        const player = await data.players.byId(tenant.scope, id);
        if (!player) continue;
        const team = (await data.players.teamsOf(tenant.scope, id)).find((t) => t.seasonIsCurrent);
        names.set(id, {
          name: playerDisplayName(player),
          photoUrl: playerPhotoUrlFor(player.photoBlobKey, tenant.organization.slug, id),
          team: team ? { id: team.teamId, name: team.teamName } : null,
        });
      }
      const weekEnd = addDays(weekStartOf(today), 6);
      if (healthRead && ids.length > 0)
        await audit(data, c, tenant, "health.viewed", "infirmary", { players: ids.length });
      return c.json(
        {
          today,
          players: periods
            .filter((p) => names.has(p.playerId))
            .map((p) => {
              const injury =
                injuries.find((i) => i.id === p.injuryId) ??
                injuries.find((i) => i.playerId === p.playerId) ??
                null;
              const phase = injury?.phases.find((ph) => ph.startedOn && !ph.doneOn) ?? null;
              return {
                playerId: p.playerId,
                ...names.get(p.playerId)!,
                availability: availabilityDto({
                  status: p.status,
                  restrictions: p.restrictions,
                  maxMinutes: p.maxMinutes,
                  fromOn: p.fromOn,
                  expectedReturnOn: p.expectedReturnOn,
                  note: p.note,
                }),
                injury: injury
                  ? {
                      id: injury.id,
                      bodyArea: injury.bodyArea,
                      kind: injury.kind,
                      diagnosis: injury.diagnosis,
                      occurredOn: injury.occurredOn,
                      phase: phase?.name ?? null,
                    }
                  : null,
                returningThisWeek:
                  !!p.expectedReturnOn &&
                  p.expectedReturnOn >= today &&
                  p.expectedReturnOn <= weekEnd,
              };
            }),
          soreness: wellness
            .filter((w) => w.soreness <= 2 && names.has(w.playerId))
            .map((w) => ({
              playerId: w.playerId,
              name: names.get(w.playerId)!.name,
              date: w.date,
              soreness: w.soreness,
              sorenessArea: w.sorenessArea,
            })),
          access: { healthRead, availabilityWrite },
        },
        200,
      );
    },
  );

  // --- El deportista adulto con su cuenta ---

  async function athleteOr404(c: RouteCtx, tenant: Tenant) {
    const athlete = await data.load.athleteOf(tenant.scope, actorOf(c).userId);
    if (!athlete) throw notFound("Tu cuenta no tiene ficha de deportista en este club.");
    return athlete;
  }

  async function athleteResponse(c: RouteCtx, tenant: Tenant) {
    const today = todayOf(tenant);
    const athlete = await data.load.athleteOf(tenant.scope, actorOf(c).userId);
    if (!athlete) return { today, player: null, wellnessToday: null, recent: [], pendingRpe: [] };
    const team =
      (await data.players.teamsOf(tenant.scope, athlete.id)).find((t) => t.seasonIsCurrent) ?? null;
    const tz = tenant.organization.timezone;
    const [wellness, sessions, loads] = await Promise.all([
      data.load.wellnessFor(tenant.scope, [athlete.id], addDays(today, -13), today),
      team
        ? data.training.teamSessions(
            tenant.scope,
            team.teamId,
            instantOf(tz, addDays(today, -2)),
            new Date(),
          )
        : Promise.resolve([]),
      data.load.loadsFor(tenant.scope, [athlete.id], addDays(today, -2), today),
    ]);
    const attendance = team
      ? await data.training.attendanceForTeam(
          tenant.scope,
          team.teamId,
          instantOf(tz, addDays(today, -2)),
          new Date(),
        )
      : [];
    const items = await data.training.itemsOf(
      tenant.scope,
      sessions.map((s) => s.id),
    );
    const pending = sessions.filter((s) => {
      if (s.status === "cancelled" || s.endsAt > new Date()) return false;
      const mark = attendance.find((a) => a.eventId === s.eventId && a.playerId === athlete.id);
      if (mark && mark.status !== "present") return false;
      const load = loads.find((l) => l.eventId === s.eventId);
      return !load || load.rpe === null;
    });
    return {
      today,
      player: {
        id: athlete.id,
        name: playerDisplayName(athlete),
        team: team ? { id: team.teamId, name: team.teamName } : null,
      },
      wellnessToday: (() => {
        const w = wellness.find((x) => x.date === today);
        if (!w) return null;
        const { playerId: _p, ...rest } = w;
        return rest;
      })(),
      recent: wellness.map((w) => ({ date: w.date, score: w.score })),
      pendingRpe: pending.map((s) => ({
        eventId: s.eventId,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        minutes:
          s.actualMinutes ??
          plannedOf(
            s,
            items.filter((i) => i.sessionId === s.id),
          ).minutes,
      })),
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/athlete",
      tags: ["Carga"],
      summary:
        "Para el deportista adulto con cuenta propia: su bienestar de hoy y las sesiones pendientes de RPE",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Deportista", AthleteResponseSchema), ...errors },
    }),
    async (c) => c.json(await athleteResponse(c, tenantOf(c)), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/me/athlete/wellness",
      tags: ["Carga"],
      summary: "El deportista responde su bienestar del día",
      security: [{ sessionCookie: [] }],
      request: { body: body(WellnessEntrySchema) },
      responses: {
        200: json("Deportista", AthleteResponseSchema),
        400: error("Fecha futura"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const athlete = await athleteOr404(c, tenant);
      const input = c.req.valid("json");
      const today = todayOf(tenant);
      if (input.date > today || input.date < addDays(today, -2))
        throw badRequest("Solo hoy o los dos días anteriores.");
      await data.load.setWellness(tenant.scope, athlete.id, input, c.get("actor").userId);
      await audit(data, c, tenant, "wellness.recorded", athlete.id, {
        date: input.date,
        self: true,
      });
      return c.json(await athleteResponse(c, tenant), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/me/athlete/sessions/{id}/rpe",
      tags: ["Carga"],
      summary: "El deportista declara su RPE de un entrenamiento reciente",
      security: [{ sessionCookie: [] }],
      request: { params: idParam, body: body(AthleteRpeSchema) },
      responses: { 200: json("Deportista", AthleteResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const athlete = await athleteOr404(c, tenant);
      const { id } = c.req.valid("param");
      const response = await athleteResponse(c, tenant);
      const pending = response.pendingRpe.find((p) => p.eventId === id);
      if (!pending) throw notFound("Ese entrenamiento no está pendiente de tu RPE.");
      const date = localDate(tenant.organization.timezone, new Date(pending.startsAt));
      await data.load.setOwnSessionRpe(
        tenant.scope,
        id,
        athlete.id,
        date,
        pending.minutes,
        c.req.valid("json").rpe,
        c.get("actor").userId,
      );
      await audit(data, c, tenant, "load.recorded", athlete.id, { eventId: id, self: true });
      return c.json(await athleteResponse(c, tenant), 200);
    },
  );

  /**
   * Lo que entrena el deportista (ADR 0045): entrenamientos y clases de sus equipos o grupos desde
   * hace una semana hasta dentro de otra, con el plan publicado (nunca un borrador). De cada
   * sesión, las tareas de todo el grupo y las que le asignan a él; la readaptación, solo si es
   * suya. Nada de notas ni valoraciones del cuerpo técnico, ni datos de nadie más.
   */
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/athlete/plan",
      tags: ["Carga"],
      summary:
        "Para el deportista con cuenta propia: sus entrenamientos de estos días con el plan publicado",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Plan", AthletePlanResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const today = todayOf(tenant);
      const athlete = await data.load.athleteOf(tenant.scope, actorOf(c).userId);
      if (!athlete) return c.json({ today, player: null, availability: null, sessions: [] }, 200);
      const tz = tenant.organization.timezone;
      const fromDay = addDays(today, -7);
      const toDay = addDays(today, 8);
      const from = instantOf(tz, fromDay);
      const to = instantOf(tz, toDay);
      const teamIds = (await data.players.teamsOf(tenant.scope, athlete.id))
        .filter((t) => t.seasonIsCurrent)
        .map((t) => t.teamId);
      const [events, sessions, loads, current] = await Promise.all([
        teamIds.length > 0
          ? data.events.listBetween(tenant.scope, from, to, { teamIds })
          : Promise.resolve([]),
        data.training.sessionsOfTeams(tenant.scope, teamIds, from, to),
        data.load.loadsFor(tenant.scope, [athlete.id], fromDay, toDay),
        data.load.currentFor(tenant.scope, [athlete.id]),
      ]);
      const published = sessions.filter((s) => s.status !== "draft");
      const items = await data.training.itemsOf(
        tenant.scope,
        published.map((s) => s.id),
      );
      const sectionIds = [...new Set(events.flatMap((e) => (e.section ? [e.section.id] : [])))];
      const sports = new Map(
        await Promise.all(
          sectionIds.map(
            async (id) =>
              [id, (await data.training.sectionOf(tenant.scope, id))?.sportCode ?? ""] as const,
          ),
        ),
      );
      const availability = current.get(athlete.id);
      const limited = availability && availability.status !== "available" ? availability : null;
      const forMe = (i: (typeof items)[number]) =>
        i.playerIds ? i.playerIds.includes(athlete.id) : i.block !== "rehab";

      return c.json(
        {
          today,
          player: { id: athlete.id, name: playerDisplayName(athlete) },
          availability: limited
            ? {
                status: limited.status,
                restrictions: limited.restrictions,
                maxMinutes: limited.maxMinutes,
                expectedReturnOn: limited.expectedReturnOn,
              }
            : null,
          sessions: events
            .flatMap((e) =>
              e.team && (e.kind === "training" || e.kind === "activity")
                ? [{ ...e, kind: e.kind, team: e.team }]
                : [],
            )
            .map((e) => {
              const session = published.find((s) => s.eventId === e.id) ?? null;
              const mine = session
                ? items.filter((i) => i.sessionId === session.id).filter(forMe)
                : [];
              return {
                eventId: e.id,
                kind: e.kind,
                title: e.title,
                startsAt: e.startsAt.toISOString(),
                endsAt: e.endsAt.toISOString(),
                team: e.team,
                sportCode: (e.section && sports.get(e.section.id)) || "",
                facility: e.facility,
                location: e.location,
                status: session
                  ? (session.status as "planned" | "done" | "cancelled")
                  : ("unplanned" as const),
                objective: session?.objective ?? null,
                targetRpe: session?.targetRpe ?? null,
                minutes: session
                  ? plannedOf(session, mine).minutes
                  : Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
                blocks: SESSION_BLOCKS.map((block) => ({
                  block,
                  items: mine
                    .filter((i) => i.block === block)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((i) => ({
                      id: i.id,
                      title: i.title,
                      minutes: i.minutes,
                      sets: i.sets,
                      reps: i.reps,
                      restSec: i.restSec,
                      targetRpe: i.targetRpe,
                      groupLabel: i.groupLabel,
                      description: i.description,
                      coachingPoints: i.coachingPoints,
                      diagram: i.diagram,
                      conflicts: limited
                        ? i.restrictionTags.filter((t) => limited.restrictions.includes(t))
                        : [],
                    })),
                })).filter((b) => b.items.length > 0),
                rpe: loads.find((l) => l.eventId === e.id)?.rpe ?? null,
              };
            }),
        },
        200,
      );
    },
  );

  return app;
}
