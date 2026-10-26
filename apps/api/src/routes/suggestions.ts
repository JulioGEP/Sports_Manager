import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  ClubSuggestionResponseSchema,
  ClubSuggestionsResponseSchema,
  orderRoadmap,
  PlatformSuggestionCreateSchema,
  PlatformSuggestionOrderSchema,
  PlatformSuggestionResponseSchema,
  PlatformSuggestionsResponseSchema,
  PlatformSuggestionUpdateSchema,
  RoadmapItemResponseSchema,
  RoadmapResponseSchema,
  SuggestionCreateSchema,
  type ClubSuggestion,
  type PlatformSuggestion,
  type RoadmapItem,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type {
  ClubSuggestionRecord,
  DataLayer,
  PlatformSuggestionRecord,
  RoadmapItemRecord,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound, suggestionLimit } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

/**
 * Mejoras de la plataforma (ADR 0046). El club (solo su administración, `org.suggestions`) envía
 * sugerencias, sigue las suyas, vota lo publicado y ve la hoja de ruta. La plataforma las revisa,
 * las publica, las ordena, les da fecha aproximada, las une y contesta al club.
 */

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true as const,
});
const idParam = z.object({ id: z.string().uuid() });
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** La mejora para el club, con su orden interno solo para colocarla (el club ve su puesto). */
function roadmapRow(r: RoadmapItemRecord): Omit<RoadmapItem, "rank"> & { position: number | null } {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    area: r.area,
    status: r.status,
    eta: r.eta,
    position: r.position,
    votes: r.votes,
    votedByClub: r.votedByClub,
    requestedByClub: r.requestedByClub,
    publishedAt: iso(r.publishedAt),
    releasedAt: iso(r.releasedAt),
  };
}

function clubDto(r: ClubSuggestionRecord): ClubSuggestion {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    area: r.area,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    response: r.response,
    reviewedAt: iso(r.reviewedAt),
    publicTitle: r.publicTitle,
    eta: r.eta,
    votes: r.publicTitle !== null ? r.votes : null,
    mergedInto: r.mergedInto,
  };
}

function platformDto(r: PlatformSuggestionRecord): PlatformSuggestion {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: iso(r.reviewedAt),
    publishedAt: iso(r.publishedAt),
    releasedAt: iso(r.releasedAt),
  };
}

export function createSuggestionRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  for (const path of ["/api/org/roadmap", "/api/org/suggestions"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  const allowed = requirePermission("org.suggestions");
  const errors = {
    401: error("Sin sesión"),
    403: error("Sin pertenencia o no es la administración del club"),
    404: error("Host sin club, o mejora que no existe o no es pública"),
  };

  const tenantOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };

  /** La hoja de ruta en su orden, con el puesto de lo que viene. */
  async function roadmapFor(scope: Parameters<DataLayer["suggestions"]["roadmap"]>[0]) {
    const rows = (await data.suggestions.roadmap(scope)).map(roadmapRow);
    return orderRoadmap(rows).map(({ position: _position, ...item }): RoadmapItem => item);
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/roadmap",
      tags: ["Mejoras"],
      summary:
        "Hoja de ruta de la plataforma: en desarrollo, planificadas (con su puesto y fecha aproximada), en estudio y disponibles, con los votos y lo que es de este club",
      security: [{ sessionCookie: [] }],
      middleware: [allowed],
      responses: { 200: json("Hoja de ruta", RoadmapResponseSchema), ...errors },
    }),
    async (c) => c.json({ items: await roadmapFor(tenantOf(c).scope) }, 200),
  );

  const voteRoute = (method: "put" | "delete") =>
    createRoute({
      method,
      path: "/api/org/roadmap/{id}/vote",
      tags: ["Mejoras"],
      summary:
        method === "put"
          ? "Vota una mejora publicada en nombre del club (un voto por club)"
          : "Quita el voto del club",
      security: [{ sessionCookie: [] }],
      middleware: [allowed],
      request: { params: idParam },
      responses: {
        200: json("Mejora con sus votos", RoadmapItemResponseSchema),
        409: error("Ya está disponible: no se vota"),
        ...errors,
      },
    });

  for (const method of ["put", "delete"] as const) {
    app.openapi(voteRoute(method), async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const user = c.get("sessionUser");
      const result =
        method === "put"
          ? await data.suggestions.vote(tenant.scope, user.id, id)
          : await data.suggestions.unvote(tenant.scope, id);
      if (result === "not_found") throw notFound("Esa mejora no está en la hoja de ruta.");
      if (result === "closed") throw conflict("Esa mejora ya está disponible.");
      await data.audit.record({
        actorUserId: user.id,
        organizationId: tenant.organization.id,
        action: method === "put" ? "suggestion.voted" : "suggestion.unvoted",
        target: id,
      });
      // El puesto sale de la hoja de ruta entera.
      const item = (await roadmapFor(tenant.scope)).find((i) => i.id === id);
      if (!item) throw notFound();
      return c.json({ item }, 200);
    });
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/suggestions",
      tags: ["Mejoras"],
      summary:
        "Sugerencias de este club: lo que escribió, en qué estado están y lo que ha contestado la plataforma",
      security: [{ sessionCookie: [] }],
      middleware: [allowed],
      responses: { 200: json("Sugerencias del club", ClubSuggestionsResponseSchema), ...errors },
    }),
    async (c) => {
      const rows = await data.suggestions.listForClub(tenantOf(c).scope);
      return c.json({ suggestions: rows.map(clubDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/suggestions",
      tags: ["Mejoras"],
      summary:
        "Sugiere una mejora a la plataforma. Queda votada por el club y solo la ven el club y la plataforma hasta que se publique",
      security: [{ sessionCookie: [] }],
      middleware: [allowed],
      request: { body: body(SuggestionCreateSchema) },
      responses: {
        201: json("Sugerencia enviada", ClubSuggestionResponseSchema),
        429: error("El club ya ha enviado las sugerencias que caben en 24 horas"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const input = c.req.valid("json");
      const user = c.get("sessionUser");
      const created = await data.suggestions.create(tenant.scope, user.id, input);
      if (created === "limit") throw suggestionLimit();
      await data.audit.record({
        actorUserId: user.id,
        organizationId: tenant.organization.id,
        action: "suggestion.created",
        target: input.title,
        details: { area: input.area },
      });
      const suggestion = await data.suggestions.clubSuggestion(tenant.scope, created.id);
      if (!suggestion) throw notFound();
      return c.json({ suggestion: clubDto(suggestion) }, 201);
    },
  );

  return app;
}

/**
 * La bandeja de la plataforma. Sin cadena propia: se monta dentro de las rutas de la plataforma
 * (`createPlatformRoutes`), que ya exigen sesión y administrador de plataforma en `/api/platform/*`.
 */
export function createPlatformSuggestionRoutes(data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const errors = {
    401: error("Sin sesión"),
    403: error("No es administrador de plataforma"),
  };

  async function load(id: string) {
    const row = await data.suggestions.byId(id);
    if (!row) throw notFound("Esa sugerencia no existe.");
    return platformDto(row);
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/suggestions",
      tags: ["Plataforma"],
      summary:
        "Todas las sugerencias de los clubes y la hoja de ruta: club, autor, votos y estado. Las más nuevas primero",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Sugerencias", PlatformSuggestionsResponseSchema), ...errors },
    }),
    async (c) => c.json({ suggestions: (await data.suggestions.listAll()).map(platformDto) }, 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/platform/suggestions",
      tags: ["Plataforma"],
      summary: "Pone en la hoja de ruta una mejora que no ha pedido ningún club",
      security: [{ sessionCookie: [] }],
      request: { body: body(PlatformSuggestionCreateSchema) },
      responses: { 201: json("Mejora creada", PlatformSuggestionResponseSchema), ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const me = c.get("sessionUser");
      const id = await data.suggestions.createByPlatform(me.id, input);
      await data.audit.record({
        actorUserId: me.id,
        organizationId: null,
        action: "suggestion.created",
        target: input.title,
        details: { from: "platform", status: input.status },
      });
      return c.json({ suggestion: await load(id) }, 201);
    },
  );

  // Antes que `/{id}`: "order" no es un id.
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/platform/suggestions/order",
      tags: ["Plataforma"],
      summary:
        "Ordena lo que viene: las mejoras en desarrollo y planificadas, la primera la siguiente",
      security: [{ sessionCookie: [] }],
      request: { body: body(PlatformSuggestionOrderSchema) },
      responses: {
        200: json("Sugerencias", PlatformSuggestionsResponseSchema),
        400: error("Algún id no está en desarrollo ni planificado, o se repite"),
        ...errors,
      },
    }),
    async (c) => {
      const { ids } = c.req.valid("json");
      if ((await data.suggestions.reorder(ids)) === "invalid")
        throw badRequest("Solo se ordenan mejoras en desarrollo o planificadas, sin repetir.");
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: null,
        action: "suggestion.reordered",
        details: { ids },
      });
      return c.json({ suggestions: (await data.suggestions.listAll()).map(platformDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/platform/suggestions/{id}",
      tags: ["Plataforma"],
      summary:
        "Revisa una sugerencia: publicarla, planificarla con fecha aproximada, descartarla o unirla a otra, reescribir su versión pública y contestar al club",
      security: [{ sessionCookie: [] }],
      request: { params: idParam, body: body(PlatformSuggestionUpdateSchema) },
      responses: {
        200: json("Sugerencia", PlatformSuggestionResponseSchema),
        400: error("Nada que cambiar, o unión a una mejora que no vale"),
        404: error("No existe"),
        ...errors,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      if (Object.keys(patch).length === 0) throw badRequest("No hay nada que cambiar.");
      const before = await load(id);
      const result = await data.suggestions.update(id, c.get("sessionUser").id, patch);
      if (result.outcome === "not_found") throw notFound("Esa sugerencia no existe.");
      if (result.outcome === "invalid_merge")
        throw badRequest("Para unirla, elige otra mejora que no esté unida a su vez a otra.");
      const after = await load(id);
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: null,
        action: "suggestion.updated",
        target: after.publicTitle ?? after.title,
        details: {
          fields: Object.keys(patch),
          ...(before.status !== after.status ? { from: before.status, to: after.status } : {}),
        },
      });
      return c.json({ suggestion: after }, 200);
    },
  );

  return app;
}
