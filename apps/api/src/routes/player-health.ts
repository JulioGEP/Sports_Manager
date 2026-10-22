import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  daysBetween,
  HEALTH_CONSENT_TEXT_VERSION,
  HealthConsentSetSchema,
  InjuryCreateSchema,
  injurySeverity,
  InjuryUpdateSchema,
  PlayerHealthResponseSchema,
  RehabPhasesSetSchema,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer, InjuryRecord } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import {
  audit,
  body,
  error,
  errors,
  guardFor,
  idParam,
  json,
  requirePlayerVisible,
  tenantOf,
  todayOf,
  type RouteCtx,
  type Tenant,
} from "./training-support.ts";

/**
 * Salud (Bloque 24, ADR 0038): consentimiento, lesiones con diagnóstico y fases de readaptación.
 * Categoría especial del RGPD: leer pide `org.health.read` (fisioterapia y preparación física;
 * la administración, solo por excepción) y escribir, `org.health.write` (fisioterapia). Cada
 * lectura queda en la auditoría. Sin consentimiento vigente no se registra ninguna lesión: el
 * deportista solo tiene disponibilidad, que no es un dato de salud.
 */
export function createPlayerHealthRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const guard = guardFor(config, data);
  for (const path of [
    "/api/org/players/:id/health",
    "/api/org/players/:id/health/*",
    "/api/org/injuries/*",
  ])
    app.use(path, guard);

  const read = requirePermission("org.health.read");
  const write = requirePermission("org.health.write");

  const injuryDto = (i: InjuryRecord, today: string) => {
    const daysOut = Math.max(0, daysBetween(i.occurredOn, i.returnedOn ?? today));
    const { playerId: _p, ...rest } = i;
    return { ...rest, daysOut, severity: injurySeverity(daysOut) };
  };

  async function healthResponse(c: RouteCtx, tenant: Tenant, playerId: string) {
    const today = todayOf(tenant);
    const [consent, injuries] = await Promise.all([
      data.health.consentOf(tenant.scope, playerId),
      data.health.injuriesOf(tenant.scope, playerId),
    ]);
    return {
      consent,
      currentTextVersion: HEALTH_CONSENT_TEXT_VERSION,
      injuries: injuries.map((i) => injuryDto(i, today)),
      access: { write: c.get("actor").permissions.has("org.health.write") },
    };
  }

  async function injuryOr404(c: RouteCtx, tenant: Tenant, id: string) {
    const injury = await data.health.injuryById(tenant.scope, id);
    if (!injury) throw notFound("Esa lesión no existe.");
    await requirePlayerVisible(data, c, tenant, injury.playerId);
    return injury;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/health",
      tags: ["Salud"],
      summary:
        "Salud de un deportista: consentimiento y lesiones con su readaptación. Cada lectura queda auditada",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      const response = await healthResponse(c, tenant, id);
      await audit(data, c, tenant, "health.viewed", id, { injuries: response.injuries.length });
      return c.json(response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/health/consent",
      tags: ["Salud"],
      summary:
        "Registra el consentimiento explícito para tratar datos de salud: quién, cuándo y con qué texto",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam, body: body(HealthConsentSetSchema) },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      const input = c.req.valid("json");
      const consent = await data.health.setConsent(tenant.scope, id, input, c.get("actor").userId);
      await audit(data, c, tenant, "health.consent_updated", id, {
        relationship: consent.relationship,
        textVersion: consent.textVersion,
      });
      return c.json(await healthResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/players/{id}/health/consent",
      tags: ["Salud"],
      summary: "Revoca el consentimiento: no se registran más lesiones hasta que se vuelva a dar",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      if (!(await data.health.revokeConsent(tenant.scope, id, todayOf(tenant))))
        throw notFound("No hay un consentimiento vigente.");
      await audit(data, c, tenant, "health.consent_revoked", id);
      return c.json(await healthResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players/{id}/health/injuries",
      tags: ["Salud"],
      summary: "Registra una lesión. Exige consentimiento vigente",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam, body: body(InjuryCreateSchema) },
      responses: {
        201: json("Salud", PlayerHealthResponseSchema),
        409: error("Sin consentimiento vigente"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requirePlayerVisible(data, c, tenant, id);
      if (!(await data.health.hasConsent(tenant.scope, id)))
        throw conflict("Sin consentimiento vigente no se registran datos de salud.");
      const input = c.req.valid("json");
      if (input.expectedReturnOn && input.expectedReturnOn < input.occurredOn)
        throw badRequest("La vuelta prevista no puede ser anterior a la lesión.");
      const injury = await data.health.createInjury(tenant.scope, id, input, c.get("actor").userId);
      await audit(data, c, tenant, "injury.created", id, {
        bodyArea: injury.bodyArea,
        kind: injury.kind,
      });
      return c.json(await healthResponse(c, tenant, id), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/injuries/{id}",
      tags: ["Salud"],
      summary: "Edita una lesión: diagnóstico, estado, vuelta prevista o real",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam, body: body(InjuryUpdateSchema) },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const injury = await injuryOr404(c, tenant, c.req.valid("param").id);
      const patch = c.req.valid("json");
      const occurredOn = patch.occurredOn ?? injury.occurredOn;
      if (patch.returnedOn && patch.returnedOn < occurredOn)
        throw badRequest("La vuelta no puede ser anterior a la lesión.");
      await data.health.updateInjury(tenant.scope, injury.id, patch);
      await audit(data, c, tenant, "injury.updated", injury.playerId, {
        fields: Object.keys(patch).filter((k) => k !== "diagnosis" && k !== "clinicalNotes"),
      });
      return c.json(await healthResponse(c, tenant, injury.playerId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/injuries/{id}/phases",
      tags: ["Salud"],
      summary: "Fases de readaptación de una lesión, en orden",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam, body: body(RehabPhasesSetSchema) },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const injury = await injuryOr404(c, tenant, c.req.valid("param").id);
      const input = c.req.valid("json");
      await data.health.setPhases(tenant.scope, injury.id, input);
      await audit(data, c, tenant, "injury.phases_updated", injury.playerId, {
        phases: input.phases.length,
      });
      return c.json(await healthResponse(c, tenant, injury.playerId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/injuries/{id}",
      tags: ["Salud"],
      summary: "Borra una lesión registrada por error",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: { 200: json("Salud", PlayerHealthResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const injury = await injuryOr404(c, tenant, c.req.valid("param").id);
      await data.health.removeInjury(tenant.scope, injury.id);
      await audit(data, c, tenant, "injury.removed", injury.playerId);
      return c.json(await healthResponse(c, tenant, injury.playerId), 200);
    },
  );

  return app;
}
