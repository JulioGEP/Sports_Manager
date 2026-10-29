import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  CategoriesResponseSchema,
  CategoryCreateSchema,
  CategoryResponseSchema,
  CategoryUpdateSchema,
  defaultSectionKind,
  EligibleMembersResponseSchema,
  RosterAddSchema,
  RosterUpdateSchema,
  SeasonCreateSchema,
  SeasonResponseSchema,
  SeasonUpdateSchema,
  SeasonsResponseSchema,
  SectionCreateSchema,
  SectionDetailResponseSchema,
  SectionResponseSchema,
  SectionUpdateSchema,
  SectionsResponseSchema,
  SportCatalogResponseSchema,
  SportConfigSchema,
  StaffAddSchema,
  StructureSummarySchema,
  TeamCreateSchema,
  TeamDetailResponseSchema,
  TeamResponseSchema,
  TeamUpdateSchema,
  TeamsResponseSchema,
  type EventSummary,
  type TeamSummary,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  weekRange,
  type DataLayer,
  type EventFilter,
  type EventRecord,
  type TeamRecord,
} from "../data/index.ts";
import { accessScopeOf, requireActor, requirePermission } from "../http/actor.ts";
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
  404: error("Host sin club o recurso inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });
type OrgScopeOf = Parameters<DataLayer["teams"]["roster"]>[0];

export const teamDto = (team: TeamRecord): TeamSummary => team;

/** Un evento tal como sale en la API: instantes en ISO. */
export const eventDto = (e: EventRecord): EventSummary => ({
  ...e,
  startsAt: e.startsAt.toISOString(),
  endsAt: e.endsAt.toISOString(),
});

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028; Bloque 14, ADR 0031): temporadas, secciones
 * con su deporte, categorías, equipos, plantilla y cuerpo técnico. Lectura con
 * `org.structure.read`, cambios con `org.structure.write`. La plantilla de un equipo también la
 * cambia su cuerpo técnico con `org.roster.write_own` (Bloque 13). Con un ámbito restringido
 * (Bloque 19, ADR 0033), solo salen las secciones y los equipos de quien pregunta.
 */
export function createStructureRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  for (const path of [
    "/api/org/seasons",
    "/api/org/sections",
    "/api/org/categories",
    "/api/org/teams",
    "/api/org/sports",
  ]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  app.use("/api/org/summary", ...chain);
  app.use("/api/org/eligible-staff", ...chain);

  const read = requirePermission("org.structure.read");
  const write = requirePermission("org.structure.write");
  /** Plantilla: quien escribe la estructura o, en sus equipos, el cuerpo técnico. Se comprueba con el equipo. */
  const rosterWrite = requirePermission("org.structure.read");

  type Ctx = {
    get: ((key: "sessionUser") => AppEnv["Variables"]["sessionUser"]) & ((key: "actor") => Actor);
  };
  const actorId = (c: Ctx) => c.get("actor").userId;
  async function canWriteRoster(c: Ctx, scope: OrgScopeOf, teamId: string) {
    const actor = c.get("actor");
    if (actor.permissions.has("org.structure.write")) return true;
    if (actor.permissions.has("org.roster.write_own")) {
      const own = await data.memberships.ownTeamIds(scope, actorId(c));
      if (own.includes(teamId)) return true;
    }
    return false;
  }
  async function requireRosterWrite(c: Ctx, scope: OrgScopeOf, teamId: string) {
    if (!(await canWriteRoster(c, scope, teamId))) throw forbidden();
  }
  const accessOf = async (c: Ctx, scope: OrgScopeOf, teamId: string) => {
    const actor = c.get("actor");
    const own =
      actor.permissions.has("org.events.write_own") ||
      actor.permissions.has("org.attendance.write_own")
        ? (await data.memberships.ownTeamIds(scope, actorId(c))).includes(teamId)
        : false;
    return {
      roster: await canWriteRoster(c, scope, teamId),
      events:
        actor.permissions.has("org.events.write") ||
        (actor.permissions.has("org.events.write_own") && own),
      attendance:
        actor.permissions.has("org.events.write") ||
        (actor.permissions.has("org.attendance.write_own") && own),
    };
  };

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  type RouteCtx = Parameters<typeof accessScopeOf>[1];
  /** Ámbito restringido de quien pregunta (Bloque 19), o nulo si ve el club entero. */
  async function restrictedOf(c: RouteCtx) {
    const access = await accessScopeOf(data, c);
    return access.kind === "restricted" ? access : null;
  }
  async function requireSectionVisible(c: RouteCtx, sectionId: string) {
    const restricted = await restrictedOf(c);
    if (restricted && !restricted.sectionIds.includes(sectionId))
      throw notFound("Esa sección no existe.");
  }
  /** Equipo del club, dentro del ámbito de quien pregunta, o 404. */
  async function teamOr404(c: RouteCtx, scope: OrgScopeOf, id: string): Promise<TeamRecord> {
    const team = await data.teams.byId(scope, id);
    if (!team) throw notFound("Ese equipo no existe.");
    const restricted = await restrictedOf(c);
    if (restricted && !restricted.teamIds.includes(id)) throw notFound("Ese equipo no existe.");
    return team;
  }
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

  /** Plantilla para la respuesta: la clave de la foto se convierte en URL y no sale de la API. */
  const rosterOf = async (
    tenant: { organization: { slug: string }; scope: OrgScopeOf },
    teamId: string,
  ) =>
    (await data.teams.roster(tenant.scope, teamId)).map(({ photoBlobKey, ...entry }) => ({
      ...entry,
      photoUrl: playerPhotoUrlFor(photoBlobKey, tenant.organization.slug, entry.playerId),
    }));

  const teamDetail = async (c: Ctx, tenant: ReturnType<typeof scopeOf>, team: TeamRecord) => {
    const canSeePlayers = c.get("actor").permissions.has("org.players.read");
    const [roster, staff, schedule, access] = await Promise.all([
      canSeePlayers ? rosterOf(tenant, team.id) : Promise.resolve([]),
      data.teams.staff(tenant.scope, team.id),
      data.schedules.listForTeam(tenant.scope, team.id),
      accessOf(c, tenant.scope, team.id),
    ]);
    return { team: teamDto(team), roster, staff, schedule, access };
  };

  // --- Catálogo de deportes (para crear secciones) ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sports",
      tags: ["Estructura"],
      summary:
        "Catálogo de deportes con sus posiciones y categorías sugeridas, para abrir una sección (Bloque 14)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Deportes", SportCatalogResponseSchema), ...errors },
    }),
    async (c) => {
      const sports = await data.sports.listWithConfig();
      return c.json(
        {
          sports: sports.map((s) => ({
            code: s.code,
            name: s.name,
            defaultKind: defaultSectionKind(s.code),
            config: SportConfigSchema.parse(s.config ?? {}),
          })),
        },
        200,
      );
    },
  );

  // --- Resumen (también para la vista de soporte: solo cifras) ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/summary",
      tags: ["Estructura"],
      summary:
        "Cifras del inicio: temporada, secciones con su tarjeta, socios, personal, instalaciones, agenda de hoy y, con `org.players.read`, alertas y preparación de las fichas",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Cifras", StructureSummarySchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const actor = c.get("actor");
      const timezone = tenant.organization.timezone;
      // Ámbito restringido (Bloque 19): cifras, tarjetas, agenda y alertas solo de lo suyo.
      const restricted = await restrictedOf(c);
      const canStructure = actor.permissions.has("org.structure.read");
      const canEvents = actor.permissions.has("org.events.read");
      const canPlayers = actor.permissions.has("org.players.read");
      // Todo lo que no depende de otra cosa sale a la vez (ADR 0060): antes eran tres oleadas
      // seguidas, y dentro de cada una varias consultas en fila.
      const countsP = data.teams.counts(tenant.scope, restricted ?? undefined);
      // Quien no lee la estructura (familias, cuerpo técnico sin más) ve en el inicio solo la
      // agenda de lo suyo: los equipos de sus deportistas o los que lleva.
      const scopedTeamsP: Promise<string[] | undefined> =
        canEvents && !canStructure
          ? Promise.all([
              data.events.teamIdsForGuardian(tenant.scope, actor.userId),
              data.memberships.ownTeamIds(tenant.scope, actor.userId),
            ]).then(([guardian, own]) => [...new Set([...guardian, ...own])])
          : Promise.resolve(undefined);
      const eventFilterP: Promise<EventFilter> = scopedTeamsP.then((scopedTeams) =>
        scopedTeams
          ? { teamIds: scopedTeams }
          : restricted
            ? { visible: { teamIds: restricted.teamIds, sectionIds: restricted.sectionIds } }
            : {},
      );
      const [
        counts,
        clubMembers,
        staff,
        facilities,
        sectionCards,
        today,
        nextEvent,
        fees,
        readiness,
        challengeSubmissionsPending,
        store,
      ] = await Promise.all([
        countsP,
        data.clubMembers.counts(tenant.scope),
        data.clubMembers.staffCount(tenant.scope),
        (restricted
          ? data.access.facilityIdsForTeams(tenant.scope, restricted.teamIds)
          : Promise.resolve(null)
        ).then((ids) => data.facilities.counts(tenant.scope, ids)),
        canStructure
          ? countsP.then((counts) =>
              data.sections.list(
                tenant.scope,
                counts.currentSeason?.id ?? null,
                restricted ? { sectionIds: restricted.sectionIds } : {},
              ),
            )
          : Promise.resolve([]),
        canEvents
          ? eventFilterP.then((filter) =>
              data.events.today(tenant.scope, timezone, new Date(), filter),
            )
          : Promise.resolve([]),
        canEvents
          ? eventFilterP.then((filter) => data.events.next(tenant.scope, new Date(), filter))
          : Promise.resolve(null),
        actor.permissions.has("org.fees.read")
          ? data.fees.summary(tenant.scope)
          : Promise.resolve(null),
        canPlayers
          ? data.players.operations(
              tenant.scope,
              restricted
                ? { teamIds: restricted.teamIds, playerIds: restricted.playerIds }
                : undefined,
            )
          : Promise.resolve(null),
        !canPlayers
          ? Promise.resolve(0)
          : actor.permissions.has("org.challenges.review")
            ? data.challenges.pendingCount(tenant.scope)
            : actor.permissions.has("org.challenges.review_own")
              ? data.memberships
                  .ownTeamIds(tenant.scope, actorId(c))
                  .then((teamIds) => data.challenges.pendingCount(tenant.scope, teamIds))
              : Promise.resolve(0),
        canPlayers && actor.permissions.has("org.store.read")
          ? data.store.alerts(tenant.scope)
          : Promise.resolve({ ordersToPrepare: 0, variantsOutOfStock: 0 }),
      ]);
      const base = {
        ...counts,
        clubMembers: clubMembers.active,
        clubMembersJoinedThisMonth: clubMembers.joinedThisMonth,
        staff,
        facilities: facilities.total,
        fees,
        sectionCards,
        today: today.map(eventDto),
        nextEvent: nextEvent ? eventDto(nextEvent) : null,
      };
      if (!readiness) {
        return c.json({ ...base, operations: null, readiness: null }, 200);
      }
      return c.json(
        {
          ...base,
          operations: {
            ...readiness.operations,
            challengeSubmissionsPending,
            facilitiesWithoutHours: facilities.withoutHours,
            feesOverdue: fees?.overdueCount ?? 0,
            storeOrdersToPrepare: store.ordersToPrepare,
            storeOutOfStock: store.variantsOutOfStock,
          },
          readiness: readiness.readiness,
        },
        200,
      );
    },
  );

  // --- Personal elegible (coordinación de sección, responsable de un objetivo) ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/eligible-staff",
      tags: ["Estructura"],
      summary:
        "Miembros con rol de entrenador, personal o administración: para elegir coordinación sin leer el personal del club. Permiso `org.structure.write`",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      responses: { 200: json("Miembros", EligibleMembersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ members: await data.teams.eligibleStaff(tenant.scope) }, 200);
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
  const seasonOf = async (tenant: ReturnType<typeof scopeOf>, requested?: string) =>
    requested
      ? await data.seasons.byId(tenant.scope, requested)
      : await data.seasons.current(tenant.scope);
  const seasonDto = (s: { id: string; name: string; isCurrent: boolean } | null) =>
    s ? { id: s.id, name: s.name, isCurrent: s.isCurrent } : null;

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections",
      tags: ["Estructura"],
      summary: "Secciones del club con sus cifras en una temporada (la actual por defecto)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ season: z.string().uuid().optional() }) },
      responses: { 200: json("Secciones", SectionsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { season: requested } = c.req.valid("query");
      const season = await seasonOf(tenant, requested);
      const restricted = await restrictedOf(c);
      return c.json(
        {
          season: seasonDto(season),
          sections: await data.sections.list(
            tenant.scope,
            season?.id ?? null,
            restricted ? { sectionIds: restricted.sectionIds } : {},
          ),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections",
      tags: ["Estructura"],
      summary: "Crea una sección con su deporte, su tipo y, si quiere, sus primeras categorías",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: SectionCreateSchema } }, required: true },
      },
      responses: {
        201: json("Sección creada", SectionResponseSchema),
        400: error("Deporte o coordinación desconocidos"),
        409: error("Ya hay una sección con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.sections.create(tenant.scope, body);
      if (result.outcome === "unknown_sport")
        throw badRequest("Ese deporte no está en el catálogo.");
      if (result.outcome === "unknown_coordinator")
        throw badRequest("Esa persona no es miembro del club.");
      if (result.outcome === "name_taken") throw conflict("Ya hay una sección con ese nombre.");
      await audit(c, tenant, "section.created", result.section.name, {
        sport: result.section.sport.code,
        kind: result.section.kind,
      });
      return c.json({ section: result.section }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections/{id}",
      tags: ["Estructura"],
      summary:
        "Ficha de una sección: categorías con sus equipos (y el siguiente evento de cada uno), resumen y cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, query: z.object({ season: z.string().uuid().optional() }) },
      responses: { 200: json("Sección", SectionDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { season: requested } = c.req.valid("query");
      const season = await seasonOf(tenant, requested);
      const seasonId = season?.id ?? null;
      // La visibilidad, la sección y el ámbito no dependen entre sí (ADR 0060).
      const [, section, restricted] = await Promise.all([
        requireSectionVisible(c, id),
        data.sections.byId(tenant.scope, id, seasonId),
        restrictedOf(c),
      ]);
      if (!section) throw notFound("Esa sección no existe.");
      const canSeePlayers = c.get("actor").permissions.has("org.players.read");
      const canWrite = c.get("actor").permissions.has("org.structure.write");
      const week = weekRange(tenant.organization.timezone);
      // El resto sale en una sola oleada; lo que depende de otra cosa se encadena a ella.
      const teamsP = seasonId
        ? data.teams.list(tenant.scope, seasonId, id, restricted?.teamIds)
        : Promise.resolve([]);
      const countsP = seasonId
        ? data.sections.counts(tenant.scope, id, seasonId)
        : Promise.resolve({ players: 0, guardians: 0, playerIds: [] as string[] });
      const [categories, teams, nextByTeam, counts, allStaff, eventsThisWeek, readiness, hasTeams] =
        await Promise.all([
          data.categories.list(tenant.scope, { sectionId: id, seasonId }),
          teamsP,
          teamsP.then((list) =>
            data.events.nextByTeam(
              tenant.scope,
              list.map((t) => t.id),
            ),
          ),
          countsP,
          seasonId ? data.sections.staff(tenant.scope, id, seasonId) : Promise.resolve([]),
          data.events.countBetween(tenant.scope, week.from, week.to, {
            sectionId: id,
            ...(restricted
              ? { visible: { teamIds: restricted.teamIds, sectionIds: restricted.sectionIds } }
              : {}),
          }),
          countsP.then((found) =>
            canSeePlayers && found.playerIds.length > 0
              ? data.players.readinessFor(tenant.scope, found.playerIds)
              : null,
          ),
          canWrite ? data.sections.hasTeams(tenant.scope, id) : Promise.resolve(true),
        ]);
      // Con ámbito restringido, el personal de la sección se reduce al de los equipos visibles.
      const staff = restricted
        ? allStaff
            .map((s) => ({
              ...s,
              teams: s.teams.filter((t) => restricted.teamIds.includes(t.teamId)),
            }))
            .filter((s) => s.teams.length > 0)
        : allStaff;
      return c.json(
        {
          section,
          season: seasonDto(season),
          categories: categories.map((category) => ({
            ...category,
            teams: teams
              .filter((t) => t.categoryId === category.id)
              .map((t) => {
                const next = nextByTeam.get(t.id);
                return { ...teamDto(t), nextEvent: next ? eventDto(next) : null };
              }),
          })),
          summary: {
            players: canSeePlayers ? counts.players : 0,
            guardians: canSeePlayers ? counts.guardians : 0,
            readinessPercent: readiness,
            staff,
            eventsThisWeek,
          },
          // Eliminable: quien escribe la estructura y la sección sin equipos en ninguna temporada.
          access: { write: canWrite, removable: canWrite && !hasTeams },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}",
      tags: ["Estructura"],
      summary: "Edita una sección: nombre, deporte, tipo, coordinación, descripción o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: SectionUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Sección", SectionResponseSchema),
        400: error("Deporte o coordinación desconocidos"),
        409: error("Ya hay una sección con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await requireSectionVisible(c, id);
      const result = await data.sections.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Esa sección no existe.");
      if (result.outcome === "unknown_sport")
        throw badRequest("Ese deporte no está en el catálogo.");
      if (result.outcome === "unknown_coordinator")
        throw badRequest("Esa persona no es miembro del club.");
      if (result.outcome === "name_taken") throw conflict("Ya hay una sección con ese nombre.");
      await audit(c, tenant, "section.updated", result.section.name, body);
      return c.json({ section: result.section }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sections/{id}",
      tags: ["Estructura"],
      summary:
        "Elimina una sección sin equipos en ninguna temporada, con sus categorías. Con equipos no se borra: se archiva",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: {
        204: { description: "Eliminada" },
        409: error("Tiene equipos: se archiva, no se elimina"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      await requireSectionVisible(c, id);
      const section = await data.sections.byId(tenant.scope, id);
      if (!section) throw notFound("Esa sección no existe.");
      const outcome = await data.sections.remove(tenant.scope, id);
      if (outcome === "not_found") throw notFound("Esa sección no existe.");
      if (outcome === "has_teams")
        throw conflict("Esa sección tiene equipos: archívala para conservar su historial.");
      await audit(c, tenant, "section.removed", section.name, {
        sport: section.sport.code,
        kind: section.kind,
      });
      return c.body(null, 204);
    },
  );

  // --- Categorías ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/categories",
      tags: ["Estructura"],
      summary: "Categorías del club (o de una sección) con sus equipos en la temporada actual",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ section: z.string().uuid().optional() }) },
      responses: { 200: json("Categorías", CategoriesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { section } = c.req.valid("query");
      const season = await data.seasons.current(tenant.scope);
      const restricted = await restrictedOf(c);
      return c.json(
        {
          categories: await data.categories.list(tenant.scope, {
            sectionId: section,
            seasonId: season?.id ?? null,
            sectionIds: restricted?.sectionIds,
          }),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/categories",
      tags: ["Estructura"],
      summary: "Crea una categoría en una sección",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: CategoryCreateSchema } }, required: true },
      },
      responses: {
        201: json("Categoría creada", CategoryResponseSchema),
        400: error("Sección desconocida"),
        409: error("Ya hay una categoría con ese nombre en la sección"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      await requireSectionVisible(c, body.sectionId);
      const result = await data.categories.create(tenant.scope, body);
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay una categoría con ese nombre en la sección.");
      await audit(c, tenant, "category.created", result.category.name, {
        sectionId: body.sectionId,
      });
      return c.json({ category: result.category }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/categories/{id}",
      tags: ["Estructura"],
      summary: "Edita una categoría: nombre, género, años de nacimiento, orden o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: CategoryUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Categoría", CategoryResponseSchema),
        409: error("Ya hay una categoría con ese nombre en la sección"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const current = await data.categories.byId(tenant.scope, id);
      if (!current) throw notFound("Esa categoría no existe.");
      await requireSectionVisible(c, current.sectionId);
      const result = await data.categories.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Esa categoría no existe.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay una categoría con ese nombre en la sección.");
      await audit(c, tenant, "category.updated", result.category.name, body);
      return c.json({ category: result.category }, 200);
    },
  );

  // --- Equipos ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams",
      tags: ["Estructura"],
      summary:
        "Equipos de una temporada (la actual por defecto), opcionalmente de una sección, con plantilla y cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({
          season: z.string().uuid().optional(),
          section: z.string().uuid().optional(),
        }),
      },
      responses: { 200: json("Equipos", TeamsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { season: requested, section } = c.req.valid("query");
      const season = await seasonOf(tenant, requested);
      if (!season) return c.json({ season: null, teams: [] }, 200);
      const restricted = await restrictedOf(c);
      const teams = await data.teams.list(tenant.scope, season.id, section, restricted?.teamIds);
      return c.json({ season: seasonDto(season), teams: teams.map(teamDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams",
      tags: ["Estructura"],
      summary: "Crea un equipo o grupo en una sección, una categoría y una temporada",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: TeamCreateSchema } }, required: true },
      },
      responses: {
        201: json("Equipo creado", TeamResponseSchema),
        400: error("Sección, categoría o temporada desconocidas"),
        409: error("Ya hay un equipo con ese nombre en esa sección y temporada"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      await requireSectionVisible(c, body.sectionId);
      const result = await data.teams.create(tenant.scope, body);
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_category")
        throw badRequest("Esa categoría no es de esa sección.");
      if (result.outcome === "unknown_season")
        throw badRequest("Esa temporada no es de este club.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un equipo con ese nombre en esa sección y temporada.");
      await audit(c, tenant, "team.created", result.team.name, {
        season: result.team.season.name,
        section: result.team.section.name,
        category: result.team.category,
      });
      return c.json({ team: teamDto(result.team) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}",
      tags: ["Estructura"],
      summary: "Ficha de un equipo: plantilla, cuerpo técnico y horario semanal",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Equipo", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const team = await teamOr404(c, tenant.scope, id);
      return c.json(await teamDetail(c, tenant, team), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/teams/{id}",
      tags: ["Estructura"],
      summary: "Edita un equipo: nombre, categoría, aforo, sección o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: TeamUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Equipo", TeamResponseSchema),
        400: error("Sección o categoría desconocidas"),
        409: error("Ya hay un equipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await teamOr404(c, tenant.scope, id);
      if (body.sectionId !== undefined) await requireSectionVisible(c, body.sectionId);
      const result = await data.teams.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese equipo no existe.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_category")
        throw badRequest("Esa categoría no es de esa sección.");
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
      summary:
        "Mete a un jugador del club en la plantilla del equipo. Quien escribe la estructura o el cuerpo técnico del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [rosterWrite],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: RosterAddSchema } }, required: true },
      },
      responses: {
        200: json("Plantilla", TeamDetailResponseSchema),
        400: error("Jugador desconocido"),
        409: error("Ya está en la plantilla o el grupo está completo"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const before = await teamOr404(c, tenant.scope, id);
      await requireRosterWrite(c, tenant.scope, id);
      if (before.capacity !== null && before.playersCount >= before.capacity)
        throw conflict("El grupo está completo.");
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
      return c.json(await teamDetail(c, tenant, team), 200);
    },
  );

  const rosterParam = z.object({ id: z.string().uuid(), playerId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/teams/{id}/players/{playerId}",
      tags: ["Estructura"],
      summary:
        "Cambia dorsal o posición de un jugador en el equipo. Quien escribe la estructura o el cuerpo técnico del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [rosterWrite],
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
      const team = await teamOr404(c, tenant.scope, id);
      await requireRosterWrite(c, tenant.scope, id);
      const ok = await data.teams.updatePlayer(tenant.scope, id, playerId, body);
      if (!ok) throw notFound("Ese jugador no está en la plantilla.");
      await audit(c, tenant, "team.roster_updated", team.name, { playerId, ...body });
      return c.json(await teamDetail(c, tenant, (await data.teams.byId(tenant.scope, id))!), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/teams/{id}/players/{playerId}",
      tags: ["Estructura"],
      summary:
        "Saca a un jugador de la plantilla. El jugador sigue en el club. Quien escribe la estructura o el cuerpo técnico del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [rosterWrite],
      request: { params: rosterParam },
      responses: { 200: json("Plantilla", TeamDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, playerId } = c.req.valid("param");
      const team = await teamOr404(c, tenant.scope, id);
      await requireRosterWrite(c, tenant.scope, id);
      const ok = await data.teams.removePlayer(tenant.scope, id, playerId);
      if (!ok) throw notFound("Ese jugador no está en la plantilla.");
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId,
        kind: "roster_removed",
        details: { team: team.name, season: team.season.name },
        actorUserId: c.get("sessionUser").id,
      });
      await audit(c, tenant, "team.roster_removed", team.name, { playerId });
      return c.json(await teamDetail(c, tenant, (await data.teams.byId(tenant.scope, id))!), 200);
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
      summary: "Añade a un miembro del club al cuerpo técnico del equipo, con su papel",
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
      const { userId, roleInTeam } = c.req.valid("json");
      await teamOr404(c, tenant.scope, id);
      const outcome = await data.teams.addStaff(
        tenant.scope,
        id,
        userId,
        roleInTeam ?? "head_coach",
      );
      if (outcome === "unknown_team") throw notFound("Ese equipo no existe.");
      if (outcome === "not_member") throw badRequest("Esa persona no es miembro del club.");
      if (outcome === "already_staff") throw conflict("Esa persona ya está en el cuerpo técnico.");
      const team = (await data.teams.byId(tenant.scope, id))!;
      await audit(c, tenant, "team.staff_added", team.name, { userId, roleInTeam });
      return c.json(await teamDetail(c, tenant, team), 200);
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
      const team = await teamOr404(c, tenant.scope, id);
      const ok = await data.teams.removeStaff(tenant.scope, id, userId);
      if (!ok) throw notFound("Esa persona no está en el cuerpo técnico.");
      await audit(c, tenant, "team.staff_removed", team.name, { userId });
      return c.json(await teamDetail(c, tenant, (await data.teams.byId(tenant.scope, id))!), 200);
    },
  );

  return app;
}
