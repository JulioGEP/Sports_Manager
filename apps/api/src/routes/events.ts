import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  AttendanceResponseSchema,
  AttendanceSetSchema,
  AttendanceSummarySchema,
  EventCreateSchema,
  EventResponseSchema,
  EventsResponseSchema,
  EventUpdateSchema,
  FacilitiesResponseSchema,
  FacilityCreateSchema,
  FacilityHoursSetSchema,
  FacilityResponseSchema,
  FacilityUpdateSchema,
  TeamScheduleSetSchema,
  TeamScheduleResponseSchema,
  type EventSummary,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  weekRange,
  type DataLayer,
  type EventFilter,
  type EventRecord,
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

/** Rango de la agenda: instantes ISO; por defecto, la semana en curso en la zona del club. */
const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
const eventsQuery = rangeQuery.extend({
  section: z.string().uuid().optional(),
  team: z.string().uuid().optional(),
  facility: z.string().uuid().optional(),
});

const ScheduleResponseSchema = TeamScheduleResponseSchema;

export const eventDto = (e: EventRecord): EventSummary => ({
  id: e.id,
  kind: e.kind,
  title: e.title,
  startsAt: e.startsAt.toISOString(),
  endsAt: e.endsAt.toISOString(),
  section: e.section,
  team: e.team,
  facility: e.facility,
  location: e.location,
  opponent: e.opponent,
  homeAway: e.homeAway,
  notes: e.notes,
  seriesId: e.seriesId,
  attendance: e.attendance,
});

/**
 * Instalaciones, agenda, horarios y pase de lista (Bloques 16 y 17). Lectura con
 * `org.facilities.read` y `org.events.read`; escritura con `org.events.write` o, en los equipos
 * propios del cuerpo técnico, `org.events.write_own`. El pase de lista lo hace el cuerpo técnico
 * de cada equipo (`org.attendance.write_own`). Las familias ven la agenda de los suyos. Con un
 * ámbito restringido (Bloque 19, ADR 0033), solo salen los eventos de los equipos y secciones de
 * quien pregunta (y los del club entero) y las instalaciones que usan sus equipos.
 */
export function createEventRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  for (const path of ["/api/org/facilities", "/api/org/events"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  app.use("/api/org/family/agenda", ...chain);
  app.use("/api/org/me/agenda", ...chain);
  app.use("/api/org/teams/:id/schedule", ...chain);
  app.use("/api/org/players/:id/attendance", ...chain);

  type Ctx = {
    get: ((key: "sessionUser") => AppEnv["Variables"]["sessionUser"]) &
      ((key: "actor") => Actor) &
      ((key: "tenant") => AppEnv["Variables"]["tenant"]);
  };
  const scopeOf = (c: Ctx) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  const audit = (
    c: Ctx,
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

  /** Equipos propios del cuerpo técnico que pregunta (ADR 0030): su ámbito "propio". */
  const ownTeams = (c: Ctx, scope: Parameters<DataLayer["events"]["byId"]>[0]) =>
    data.memberships.ownTeamIds(scope, c.get("actor").userId);
  type RouteCtx = Parameters<typeof accessScopeOf>[1];
  /** Filtro de ámbito (Bloque 19): vacío cuando se ve el club entero. */
  async function visibleFilter(c: RouteCtx): Promise<Pick<EventFilter, "visible">> {
    const access = await accessScopeOf(data, c);
    return access.kind === "club"
      ? {}
      : { visible: { teamIds: access.teamIds, sectionIds: access.sectionIds } };
  }
  /** Un evento fuera del ámbito de quien pregunta no existe para esa persona. */
  async function eventOr404(
    c: RouteCtx,
    scope: Parameters<DataLayer["events"]["byId"]>[0],
    id: string,
  ): Promise<EventRecord> {
    const event = await data.events.byId(scope, id);
    if (!event) throw notFound("Ese evento no existe.");
    const { visible } = await visibleFilter(c);
    if (!data.events.isVisible(event, visible)) throw notFound("Ese evento no existe.");
    return event;
  }
  async function requireTeamVisible(c: RouteCtx, teamId: string) {
    const access = await accessScopeOf(data, c);
    if (access.kind === "restricted" && !access.teamIds.includes(teamId))
      throw notFound("Ese equipo no existe.");
  }

  async function canWriteEvent(
    c: Ctx,
    scope: Parameters<DataLayer["events"]["byId"]>[0],
    teamIds: (string | null)[],
  ): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.events.write")) return true;
    if (!actor.permissions.has("org.events.write_own")) return false;
    if (teamIds.some((t) => !t)) return false;
    const own = await ownTeams(c, scope);
    return teamIds.every((t) => t && own.includes(t));
  }

  async function canReadAttendance(
    c: Ctx,
    scope: Parameters<DataLayer["events"]["byId"]>[0],
    teamId: string | null,
  ): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.attendance.read")) return true;
    if (!teamId || !actor.permissions.has("org.attendance.write_own")) return false;
    return (await ownTeams(c, scope)).includes(teamId);
  }

  async function canWriteAttendance(
    c: Ctx,
    scope: Parameters<DataLayer["events"]["byId"]>[0],
    teamId: string | null,
  ): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.events.write")) return true;
    if (!teamId || !actor.permissions.has("org.attendance.write_own")) return false;
    return (await ownTeams(c, scope)).includes(teamId);
  }

  function rangeOf(
    query: { from?: string | undefined; to?: string | undefined },
    timezone: string,
  ) {
    const week = weekRange(timezone);
    const from = query.from ? new Date(query.from) : week.from;
    const to = query.to
      ? new Date(query.to)
      : query.from
        ? new Date(from.getTime() + 7 * 86_400_000)
        : week.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw badRequest("Fechas inválidas: usa instantes ISO 8601.");
    if (to.getTime() <= from.getTime())
      throw badRequest("El final tiene que ir después del inicio.");
    if (to.getTime() - from.getTime() > 400 * 86_400_000)
      throw badRequest("El rango no puede superar un año.");
    return { from, to };
  }

  const eventsResponse = async (
    scope: Parameters<DataLayer["events"]["byId"]>[0],
    from: Date,
    to: Date,
    filter: Parameters<DataLayer["events"]["listBetween"]>[3],
    withConflicts: boolean,
  ) => ({
    from: from.toISOString(),
    to: to.toISOString(),
    events: (await data.events.listBetween(scope, from, to, filter)).map(eventDto),
    conflicts: withConflicts ? await data.events.conflictsBetween(scope, from, to) : [],
  });

  // --- Instalaciones ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/facilities",
      tags: ["Agenda"],
      summary: "Instalaciones del club con sus franjas de apertura y la ocupación de esta semana",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.facilities.read")],
      responses: { 200: json("Instalaciones", FacilitiesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const access = await accessScopeOf(data, c);
      const onlyIds =
        access.kind === "restricted"
          ? await data.access.facilityIdsForTeams(tenant.scope, access.teamIds)
          : null;
      const facilities = await data.facilities.list(
        tenant.scope,
        tenant.organization.timezone,
        new Date(),
        null,
        onlyIds,
      );
      return c.json({ facilities }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/facilities",
      tags: ["Agenda"],
      summary: "Crea una instalación",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.facilities.write")],
      request: {
        body: { content: { "application/json": { schema: FacilityCreateSchema } }, required: true },
      },
      responses: {
        201: json("Instalación creada", FacilityResponseSchema),
        409: error("Ya hay una instalación con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.facilities.create(tenant.scope, body, tenant.organization.timezone);
      if (result.outcome === "name_taken") throw conflict("Ya hay una instalación con ese nombre.");
      await audit(c, tenant, "facility.created", result.facility.name);
      return c.json({ facility: result.facility }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/facilities/{id}",
      tags: ["Agenda"],
      summary: "Edita una instalación: nombre, tipo, aforo, descripción o estado",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.facilities.write")],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: FacilityUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Instalación", FacilityResponseSchema),
        409: error("Ya hay una instalación con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.facilities.update(
        tenant.scope,
        id,
        body,
        tenant.organization.timezone,
      );
      if (result.outcome === "not_found") throw notFound("Esa instalación no existe.");
      if (result.outcome === "name_taken") throw conflict("Ya hay una instalación con ese nombre.");
      await audit(c, tenant, "facility.updated", result.facility.name, body);
      return c.json({ facility: result.facility }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/facilities/{id}/hours",
      tags: ["Agenda"],
      summary: "Sustituye las franjas de apertura de una instalación",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.facilities.write")],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: FacilityHoursSetSchema } },
          required: true,
        },
      },
      responses: { 200: json("Instalación", FacilityResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const ok = await data.facilities.setHours(tenant.scope, id, body);
      if (!ok) throw notFound("Esa instalación no existe.");
      const facility = (await data.facilities.byId(
        tenant.scope,
        id,
        tenant.organization.timezone,
      ))!;
      await audit(c, tenant, "facility.updated", facility.name, { hours: body.hours.length });
      return c.json({ facility }, 200);
    },
  );

  // --- Agenda ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/events",
      tags: ["Agenda"],
      summary:
        "Agenda del club en un rango (por defecto, la semana en curso en la zona del club), con los solapes de instalación",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: { query: eventsQuery },
      responses: { 200: json("Eventos", EventsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const query = c.req.valid("query");
      const { from, to } = rangeOf(query, tenant.organization.timezone);
      return c.json(
        await eventsResponse(
          tenant.scope,
          from,
          to,
          {
            sectionId: query.section,
            teamId: query.team,
            facilityId: query.facility,
            ...(await visibleFilter(c)),
          },
          true,
        ),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/events",
      tags: ["Agenda"],
      summary:
        "Crea un evento, con repetición semanal opcional. Quien escribe la agenda o, en sus equipos, el cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: {
        body: { content: { "application/json": { schema: EventCreateSchema } }, required: true },
      },
      responses: {
        201: json(
          "Evento creado (con los solapes de instalación, si los hay)",
          EventResponseSchema,
        ),
        400: error("Sección, equipo o instalación desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      if (!(await canWriteEvent(c, tenant.scope, [body.teamId ?? null]))) throw forbidden();
      if (body.teamId) await requireTeamVisible(c, body.teamId);
      const result = await data.events.create(tenant.scope, body, {
        timezone: tenant.organization.timezone,
        createdBy: c.get("sessionUser").id,
      });
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_team") throw badRequest("Ese equipo no es de este club.");
      if (result.outcome === "unknown_facility")
        throw badRequest("Esa instalación no es de este club.");
      await audit(c, tenant, "event.created", result.event.title, {
        kind: body.kind,
        created: result.created,
        teamId: body.teamId ?? null,
      });
      return c.json(
        {
          event: eventDto(result.event),
          created: result.created,
          conflictsWith: result.conflictsWith,
        },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/events/{id}",
      tags: ["Agenda"],
      summary: "Un evento",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: { params: idParam },
      responses: { 200: json("Evento", EventResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const event = await eventOr404(c, tenant.scope, id);
      return c.json({ event: eventDto(event) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/events/{id}",
      tags: ["Agenda"],
      summary: "Edita un evento. Quien escribe la agenda o, en sus equipos, el cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: EventUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Evento", EventResponseSchema),
        400: error("Sección, equipo o instalación desconocidos, o fin antes del inicio"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const current = await eventOr404(c, tenant.scope, id);
      const teams = [current.team?.id ?? null];
      if (body.teamId !== undefined) teams.push(body.teamId ?? null);
      if (!(await canWriteEvent(c, tenant.scope, teams))) throw forbidden();
      if (body.teamId) await requireTeamVisible(c, body.teamId);
      const result = await data.events.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese evento no existe.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_team") throw badRequest("Ese equipo no es de este club.");
      if (result.outcome === "unknown_facility")
        throw badRequest("Esa instalación no es de este club.");
      if (result.outcome === "invalid_range")
        throw badRequest("El evento tiene que acabar después de empezar.");
      await audit(c, tenant, "event.updated", result.event.title, body);
      return c.json({ event: eventDto(result.event), conflictsWith: result.conflictsWith }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/events/{id}",
      tags: ["Agenda"],
      summary:
        "Borra un evento; con `series=1`, también los siguientes de su serie. Quien escribe la agenda o, en sus equipos, el cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: { params: idParam, query: z.object({ series: z.string().optional() }) },
      responses: {
        200: json("Borrado", z.object({ removed: z.number().int().nonnegative() })),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { series } = c.req.valid("query");
      const current = await eventOr404(c, tenant.scope, id);
      if (!(await canWriteEvent(c, tenant.scope, [current.team?.id ?? null]))) throw forbidden();
      const removed = await data.events.remove(tenant.scope, id, { series: series === "1" });
      if (removed === 0) throw notFound("Ese evento no existe.");
      await audit(c, tenant, "event.removed", current.title, { removed });
      return c.json({ removed }, 200);
    },
  );

  // --- Pase de lista ---
  const attendanceOf = async (
    tenant: ReturnType<typeof scopeOf>,
    event: EventRecord,
    write: boolean,
  ) => {
    const entries = (await data.attendance.forEvent(tenant.scope, event.id)) ?? [];
    return {
      event: eventDto((await data.events.byId(tenant.scope, event.id)) ?? event),
      entries: entries.map(({ photoBlobKey, ...entry }) => ({
        ...entry,
        photoUrl: playerPhotoUrlFor(photoBlobKey, tenant.organization.slug, entry.playerId),
      })),
      access: { write },
    };
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/events/{id}/attendance",
      tags: ["Agenda"],
      summary:
        "Pase de lista de un evento: la plantilla del equipo con el estado de cada deportista",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: { 200: json("Pase de lista", AttendanceResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const event = await eventOr404(c, tenant.scope, id);
      if (!(await canReadAttendance(c, tenant.scope, event.team?.id ?? null))) throw forbidden();
      const write = await canWriteAttendance(c, tenant.scope, event.team?.id ?? null);
      return c.json(await attendanceOf(tenant, event, write), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/events/{id}/attendance",
      tags: ["Agenda"],
      summary:
        "Guarda el pase de lista. El cuerpo técnico del equipo o quien escribe la agenda. Solo deportistas de la plantilla",
      security: [{ sessionCookie: [] }],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: AttendanceSetSchema } }, required: true },
      },
      responses: {
        200: json("Pase de lista", AttendanceResponseSchema),
        400: error("El evento no tiene equipo"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const event = await eventOr404(c, tenant.scope, id);
      if (!(await canWriteAttendance(c, tenant.scope, event.team?.id ?? null))) throw forbidden();
      const result = await data.attendance.set(
        tenant.scope,
        id,
        body.entries,
        c.get("sessionUser").id,
      );
      if (result.outcome === "unknown_event") throw notFound("Ese evento no existe.");
      if (result.outcome === "no_team")
        throw badRequest("Solo se pasa lista en los eventos de un equipo.");
      await audit(c, tenant, "attendance.recorded", event.title, { saved: result.saved });
      return c.json(await attendanceOf(tenant, event, true), 200);
    },
  );

  // --- Horario semanal del equipo ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/schedule",
      tags: ["Agenda"],
      summary: "Horario semanal de un equipo o grupo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.read")],
      request: { params: idParam },
      responses: { 200: json("Horario", ScheduleResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      await requireTeamVisible(c, id);
      return c.json(
        { schedule: await data.schedules.listForTeam(tenant.scope, id), generated: 0 },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/teams/{id}/schedule",
      tags: ["Agenda"],
      summary:
        "Sustituye el horario semanal del equipo y, si se pide, regenera sus entrenamientos hasta el fin de la temporada. Quien escribe la estructura o, en sus equipos, el cuerpo técnico",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.read")],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: TeamScheduleSetSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Horario", ScheduleResponseSchema),
        400: error("Instalación desconocida"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team) throw notFound("Ese equipo no existe.");
      await requireTeamVisible(c, id);
      const actor = c.get("actor");
      const allowed =
        actor.permissions.has("org.structure.write") ||
        (actor.permissions.has("org.events.write_own") &&
          (await ownTeams(c, tenant.scope)).includes(id));
      if (!allowed) throw forbidden();
      const result = await data.schedules.set(tenant.scope, id, body.slots);
      if (result.outcome === "unknown_team") throw notFound("Ese equipo no existe.");
      if (result.outcome === "unknown_facility")
        throw badRequest("Alguna instalación no es de este club.");
      const generated = body.generate
        ? await data.schedules.generate(
            tenant.scope,
            id,
            tenant.organization.timezone,
            new Date(),
            c.get("sessionUser").id,
          )
        : 0;
      await audit(c, tenant, "team.schedule_updated", team.name, {
        slots: body.slots.length,
        generated,
      });
      return c.json({ schedule: result.schedule, generated }, 200);
    },
  );

  // --- Agendas propias ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family/agenda",
      tags: ["Familia"],
      summary: "Agenda de los equipos de los deportistas de la familia",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { query: rangeQuery },
      responses: { 200: json("Eventos", EventsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { from, to } = rangeOf(c.req.valid("query"), tenant.organization.timezone);
      const teamIds = await data.events.teamIdsForGuardian(tenant.scope, c.get("actor").userId);
      return c.json(await eventsResponse(tenant.scope, from, to, { teamIds }, false), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/agenda",
      tags: ["Agenda"],
      summary: "Agenda propia del cuerpo técnico: sus equipos; sin equipos, la del club entera",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.events.read")],
      request: { query: rangeQuery },
      responses: { 200: json("Eventos", EventsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { from, to } = rangeOf(c.req.valid("query"), tenant.organization.timezone);
      const own = await ownTeams(c, tenant.scope);
      const filter: EventFilter = own.length > 0 ? { teamIds: own } : await visibleFilter(c);
      return c.json(await eventsResponse(tenant.scope, from, to, filter, false), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/attendance",
      tags: ["Agenda"],
      summary: "Asistencia de un deportista en la temporada actual",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.players.read")],
      request: { params: idParam },
      responses: { 200: json("Asistencia", AttendanceSummarySchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      if (!(await data.attendance.playerExists(tenant.scope, id)))
        throw notFound("Ese deportista no existe.");
      if (!(await data.access.isPlayerVisible(tenant.scope, await accessScopeOf(data, c), id)))
        throw notFound("Ese deportista no existe.");
      const season = await data.seasons.current(tenant.scope);
      return c.json(
        await data.attendance.summaryForPlayer(tenant.scope, id, season?.id ?? null),
        200,
      );
    },
  );

  return app;
}
