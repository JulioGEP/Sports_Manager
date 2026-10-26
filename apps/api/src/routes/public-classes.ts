import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  PUBLIC_KEY_HEADER,
  PUBLIC_KEY_PATTERN,
  PUBLIC_KEY_QUERY,
  PublicClassesResponseSchema,
  PublicTrialRequestSchema,
  PublicTrialResponseSchema,
} from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const DAY = 86_400_000;

/**
 * La web del box (ADR 0049): su horario de clases y la petición de una clase de prueba, con la
 * misma clave publicable que el catálogo de la tienda (ADR 0041) y sin sesión. El horario solo dice
 * cuántas plazas quedan, nunca quién viene. La petición deja un lead con su consentimiento; la
 * misma persona no crea dos en un día.
 */
export function createPublicClassRoutes(_config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();

  const resolveKey: MiddlewareHandler<AppEnv> = async (c, next) => {
    const key = (c.req.header(PUBLIC_KEY_HEADER) ?? c.req.query(PUBLIC_KEY_QUERY) ?? "").trim();
    if (!PUBLIC_KEY_PATTERN.test(key))
      throw new ApiError(401, "unauthorized", "Falta la clave pública del club o no es válida.");
    const found = await data.store.publicKey.resolve(key);
    const resolved = found ? await data.organizations.findBySlug(found.slug) : null;
    if (!resolved)
      throw new ApiError(401, "unauthorized", "Esa clave pública no existe o está apagada.");
    if (resolved.organization.status !== "active") throw forbidden("Este club no está activo.");
    c.set("tenant", {
      kind: "organization",
      organization: resolved.organization,
      scope: resolved.scope,
    });
    await next();
  };
  app.use("/api/public/v1/classes", resolveKey);
  app.use("/api/public/v1/trials", resolveKey);

  const tenantOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/classes",
      tags: ["API pública"],
      summary:
        "Horario de clases abiertas de los próximos días (7 por defecto, hasta 14) con las plazas libres",
      request: {
        query: z.object({
          days: z.coerce.number().int().min(1).max(14).optional(),
          key: z.string().optional(),
        }),
      },
      responses: {
        200: json("Horario", PublicClassesResponseSchema),
        401: error("Sin clave o con una clave que no vale"),
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const days = c.req.valid("query").days ?? 7;
      const now = new Date();
      const classes = await data.bookings.classesBetween(
        tenant.scope,
        now,
        new Date(now.getTime() + days * DAY),
        tenant.organization.timezone,
      );
      return c.json(
        {
          club: {
            slug: tenant.organization.slug,
            name: tenant.organization.name,
            timezone: tenant.organization.timezone,
          },
          classes: classes.map((x) => ({
            id: x.id,
            title: x.title,
            startsAt: x.startsAt.toISOString(),
            endsAt: x.endsAt.toISOString(),
            discipline: x.section?.name ?? null,
            classType: x.team?.name ?? null,
            coach: x.coach?.name.split(" ")[0] ?? null,
            spotsLeft: x.capacity === null ? null : Math.max(0, x.capacity - x.booked),
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/trials",
      tags: ["API pública"],
      summary:
        "Pide una clase de prueba desde la web del box: deja una persona interesada con su contacto y, si la elige, su clase",
      request: {
        query: z.object({ key: z.string().optional() }),
        body: {
          content: { "application/json": { schema: PublicTrialRequestSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Recibida", PublicTrialResponseSchema),
        400: error("Datos incompletos o clase que no existe"),
        401: error("Sin clave o con una clave que no vale"),
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const input = c.req.valid("json");
      if (
        await data.community.leads.existsByEmail(
          tenant.scope,
          input.email,
          new Date(Date.now() - DAY),
        )
      )
        return c.json({ received: true as const }, 201);
      let trialEventId: string | null = null;
      if (input.eventId) {
        const cls = await data.bookings.classById(
          tenant.scope,
          input.eventId,
          tenant.organization.timezone,
        );
        if (!cls || cls.startsAt.getTime() < Date.now())
          throw badRequest("Esa clase no está en el horario.");
        trialEventId = cls.id;
      }
      const result = await data.community.leads.create(
        tenant.scope,
        {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          source: "web",
          trialEventId,
        },
        null,
      );
      if (result.outcome !== "created") throw badRequest("No se ha podido guardar la petición.");
      await data.audit.record({
        actorUserId: null,
        organizationId: tenant.organization.id,
        action: "lead.created",
        target: `${input.firstName} ${input.lastName}`,
        details: { source: "web" },
      });
      return c.json({ received: true as const }, 201);
    },
  );

  return app;
}
