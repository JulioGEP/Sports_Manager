import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  addDays,
  DrillCreateSchema,
  DrillResponseSchema,
  DrillsResponseSchema,
  DrillUpdateSchema,
  InsightFeedbackSchema,
  MethodologyResponseSchema,
  MicrocycleTemplateResponseSchema,
  MicrocycleTemplateSetSchema,
  playerDisplayName,
  SessionBlockSchema,
  SessionBlockSetSchema,
  SessionCloseSchema,
  SessionCopySchema,
  SessionCreateSchema,
  SessionDetailResponseSchema,
  SessionUpdateSchema,
  TeamInsightsResponseSchema,
  TeamSeasonResponseSchema,
  TeamSessionsResponseSchema,
  TeamWeekResponseSchema,
  TRAINING_CONTENT_KINDS,
  TrainingConfigResponseSchema,
  TrainingContentCreateSchema,
  TrainingContentUpdateSchema,
  TrainingCycleCreateSchema,
  TrainingCycleUpdateSchema,
  TrainingPlanSetSchema,
  TrainingSettingsPatchSchema,
  weekDays,
  weekStartOf,
  WeekCopySchema,
  WeekTemplateApplySchema,
  type DrillScope,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  instantOf,
  localDate,
  playerPhotoUrlFor,
  plannedOf,
  type DataLayer,
  type DrillRecord,
  type LoadRecord,
  type SessionRecord,
  type TeamRecord,
} from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  actualLoadOf,
  audit,
  availabilityDto,
  blocksFor,
  body,
  buildTeamInsights,
  canPlan,
  canWriteLoad,
  contentDto,
  error,
  errors,
  guardFor,
  idParam,
  insightDto,
  itemDto,
  json,
  localeOf,
  mdLabeler,
  requireSectionVisible,
  restrictedOf,
  sessionSummaryDto,
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

/**
 * Planificación de entrenamientos (bloques 21, 22, 23 y 26, ADR 0038). Leer la planificación,
 * la biblioteca y las recomendaciones pide `org.training.read`; planificar, `org.training.write`
 * (cualquier equipo del ámbito) o `org.training.write_own` (sus equipos, por bloques según el
 * papel en el cuerpo técnico); la biblioteca del club y la metodología, `org.training.library`.
 */
export function createTrainingRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const guard = guardFor(config, data);
  for (const path of [
    "/api/org/sections/:id/training-config",
    "/api/org/sections/:id/training-contents",
    "/api/org/sections/:id/training-contents/*",
    "/api/org/sections/:id/microcycle-templates",
    "/api/org/sections/:id/microcycle-templates/*",
    "/api/org/sections/:id/methodology",
    "/api/org/drills",
    "/api/org/drills/*",
    "/api/org/teams/:id/training/*",
    "/api/org/teams/:id/sessions",
    "/api/org/teams/:id/insights",
    "/api/org/teams/:id/insights/*",
    "/api/org/sessions/*",
    "/api/org/events/:id/session",
  ])
    app.use(path, guard);

  const read = requirePermission("org.training.read");
  const library = requirePermission("org.training.library");

  // --- Ajustes de la sección ---

  async function configResponse(c: RouteCtx, tenant: Tenant, sectionId: string) {
    const section = await data.training.sectionTraining(tenant.scope, sectionId);
    if (!section) throw notFound("Esa sección no existe.");
    const [contents, categories, templates] = await Promise.all([
      data.training.ensureCatalog(tenant.scope, sectionId, section.sportCode, localeOf(c, tenant)),
      data.training.categoriesOf(tenant.scope, sectionId),
      data.training.templatesOf(tenant.scope, sectionId),
    ]);
    return {
      section: { id: section.id, name: section.name, sportCode: section.sportCode },
      settings: section.settings,
      customized: section.customized,
      contents: contents.map(contentDto),
      categories,
      templates: templates.map(({ sectionId: _s, ...t }) => t),
      access: { configure: c.get("actor").permissions.has("org.training.library") },
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections/{id}/training-config",
      tags: ["Entrenamiento"],
      summary:
        "Ajustes de entrenamiento de una sección: seguimiento, umbrales, metodología, contenidos y semanas tipo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Ajustes", TrainingConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}/training-config",
      tags: ["Entrenamiento"],
      summary:
        "Cambia el seguimiento, los umbrales de las recomendaciones o la metodología de la sección",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: idParam, body: body(TrainingSettingsPatchSchema) },
      responses: { 200: json("Ajustes", TrainingConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      await requireSectionVisible(data, c, id);
      if (!(await data.training.updateSettings(tenant.scope, id, patch)))
        throw notFound("Esa sección no existe.");
      const response = await configResponse(c, tenant, id);
      await audit(data, c, tenant, "training_config.updated", response.section.name, patch);
      return c.json(response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections/{id}/training-contents",
      tags: ["Entrenamiento"],
      summary: "Añade un contenido de entrenamiento a la sección",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: idParam, body: body(TrainingContentCreateSchema) },
      responses: {
        201: json("Ajustes", TrainingConfigResponseSchema),
        409: error("Ya hay un contenido con esa clave"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      await requireSectionVisible(data, c, id);
      const result = await data.training.createContent(tenant.scope, id, input);
      if (result === "not_found") throw notFound("Esa sección no existe.");
      if (result === "code_taken")
        throw conflict("Ya hay un contenido con esa clave en la sección.");
      await audit(data, c, tenant, "training_content.created", result.name, { code: result.code });
      return c.json(await configResponse(c, tenant, id), 201);
    },
  );

  const contentParam = z.object({ id: z.string().uuid(), contentId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sections/{id}/training-contents/{contentId}",
      tags: ["Entrenamiento"],
      summary: "Edita un contenido: nombre, tipo, acciones que lo miden, orden o archivo",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: contentParam, body: body(TrainingContentUpdateSchema) },
      responses: { 200: json("Ajustes", TrainingConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, contentId } = c.req.valid("param");
      const patch = c.req.valid("json");
      await requireSectionVisible(data, c, id);
      const updated = await data.training.updateContent(tenant.scope, id, contentId, patch);
      if (!updated) throw notFound("Ese contenido no existe.");
      await audit(data, c, tenant, "training_content.updated", updated.name, patch);
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sections/{id}/training-contents/{contentId}",
      tags: ["Entrenamiento"],
      summary: "Quita un contenido; si ya se usa, se archiva",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: contentParam },
      responses: { 200: json("Ajustes", TrainingConfigResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, contentId } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      const outcome = await data.training.removeContent(tenant.scope, id, contentId);
      if (outcome === "not_found") throw notFound("Ese contenido no existe.");
      await audit(data, c, tenant, "training_content.removed", contentId, { outcome });
      return c.json(await configResponse(c, tenant, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sections/{id}/microcycle-templates",
      tags: ["Entrenamiento"],
      summary: "Crea una semana tipo de la sección",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: idParam, body: body(MicrocycleTemplateSetSchema) },
      responses: {
        201: json("Semana tipo", MicrocycleTemplateResponseSchema),
        409: error("Ya hay una semana tipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      await requireSectionVisible(data, c, id);
      if (!(await data.training.sectionTraining(tenant.scope, id)))
        throw notFound("Esa sección no existe.");
      const created = await data.training.createTemplate(tenant.scope, id, input);
      if (created === "name_taken") throw conflict("Ya hay una semana tipo con ese nombre.");
      await audit(data, c, tenant, "microcycle_template.created", created.name);
      const { sectionId: _s, ...template } = created;
      return c.json({ template }, 201);
    },
  );

  const templateParam = z.object({ id: z.string().uuid(), templateId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/sections/{id}/microcycle-templates/{templateId}",
      tags: ["Entrenamiento"],
      summary: "Cambia una semana tipo",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: templateParam, body: body(MicrocycleTemplateSetSchema) },
      responses: {
        200: json("Semana tipo", MicrocycleTemplateResponseSchema),
        409: error("Ya hay una semana tipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, templateId } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      const updated = await data.training.updateTemplate(
        tenant.scope,
        id,
        templateId,
        c.req.valid("json"),
      );
      if (updated === "name_taken") throw conflict("Ya hay una semana tipo con ese nombre.");
      if (!updated) throw notFound("Esa semana tipo no existe.");
      await audit(data, c, tenant, "microcycle_template.updated", updated.name);
      const { sectionId: _s, ...template } = updated;
      return c.json({ template }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sections/{id}/microcycle-templates/{templateId}",
      tags: ["Entrenamiento"],
      summary: "Quita una semana tipo",
      security: [{ sessionCookie: [] }],
      middleware: [library],
      request: { params: templateParam },
      responses: { 204: { description: "Quitada" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, templateId } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      if (!(await data.training.removeTemplate(tenant.scope, id, templateId)))
        throw notFound("Esa semana tipo no existe.");
      await audit(data, c, tenant, "microcycle_template.removed", templateId);
      return c.body(null, 204);
    },
  );

  // --- Biblioteca ---

  /** Editar una tarea: la biblioteca del club y de la sección, con `library`; la del equipo, quien planifica en él; la personal, quien la creó. */
  async function canEditDrill(c: RouteCtx, tenant: Tenant, drill: DrillRecord): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.kind !== "member") return false;
    if (drill.scope === "personal") return drill.owner?.userId === actor.userId;
    if (actor.permissions.has("org.training.library")) return true;
    if (drill.scope === "team" && drill.team) {
      const team = await data.teams.byId(tenant.scope, drill.team.id);
      return team ? canPlan(actor, team) || blocksFor(actor, team).length > 0 : false;
    }
    return false;
  }

  async function drillVisible(c: RouteCtx, drill: DrillRecord): Promise<boolean> {
    const actor = c.get("actor");
    if (drill.scope === "personal")
      return actor.kind === "member" && drill.owner?.userId === actor.userId;
    const visible = await visibleOf(data, c);
    if (!visible || drill.scope === "club") return true;
    if (drill.scope === "section")
      return !!drill.section && visible.sectionIds.includes(drill.section.id);
    return !!drill.team && visible.teamIds.includes(drill.team.id);
  }

  async function drillOr404(c: RouteCtx, tenant: Tenant, id: string) {
    const drill = await data.training.drillById(tenant.scope, id);
    if (!drill || !(await drillVisible(c, drill))) throw notFound("Esa tarea no existe.");
    return drill;
  }

  const drillSummaryDto = (d: DrillRecord, canEdit: boolean) => ({
    id: d.id,
    scope: d.scope,
    section: d.section,
    team: d.team,
    owner: d.owner,
    name: d.name,
    format: d.format,
    space: d.space,
    durationMin: d.durationMin,
    targetRpe: d.targetRpe,
    restrictionTags: d.restrictionTags,
    contents: d.contents,
    diagram: d.diagram,
    status: d.status,
    uses: d.uses,
    lastUsedOn: d.lastUsedOn,
    rating: d.rating,
    canEdit,
  });

  const DrillsQuery = z.object({
    section: z.string().uuid().optional(),
    team: z.string().uuid().optional(),
    content: z.string().uuid().optional(),
    q: z.string().max(80).optional(),
    archived: z.enum(["1"]).optional(),
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/drills",
      tags: ["Entrenamiento"],
      summary:
        "Biblioteca de tareas visible: del club, de las secciones y equipos del ámbito y las propias",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: DrillsQuery },
      responses: { 200: json("Biblioteca", DrillsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const query = c.req.valid("query");
      const actor = c.get("actor");
      const visible = await visibleOf(data, c);
      const [sections, seasons] = await Promise.all([
        data.sections.list(tenant.scope, null),
        data.seasons.current(tenant.scope),
      ]);
      const visibleSections = sections.filter((s) => !visible || visible.sectionIds.includes(s.id));
      // Cada sección visible nace con su catálogo y su biblioteca de arranque.
      for (const s of visibleSections) {
        const section = await data.training.sectionTraining(tenant.scope, s.id);
        if (section)
          await data.training.ensureCatalog(
            tenant.scope,
            s.id,
            section.sportCode,
            localeOf(c, tenant),
          );
      }
      const teams = seasons
        ? (await data.teams.list(tenant.scope, seasons.id)).filter(
            (t) => !visible || visible.teamIds.includes(t.id),
          )
        : [];
      const drills = await data.training.listDrills(tenant.scope, {
        visible,
        userId: actor.userId,
        sectionId: query.section,
        teamId: query.team,
        contentId: query.content,
        q: query.q,
        includeArchived: query.archived === "1",
      });
      const contents = await data.training.contentsOf(
        tenant.scope,
        visibleSections.map((s) => s.id),
      );
      const editable = await Promise.all(drills.map((d) => canEditDrill(c, tenant, d)));
      const create =
        actor.permissions.has("org.training.library") ||
        actor.permissions.has("org.training.write") ||
        actor.permissions.has("org.training.write_own");
      return c.json(
        {
          drills: drills.map((d, i) => drillSummaryDto(d, editable[i]!)),
          contents: contents.map(contentDto),
          sections: visibleSections.map((s) => ({ id: s.id, name: s.name })),
          teams: teams.map((t) => ({ id: t.id, name: t.name, sectionId: t.section.id })),
          access: { library: actor.permissions.has("org.training.library"), create },
        },
        200,
      );
    },
  );

  /** Comprueba quién puede crear o mover una tarea a un ámbito, y resuelve su sección. */
  async function resolveDrillScope(
    c: RouteCtx,
    tenant: Tenant,
    scope: DrillScope,
    sectionId: string | null | undefined,
    teamId: string | null | undefined,
  ): Promise<{ sectionId: string | null; teamId: string | null }> {
    const actor = c.get("actor");
    if (scope === "club") {
      if (!actor.permissions.has("org.training.library")) throw forbidden();
      return { sectionId: null, teamId: null };
    }
    if (scope === "section") {
      if (!actor.permissions.has("org.training.library")) throw forbidden();
      if (!sectionId) throw badRequest("Una tarea de sección necesita su sección.");
      await requireSectionVisible(data, c, sectionId);
      if (!(await data.training.sectionTraining(tenant.scope, sectionId)))
        throw notFound("Esa sección no existe.");
      return { sectionId, teamId: null };
    }
    if (scope === "team") {
      if (!teamId) throw badRequest("Una tarea de equipo necesita su equipo.");
      const team = await teamOr404(data, c, tenant, teamId);
      if (!actor.permissions.has("org.training.library") && blocksFor(actor, team).length === 0)
        throw forbidden();
      return { sectionId: team.section.id, teamId };
    }
    if (
      !actor.permissions.has("org.training.write") &&
      !actor.permissions.has("org.training.write_own") &&
      !actor.permissions.has("org.training.library")
    )
      throw forbidden();
    if (sectionId) await requireSectionVisible(data, c, sectionId);
    return { sectionId: sectionId ?? null, teamId: null };
  }

  async function drillResponse(c: RouteCtx, tenant: Tenant, drill: DrillRecord) {
    const [recent, sections] = await Promise.all([
      data.training.drillSessions(tenant.scope, drill.id, tenant.organization.timezone),
      drill.section
        ? Promise.resolve([drill.section.id])
        : data.sections.list(tenant.scope, null).then((l) => l.map((s) => s.id)),
    ]);
    const visible = await visibleOf(data, c);
    const contents = await data.training.contentsOf(
      tenant.scope,
      sections.filter((id) => !visible || visible.sectionIds.includes(id)),
    );
    const restricted = await restrictedOf(data, c);
    return {
      drill: {
        ...drillSummaryDto(drill, await canEditDrill(c, tenant, drill)),
        description: drill.description,
        rules: drill.rules,
        coachingPoints: drill.coachingPoints,
        variants: drill.variants,
        playersMin: drill.playersMin,
        playersMax: drill.playersMax,
        material: drill.material,
        videoUrl: drill.videoUrl,
        recentSessions: recent.filter((r) => !restricted || restricted.teamIds.includes(r.team.id)),
      },
      contents: contents.map(contentDto),
    };
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/drills",
      tags: ["Entrenamiento"],
      summary: "Crea una tarea en la biblioteca: del club, de una sección, de un equipo o personal",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { body: body(DrillCreateSchema) },
      responses: {
        201: json("Tarea", DrillResponseSchema),
        400: error("Contenido desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const input = c.req.valid("json");
      const where = await resolveDrillScope(c, tenant, input.scope, input.sectionId, input.teamId);
      const created = await data.training.createDrill(
        tenant.scope,
        { ...input, ...where },
        c.get("actor").userId,
      );
      if (created === "unknown_content") throw badRequest("Algún contenido no es de esa sección.");
      await audit(data, c, tenant, "drill.created", created.name, { scope: created.scope });
      return c.json(await drillResponse(c, tenant, created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/drills/{id}",
      tags: ["Entrenamiento"],
      summary: "Una tarea con su pizarra, su uso y las últimas sesiones en las que salió",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Tarea", DrillResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const drill = await drillOr404(c, tenant, c.req.valid("param").id);
      return c.json(await drillResponse(c, tenant, drill), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/drills/{id}",
      tags: ["Entrenamiento"],
      summary: "Edita una tarea, la mueve de ámbito o la archiva",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(DrillUpdateSchema) },
      responses: {
        200: json("Tarea", DrillResponseSchema),
        400: error("Contenido desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const drill = await drillOr404(c, tenant, id);
      if (!(await canEditDrill(c, tenant, drill))) throw forbidden();
      let where = {};
      if (patch.scope && patch.scope !== drill.scope)
        where = await resolveDrillScope(
          c,
          tenant,
          patch.scope,
          drill.section?.id ?? null,
          patch.teamId ?? drill.team?.id ?? null,
        );
      const { teamId: _t, ...rest } = patch;
      const updated = await data.training.updateDrill(tenant.scope, id, { ...rest, ...where });
      if (updated === "unknown_content") throw badRequest("Algún contenido no es de esa sección.");
      if (!updated) throw notFound("Esa tarea no existe.");
      await audit(data, c, tenant, "drill.updated", updated.name, Object.keys(patch));
      return c.json(await drillResponse(c, tenant, updated), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/drills/{id}",
      tags: ["Entrenamiento"],
      summary: "Quita una tarea; si alguna sesión la usa, se archiva",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 204: { description: "Quitada o archivada" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const drill = await drillOr404(c, tenant, id);
      if (!(await canEditDrill(c, tenant, drill))) throw forbidden();
      const outcome = await data.training.removeDrill(tenant.scope, id);
      await audit(data, c, tenant, "drill.removed", drill.name, { outcome });
      return c.body(null, 204);
    },
  );

  // --- Semana, temporada e histórico de un equipo ---

  async function matchDatesAround(tenant: Tenant, team: TeamRecord, from: string, to: string) {
    const tz = tenant.organization.timezone;
    const [events, matches] = await Promise.all([
      data.training.teamEvents(
        tenant.scope,
        team.id,
        instantOf(tz, from),
        instantOf(tz, addDays(to, 1)),
      ),
      data.matches.listForTeam(tenant.scope, team.id),
    ]);
    const dates = [
      ...events.filter((e) => e.kind === "match").map((e) => localDate(tz, e.startsAt)),
      ...matches.filter((m) => m.playedOn >= from && m.playedOn <= to).map((m) => m.playedOn),
    ];
    return { events, matches, label: mdLabeler(dates) };
  }

  async function sessionBundle(tenant: Tenant, sessions: SessionRecord[]) {
    const [items, loads] = await Promise.all([
      data.training.itemsOf(
        tenant.scope,
        sessions.map((s) => s.id),
      ),
      data.load.loadsForEvents(
        tenant.scope,
        sessions.map((s) => s.eventId),
      ),
    ]);
    const itemsOf = (id: string) => items.filter((i) => i.sessionId === id);
    const loadsOf = (eventId: string) => loads.filter((l) => l.eventId === eventId);
    return { items, loads, itemsOf, loadsOf };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/training/week",
      tags: ["Entrenamiento"],
      summary:
        "Semana de un equipo: sesiones, entrenamientos sin planificar, partidos, MD, disponibles y carga",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, query: DateQuery },
      responses: { 200: json("Semana", TeamWeekResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await teamOr404(data, c, tenant, id);
      const tz = tenant.organization.timezone;
      const date = c.req.valid("query").date ?? todayOf(tenant);
      const start = weekStartOf(date);
      const end = addDays(start, 6);
      const section = await data.training.sectionTraining(tenant.scope, team.section.id);
      if (!section) throw notFound("Esa sección no existe.");
      const [around, contents, templates, cycles, roster, history] = await Promise.all([
        matchDatesAround(tenant, team, addDays(start, -7), addDays(end, 7)),
        data.training.ensureCatalog(
          tenant.scope,
          section.id,
          section.sportCode,
          localeOf(c, tenant),
        ),
        data.training.templatesOf(tenant.scope, section.id),
        data.training.cyclesOfTeam(tenant.scope, team.id),
        data.teams.roster(tenant.scope, team.id),
        data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, addDays(start, -28)),
          instantOf(tz, addDays(end, 1)),
        ),
      ]);
      const bundle = await sessionBundle(tenant, history);
      const active = roster.filter((r) => r.status === "active").map((r) => r.playerId);
      const availability = await data.load.currentFor(tenant.scope, active);
      const counts = { total: active.length, available: 0, limited: 0, rehab: 0, out: 0 };
      for (const a of availability.values()) counts[a.status] += 1;
      const inRange = (s: SessionRecord, from: string, to: string) => {
        const d = localDate(tz, s.startsAt);
        return d >= from && d <= to && s.status !== "cancelled";
      };
      const weekSessions = history.filter((s) => inRange(s, start, end));
      const planned = weekSessions.reduce((a, s) => a + plannedOf(s, bundle.itemsOf(s.id)).load, 0);
      const actualValues = weekSessions
        .map((s) => actualLoadOf(bundle.loadsOf(s.eventId)))
        .filter((v): v is number => v !== null);
      const previous: number[] = [];
      for (let w = 1; w <= 4; w++) {
        const ws = addDays(start, -7 * w);
        const total = history
          .filter((s) => inRange(s, ws, addDays(ws, 6)))
          .reduce(
            (a, s) =>
              a +
              (actualLoadOf(bundle.loadsOf(s.eventId)) ?? plannedOf(s, bundle.itemsOf(s.id)).load),
            0,
          );
        if (total > 0) previous.push(total);
      }
      const matchesByEvent = new Map(
        around.matches.filter((m) => m.event).map((m) => [m.event!.id, m]),
      );
      const days = weekDays(start).map((day) => {
        const sessions = weekSessions.filter((s) => localDate(tz, s.startsAt) === day);
        const trainings = around.events.filter(
          (e) => e.kind === "training" && !e.sessionId && localDate(tz, e.startsAt) === day,
        );
        const agendaMatches = around.events.filter(
          (e) => e.kind === "match" && localDate(tz, e.startsAt) === day,
        );
        const recorded = around.matches.filter(
          (m) =>
            m.playedOn === day && !(m.event && agendaMatches.some((e) => e.id === m.event!.id)),
        );
        return {
          date: day,
          mdLabel: around.label(day),
          sessions: sessions.map((s) =>
            sessionSummaryDto(
              s,
              bundle.itemsOf(s.id),
              bundle.loadsOf(s.eventId),
              tz,
              around.label(day),
            ),
          ),
          trainings: trainings.map((e) => ({
            eventId: e.id,
            title: e.title,
            startsAt: e.startsAt.toISOString(),
            endsAt: e.endsAt.toISOString(),
            facility: e.facility,
          })),
          matches: [
            ...agendaMatches.map((e) => {
              const m = matchesByEvent.get(e.id);
              return {
                matchId: m?.id ?? null,
                eventId: e.id,
                opponent: e.opponent ?? m?.opponent ?? null,
                homeAway: (e.homeAway as "home" | "away" | null) ?? m?.homeAway ?? null,
                startsAt: e.startsAt.toISOString(),
                status: m?.status ?? null,
                ownScore: m?.ownScore ?? null,
                opponentScore: m?.opponentScore ?? null,
              };
            }),
            ...recorded.map((m) => ({
              matchId: m.id,
              eventId: null,
              opponent: m.opponent,
              homeAway: m.homeAway,
              startsAt: null,
              status: m.status,
              ownScore: m.ownScore,
              opponentScore: m.opponentScore,
            })),
          ],
        };
      });
      const cycle = cycles.find((cy) => cy.startsOn <= end && cy.endsOn >= start) ?? null;
      return c.json(
        {
          team: {
            id: team.id,
            name: team.name,
            section: { id: section.id, name: section.name, sportCode: section.sportCode },
          },
          week: { start, end },
          days,
          availability: counts,
          load: {
            planned,
            actual: actualValues.length > 0 ? actualValues.reduce((a, b) => a + b, 0) : null,
            baseline:
              previous.length > 0
                ? Math.round(previous.reduce((a, b) => a + b, 0) / previous.length)
                : null,
          },
          cycle: cycle
            ? { id: cycle.id, name: cycle.name, focusContentIds: cycle.focusContentIds }
            : null,
          templates: templates.map(({ sectionId: _s, ...t }) => t),
          contents: contents.map(contentDto),
          tracking: section.settings.tracking,
          access: { write: canPlan(c.get("actor"), team) },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/training/season",
      tags: ["Entrenamiento"],
      summary: "Plan de temporada: ciclos, carga planificada frente a real por semana y partidos",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Temporada", TeamSeasonResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await teamOr404(data, c, tenant, id);
      const tz = tenant.organization.timezone;
      const season = (await data.seasons.list(tenant.scope)).find((s) => s.id === team.season.id);
      if (!season) throw notFound("Esa temporada no existe.");
      const section = await data.training.sectionTraining(tenant.scope, team.section.id);
      const [plan, cycles, sessions, around, contents] = await Promise.all([
        data.training.planOf(tenant.scope, team.id, season.id),
        data.training.cyclesOfTeam(tenant.scope, team.id),
        data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, season.startsOn),
          instantOf(tz, addDays(season.endsOn, 1)),
        ),
        matchDatesAround(tenant, team, season.startsOn, season.endsOn),
        section
          ? data.training.ensureCatalog(
              tenant.scope,
              section.id,
              section.sportCode,
              localeOf(c, tenant),
            )
          : Promise.resolve([]),
      ]);
      const bundle = await sessionBundle(tenant, sessions);
      const fixtures = [
        ...around.events
          .filter((e) => e.kind === "match")
          .map((e) => {
            const m = around.matches.find((x) => x.event?.id === e.id);
            return {
              date: localDate(tz, e.startsAt),
              opponent: e.opponent ?? m?.opponent ?? null,
              matchId: m?.id ?? null,
              ownScore: m && m.status === "finished" ? m.ownScore : null,
              opponentScore: m && m.status === "finished" ? m.opponentScore : null,
            };
          }),
        ...around.matches
          .filter((m) => m.playedOn >= season.startsOn && m.playedOn <= season.endsOn)
          .filter((m) => !m.event || !around.events.some((e) => e.id === m.event!.id))
          .map((m) => ({
            date: m.playedOn,
            opponent: m.opponent,
            matchId: m.id,
            ownScore: m.status === "finished" ? m.ownScore : null,
            opponentScore: m.status === "finished" ? m.opponentScore : null,
          })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      const weeks = [];
      for (let w = weekStartOf(season.startsOn); w <= season.endsOn; w = addDays(w, 7)) {
        const inWeek = sessions.filter((s) => {
          const d = localDate(tz, s.startsAt);
          return d >= w && d <= addDays(w, 6) && s.status !== "cancelled";
        });
        const actuals = inWeek
          .map((s) => actualLoadOf(bundle.loadsOf(s.eventId)))
          .filter((v): v is number => v !== null);
        weeks.push({
          start: w,
          planned: inWeek.reduce((a, s) => a + plannedOf(s, bundle.itemsOf(s.id)).load, 0),
          actual: actuals.length > 0 ? actuals.reduce((a, b) => a + b, 0) : null,
          sessions: inWeek.length,
          matches: fixtures.filter((f) => f.date >= w && f.date <= addDays(w, 6)).length,
        });
      }
      return c.json(
        {
          team: { id: team.id, name: team.name },
          season: {
            id: season.id,
            name: season.name,
            startsOn: season.startsOn,
            endsOn: season.endsOn,
          },
          plan: plan ? { id: plan.id, name: plan.name, notes: plan.notes } : null,
          cycles: cycles.map(({ planId: _p, ...cy }) => cy),
          weeks,
          matches: fixtures,
          contents: contents.map(contentDto),
          access: { write: canPlan(c.get("actor"), team) },
        },
        200,
      );
    },
  );

  async function requirePlanner(c: RouteCtx, tenant: Tenant, teamId: string) {
    const team = await teamOr404(data, c, tenant, teamId);
    if (!canPlan(c.get("actor"), team)) throw forbidden();
    return team;
  }

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/teams/{id}/training/plan",
      tags: ["Entrenamiento"],
      summary: "Crea o cambia el plan de temporada del equipo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(TrainingPlanSetSchema) },
      responses: {
        200: json(
          "Plan",
          z.object({
            plan: z.object({ id: z.string(), name: z.string(), notes: z.string().nullable() }),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      const plan = await data.training.setPlan(
        tenant.scope,
        team.id,
        team.season.id,
        c.req.valid("json"),
      );
      await audit(data, c, tenant, "training_plan.updated", team.name, { name: plan.name });
      return c.json({ plan: { id: plan.id, name: plan.name, notes: plan.notes } }, 200);
    },
  );

  const CycleResponse = z.object({
    cycle: z.object({
      id: z.string(),
      name: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      focusContentIds: z.array(z.string()),
      targetWeeklyLoad: z.number().int().nullable(),
      notes: z.string().nullable(),
    }),
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/training/cycles",
      tags: ["Entrenamiento"],
      summary: "Añade un ciclo al plan de temporada (lo crea si no existe)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(TrainingCycleCreateSchema) },
      responses: {
        201: json("Ciclo", CycleResponse),
        400: error("Contenido desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      const created = await data.training.createCycle(
        tenant.scope,
        team.id,
        team.season.id,
        c.req.valid("json"),
        `Plan ${team.season.name}`,
      );
      if (created === "unknown_content")
        throw badRequest("Algún contenido no es de la sección del equipo.");
      await audit(data, c, tenant, "training_cycle.created", `${team.name} · ${created.name}`);
      const { planId: _p, ...cycle } = created;
      return c.json({ cycle }, 201);
    },
  );

  const cycleParam = z.object({ id: z.string().uuid(), cycleId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/teams/{id}/training/cycles/{cycleId}",
      tags: ["Entrenamiento"],
      summary: "Cambia un ciclo: nombre, fechas, foco de contenidos o carga objetivo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: cycleParam, body: body(TrainingCycleUpdateSchema) },
      responses: {
        200: json("Ciclo", CycleResponse),
        400: error("Fechas o contenidos no válidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, cycleId } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      const updated = await data.training.updateCycle(
        tenant.scope,
        team.id,
        cycleId,
        c.req.valid("json"),
      );
      if (updated === "unknown_content")
        throw badRequest("Algún contenido no es de la sección del equipo.");
      if (updated === "invalid_dates")
        throw badRequest("El ciclo tiene que acabar después de empezar.");
      if (!updated) throw notFound("Ese ciclo no existe.");
      await audit(data, c, tenant, "training_cycle.updated", `${team.name} · ${updated.name}`);
      const { planId: _p, ...cycle } = updated;
      return c.json({ cycle }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/teams/{id}/training/cycles/{cycleId}",
      tags: ["Entrenamiento"],
      summary: "Quita un ciclo del plan",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: cycleParam },
      responses: { 204: { description: "Quitado" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, cycleId } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      if (!(await data.training.removeCycle(tenant.scope, team.id, cycleId)))
        throw notFound("Ese ciclo no existe.");
      await audit(data, c, tenant, "training_cycle.removed", `${team.name} · ${cycleId}`);
      return c.body(null, 204);
    },
  );

  const WeekResult = z.object({ sessions: z.number().int() });

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/training/week/copy",
      tags: ["Entrenamiento"],
      summary:
        "Copia la planificación de una semana en otra: por etiqueta MD y, si no, por día de la semana",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(WeekCopySchema) },
      responses: { 200: json("Copia", WeekResult), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      const tz = tenant.organization.timezone;
      const input = c.req.valid("json");
      const fromStart = weekStartOf(input.from);
      const toStart = weekStartOf(input.to);
      const [sourceSessions, around] = await Promise.all([
        data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, fromStart),
          instantOf(tz, addDays(fromStart, 7)),
        ),
        matchDatesAround(
          tenant,
          team,
          addDays(fromStart < toStart ? fromStart : toStart, -7),
          addDays(fromStart > toStart ? fromStart : toStart, 13),
        ),
      ]);
      const targetTrainings = around.events.filter((e) => {
        const d = localDate(tz, e.startsAt);
        return e.kind === "training" && d >= toStart && d <= addDays(toStart, 6);
      });
      let copied = 0;
      const used = new Set<string>();
      for (const source of sourceSessions) {
        const sourceDay = localDate(tz, source.startsAt);
        const md = source.mdLabel ?? around.label(sourceDay);
        const offset = Math.round((Date.parse(sourceDay) - Date.parse(fromStart)) / 86_400_000);
        const target =
          (md &&
            targetTrainings.find(
              (e) => !used.has(e.id) && around.label(localDate(tz, e.startsAt)) === md,
            )) ||
          targetTrainings.find(
            (e) => !used.has(e.id) && localDate(tz, e.startsAt) === addDays(toStart, offset),
          );
        if (!target) continue;
        used.add(target.id);
        const result = await data.training.copySession(tenant.scope, source, target.id, {
          createdBy: c.get("actor").userId,
          timezone: tz,
          title: target.title,
        });
        if (typeof result !== "string") copied += 1;
      }
      await audit(data, c, tenant, "training_week.copied", team.name, {
        from: fromStart,
        to: toStart,
        sessions: copied,
      });
      return c.json({ sessions: copied }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/training/week/template",
      tags: ["Entrenamiento"],
      summary:
        "Aplica una semana tipo: una sesión por día respecto al partido, creando el entrenamiento si falta",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(WeekTemplateApplySchema) },
      responses: {
        200: json("Semana tipo aplicada", WeekResult),
        400: error("Semana sin partido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await requirePlanner(c, tenant, id);
      const tz = tenant.organization.timezone;
      const input = c.req.valid("json");
      const template = await data.training.templateById(tenant.scope, input.templateId);
      if (!template || template.sectionId !== team.section.id)
        throw notFound("Esa semana tipo no existe.");
      const start = weekStartOf(input.date);
      const around = await matchDatesAround(tenant, team, start, addDays(start, 13));
      const matchDay = around.events
        .filter((e) => e.kind === "match")
        .map((e) => localDate(tz, e.startsAt))
        .concat(around.matches.map((m) => m.playedOn))
        .filter((d) => d >= start && d <= addDays(start, 8))
        .sort()[0];
      if (!matchDay)
        throw badRequest("Esa semana no tiene partido: la semana tipo cuenta los días desde él.");
      let applied = 0;
      for (const day of template.days) {
        const date = addDays(matchDay, day.offset);
        const training = around.events.find(
          (e) => e.kind === "training" && localDate(tz, e.startsAt) === date,
        );
        let session = training?.sessionId
          ? await data.training.sessionById(tenant.scope, training.sessionId)
          : null;
        if (!session) {
          const created = await data.training.createSession(
            tenant.scope,
            team.id,
            training
              ? { eventId: training.id }
              : { date, startsAt: day.startsAt ?? "19:00", minutes: day.minutes },
            { timezone: tz, createdBy: c.get("actor").userId, title: `Entrenamiento ${team.name}` },
          );
          if (typeof created === "string") continue;
          session = created;
        }
        await data.training.updateSession(tenant.scope, session.id, {
          objective: session.objective ?? day.objective,
          targetRpe: day.targetRpe,
          status: session.status === "draft" ? "planned" : session.status,
        });
        applied += 1;
      }
      await audit(data, c, tenant, "training_week.template_applied", team.name, {
        template: template.name,
        week: start,
        sessions: applied,
      });
      return c.json({ sessions: applied }, 200);
    },
  );

  const HistoryQuery = z.object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    content: z.string().uuid().optional(),
    drill: z.string().uuid().optional(),
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/training/sessions",
      tags: ["Entrenamiento"],
      summary: "Histórico de sesiones del equipo, filtrable por contenido o tarea",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, query: HistoryQuery },
      responses: { 200: json("Sesiones", TeamSessionsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      const team = await teamOr404(data, c, tenant, id);
      const tz = tenant.organization.timezone;
      const today = todayOf(tenant);
      const from = query.from ?? addDays(today, -180);
      const to = query.to ?? addDays(today, 14);
      const section = await data.training.sectionTraining(tenant.scope, team.section.id);
      const [sessions, around, contents] = await Promise.all([
        data.training.teamSessions(
          tenant.scope,
          team.id,
          instantOf(tz, from),
          instantOf(tz, addDays(to, 1)),
        ),
        matchDatesAround(tenant, team, addDays(from, -7), addDays(to, 7)),
        section
          ? data.training.ensureCatalog(
              tenant.scope,
              section.id,
              section.sportCode,
              localeOf(c, tenant),
            )
          : Promise.resolve([]),
      ]);
      const bundle = await sessionBundle(tenant, sessions);
      const rows = sessions
        .filter((s) => {
          const items = bundle.itemsOf(s.id);
          if (
            query.content &&
            !s.contentIds.includes(query.content) &&
            !items.some((i) => i.contentIds.includes(query.content!))
          )
            return false;
          if (query.drill && !items.some((i) => i.drillId === query.drill)) return false;
          return true;
        })
        .reverse()
        .map((s) => {
          const items = bundle.itemsOf(s.id);
          return {
            ...sessionSummaryDto(
              s,
              items,
              bundle.loadsOf(s.eventId),
              tz,
              around.label(localDate(tz, s.startsAt)),
            ),
            drills: items.map((i) => i.title),
          };
        });
      return c.json(
        {
          team: { id: team.id, name: team.name },
          sessions: rows,
          contents: contents.map(contentDto),
        },
        200,
      );
    },
  );

  // --- Sesiones ---

  async function sessionOr404(c: RouteCtx, tenant: Tenant, id: string) {
    const session = await data.training.sessionById(tenant.scope, id);
    if (!session) throw notFound("Esa sesión no existe.");
    const restricted = await restrictedOf(data, c);
    if (restricted && !restricted.teamIds.includes(session.team.id))
      throw notFound("Esa sesión no existe.");
    const team = await data.teams.byId(tenant.scope, session.team.id);
    if (!team) throw notFound("Esa sesión no existe.");
    return { session, team };
  }

  async function sessionDetail(
    c: RouteCtx,
    tenant: Tenant,
    session: SessionRecord,
    team: TeamRecord,
  ) {
    const tz = tenant.organization.timezone;
    const date = localDate(tz, session.startsAt);
    const section = await data.training.sectionTraining(tenant.scope, team.section.id);
    if (!section) throw notFound("Esa sección no existe.");
    const [items, loads, attendance, roster, around, cycles, insights] = await Promise.all([
      data.training.itemsOf(tenant.scope, [session.id]),
      data.load.loadsForEvents(tenant.scope, [session.eventId]),
      data.attendance.forEvent(tenant.scope, session.eventId),
      data.teams.roster(tenant.scope, team.id),
      matchDatesAround(tenant, team, addDays(date, -7), addDays(date, 7)),
      data.training.cyclesOfTeam(tenant.scope, team.id),
      buildTeamInsights(data, c, tenant, team, date, { sessionId: session.id }),
    ]);
    const active = roster.filter((r) => r.status === "active");
    const availability = await data.load.currentFor(
      tenant.scope,
      active.map((r) => r.playerId),
    );
    const attendanceOf = new Map((attendance ?? []).map((a) => [a.playerId, a.status]));
    const loadOf = new Map<string, LoadRecord>(loads.map((l) => [l.playerId, l]));
    const blocks = blocksFor(c.get("actor"), team);
    const keep = new Set([
      "restriction_conflict",
      "md_plus_one",
      "rpe_above_target",
      "known_opponent",
      "wellness_drop",
    ]);
    return {
      session: {
        ...sessionSummaryDto(session, items, loads, tz, around.label(date)),
        notes: session.notes,
        rating: session.rating,
        cycleId: session.cycleId,
        contentIds: session.contentIds,
        mdLabelOverride: session.mdLabel,
      },
      section: { id: section.id, name: section.name, sportCode: section.sportCode },
      items: items.map(itemDto),
      roster: active.map((r) => {
        const load = loadOf.get(r.playerId);
        return {
          playerId: r.playerId,
          name: playerDisplayName(r),
          photoUrl: playerPhotoUrlFor(r.photoBlobKey, tenant.organization.slug, r.playerId),
          shirtNumber: r.shirtNumber,
          position: r.position,
          isGoalkeeper: r.position ? /port|keeper|goalie/i.test(r.position) : false,
          availability: availabilityDto(availability.get(r.playerId)!),
          attendance: attendanceOf.get(r.playerId) ?? null,
          load: load
            ? { rpe: load.rpe, minutes: load.minutes, participation: load.participation }
            : null,
        };
      }),
      contents: insights.contents.map(contentDto),
      cycles: cycles.map((cy) => ({
        id: cy.id,
        name: cy.name,
        startsOn: cy.startsOn,
        endsOn: cy.endsOn,
      })),
      insights: insights.insights
        .filter((i) => keep.has(i.rule) && (!i.sessionId || i.sessionId === session.id))
        .map(insightDto),
      tracking: section.settings.tracking,
      access: {
        header: blocks.includes("main"),
        blocks,
        close: blocks.includes("main") || canWriteLoad(c.get("actor"), team),
      },
    };
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/sessions",
      tags: ["Entrenamiento"],
      summary: "Planifica un entrenamiento: el de la agenda, o uno nuevo con fecha y hora",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(SessionCreateSchema) },
      responses: {
        201: json("Sesión", SessionDetailResponseSchema),
        400: error("Entrenamiento o instalación desconocidos"),
        409: error("Ese entrenamiento ya tiene sesión"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const team = await requirePlanner(c, tenant, id);
      const created = await data.training.createSession(tenant.scope, team.id, input, {
        timezone: tenant.organization.timezone,
        createdBy: c.get("actor").userId,
        title: `Entrenamiento ${team.name}`,
      });
      if (created === "unknown_event")
        throw badRequest("Ese entrenamiento de la agenda no es del equipo.");
      if (created === "unknown_facility") throw badRequest("Esa instalación no es del club.");
      if (created === "exists") throw conflict("Ese entrenamiento ya tiene sesión.");
      await audit(
        data,
        c,
        tenant,
        "session.created",
        `${team.name} · ${localDate(tenant.organization.timezone, created.startsAt)}`,
      );
      return c.json(await sessionDetail(c, tenant, created, team), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/events/{id}/session",
      tags: ["Entrenamiento"],
      summary: "La sesión de un entrenamiento de la agenda, si está planificado",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Sesión", z.object({ sessionId: z.string().nullable() })), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const session = await data.training.sessionByEvent(tenant.scope, c.req.valid("param").id);
      if (!session) return c.json({ sessionId: null }, 200);
      const restricted = await restrictedOf(data, c);
      if (restricted && !restricted.teamIds.includes(session.team.id))
        return c.json({ sessionId: null }, 200);
      return c.json({ sessionId: session.id }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sessions/{id}",
      tags: ["Entrenamiento"],
      summary:
        "Una sesión: tareas por bloque, plantilla del día con disponibilidad, asistencia y carga, y lo que hay que tener en cuenta",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Sesión", SessionDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { session, team } = await sessionOr404(c, tenant, c.req.valid("param").id);
      return c.json(await sessionDetail(c, tenant, session, team), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/sessions/{id}",
      tags: ["Entrenamiento"],
      summary:
        "Cabecera de la sesión: objetivo, contenidos, MD, estado, RPE objetivo, ciclo y notas",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(SessionUpdateSchema) },
      responses: {
        200: json("Sesión", SessionDetailResponseSchema),
        400: error("Contenido o ciclo desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { session, team } = await sessionOr404(c, tenant, c.req.valid("param").id);
      if (!canPlan(c.get("actor"), team)) throw forbidden();
      const patch = c.req.valid("json");
      const updated = await data.training.updateSession(tenant.scope, session.id, patch);
      if (updated === "unknown_content") throw badRequest("Algún contenido no es de la sección.");
      if (updated === "unknown_cycle") throw badRequest("Ese ciclo no es del equipo.");
      if (!updated) throw notFound("Esa sesión no existe.");
      await audit(
        data,
        c,
        tenant,
        "session.updated",
        `${team.name} · ${localDate(tenant.organization.timezone, updated.startsAt)}`,
        patch,
      );
      return c.json(await sessionDetail(c, tenant, updated, team), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/sessions/{id}/blocks/{block}",
      tags: ["Entrenamiento"],
      summary: "Tareas de un bloque de la sesión. Cada papel del cuerpo técnico edita sus bloques",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: z.object({ id: z.string().uuid(), block: SessionBlockSchema }),
        body: body(SessionBlockSetSchema),
      },
      responses: {
        200: json("Sesión", SessionDetailResponseSchema),
        400: error("Tarea, contenido o jugador desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id, block } = c.req.valid("param");
      const { items } = c.req.valid("json");
      const { session, team } = await sessionOr404(c, tenant, id);
      if (!blocksFor(c.get("actor"), team).includes(block)) throw forbidden();
      const roster = new Set(
        (await data.teams.roster(tenant.scope, team.id)).map((r) => r.playerId),
      );
      if (items.some((i) => (i.playerIds ?? []).some((p) => !roster.has(p))))
        throw badRequest("Algún jugador no es de la plantilla.");
      const result = await data.training.replaceBlock(
        tenant.scope,
        session.id,
        block,
        items,
        c.get("actor").userId,
      );
      if (result === "unknown_drill")
        throw badRequest("Alguna tarea no es de la biblioteca del club.");
      if (result === "unknown_item") throw badRequest("Alguna tarea no es de este bloque.");
      if (result === "unknown_content") throw badRequest("Algún contenido no es del club.");
      if (session.status === "draft" && items.length > 0)
        await data.training.updateSession(tenant.scope, session.id, { status: "planned" });
      await audit(
        data,
        c,
        tenant,
        "session.block_updated",
        `${team.name} · ${localDate(tenant.organization.timezone, session.startsAt)}`,
        {
          block,
          items: items.length,
        },
      );
      const fresh = (await data.training.sessionById(tenant.scope, session.id))!;
      return c.json(await sessionDetail(c, tenant, fresh, team), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/sessions/{id}/close",
      tags: ["Entrenamiento"],
      summary:
        "Cierra la sesión: asistencia, participación y RPE de cada jugador, duración real y valoración",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(SessionCloseSchema) },
      responses: {
        200: json("Sesión", SessionDetailResponseSchema),
        400: error("Jugador desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const input = c.req.valid("json");
      const { session, team } = await sessionOr404(c, tenant, c.req.valid("param").id);
      const actor = c.get("actor");
      if (!canPlan(actor, team) && !canWriteLoad(actor, team)) throw forbidden();
      const roster = new Set(
        (await data.teams.roster(tenant.scope, team.id)).map((r) => r.playerId),
      );
      if (input.players.some((p) => !roster.has(p.playerId)))
        throw badRequest("Algún jugador no es de la plantilla.");
      const tz = tenant.organization.timezone;
      const date = localDate(tz, session.startsAt);
      const items = await data.training.itemsOf(tenant.scope, [session.id]);
      const actualMinutes = input.actualMinutes ?? plannedOf(session, items).minutes;
      await data.attendance.set(
        tenant.scope,
        session.eventId,
        input.players.map((p) => ({ playerId: p.playerId, status: p.status })),
        actor.userId,
      );
      const present = input.players.filter((p) => p.status === "present");
      await data.load.setSessionLoads(
        tenant.scope,
        session.eventId,
        date,
        present.map((p) => ({
          playerId: p.playerId,
          minutes: p.minutes ?? actualMinutes,
          rpe: p.rpe ?? input.groupRpe ?? null,
          participation: p.participation ?? "full",
        })),
        actor.userId,
      );
      await data.load.clearSessionLoads(
        tenant.scope,
        session.eventId,
        input.players.filter((p) => p.status !== "present").map((p) => p.playerId),
      );
      const itemIds = new Set(items.map((i) => i.id));
      await data.training.markClosed(tenant.scope, session.id, {
        actualMinutes,
        rating: input.rating,
        notes: input.notes,
        itemRatings: (input.itemRatings ?? []).filter((r) => itemIds.has(r.itemId)),
      });
      await audit(data, c, tenant, "session.closed", `${team.name} · ${date}`, {
        present: present.length,
        withRpe: present.filter((p) => (p.rpe ?? input.groupRpe) != null).length,
      });
      const fresh = (await data.training.sessionById(tenant.scope, session.id))!;
      return c.json(await sessionDetail(c, tenant, fresh, team), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/sessions/{id}/copy",
      tags: ["Entrenamiento"],
      summary: "Copia la sesión en otro entrenamiento del equipo (sustituye su planificación)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(SessionCopySchema) },
      responses: {
        201: json("Sesión de destino", SessionDetailResponseSchema),
        400: error("Entrenamiento de destino desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { session, team } = await sessionOr404(c, tenant, c.req.valid("param").id);
      if (!canPlan(c.get("actor"), team)) throw forbidden();
      const { eventId } = c.req.valid("json");
      const targetSession = await data.training.sessionByEvent(tenant.scope, eventId);
      if (targetSession && targetSession.team.id !== team.id)
        throw badRequest("Ese entrenamiento es de otro equipo.");
      const copied = await data.training.copySession(tenant.scope, session, eventId, {
        createdBy: c.get("actor").userId,
        timezone: tenant.organization.timezone,
        title: `Entrenamiento ${team.name}`,
      });
      if (copied === "unknown_event" || copied.team.id !== team.id)
        throw badRequest("Ese entrenamiento de la agenda no es del equipo.");
      await audit(
        data,
        c,
        tenant,
        "session.copied",
        `${team.name} · ${localDate(tenant.organization.timezone, copied.startsAt)}`,
        {
          from: session.id,
        },
      );
      return c.json(await sessionDetail(c, tenant, copied, team), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/sessions/{id}",
      tags: ["Entrenamiento"],
      summary: "Quita la planificación de un entrenamiento. El entrenamiento sigue en la agenda",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 204: { description: "Quitada" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { session, team } = await sessionOr404(c, tenant, c.req.valid("param").id);
      if (!canPlan(c.get("actor"), team)) throw forbidden();
      await data.training.removeSession(tenant.scope, session.id);
      await audit(
        data,
        c,
        tenant,
        "session.removed",
        `${team.name} · ${localDate(tenant.organization.timezone, session.startsAt)}`,
      );
      return c.body(null, 204);
    },
  );

  // --- Recomendaciones ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/teams/{id}/insights",
      tags: ["Entrenamiento"],
      summary:
        "Lo que hay que tener en cuenta: recomendaciones explicables del equipo y de sus jugadores",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, query: DateQuery },
      responses: { 200: json("Recomendaciones", TeamInsightsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const team = await teamOr404(data, c, tenant, id);
      const date = c.req.valid("query").date ?? todayOf(tenant);
      const [{ insights, contents }, roster] = await Promise.all([
        buildTeamInsights(data, c, tenant, team, date),
        data.teams.roster(tenant.scope, team.id),
      ]);
      return c.json(
        {
          date,
          insights: insights.map(insightDto),
          contents: contents.map(contentDto),
          players: roster.map((r) => ({ id: r.playerId, name: playerDisplayName(r) })),
          access: {
            answer:
              blocksFor(c.get("actor"), team).length > 0 || canWriteLoad(c.get("actor"), team),
          },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/teams/{id}/insights/feedback",
      tags: ["Entrenamiento"],
      summary:
        "Aplica o descarta una recomendación: la silencia para ese caso un tiempo y mide la utilidad de la regla",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam, body: body(InsightFeedbackSchema) },
      responses: { 204: { description: "Guardado" }, ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const team = await teamOr404(data, c, tenant, id);
      const actor = c.get("actor");
      if (blocksFor(actor, team).length === 0 && !canWriteLoad(actor, team)) throw forbidden();
      const today = todayOf(tenant);
      await data.load.answerInsight(
        tenant.scope,
        team.id,
        {
          rule: input.rule,
          fingerprint: input.fingerprint,
          playerId: input.playerId ?? null,
          outcome: input.outcome,
          reason: input.reason ?? null,
          snoozeUntil: addDays(today, input.snoozeDays ?? (input.outcome === "applied" ? 28 : 14)),
        },
        actor.userId,
      );
      await audit(data, c, tenant, "insight.answered", team.name, {
        rule: input.rule,
        outcome: input.outcome,
      });
      return c.body(null, 204);
    },
  );

  // --- Metodología (coordinación) ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/sections/{id}/methodology",
      tags: ["Entrenamiento"],
      summary:
        "Cumplimiento de la metodología: sesiones planificadas, reparto de contenidos y uso de la biblioteca oficial por equipo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Metodología", MethodologyResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      await requireSectionVisible(data, c, id);
      const section = await data.training.sectionTraining(tenant.scope, id);
      if (!section) throw notFound("Esa sección no existe.");
      const tz = tenant.organization.timezone;
      const today = todayOf(tenant);
      const season = await data.seasons.current(tenant.scope);
      const restricted = await restrictedOf(data, c);
      const teams = season
        ? (await data.teams.list(tenant.scope, season.id, id)).filter(
            (t) => !restricted || restricted.teamIds.includes(t.id),
          )
        : [];
      const from = season ? instantOf(tz, season.startsOn) : instantOf(tz, addDays(today, -365));
      const to = instantOf(tz, addDays(today, 1));
      const [contents, categories, sessions, trainings] = await Promise.all([
        data.training.ensureCatalog(tenant.scope, id, section.sportCode, localeOf(c, tenant)),
        data.training.categoriesOf(tenant.scope, id),
        data.training.sessionsOfTeams(
          tenant.scope,
          teams.map((t) => t.id),
          from,
          to,
        ),
        data.training.trainingCounts(
          tenant.scope,
          teams.map((t) => t.id),
          from,
          to,
        ),
      ]);
      const items = await data.training.itemsOf(
        tenant.scope,
        sessions.map((s) => s.id),
      );
      const kindOf = new Map(contents.map((ct) => [ct.id, ct.kind]));
      const scopes = await data.training.drillScopes(tenant.scope, [
        ...new Set(items.map((i) => i.drillId).filter((x): x is string => !!x)),
      ]);
      return c.json(
        {
          section: { id: section.id, name: section.name },
          categories,
          methodology: section.settings.methodology,
          teams: teams.map((t) => {
            const own = sessions.filter((s) => s.team.id === t.id && s.status !== "cancelled");
            const ownItems = items.filter((i) => own.some((s) => s.id === i.sessionId));
            const byKind = Object.fromEntries(TRAINING_CONTENT_KINDS.map((k) => [k, 0])) as Record<
              string,
              number
            >;
            for (const i of ownItems) {
              const kinds = [
                ...new Set(
                  i.contentIds
                    .map((cid) => kindOf.get(cid))
                    .filter((k): k is NonNullable<typeof k> => !!k),
                ),
              ];
              for (const k of kinds)
                byKind[k] = (byKind[k] ?? 0) + Math.round(i.minutes / kinds.length);
            }
            const total = ownItems.reduce((a, i) => a + i.minutes, 0);
            const official = ownItems
              .filter((i) => i.drillId && ["club", "section"].includes(scopes.get(i.drillId) ?? ""))
              .reduce((a, i) => a + i.minutes, 0);
            return {
              id: t.id,
              name: t.name,
              category: t.categoryId
                ? (categories.find((cat) => cat.id === t.categoryId) ?? null)
                : null,
              trainings: trainings.get(t.id) ?? 0,
              planned: own.filter((s) => s.status !== "draft").length,
              done: own.filter((s) => s.status === "done").length,
              minutesByKind: byKind,
              totalMinutes: total,
              officialShare: total > 0 ? Math.round((official / total) * 100) : null,
            };
          }),
          access: { configure: c.get("actor").permissions.has("org.training.library") },
        },
        200,
      );
    },
  );

  return app;
}
