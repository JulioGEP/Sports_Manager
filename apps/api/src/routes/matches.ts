import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  MatchActionTypeCreateSchema,
  MatchActionTypeUpdateSchema,
  MatchCreateSchema,
  MatchDetailResponseSchema,
  MatchEventsAppendSchema,
  MatchEventsResponseSchema,
  MatchResponseSchema,
  MatchSquadResponseSchema,
  MatchSquadSetSchema,
  MatchUpdateSchema,
  MatchesResponseSchema,
  PlayerMatchesResponseSchema,
  SectionMatchConfigResponseSchema,
  SectionMatchConfigUpdateSchema,
  TeamMatchHistoryResponseSchema,
  computeMatchStats,
  playerDisplayName,
  type Locale,
  type PlayerMatchLine,
} from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  type DataLayer,
  type MatchActionTypeRecord,
  type MatchEventRecord,
  type MatchRecord,
  type MatchSquadRecord,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { Actor, AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club, sección, equipo o partido inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

/**
 * Partido en directo (Fase 1, Bloque 19, ADR 0032). El personal consulta partidos y
 * estadísticas (`org.matches.read`); los registra en cualquier equipo (`org.matches.write`) o
 * solo en los suyos (`org.matches.write_own`); configura el motor por sección
 * (`org.matches.configure`). La familia ve la línea de los suyos y nada más (`org.family.read`).
 */
export function createMatchRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  /**
   * Varias rutas cuelgan de prefijos que ya protegen otras familias (`/api/org/teams/*`): si el
   * actor ya está resuelto, la cadena no se repite.
   */
  const guard: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (c.get("actor")) return next();
    const run = async (i: number): Promise<void> => {
      if (i < chain.length) await chain[i]!(c, () => run(i + 1));
      else await next();
    };
    return run(0);
  };
  for (const path of [
    "/api/org/matches",
    "/api/org/matches/*",
    "/api/org/sections/:id/match-config",
    "/api/org/sections/:id/match-actions",
    "/api/org/sections/:id/match-actions/*",
    "/api/org/teams/:id/matches",
    "/api/org/teams/:id/matches/*",
    "/api/org/players/:id/matches",
    "/api/org/family/players/:id/matches",
  ]) {
    app.use(path, guard);
  }

  const read = requirePermission("org.matches.read");
  const configure = requirePermission("org.matches.configure");
  const family = requirePermission("org.family.read");

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  type Tenant = ReturnType<typeof scopeOf>;
  type Ctx = {
    get: ((key: "sessionUser") => AppEnv["Variables"]["sessionUser"]) &
      ((key: "actor") => Actor) &
      ((key: "tenant") => AppEnv["Variables"]["tenant"]);
  };
  const actorId = (c: Ctx) => c.get("actor").userId;
  const localeOf = (c: Ctx, tenant: Tenant): Locale =>
    (c.get("sessionUser").locale ?? tenant.organization.defaultLocale) as Locale;
  const audit = (
    c: Ctx,
    tenant: Tenant,
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: c.get("sessionUser").id,
      organizationId: tenant.organization.id,
      action,
      target,
      details,
    });

  /** Registrar en un equipo: en cualquiera con `write`, en los propios con `write_own`. */
  async function canWrite(c: Ctx, tenant: Tenant, teamId: string): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.matches.write")) return true;
    if (actor.permissions.has("org.matches.write_own")) {
      const own = await data.memberships.ownTeamIds(tenant.scope, actorId(c));
      return own.includes(teamId);
    }
    return false;
  }
  async function requireWrite(c: Ctx, tenant: Tenant, teamId: string) {
    if (!(await canWrite(c, tenant, teamId))) throw forbidden();
  }

  const typeDto = (t: MatchActionTypeRecord) => t;
  const matchDto = (m: MatchRecord) => ({
    id: m.id,
    team: m.team,
    section: m.section,
    season: m.season,
    opponent: m.opponent,
    homeAway: m.homeAway,
    playedOn: m.playedOn,
    status: m.status,
    ownScore: m.ownScore,
    opponentScore: m.opponentScore,
    eventsCount: m.eventsCount,
    squadCount: m.squadCount,
    clock: {
      period: m.clock.period,
      elapsedMs: m.clock.elapsedMs,
      runningSince: m.clock.runningSince?.toISOString() ?? null,
    },
    event: m.event
      ? { id: m.event.id, title: m.event.title, startsAt: m.event.startsAt.toISOString() }
      : null,
    updatedAt: m.updatedAt.toISOString(),
  });
  const detailDto = (m: MatchRecord) => ({
    ...matchDto(m),
    settings: m.settings,
    formation: m.formation,
    attackDirection: m.attackDirection,
    notes: m.notes,
    finishedAt: m.finishedAt?.toISOString() ?? null,
  });
  const squadDto = (s: MatchSquadRecord, slug: string) => ({
    playerId: s.playerId,
    name: playerDisplayName(s),
    photoUrl: playerPhotoUrlFor(s.photoBlobKey, slug, s.playerId),
    shirtNumber: s.shirtNumber,
    position: s.position,
    isGoalkeeper: s.isGoalkeeper,
    starter: s.starter,
    slot: s.slot,
  });
  const eventDto = (e: MatchEventRecord) => ({ ...e, createdAt: e.createdAt.toISOString() });

  async function matchOr404(tenant: Tenant, id: string): Promise<MatchRecord> {
    const match = await data.matches.byId(tenant.scope, id);
    if (!match) throw notFound("Ese partido no existe.");
    return match;
  }

  async function configResponse(c: Ctx, tenant: Tenant, sectionId: string) {
    const cfg = await data.matches.configOf(tenant.scope, sectionId, localeOf(c, tenant));
    if (!cfg) throw notFound("Esa sección no existe.");
    return {
      section: cfg.section,
      settings: cfg.settings,
      customized: cfg.customized,
      actionTypes: cfg.actionTypes.map(typeDto),
      sportDefaults: data.matches.sportDefaults(cfg.section.sportCode, localeOf(c, tenant)),
      access: { write: c.get("actor").permissions.has("org.matches.configure") },
    };
  }

  /** La línea de un jugador en un partido, calculada con el motor compartido. */
  function lineOf(
    entry: {
      match: MatchRecord;
      squad: MatchSquadRecord[];
      events: MatchEventRecord[];
      actionTypes: MatchActionTypeRecord[];
    },
    playerId: string,
  ): PlayerMatchLine | null {
    const squad = entry.squad.find((s) => s.playerId === playerId);
    if (!squad) return null;
    const stats = computeMatchStats({
      settings: entry.match.settings,
      players: entry.squad.map((s) => ({
        playerId: s.playerId,
        name: playerDisplayName(s),
        shirtNumber: s.shirtNumber,
        position: s.position,
        isGoalkeeper: s.isGoalkeeper,
        starter: s.starter,
      })),
      actionTypes: entry.actionTypes,
      events: entry.events,
      now:
        entry.match.status === "live"
          ? { period: entry.match.clock.period, clockMs: entry.match.clock.elapsedMs }
          : undefined,
    });
    const p = stats.players.find((x) => x.playerId === playerId);
    if (!p) return null;
    return {
      match: matchDto(entry.match),
      starter: p.starter,
      timeMs: p.timeMs,
      scoreFor: p.scoreFor,
      scoreAgainst: p.scoreAgainst,
      plusMinus: p.plusMinus,
      actions: p.actions,
      rating: Math.round(p.rating * 100) / 100,
    };
  }

  async function playerMatches(tenant: Tenant, playerId: string) {
    const entries = await data.matches.matchesOfPlayer(tenant.scope, playerId);
    const lines = entries
      .map((entry) => lineOf(entry, playerId))
      .filter((line): line is PlayerMatchLine => line !== null);
    const types = new Map<string, MatchActionTypeRecord>();
    for (const entry of entries) for (const t of entry.actionTypes) types.set(t.id, t);
    const totals = {
      matches: lines.length,
      starts: lines.filter((l) => l.starter).length,
      timeMs: lines.reduce((a, l) => a + l.timeMs, 0),
      plusMinus: lines.reduce((a, l) => a + l.plusMinus, 0),
      rating: Math.round(lines.reduce((a, l) => a + l.rating, 0) * 100) / 100,
      actions: {} as Record<string, number>,
    };
    for (const line of lines)
      for (const [code, n] of Object.entries(line.actions))
        totals.actions[code] = (totals.actions[code] ?? 0) + n;
    return { actionTypes: [...types.values()].map(typeDto), lines, totals };
  }

  // --- Configuración del motor por sección ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections/{id}/match-config",
      tags: ["Partidos"],
      summary:
        "Configuración del partido en directo de una sección: ajustes, catálogo de acciones y lo que propone el deporte",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Configuración", SectionMatchConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}/match-config",
      tags: ["Partidos"],
      summary: "Cambia los ajustes del partido de la sección o vuelve a los del deporte",
      security: [{ sessionCookie: [] }],
      middleware: [configure],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: SectionMatchConfigUpdateSchema } },
          required: true,
        },
      },
      responses: { 200: json("Configuración", SectionMatchConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      if (body.resetToSport) {
        if (!(await data.matches.resetToSport(tenant.scope, id, localeOf(c, tenant))))
          throw notFound("Esa sección no existe.");
      } else if (body.settings) {
        if (!(await data.matches.updateSectionSettings(tenant.scope, id, body.settings)))
          throw notFound("Esa sección no existe.");
      }
      const response = await configResponse(c, tenant, id);
      await audit(c, tenant, "match_config.updated", response.section.name, body);
      return c.json(response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections/{id}/match-actions",
      tags: ["Partidos"],
      summary: "Añade una acción al catálogo de la sección",
      security: [{ sessionCookie: [] }],
      middleware: [configure],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: MatchActionTypeCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Configuración", SectionMatchConfigResponseSchema),
        409: error("Ya hay una acción con esa clave"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.matches.createType(tenant.scope, id, body);
      if (result === "not_found") throw notFound("Esa sección no existe.");
      if (result === "code_taken") throw conflict("Ya hay una acción con esa clave en la sección.");
      await audit(c, tenant, "match_action.created", result.name, { code: result.code });
      return c.json(await configResponse(c, tenant, id), 201);
    },
  );

  const actionParam = z.object({ id: z.string().uuid(), actionId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}/match-actions/{actionId}",
      tags: ["Partidos"],
      summary: "Edita una acción del catálogo (nombre, puntos, peso, bandeja rápida, archivo)",
      security: [{ sessionCookie: [] }],
      middleware: [configure],
      request: {
        params: actionParam,
        body: {
          content: { "application/json": { schema: MatchActionTypeUpdateSchema } },
          required: true,
        },
      },
      responses: { 200: json("Configuración", SectionMatchConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, actionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await data.matches.updateType(tenant.scope, id, actionId, body);
      if (!updated) throw notFound("Esa acción no existe.");
      await audit(c, tenant, "match_action.updated", updated.name, body);
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sections/{id}/match-actions/{actionId}",
      tags: ["Partidos"],
      summary: "Quita una acción. Si ya se ha usado en algún partido, se archiva",
      security: [{ sessionCookie: [] }],
      middleware: [configure],
      request: { params: actionParam },
      responses: { 200: json("Configuración", SectionMatchConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, actionId } = c.req.valid("param");
      const outcome = await data.matches.removeType(tenant.scope, id, actionId);
      if (outcome === "not_found") throw notFound("Esa acción no existe.");
      await audit(c, tenant, "match_action.removed", actionId, { outcome });
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  // --- Partidos de un equipo ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/matches",
      tags: ["Partidos"],
      summary:
        "Partidos de un equipo, del más reciente al más antiguo, y los de la agenda sin registro",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Partidos", MatchesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      const [matches, upcoming, write] = await Promise.all([
        data.matches.listForTeam(tenant.scope, id),
        data.matches.upcomingEventsOf(tenant.scope, id, new Date()),
        canWrite(c, tenant, id),
      ]);
      return c.json(
        {
          team: { id: team.id, name: team.name },
          matches: matches.map(matchDto),
          upcoming: upcoming.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })),
          access: { write },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/matches",
      tags: ["Partidos"],
      summary: "Crea un partido del equipo con la plantilla como convocatoria inicial",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: MatchCreateSchema } }, required: true },
      },
      responses: {
        201: json("Partido", MatchDetailResponseSchema),
        400: error("Evento de la agenda desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await requireWrite(c, tenant, id);
      const result = await data.matches.create(
        tenant.scope,
        id,
        body,
        actorId(c),
        localeOf(c, tenant),
      );
      if (result === "unknown_team") throw notFound("Ese equipo no existe.");
      if (result === "unknown_event")
        throw badRequest("Ese partido de la agenda no es del equipo.");
      await audit(c, tenant, "match.created", `${result.team.name} · ${result.opponent}`, {
        playedOn: result.playedOn,
      });
      return c.json(await detailResponse(c, tenant, result), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/matches/history",
      tags: ["Partidos"],
      summary: "Histórico del equipo: cada partido con convocatoria y eventos, para acumular",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Histórico", TeamMatchHistoryResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      const [history, actionTypes] = await Promise.all([
        data.matches.historyOf(tenant.scope, id),
        data.matches.listTypes(tenant.scope, team.section.id),
      ]);
      return c.json(
        {
          team: { id: team.id, name: team.name },
          season: { id: team.season.id, name: team.season.name },
          actionTypes: actionTypes.map(typeDto),
          matches: history.map((h) => ({
            match: detailDto(h.match),
            squad: h.squad.map((s) => squadDto(s, tenant.organization.slug)),
            events: h.events.map(eventDto),
          })),
        },
        200,
      );
    },
  );

  // --- Un partido ---

  async function detailResponse(c: Ctx, tenant: Tenant, match: MatchRecord) {
    const [squad, roster, actionTypes, events, write] = await Promise.all([
      data.matches.squadOf(tenant.scope, match.id),
      data.matches.rosterNotInSquad(tenant.scope, match),
      data.matches.listTypes(tenant.scope, match.section.id),
      data.matches.eventsOf(tenant.scope, match.id),
      canWrite(c, tenant, match.team.id),
    ]);
    return {
      match: detailDto(match),
      squad: squad.map((s) => squadDto(s, tenant.organization.slug)),
      roster: roster.map((r) => ({
        playerId: r.playerId,
        name: playerDisplayName(r),
        photoUrl: playerPhotoUrlFor(r.photoBlobKey, tenant.organization.slug, r.playerId),
        shirtNumber: r.shirtNumber,
        position: r.position,
      })),
      actionTypes: actionTypes.map(typeDto),
      events: events.map(eventDto),
      access: { write },
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/matches/{id}",
      tags: ["Partidos"],
      summary: "Un partido completo: ajustes, convocatoria, catálogo y todos sus eventos",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Partido", MatchDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const match = await matchOr404(tenant, id);
      return c.json(await detailResponse(c, tenant, match), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/matches/{id}",
      tags: ["Partidos"],
      summary:
        "Edita un partido: rival, fecha, ajustes, sistema, dirección de ataque, cronómetro o estado",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: MatchUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Partido", MatchResponseSchema),
        400: error("Evento de la agenda desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const before = await matchOr404(tenant, id);
      await requireWrite(c, tenant, before.team.id);
      const result = await data.matches.update(tenant.scope, id, body);
      if (result === "not_found") throw notFound("Ese partido no existe.");
      if (result === "unknown_event")
        throw badRequest("Ese partido de la agenda no es del equipo.");
      if (body.status === "finished" && before.status !== "finished") {
        await audit(c, tenant, "match.finished", `${result.team.name} · ${result.opponent}`, {
          score: `${result.ownScore}-${result.opponentScore}`,
        });
      } else if (body.clock === undefined) {
        // El cronómetro se guarda muchas veces por partido: no deja rastro en la auditoría.
        await audit(c, tenant, "match.updated", `${result.team.name} · ${result.opponent}`, body);
      }
      return c.json({ match: detailDto(result) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/matches/{id}",
      tags: ["Partidos"],
      summary: "Borra un partido con todos sus eventos",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 204: { description: "Borrado" }, ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const match = await matchOr404(tenant, id);
      await requireWrite(c, tenant, match.team.id);
      await data.matches.remove(tenant.scope, id);
      await audit(c, tenant, "match.removed", `${match.team.name} · ${match.opponent}`);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/matches/{id}/squad",
      tags: ["Partidos"],
      summary: "Convocatoria del partido: quién va, dorsal, portero, titulares y huecos en pista",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: MatchSquadSetSchema } }, required: true },
      },
      responses: {
        200: json("Convocatoria", MatchSquadResponseSchema),
        400: error("Jugador desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const match = await matchOr404(tenant, id);
      await requireWrite(c, tenant, match.team.id);
      const squad = await data.matches.setSquad(tenant.scope, id, body.players);
      if (squad === "unknown_player") throw badRequest("Algún jugador no es de este club.");
      await audit(c, tenant, "match.squad_updated", `${match.team.name} · ${match.opponent}`, {
        players: squad.length,
      });
      return c.json(
        {
          match: detailDto((await data.matches.byId(tenant.scope, id))!),
          squad: squad.map((s) => squadDto(s, tenant.organization.slug)),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/matches/{id}/events",
      tags: ["Partidos"],
      summary:
        "Registra uno o varios eventos al final del partido (acción, cambio, periodo, quinteto). Devuelve todos los eventos y el marcador",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: MatchEventsAppendSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Eventos", MatchEventsResponseSchema),
        400: error("Acción archivada o de otra sección, o jugador sin convocar"),
        409: error("El partido está acabado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const match = await matchOr404(tenant, id);
      await requireWrite(c, tenant, match.team.id);
      if (match.status === "finished")
        throw conflict("El partido está acabado: reábrelo para registrar.");
      const events = await data.matches.appendEvents(tenant.scope, match, body.events, actorId(c));
      if (events === "unknown_action")
        throw badRequest("Esa acción no está en el catálogo de la sección.");
      if (events === "unknown_player") throw badRequest("Ese jugador no está convocado.");
      return c.json(
        {
          match: detailDto((await data.matches.byId(tenant.scope, id))!),
          events: events.map(eventDto),
        },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/matches/{id}/events/{eventId}",
      tags: ["Partidos"],
      summary: "Deshace un evento del partido y recalcula el marcador",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: z.object({ id: z.string().uuid(), eventId: z.string().uuid() }) },
      responses: { 200: json("Eventos", MatchEventsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, eventId } = c.req.valid("param");
      const match = await matchOr404(tenant, id);
      await requireWrite(c, tenant, match.team.id);
      if (!(await data.matches.removeEvent(tenant.scope, id, eventId)))
        throw notFound("Ese evento no existe.");
      const events = await data.matches.eventsOf(tenant.scope, id);
      return c.json(
        {
          match: detailDto((await data.matches.byId(tenant.scope, id))!),
          events: events.map(eventDto),
        },
        200,
      );
    },
  );

  // --- Lo de un jugador: para el personal y para su familia ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/matches",
      tags: ["Partidos"],
      summary: "Partidos de un jugador con su línea en cada uno y los totales",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Partidos del jugador", PlayerMatchesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      if (!c.get("actor").permissions.has("org.players.read")) throw forbidden();
      return c.json(await playerMatches(tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family/players/{id}/matches",
      tags: ["Partidos"],
      summary:
        "Partidos de uno de los suyos, vistos por la familia: su línea y el resultado del equipo. Nunca la de otros",
      security: [{ sessionCookie: [] }],
      middleware: [family],
      request: { params: idParam },
      responses: { 200: json("Partidos del jugador", PlayerMatchesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      if (!(await data.players.isGuardianOf(tenant.scope, actorId(c), id)))
        throw notFound("Ese jugador no está vinculado a tu cuenta.");
      return c.json(await playerMatches(tenant, id), 200);
    },
  );

  return app;
}
