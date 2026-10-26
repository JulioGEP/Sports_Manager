import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  aiQuotaResetsOn,
  AiWodGenerationResponseSchema,
  AiWodRequestSchema,
  weekStartOf,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { AiWodRecord, DataLayer } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { aiUnavailable, badRequest, forbidden, notFound, quotaExceeded } from "../http/errors.ts";
import { dispatchGeneration } from "../services/ai-drafts.ts";
import { buildWodContext } from "../services/ai-wods.ts";
import {
  auditOf,
  body,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  json,
  orgOf,
  todayIn,
  type Ctx,
} from "./fitness-common.ts";

/**
 * Propuesta de WOD con IA (ADR 0049). La pide quien programa la disciplina (el coach de sus clases
 * o quien escribe toda la programación) para un día; se genera en segundo plano con la cuota
 * semanal del club (ADR 0044) y el coach la carga en el editor, la revisa y la guarda él: la
 * propuesta nunca publica nada por su cuenta.
 */
export function createFitnessAiRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  app.use("/api/org/ai-wods", ...chain);
  app.use("/api/org/ai-wods/*", ...chain);
  const audit = auditOf(data);
  const read = requirePermission("org.training.read");

  /** Mismas reglas que para guardar un WOD: toda la programación, o la de sus clases. */
  async function canProgram(c: Ctx, sectionId: string): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.training.write")) return true;
    if (!actor.permissions.has("org.training.write_own")) return false;
    const tenant = orgOf(c);
    const own = await data.memberships.ownTeamIds(tenant.scope, actor.userId);
    const season = await data.seasons.current(tenant.scope);
    const teams = season ? await data.teams.list(tenant.scope, season.id, sectionId, own) : [];
    return teams.length > 0;
  }

  const isAvailable = (c: Ctx) =>
    config.ai.configured && data.aiModel !== null && orgOf(c).organization.aiWeeklyQuota > 0;

  async function quotaOf(c: Ctx) {
    const tenant = orgOf(c);
    const from = weekStartOf(todayIn(tenant.organization.timezone));
    const used = await data.ai.usedThisWeek(tenant.scope, from);
    const limit = tenant.organization.aiWeeklyQuota;
    return { limit, used, remaining: Math.max(0, limit - used), resetsOn: aiQuotaResetsOn(from) };
  }

  async function responseOf(c: Ctx, g: AiWodRecord) {
    return {
      generation: {
        id: g.id,
        status: g.status,
        failure: g.failure,
        onDate: g.request.onDate,
        section: g.section,
        team: g.team,
        proposal: g.status === "ready" ? g.proposal : null,
        quota: await quotaOf(c),
      },
    };
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/ai-wods",
      tags: ["Fitness"],
      summary:
        "Pide a la IA el WOD de un día de una disciplina (y, si se quiere, de un tipo de clase). Gasta una de las llamadas semanales del club",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: body(AiWodRequestSchema),
      responses: {
        201: json("Propuesta pedida", AiWodGenerationResponseSchema),
        400: errorResponse("Disciplina o tipo de clase que no son del box"),
        429: errorResponse("Cuota semanal gastada"),
        503: errorResponse("La IA no está disponible en este club"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const sections = await data.fitness.fitnessSections(tenant.scope);
      const section = sections.find((s) => s.id === input.sectionId);
      if (!section)
        throw badRequest("Esa disciplina no es de este box o no tiene clases abiertas.");
      let team: { id: string; name: string } | null = null;
      if (input.teamId) {
        const found = await data.teams.byId(tenant.scope, input.teamId);
        if (
          !found ||
          found.bookingMode !== "open" ||
          found.status !== "active" ||
          found.section.id !== section.id
        )
          throw badRequest("Ese tipo de clase no es de esta disciplina.");
        team = { id: found.id, name: found.name };
      }
      if (!(await canProgram(c, section.id)))
        throw forbidden("Solo programas en las disciplinas de tus clases.");
      if (!isAvailable(c)) throw aiUnavailable();
      const locale = tenant.organization.defaultLocale as Locale;
      const [training, sports] = await Promise.all([
        data.training.sectionTraining(tenant.scope, section.id),
        data.sports.list(),
      ]);
      const sport =
        sports.find((s) => s.code === training?.sportCode)?.name[locale] ?? section.name;
      const context = await buildWodContext({
        data,
        scope: tenant.scope,
        timezone: tenant.organization.timezone,
        locale,
        section,
        sport,
        team,
        request: input,
      });
      const request = {
        sectionId: section.id,
        teamId: team?.id ?? null,
        onDate: input.onDate,
        focus: context.focus,
        durationMinutes: context.minutes,
      };
      const reserved = await data.ai.reserve(tenant.scope, {
        kind: "wod",
        sectionId: section.id,
        teamId: team?.id ?? null,
        requestedBy: c.get("sessionUser").id,
        weekStart: weekStartOf(todayIn(tenant.organization.timezone)),
        model: config.ai.model,
        request,
        context,
      });
      if (reserved === "quota_exceeded") throw quotaExceeded();
      await audit(c, "ai_wod.requested", team ? `${section.name} · ${team.name}` : section.name, {
        onDate: input.onDate,
      });
      const dispatched = await dispatchGeneration(
        config,
        data,
        reserved.id,
        new URL(c.req.url).origin,
      );
      if (!dispatched) await data.ai.markFailed(tenant.scope, reserved.id, "model_error");
      const generation = await data.ai.wodById(tenant.scope, reserved.id);
      if (!generation) throw notFound();
      return c.json(await responseOf(c, generation), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/ai-wods/{id}",
      tags: ["Fitness"],
      summary:
        "Estado de una propuesta de WOD con IA y, cuando está lista, los bloques para cargar en el editor",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Propuesta", AiWodGenerationResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const generation = await data.ai.wodById(tenant.scope, c.req.valid("param").id);
      if (!generation || !(await canProgram(c, generation.section.id)))
        throw notFound("Esa propuesta no existe.");
      return c.json(await responseOf(c, generation), 200);
    },
  );

  return app;
}
