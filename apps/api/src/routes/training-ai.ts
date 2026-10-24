import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  AiApplyResponseSchema,
  AiApplySchema,
  aiProfileBlocks,
  aiProfileFor,
  aiQuotaResetsOn,
  AiDraftConfigResponseSchema,
  AiDraftRequestSchema,
  AiGenerationResponseSchema,
  ageOn,
  defaultEmphasisFor,
  emphasisFor,
  playerDisplayName,
  SectionEquipmentCreateSchema,
  SectionEquipmentResponseSchema,
  SectionEquipmentUpdateSchema,
  weekStartOf,
  type AiCoachProfile,
  type RestrictionTag,
  type SessionItemInput,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  instantOf,
  localDate,
  type AiGenerationRecord,
  type DataLayer,
  type TeamRecord,
} from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import {
  aiUnavailable,
  badRequest,
  conflict,
  forbidden,
  notFound,
  quotaExceeded,
} from "../http/errors.ts";
import { buildAiContext, dispatchGeneration, isFormativeTeam } from "../services/ai-drafts.ts";
import {
  actorOf,
  audit,
  blocksFor,
  body,
  buildTeamInsights,
  canPlan,
  error,
  errors,
  guardFor,
  idParam,
  json,
  localeOf,
  requireSectionVisible,
  teamOr404,
  tenantOf,
  todayOf,
  visibleOf,
  type RouteCtx,
  type Tenant,
} from "./training-support.ts";

const DateQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const blockLabelsOf = (profile: AiCoachProfile) =>
  aiProfileBlocks(profile).map((block) => ({ block, label: profile.blocks[block]!.label }));

/**
 * Propuesta de sesión con IA (ADR 0044). Pedirla y aplicarla es de quien planifica el equipo
 * (lleva la parte principal); verla, de quien lee el entrenamiento del equipo. El material de la
 * sección lo edita quien edita su biblioteca y su metodología.
 */
export function createTrainingAiRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const guard = guardFor(config, data);
  for (const path of [
    "/api/org/teams/:id/ai-config",
    "/api/org/teams/:id/ai-drafts",
    "/api/org/ai-drafts/*",
    "/api/org/sections/:id/equipment",
    "/api/org/sections/:id/equipment/*",
  ])
    app.use(path, guard);

  const read = requirePermission("org.training.read");
  const library = requirePermission("org.training.library");

  /** Ventana de la cuota: la semana del club que empieza el lunes. */
  const weekOf = (tenant: Tenant) => weekStartOf(todayOf(tenant));
  const isAvailable = (tenant: Tenant) =>
    config.ai.configured && data.aiModel !== null && tenant.organization.aiWeeklyQuota > 0;

  async function quotaOf(tenant: Tenant) {
    const from = weekOf(tenant);
    const used = await data.ai.usedThisWeek(tenant.scope, from);
    const limit = tenant.organization.aiWeeklyQuota;
    return { limit, used, remaining: Math.max(0, limit - used), resetsOn: aiQuotaResetsOn(from) };
  }

  /** Perfil de coach del equipo: el del deporte de su sección, en formación o no. */
  async function profileOf(tenant: Tenant, team: TeamRecord, date: string) {
    const section = await data.training.sectionTraining(tenant.scope, team.section.id);
    if (!section) throw notFound("Esa sección no existe.");
    const roster = (await data.teams.roster(tenant.scope, team.id)).filter(
      (r) => r.status === "active",
    );
    const formative = isFormativeTeam(
      section.settings,
      roster.map((r) => ageOn(r.birthDate, new Date(`${date}T12:00:00Z`))),
    );
    return { section, formative, profile: aiProfileFor(section.sportCode, formative) };
  }

  function summaryDto(g: AiGenerationRecord) {
    return {
      id: g.id,
      status: g.status,
      failure: g.failure,
      createdAt: g.createdAt.toISOString(),
      appliedAt: g.appliedAt?.toISOString() ?? null,
      requestedBy: g.requestedBy?.name ?? null,
      dates: g.context.sessions.map((s) => s.date),
    };
  }

  async function generationResponse(c: RouteCtx, tenant: Tenant, g: AiGenerationRecord) {
    const team = await teamOr404(data, c, tenant, g.team.id);
    const roster = await data.teams.roster(tenant.scope, team.id);
    const proposal = g.proposal;
    const drillIds = new Set(
      (proposal?.sessions ?? []).flatMap((s) =>
        s.blocks.flatMap((b) => b.items.map((i) => i.drillId).filter((id): id is string => !!id)),
      ),
    );
    const planned: { eventId: string; sessionId: string }[] = [];
    for (const s of proposal?.sessions ?? []) {
      const session = await data.training.sessionByEvent(tenant.scope, s.eventId);
      if (!session) continue;
      const blocks = new Set(s.blocks.map((b) => b.block));
      const items = await data.training.itemsOf(tenant.scope, [session.id]);
      if (items.some((i) => blocks.has(i.block)))
        planned.push({ eventId: s.eventId, sessionId: session.id });
    }
    const profile = g.context.profile;
    return {
      generation: {
        ...summaryDto(g),
        team: { id: team.id, name: team.name },
        request: {
          eventIds: g.request.eventIds,
          objective: g.request.objective ?? null,
          emphasis: g.request.emphasis,
          intensity: g.request.intensity,
          context: g.request.context ?? null,
          libraryOnly: g.request.libraryOnly ?? false,
          includeVariants: g.request.includeVariants ?? true,
        },
        profile: { code: profile.code, name: profile.name },
        blockLabels: blockLabelsOf(profile),
        proposal,
        finishedAt: g.finishedAt?.toISOString() ?? null,
        planned,
      },
      lookups: {
        players: roster.map((r) => ({ id: r.playerId, name: playerDisplayName(r) })),
        contents: g.context.contents.map((ct) => ({ id: ct.id, name: ct.name, kind: ct.kind })),
        drills: g.context.library
          .filter((d) => drillIds.has(d.id))
          .map((d) => ({ id: d.id, name: d.name })),
      },
      access: { apply: g.status === "ready" && canPlan(c.get("actor"), team) },
    };
  }

  // --- Formulario ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/ai-config",
      tags: ["Entrenamiento con IA"],
      summary:
        "Lo que necesita el formulario de la propuesta con IA: perfil de coach, cuota, material y entrenamientos de la semana",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, query: DateQuery },
      responses: { 200: json("Configuración", AiDraftConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const team = await teamOr404(data, c, tenant, c.req.valid("param").id);
      const tz = tenant.organization.timezone;
      const date = c.req.valid("query").date ?? todayOf(tenant);
      const from = weekStartOf(date);
      const { section, profile } = await profileOf(tenant, team, date);
      const [quota, equipment, events, sessions, recent] = await Promise.all([
        quotaOf(tenant),
        data.ai.equipmentOf(tenant.scope, section.id),
        data.training.teamEvents(
          tenant.scope,
          team.id,
          instantOf(tz, from),
          instantOf(tz, addDays(from, 7)),
        ),
        data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, from),
          instantOf(tz, addDays(from, 7)),
        ),
        data.ai.listForTeam(tenant.scope, team.id),
      ]);
      const items = await data.training.itemsOf(
        tenant.scope,
        sessions.map((s) => s.id),
      );
      const sessionOf = new Map(sessions.map((s) => [s.eventId, s]));
      return c.json(
        {
          available: isAvailable(tenant),
          configured: config.ai.configured,
          profile: {
            code: profile.code,
            name: profile.name,
            axes: profile.axes.map((a) => ({ code: a.code, label: a.label })),
            defaultEmphasis: defaultEmphasisFor(
              profile,
              section.settings.methodology[team.categoryId],
            ),
            blocks: blockLabelsOf(profile),
          },
          quota,
          equipment,
          week: {
            from,
            events: events
              .filter((e) => e.kind === "training")
              .map((e) => {
                const session = sessionOf.get(e.id) ?? null;
                return {
                  id: e.id,
                  date: localDate(tz, e.startsAt),
                  startsAt: e.startsAt.toISOString(),
                  endsAt: e.endsAt.toISOString(),
                  facility: e.facility,
                  sessionId: session?.id ?? null,
                  status: session?.status ?? null,
                  itemsCount: session ? items.filter((i) => i.sessionId === session.id).length : 0,
                };
              }),
          },
          recent: recent.map(summaryDto),
          access: { request: canPlan(c.get("actor"), team) },
        },
        200,
      );
    },
  );

  // --- Pedir una propuesta ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/ai-drafts",
      tags: ["Entrenamiento con IA"],
      summary:
        "Pide a la IA una propuesta para uno o varios entrenamientos del equipo. Gasta una de las llamadas semanales del club",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(AiDraftRequestSchema) },
      responses: {
        201: json("Propuesta pedida", AiGenerationResponseSchema),
        400: error("Entrenamiento desconocido o balance que no encaja con el perfil"),
        429: error("Cuota semanal gastada"),
        503: error("La IA no está disponible en este club"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const team = await teamOr404(data, c, tenant, c.req.valid("param").id);
      const actor = actorOf(c);
      if (!canPlan(actor, team)) throw forbidden();
      if (!isAvailable(tenant)) throw aiUnavailable();
      const request = c.req.valid("json");
      const eventIds = [...new Set(request.eventIds)];
      const events = await data.ai.trainingEvents(tenant.scope, team.id, eventIds);
      if (events.length !== eventIds.length)
        throw badRequest("Algún entrenamiento no es de este equipo.");
      const tz = tenant.organization.timezone;
      const firstDate = localDate(tz, events[0]!.startsAt);
      const { section, formative, profile } = await profileOf(tenant, team, firstDate);
      const emphasis = emphasisFor(profile, request.emphasis);
      if (!emphasis) throw badRequest("El balance no encaja con los ejes de esta sección.");
      const locale = localeOf(c, tenant);
      // Las recomendaciones primero: aseguran el catálogo y la biblioteca de arranque de la sección.
      const { insights, contents } = await buildTeamInsights(data, c, tenant, team, firstDate);
      const [drills, sports] = await Promise.all([
        data.training.listDrills(tenant.scope, {
          visible: await visibleOf(data, c),
          userId: actor.userId,
          sectionId: section.id,
          teamId: team.id,
        }),
        data.sports.list(),
      ]);
      const context = await buildAiContext({
        data,
        scope: tenant.scope,
        timezone: tz,
        locale,
        team,
        sport: {
          code: section.sportCode,
          name: sports.find((s) => s.code === section.sportCode)?.name.es ?? section.sportCode,
        },
        settings: section.settings,
        formative,
        request: { ...request, eventIds },
        emphasis,
        events,
        insights,
        contents,
        library: drills,
      });
      const reserved = await data.ai.reserve(tenant.scope, {
        sectionId: section.id,
        teamId: team.id,
        requestedBy: c.get("sessionUser").id,
        weekStart: weekOf(tenant),
        profileCode: profile.code,
        profileVersion: profile.version,
        model: config.ai.model,
        request: { ...request, eventIds },
        context,
      });
      if (reserved === "quota_exceeded") throw quotaExceeded();
      await audit(data, c, tenant, "ai_draft.requested", team.name, {
        sessions: events.length,
        profile: profile.code,
      });
      const dispatched = await dispatchGeneration(
        config,
        data,
        reserved.id,
        new URL(c.req.url).origin,
      );
      if (!dispatched) await data.ai.markFailed(tenant.scope, reserved.id, "model_error");
      const generation = await data.ai.byId(tenant.scope, reserved.id);
      return c.json(await generationResponse(c, tenant, generation!), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/ai-drafts/{id}",
      tags: ["Entrenamiento con IA"],
      summary: "Una propuesta: su estado y, cuando está lista, el borrador con el porqué",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Propuesta", AiGenerationResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const generation = await data.ai.byId(tenant.scope, c.req.valid("param").id);
      if (!generation) throw notFound("Esa propuesta no existe.");
      return c.json(await generationResponse(c, tenant, generation), 200);
    },
  );

  // --- Aplicar ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/ai-drafts/{id}/apply",
      tags: ["Entrenamiento con IA"],
      summary:
        "Pasa la propuesta a las sesiones como borrador: crea la sesión si no existe y sustituye las tareas de los bloques propuestos",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(AiApplySchema) },
      responses: {
        200: json("Aplicada", AiApplyResponseSchema),
        409: error("La propuesta no está lista"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const generation = await data.ai.byId(tenant.scope, c.req.valid("param").id);
      if (!generation) throw notFound("Esa propuesta no existe.");
      const team = await teamOr404(data, c, tenant, generation.team.id);
      const actor = actorOf(c);
      if (!canPlan(actor, team)) throw forbidden();
      if (generation.status !== "ready" || !generation.proposal)
        throw conflict("La propuesta todavía no está lista.");
      const input = c.req.valid("json");
      const chosen = generation.proposal.sessions.filter(
        (s) => !input.eventIds || input.eventIds.includes(s.eventId),
      );
      if (chosen.length === 0) throw badRequest("Ninguna de esas sesiones está en la propuesta.");
      const tz = tenant.organization.timezone;
      const editable = new Set(blocksFor(actor, team));
      const roster = new Set(
        (await data.teams.roster(tenant.scope, team.id)).map((r) => r.playerId),
      );
      const applied: { eventId: string; sessionId: string }[] = [];
      let items = 0;
      let drillsCreated = 0;
      // La misma tarea nueva en varias sesiones de la semana entra una sola vez en la biblioteca.
      const createdByTitle = new Map<string, string>();
      for (const proposed of chosen) {
        let session = await data.training.sessionByEvent(tenant.scope, proposed.eventId);
        if (session && session.team.id !== team.id) continue;
        if (!session) {
          const created = await data.training.createSession(
            tenant.scope,
            team.id,
            {
              eventId: proposed.eventId,
              objective: proposed.objective,
              targetRpe: proposed.targetRpe,
              status: "draft",
            },
            { timezone: tz, createdBy: actor.userId, title: `Entrenamiento ${team.name}` },
          );
          if (typeof created === "string") continue;
          session = created;
        }
        await data.training.updateSession(tenant.scope, session.id, {
          objective: proposed.objective,
          targetRpe: proposed.targetRpe,
          contentIds: proposed.contentIds,
        });
        for (const { block, items: list } of proposed.blocks) {
          if (!editable.has(block)) continue;
          const inputs: SessionItemInput[] = [];
          const tags: RestrictionTag[][] = [];
          for (const item of list) {
            let drillId = item.drillId ?? createdByTitle.get(item.title.toLowerCase()) ?? null;
            if (!drillId && item.newDrill && input.saveNewDrills) {
              const drill = await data.training.createDrill(
                tenant.scope,
                {
                  scope: "team",
                  sectionId: team.section.id,
                  teamId: team.id,
                  name: item.title,
                  description: item.newDrill.description,
                  rules: item.newDrill.rules,
                  coachingPoints: item.newDrill.coachingPoints,
                  variants: item.newDrill.variants,
                  format: item.newDrill.format,
                  space: item.newDrill.space,
                  playersMin: item.newDrill.playersMin,
                  playersMax: item.newDrill.playersMax,
                  durationMin: item.minutes,
                  targetRpe: item.targetRpe,
                  material: item.newDrill.material,
                  restrictionTags: item.newDrill.restrictionTags,
                  contentIds: item.contentIds,
                },
                actor.userId,
              );
              if (typeof drill !== "string") {
                drillId = drill.id;
                drillsCreated += 1;
                createdByTitle.set(item.title.toLowerCase(), drill.id);
              }
            }
            inputs.push({
              drillId,
              title: item.title,
              minutes: item.minutes,
              sets: item.sets,
              reps: item.reps,
              restSec: item.restSec,
              targetRpe: item.targetRpe,
              groupLabel: item.groupLabel,
              playerIds: item.playerIds ? item.playerIds.filter((p) => roster.has(p)) : null,
              // Sin contenidos propios, los de la tarea de la biblioteca.
              ...(item.contentIds.length > 0 || !drillId ? { contentIds: item.contentIds } : {}),
              notes: item.notes,
            });
            tags.push(item.restrictionTags);
          }
          const ai = { generationId: generation.id, tags };
          let saved = await data.training.replaceBlock(
            tenant.scope,
            session.id,
            block,
            inputs,
            actor.userId,
            ai,
          );
          // Una tarea de la biblioteca borrada desde que se pidió la propuesta queda como libre.
          if (saved === "unknown_drill")
            saved = await data.training.replaceBlock(
              tenant.scope,
              session.id,
              block,
              inputs.map((i) =>
                i.drillId && ![...createdByTitle.values()].includes(i.drillId)
                  ? { ...i, drillId: null }
                  : i,
              ),
              actor.userId,
              ai,
            );
          if (saved === "saved") items += inputs.length;
        }
        applied.push({ eventId: proposed.eventId, sessionId: session.id });
      }
      await data.ai.markApplied(tenant.scope, generation.id, c.get("sessionUser").id, items);
      await audit(data, c, tenant, "ai_draft.applied", team.name, {
        sessions: applied.length,
        items,
        drillsCreated,
      });
      return c.json({ sessions: applied, drillsCreated }, 200);
    },
  );

  // --- Material de la sección ---

  const equipmentParams = z.object({ id: z.string().uuid(), equipmentId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections/{id}/equipment",
      tags: ["Entrenamiento con IA"],
      summary: "Añade material al inventario de la sección",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: idParam, body: body(SectionEquipmentCreateSchema) },
      responses: {
        201: json("Material", SectionEquipmentResponseSchema),
        409: error("Ya hay material con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      if (!(await data.training.sectionTraining(tenant.scope, id)))
        throw notFound("Esa sección no existe.");
      const created = await data.ai.createEquipment(tenant.scope, id, c.req.valid("json"));
      if (created === "exists") throw conflict("Ya hay material con ese nombre en la sección.");
      await audit(data, c, tenant, "section_equipment.created", created.name);
      return c.json({ equipment: created }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}/equipment/{equipmentId}",
      tags: ["Entrenamiento con IA"],
      summary: "Cambia el nombre, la cantidad o las notas de un material",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: equipmentParams, body: body(SectionEquipmentUpdateSchema) },
      responses: {
        200: json("Material", SectionEquipmentResponseSchema),
        409: error("Ya hay material con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, equipmentId } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      const updated = await data.ai.updateEquipment(
        tenant.scope,
        id,
        equipmentId,
        c.req.valid("json"),
      );
      if (updated === "exists") throw conflict("Ya hay material con ese nombre en la sección.");
      if (!updated) throw notFound("Ese material no existe.");
      await audit(data, c, tenant, "section_equipment.updated", updated.name);
      return c.json({ equipment: updated }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sections/{id}/equipment/{equipmentId}",
      tags: ["Entrenamiento con IA"],
      summary: "Quita material del inventario de la sección",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: equipmentParams },
      responses: { 204: { description: "Quitado" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, equipmentId } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      if (!(await data.ai.removeEquipment(tenant.scope, id, equipmentId)))
        throw notFound("Ese material no existe.");
      await audit(data, c, tenant, "section_equipment.removed", equipmentId);
      return c.body(null, 204);
    },
  );

  return app;
}
