import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  EligibleMembersResponseSchema,
  RosterAddSchema,
  RosterUpdateSchema,
  SeasonCreateSchema,
  SeasonResponseSchema,
  SeasonUpdateSchema,
  SeasonsResponseSchema,
  SectionCreateSchema,
  SectionResponseSchema,
  SectionUpdateSchema,
  SectionsResponseSchema,
  StaffAddSchema,
  StructureSummarySchema,
  TeamCreateSchema,
  TeamDetailResponseSchema,
  TeamResponseSchema,
  TeamUpdateSchema,
  TeamsResponseSchema,
  type TeamSummary,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { playerPhotoUrlFor, type DataLayer, type TeamRecord } from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o recurso inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

export const teamDto = (team: TeamRecord): TeamSummary => team;

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028): temporadas, secciones, equipos, plantilla
 * y cuerpo técnico. Lectura con `org.structure.read`, cambios con `org.structure.write`.
 */
export function createStructureRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  for (const path of ["/api/org/seasons", "/api/org/sections", "/api/org/teams"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  app.use("/api/org/summary", ...chain);

  const read = requirePermission("org.structure.read");
  const write = requirePermission("org.structure.write");

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  const audit = (
    c: { get: (key: "sessionUser") => AppEnv["Variables"]["sessionUser"] },
    tenant: { organization: { id: string } },
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

  // --- Resumen (también para la vista de soporte: solo cifras) ---
  /** Plantilla para la respuesta: la clave de la foto se convierte en URL y no sale de la API. */
  const rosterOf = async (
    tenant: { organization: { slug: string }; scope: Parameters<DataLayer["teams"]["roster"]>[0] },
    teamId: string,
  ) =>
    (await data.teams.roster(tenant.scope, teamId)).map(({ photoBlobKey, ...entry }) => ({
      ...entry,
      photoUrl: playerPhotoUrlFor(photoBlobKey, tenant.organization.slug, entry.playerId),
    }));

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/summary",
      tags: ["Estructura"],
      summary: "Cifras del club: temporada actual, secciones, equipos, jugadores y familias",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Cifras", StructureSummarySchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json(await data.teams.counts(tenant.scope), 200);
    },
  );

  // --- Temporadas ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/seasons",
      tags: ["Estructura"],
      summary: "Temporadas del club, la más reciente primero",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Temporadas", SeasonsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ seasons: await data.seasons.list(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/seasons",
      tags: ["Estructura"],
      summary: "Crea una temporada. La primera del club pasa a ser la actual",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: SeasonCreateSchema } }, required: true },
      },
      responses: {
        201: json("Temporada creada", SeasonResponseSchema),
        409: error("Ya hay una temporada con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.seasons.create(tenant.scope, body);
      if (result.outcome === "name_taken") throw conflict("Ya hay una temporada con ese nombre.");
      await audit(c, tenant, "season.created", result.season.name);
      return c.json({ season: result.season }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/seasons/{id}",
      tags: ["Estructura"],
      summary: "Edita una temporada o la marca como actual",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: SeasonUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Temporada", SeasonResponseSchema),
        409: error("Ya hay una temporada con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.seasons.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Esa temporada no existe.");
      if (result.outcome === "name_taken") throw conflict("Ya hay una temporada con ese nombre.");
      await audit(c, tenant, "season.updated", result.season.name, body);
      return c.json({ season: result.season }, 200);
    },
  );

  // --- Secciones ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections",
      tags: ["Estructura"],
      summary: "Secciones del club con sus equipos en la temporada actual",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ season: z.string().uuid().optional() }) },
      responses: { 200: json("Secciones", SectionsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { season } = c.req.valid("query");
      const seasonId = season ?? (await data.seasons.current(tenant.scope))?.id ?? null;
      return c.json({ sections: await data.sections.list(tenant.scope, seasonId) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections",
      tags: ["Estructura"],
      summary: "Crea una sección",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: SectionCreateSchema } }, required: true },
      },
      responses: {
        201: json("Sección creada", SectionResponseSchema),
        409: error("Ya hay una sección con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.sections.create(tenant.scope, body);
      if (result.outcome === "name_taken") throw conflict("Ya hay una sección con ese nombre.");
      await audit(c, tenant, "section.created", result.section.name);
      return c.json({ section: result.section }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}",
      tags: ["Estructura"],
      summary: "Renombra o archiva una sección",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: SectionUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Sección", SectionResponseSchema),
        409: error("Ya hay una sección con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.sections.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Esa sección no existe.");
      if (result.outcome === "name_taken") throw conflict("Ya hay una sección con ese nombre.");
      await audit(c, tenant, "section.updated", result.section.name, body);
      return c.json({ section: result.section }, 200);
    },
  );

  // --- Equipos ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams",
      tags: ["Estructura"],
      summary: "Equipos de una temporada (la actual por defecto) con plantilla y cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ season: z.string().uuid().optional() }) },
      responses: { 200: json("Equipos", TeamsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { season: requested } = c.req.valid("query");
      const season = requested
        ? await data.seasons.byId(tenant.scope, requested)
        : await data.seasons.current(tenant.scope);
      if (!season) return c.json({ season: null, teams: [] }, 200);
      const teams = await data.teams.list(tenant.scope, season.id);
      return c.json(
        {
          season: { id: season.id, name: season.name, isCurrent: season.isCurrent },
          teams: teams.map(teamDto),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams",
      tags: ["Estructura"],
      summary: "Crea un equipo en una sección y una temporada",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: TeamCreateSchema } }, required: true },
      },
      responses: {
        201: json("Equipo creado", TeamResponseSchema),
        400: error("Sección o temporada desconocidas"),
        409: error("Ya hay un equipo con ese nombre en esa sección y temporada"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.teams.create(tenant.scope, body);
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_season")
        throw badRequest("Esa temporada no es de este club.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un equipo con ese nombre en esa sección y temporada.");
      await audit(c, tenant, "team.created", result.team.name, {
        season: result.team.season.name,
        section: result.team.section.name,
      });
      return c.json({ team: teamDto(result.team) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}",
      tags: ["Estructura"],
      summary: "Ficha de un equipo: plantilla y cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Equipo", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      // La plantilla lleva datos de jugadores: solo con permiso de jugadores. Sin él, la ficha va vacía.
      const canSeePlayers = c.get("actor").permissions.has("org.players.read");
      const roster = canSeePlayers ? await rosterOf(tenant, id) : [];
      const staff = await data.teams.staff(tenant.scope, id);
      return c.json({ team: teamDto(team), roster, staff }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/teams/{id}",
      tags: ["Estructura"],
      summary: "Edita un equipo: nombre, categoría, sección o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: TeamUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Equipo", TeamResponseSchema),
        400: error("Sección desconocida"),
        409: error("Ya hay un equipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.teams.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese equipo no existe.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un equipo con ese nombre en esa sección y temporada.");
      await audit(c, tenant, "team.updated", result.team.name, body);
      return c.json({ team: teamDto(result.team) }, 200);
    },
  );

  // --- Plantilla ---
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/players",
      tags: ["Estructura"],
      summary: "Mete a un jugador del club en la plantilla del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: RosterAddSchema } }, required: true },
      },
      responses: {
        200: json("Plantilla", TeamDetailResponseSchema),
        400: error("Jugador desconocido"),
        409: error("Ya está en la plantilla"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const outcome = await data.teams.addPlayer(tenant.scope, id, body);
      if (outcome === "unknown_team") throw notFound("Ese equipo no existe.");
      if (outcome === "unknown_player") throw badRequest("Ese jugador no es de este club.");
      if (outcome === "already_in_team") throw conflict("Ese jugador ya está en la plantilla.");
      const team = (await data.teams.byId(tenant.scope, id))!;
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: body.playerId,
        kind: "roster_added",
        details: { team: team.name, season: team.season.name },
        actorUserId: c.get("sessionUser").id,
      });
      await audit(c, tenant, "team.roster_added", team.name, { playerId: body.playerId });
      return c.json(
        {
          team: teamDto(team),
          roster: await rosterOf(tenant, id),
          staff: await data.teams.staff(tenant.scope, id),
        },
        200,
      );
    },
  );

  const rosterParam = z.object({ id: z.string().uuid(), playerId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/teams/{id}/players/{playerId}",
      tags: ["Estructura"],
      summary: "Cambia dorsal o posición de un jugador en el equipo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: rosterParam,
        body: { content: { "application/json": { schema: RosterUpdateSchema } }, required: true },
      },
      responses: { 200: json("Plantilla", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, playerId } = c.req.valid("param");
      const body = c.req.valid("json");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      const ok = await data.teams.updatePlayer(tenant.scope, id, playerId, body);
      if (!ok) throw notFound("Ese jugador no está en la plantilla.");
      await audit(c, tenant, "team.roster_updated", team.name, { playerId, ...body });
      return c.json(
        {
          team: teamDto((await data.teams.byId(tenant.scope, id))!),
          roster: await rosterOf(tenant, id),
          staff: await data.teams.staff(tenant.scope, id),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/teams/{id}/players/{playerId}",
      tags: ["Estructura"],
      summary: "Saca a un jugador de la plantilla. El jugador sigue en el club",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: rosterParam },
      responses: { 200: json("Plantilla", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, playerId } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      const ok = await data.teams.removePlayer(tenant.scope, id, playerId);
      if (!ok) throw notFound("Ese jugador no está en la plantilla.");
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId,
        kind: "roster_removed",
        details: { team: team.name, season: team.season.name },
        actorUserId: c.get("sessionUser").id,
      });
      await audit(c, tenant, "team.roster_removed", team.name, { playerId });
      return c.json(
        {
          team: teamDto((await data.teams.byId(tenant.scope, id))!),
          roster: await rosterOf(tenant, id),
          staff: await data.teams.staff(tenant.scope, id),
        },
        200,
      );
    },
  );

  // --- Cuerpo técnico ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/eligible-staff",
      tags: ["Estructura"],
      summary: "Miembros del club que pueden formar parte del cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: { 200: json("Miembros", EligibleMembersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ members: await data.teams.eligibleStaff(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/staff",
      tags: ["Estructura"],
      summary: "Añade a un miembro del club al cuerpo técnico del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: StaffAddSchema } }, required: true },
      },
      responses: {
        200: json("Equipo", TeamDetailResponseSchema),
        400: error("No es miembro del club"),
        409: error("Ya está en el cuerpo técnico"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { userId } = c.req.valid("json");
      const outcome = await data.teams.addStaff(tenant.scope, id, userId);
      if (outcome === "unknown_team") throw notFound("Ese equipo no existe.");
      if (outcome === "not_member") throw badRequest("Esa persona no es miembro del club.");
      if (outcome === "already_staff") throw conflict("Esa persona ya está en el cuerpo técnico.");
      const team = (await data.teams.byId(tenant.scope, id))!;
      await audit(c, tenant, "team.staff_added", team.name, { userId });
      const canSeePlayers = c.get("actor").permissions.has("org.players.read");
      return c.json(
        {
          team: teamDto(team),
          roster: canSeePlayers ? await rosterOf(tenant, id) : [],
          staff: await data.teams.staff(tenant.scope, id),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/teams/{id}/staff/{userId}",
      tags: ["Estructura"],
      summary: "Quita a alguien del cuerpo técnico del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }) },
      responses: { 200: json("Equipo", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, userId } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      const ok = await data.teams.removeStaff(tenant.scope, id, userId);
      if (!ok) throw notFound("Esa persona no está en el cuerpo técnico.");
      await audit(c, tenant, "team.staff_removed", team.name, { userId });
      const canSeePlayers = c.get("actor").permissions.has("org.players.read");
      return c.json(
        {
          team: teamDto((await data.teams.byId(tenant.scope, id))!),
          roster: canSeePlayers ? await rosterOf(tenant, id) : [],
          staff: await data.teams.staff(tenant.scope, id),
        },
        200,
      );
    },
  );

  return app;
}
