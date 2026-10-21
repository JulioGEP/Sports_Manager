import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  ChallengeCreateSchema,
  ChallengeDetailResponseSchema,
  ChallengeResponseSchema,
  ChallengeStandingsResponseSchema,
  ChallengeSubmissionResponseSchema,
  ChallengeSubmissionsResponseSchema,
  ChallengeTaskCreateSchema,
  ChallengeTaskUpdateSchema,
  ChallengeUpdateSchema,
  ChallengesResponseSchema,
  FamilyChallengesResponseSchema,
  SubmissionCreateSchema,
  SubmissionReviewSchema,
  SUBMISSION_STATUSES,
  defaultChallengeTasks,
  playerDisplayName,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  type ChallengeRecord,
  type DataLayer,
  type StandingRecord,
  type SubmissionRecord,
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
  404: error("Host sin club o reto inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

const challengeDto = (c: ChallengeRecord) => ({ ...c, updatedAt: c.updatedAt.toISOString() });

/**
 * Retos por puntos (Fase 1, Bloque 13, ADR 0030). El personal consulta (`org.challenges.read`),
 * gestiona el catálogo (`org.challenges.manage`) y valida registros, de todo el club
 * (`org.challenges.review`) o solo de sus equipos (`org.challenges.review_own`). La familia
 * registra la actividad de los suyos y ve solo sus puntos (`org.family.*`): nunca una comparativa.
 *
 * Ámbito (ADR 0032): cada reto es de una sección o de un equipo de esa sección. Quien valida
 * todo el club gestiona retos de cualquier sección o equipo; quien solo valida lo suyo (la
 * entrenadora) crea y gestiona solo retos de equipo de los equipos que lleva. La familia ve, por
 * cada jugador, los retos activos de su sección y de su equipo.
 */
export function createChallengeRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org/challenges", ...chain);
  app.use("/api/org/challenges/*", ...chain);
  app.use("/api/org/family/players/*", ...chain);

  const read = requirePermission("org.challenges.read");
  const manage = requirePermission("org.challenges.manage");
  const family = requirePermission("org.family.read");
  const familyWrite = requirePermission("org.family.write");

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
  const audit = (
    c: Ctx,
    tenant: Tenant,
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: actorId(c),
      organizationId: tenant.organization.id,
      action,
      target,
      details,
    });

  const submissionDto = (s: SubmissionRecord, slug: string) => ({
    id: s.id,
    task: s.task,
    player: {
      id: s.player.id,
      name: playerDisplayName(s.player),
      photoUrl: playerPhotoUrlFor(s.player.photoBlobKey, slug, s.player.id),
    },
    team: s.team,
    quantity: s.quantity,
    points: s.points,
    note: s.note,
    happenedOn: s.happenedOn,
    status: s.status,
    submittedBy: s.submittedBy,
    reviewedBy: s.reviewedBy,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    reviewNote: s.reviewNote,
    createdAt: s.createdAt.toISOString(),
  });
  const standingDto = (s: StandingRecord, challenge: ChallengeRecord, slug: string) => ({
    player: {
      id: s.player.id,
      name: playerDisplayName(s.player),
      photoUrl: playerPhotoUrlFor(s.player.photoBlobKey, slug, s.player.id),
    },
    team: s.team,
    totals: s.totals,
    submissionsCount: s.submissionsCount,
    reachedMin: s.totals.approved >= challenge.minPoints,
    reachedTarget: s.totals.approved >= challenge.targetPoints,
  });

  type RouteCtx = Parameters<typeof accessScopeOf>[1];

  /**
   * Ámbito restringido (Bloque 19, ADR 0033): quien ve solo sus secciones o sus equipos ve los
   * retos de esas secciones y, de los de equipo, solo los de sus equipos. El resto no existe.
   */
  async function visibleChallenges(c: RouteCtx, challenges: ChallengeRecord[]) {
    const access = await accessScopeOf(data, c);
    if (access.kind === "club") return challenges;
    return challenges.filter(
      (ch) =>
        access.sectionIds.includes(ch.section.id) &&
        (ch.team === null || access.teamIds.includes(ch.team.id)),
    );
  }

  async function challengeOr404(c: RouteCtx, tenant: Tenant, id: string): Promise<ChallengeRecord> {
    const challenge = await data.challenges.byId(tenant.scope, id);
    if (!challenge) throw notFound("Ese reto no existe.");
    if ((await visibleChallenges(c, [challenge])).length === 0)
      throw notFound("Ese reto no existe.");
    return challenge;
  }

  /**
   * Hasta dónde llega quien pregunta al gestionar retos. Con `org.challenges.review` (todo el
   * club), cualquier sección o equipo; con solo `review_own`, retos de equipo de los suyos.
   */
  async function manageScopeOf(
    c: Ctx,
    tenant: Tenant,
  ): Promise<{ scope: "club" | "own" | "none"; ownTeamIds: string[] }> {
    const actor = c.get("actor");
    if (!actor.permissions.has("org.challenges.manage")) return { scope: "none", ownTeamIds: [] };
    if (actor.permissions.has("org.challenges.review")) return { scope: "club", ownTeamIds: [] };
    if (actor.permissions.has("org.challenges.review_own")) {
      return {
        scope: "own",
        ownTeamIds: await data.memberships.ownTeamIds(tenant.scope, actorId(c)),
      };
    }
    return { scope: "club", ownTeamIds: [] };
  }

  const canManage = (
    manage: { scope: "club" | "own" | "none"; ownTeamIds: string[] },
    challenge: { team: { id: string } | null },
  ) =>
    manage.scope === "club" ||
    (manage.scope === "own" &&
      challenge.team !== null &&
      manage.ownTeamIds.includes(challenge.team.id));

  async function requireManageOf(c: Ctx, tenant: Tenant, challenge: ChallengeRecord) {
    if (!canManage(await manageScopeOf(c, tenant), challenge))
      throw forbidden("Solo puedes gestionar los retos de tus equipos.");
  }

  const detailOf = async (c: Ctx, tenant: Tenant, challenge: ChallengeRecord) => {
    const actor = c.get("actor");
    const manageScope = await manageScopeOf(c, tenant);
    return {
      challenge: challengeDto(challenge),
      tasks: await data.challenges.tasksOf(tenant.scope, challenge.id),
      access: {
        manage: canManage(manageScope, challenge),
        review:
          actor.permissions.has("org.challenges.review") ||
          actor.permissions.has("org.challenges.review_own"),
      },
      manage: manageScope,
    };
  };

  /**
   * Ámbito de validación: `undefined` es todo el club; una lista de equipos, solo los propios.
   * Sin ninguno de los dos permisos, 403.
   */
  async function reviewScope(c: Ctx, tenant: Tenant): Promise<string[] | undefined> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.challenges.review")) return undefined;
    if (actor.permissions.has("org.challenges.review_own"))
      return data.memberships.ownTeamIds(tenant.scope, actorId(c));
    throw forbidden();
  }

  async function requireReviewOf(c: Ctx, tenant: Tenant, playerId: string) {
    const actor = c.get("actor");
    if (actor.permissions.has("org.challenges.review")) return;
    if (
      actor.permissions.has("org.challenges.review_own") &&
      (await data.players.isStaffOf(tenant.scope, actorId(c), playerId))
    )
      return;
    throw forbidden();
  }

  // --- Personal del club ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/challenges",
      tags: ["Retos"],
      summary:
        "Retos del club: activos primero, agrupados por sección. `manage` dice hasta dónde llega quien pregunta",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Retos", ChallengesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const [challenges, manage] = await Promise.all([
        data.challenges.list(tenant.scope).then((all) => visibleChallenges(c, all)),
        manageScopeOf(c, tenant),
      ]);
      return c.json({ challenges: challenges.map(challengeDto), manage }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/challenges",
      tags: ["Retos"],
      summary:
        "Crea un reto de una sección o de un equipo de esa sección. Con `withDefaultTasks`, nace con el catálogo de ejemplo en el idioma del club. Quien solo valida lo suyo crea solo retos de sus equipos",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        body: {
          content: { "application/json": { schema: ChallengeCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Reto creado", ChallengeResponseSchema),
        400: error("Sección, equipo o temporada desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const manageScope = await manageScopeOf(c, tenant);
      if (!canManage(manageScope, { team: body.teamId ? { id: body.teamId } : null }))
        throw forbidden("Solo puedes crear retos para tus equipos.");
      const tasks = body.withDefaultTasks
        ? defaultChallengeTasks(tenant.organization.defaultLocale as Locale)
        : [];
      const result = await data.challenges.create(tenant.scope, body, actorId(c), tasks);
      if (result === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result === "unknown_team") throw badRequest("Ese equipo no es de esa sección.");
      if (result === "unknown_season") throw badRequest("Esa temporada no es de este club.");
      await audit(c, tenant, "challenge.created", result.name, {
        status: result.status,
        section: result.section.name,
        team: result.team?.name ?? null,
        tasks: tasks.length,
      });
      return c.json({ challenge: challengeDto(result) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/challenges/{id}",
      tags: ["Retos"],
      summary: "Un reto con su catálogo de pruebas y lo que quien pregunta puede hacer con él",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Reto", ChallengeDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const challenge = await challengeOr404(c, tenant, id);
      return c.json(await detailOf(c, tenant, challenge), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/challenges/{id}",
      tags: ["Retos"],
      summary:
        "Edita un reto, lo activa o lo cierra. El ámbito (sección o equipo) solo cambia en borrador. Al cerrarlo, cada jugador con puntos aprobados recibe un registro en su timeline",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: ChallengeUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Reto", ChallengeResponseSchema),
        400: error("Sección, equipo o temporada desconocidos, o puntos incoherentes"),
        409: error("Reto cerrado, o cambio de ámbito fuera del borrador"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const before = await challengeOr404(c, tenant, id);
      const manageScope = await manageScopeOf(c, tenant);
      if (!canManage(manageScope, before))
        throw forbidden("Solo puedes gestionar los retos de tus equipos.");
      const changesScope = body.sectionId !== undefined || body.teamId !== undefined;
      if (changesScope && before.status !== "draft")
        throw conflict("El ámbito de un reto solo cambia mientras es un borrador.");
      if (
        changesScope &&
        !canManage(manageScope, { team: body.teamId ? { id: body.teamId } : null })
      )
        throw forbidden("Solo puedes crear retos para tus equipos.");
      const minPoints = body.minPoints ?? before.minPoints;
      const targetPoints = body.targetPoints ?? before.targetPoints;
      if (targetPoints < minPoints)
        throw badRequest("El objetivo no puede ser menor que el mínimo.");
      if (before.status === "closed" && body.status && body.status !== "closed")
        throw conflict("Un reto cerrado no se vuelve a abrir.");
      const result = await data.challenges.update(tenant.scope, id, body);
      if (result === "not_found") throw notFound("Ese reto no existe.");
      if (result === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result === "unknown_team") throw badRequest("Ese equipo no es de esa sección.");
      if (result === "unknown_season") throw badRequest("Esa temporada no es de este club.");
      if (body.status === "closed" && before.status !== "closed") {
        const approved = await data.challenges.approvedByPlayer(tenant.scope, id);
        for (const [playerId, points] of approved) {
          await data.playerProfile.recordEvent(tenant.scope, {
            playerId,
            kind: "challenge_closed",
            details: { challenge: result.name, points },
            actorUserId: actorId(c),
          });
        }
      }
      await audit(c, tenant, "challenge.updated", result.name, body);
      return c.json({ challenge: challengeDto(result) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/challenges/{id}/tasks",
      tags: ["Retos"],
      summary: "Añade una prueba al catálogo del reto",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: ChallengeTaskCreateSchema } },
          required: true,
        },
      },
      responses: { 201: json("Reto", ChallengeDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const challenge = await challengeOr404(c, tenant, id);
      await requireManageOf(c, tenant, challenge);
      if (challenge.status === "closed") throw conflict("Un reto cerrado no admite cambios.");
      const task = await data.challenges.createTask(tenant.scope, id, body);
      await audit(c, tenant, "challenge.task_created", challenge.name, { task: task.name });
      return c.json(
        await detailOf(c, tenant, (await data.challenges.byId(tenant.scope, id))!),
        201,
      );
    },
  );

  const taskParam = z.object({ id: z.string().uuid(), taskId: z.string().uuid() });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/challenges/{id}/tasks/{taskId}",
      tags: ["Retos"],
      summary: "Edita una prueba o la archiva. Los registros ya hechos conservan sus puntos",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        params: taskParam,
        body: {
          content: { "application/json": { schema: ChallengeTaskUpdateSchema } },
          required: true,
        },
      },
      responses: { 200: json("Reto", ChallengeDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, taskId } = c.req.valid("param");
      const body = c.req.valid("json");
      const challenge = await challengeOr404(c, tenant, id);
      await requireManageOf(c, tenant, challenge);
      if (challenge.status === "closed") throw conflict("Un reto cerrado no admite cambios.");
      const task = await data.challenges.updateTask(tenant.scope, id, taskId, body);
      if (!task) throw notFound("Esa prueba no existe.");
      await audit(c, tenant, "challenge.task_updated", challenge.name, {
        task: task.name,
        ...body,
      });
      return c.json(
        await detailOf(c, tenant, (await data.challenges.byId(tenant.scope, id))!),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/challenges/{id}/tasks/{taskId}",
      tags: ["Retos"],
      summary: "Quita una prueba. Si ya tiene registros, se archiva en vez de borrarse",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: { params: taskParam },
      responses: { 200: json("Reto", ChallengeDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, taskId } = c.req.valid("param");
      const challenge = await challengeOr404(c, tenant, id);
      await requireManageOf(c, tenant, challenge);
      if (challenge.status === "closed") throw conflict("Un reto cerrado no admite cambios.");
      const outcome = await data.challenges.removeTask(tenant.scope, id, taskId);
      if (outcome === "not_found") throw notFound("Esa prueba no existe.");
      await audit(c, tenant, "challenge.task_removed", challenge.name, { taskId, outcome });
      return c.json(
        await detailOf(c, tenant, (await data.challenges.byId(tenant.scope, id))!),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/challenges/{id}/submissions",
      tags: ["Retos"],
      summary:
        "Registros del reto para validar: todo el club con `org.challenges.review`, solo los equipos propios con `org.challenges.review_own`",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        query: z.object({ status: z.enum(SUBMISSION_STATUSES).optional() }),
      },
      responses: { 200: json("Registros", ChallengeSubmissionsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("query");
      await challengeOr404(c, tenant, id);
      const teamIds = await reviewScope(c, tenant);
      const submissions = await data.challenges.submissions(tenant.scope, id, { status, teamIds });
      return c.json(
        {
          submissions: submissions.map((s) => submissionDto(s, tenant.organization.slug)),
          scope: teamIds ? ("own" as const) : ("club" as const),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/challenges/{id}/submissions/{submissionId}/review",
      tags: ["Retos"],
      summary: "Aprueba o rechaza un registro. Solo los aprobados suman",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: z.object({ id: z.string().uuid(), submissionId: z.string().uuid() }),
        body: {
          content: { "application/json": { schema: SubmissionReviewSchema } },
          required: true,
        },
      },
      responses: { 200: json("Registro", ChallengeSubmissionResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, submissionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const challenge = await challengeOr404(c, tenant, id);
      if (challenge.status === "closed") throw conflict("Un reto cerrado no admite validaciones.");
      const existing = await data.challenges.submissionById(tenant.scope, submissionId);
      if (!existing || existing.challengeId !== id) throw notFound("Ese registro no existe.");
      await requireReviewOf(c, tenant, existing.player.id);
      const reviewed = await data.challenges.review(tenant.scope, submissionId, {
        decision: body.decision,
        note: body.note ?? null,
        reviewedBy: actorId(c),
      });
      if (!reviewed) throw notFound("Ese registro no existe.");
      await audit(c, tenant, "challenge.submission_reviewed", playerDisplayName(reviewed.player), {
        challenge: challenge.name,
        task: reviewed.task.name,
        decision: body.decision,
        points: reviewed.points,
      });
      return c.json({ submission: submissionDto(reviewed, tenant.organization.slug) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/challenges/{id}/standings",
      tags: ["Retos"],
      summary:
        "Participación por jugador: puntos aprobados y pendientes. Solo para el personal; con `review_own`, solo los equipos propios",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Participación", ChallengeStandingsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const challenge = await challengeOr404(c, tenant, id);
      const teamIds = await reviewScope(c, tenant);
      const standings = await data.challenges.standings(tenant.scope, id, { teamIds });
      return c.json(
        {
          standings: standings.map((s) => standingDto(s, challenge, tenant.organization.slug)),
          scope: teamIds ? ("own" as const) : ("club" as const),
        },
        200,
      );
    },
  );

  // --- Familia: los retos de uno de los suyos ---

  const playerParam = z.object({ playerId: z.string().uuid() });
  const playerChallengeParam = z.object({
    playerId: z.string().uuid(),
    challengeId: z.string().uuid(),
  });

  async function requireOwnPlayer(c: Ctx, tenant: Tenant, playerId: string) {
    if (!(await data.players.isGuardianOf(tenant.scope, actorId(c), playerId)))
      throw notFound("Ese jugador no está vinculado a tu cuenta.");
  }

  /** Un reto activo en el que participa el jugador (su sección o su equipo). Si no, 404. */
  async function activeChallengeOf(tenant: Tenant, playerId: string, challengeId: string) {
    const challenge = (await data.challenges.activeFor(tenant.scope, playerId)).find(
      (ch) => ch.id === challengeId,
    );
    if (!challenge) throw notFound("Ese reto no es de este jugador o ya no está activo.");
    return challenge;
  }

  /** Los retos activos del jugador, cada uno con sus pruebas, sus puntos y sus registros. */
  async function familyView(tenant: Tenant, playerId: string) {
    const challenges = await data.challenges.activeFor(tenant.scope, playerId);
    return {
      challenges: await Promise.all(
        challenges.map(async (challenge) => {
          const [tasks, totals, submissions] = await Promise.all([
            data.challenges.tasksOf(tenant.scope, challenge.id),
            data.challenges.totalsFor(tenant.scope, challenge.id, playerId),
            data.challenges.submissionsOfPlayer(tenant.scope, challenge.id, playerId),
          ]);
          return {
            challenge: challengeDto(challenge),
            tasks: tasks.filter((t) => t.status === "active"),
            totals,
            submissions: submissions.map((s) => submissionDto(s, tenant.organization.slug)),
          };
        }),
      ),
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family/players/{playerId}/challenges",
      tags: ["Retos"],
      summary:
        "Los retos activos de uno de los suyos vistos por la familia (los de su sección y los de su equipo): pruebas, puntos del jugador y sus registros",
      security: [{ sessionCookie: [] }],
      middleware: [family],
      request: { params: playerParam },
      responses: { 200: json("Retos de la familia", FamilyChallengesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { playerId } = c.req.valid("param");
      await requireOwnPlayer(c, tenant, playerId);
      return c.json(await familyView(tenant, playerId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/family/players/{playerId}/challenges/{challengeId}/submissions",
      tags: ["Retos"],
      summary:
        "La familia registra actividad de uno de los suyos en uno de sus retos. Queda pendiente de validación",
      security: [{ sessionCookie: [] }],
      middleware: [familyWrite],
      request: {
        params: playerChallengeParam,
        body: {
          content: { "application/json": { schema: SubmissionCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Retos de la familia", FamilyChallengesResponseSchema),
        400: error("Prueba desconocida o archivada"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { playerId, challengeId } = c.req.valid("param");
      const body = c.req.valid("json");
      await requireOwnPlayer(c, tenant, playerId);
      const challenge = await activeChallengeOf(tenant, playerId, challengeId);
      const result = await data.challenges.submit(tenant.scope, {
        challengeId: challenge.id,
        taskId: body.taskId,
        playerId,
        submittedBy: actorId(c),
        quantity: body.quantity,
        note: body.note ?? null,
        happenedOn: body.happenedOn,
      });
      if (result === "unknown_task") throw badRequest("Esa prueba no es de este reto.");
      if (result === "task_archived") throw badRequest("Esa prueba ya no admite registros.");
      await audit(c, tenant, "challenge.submission_created", playerDisplayName(result.player), {
        challenge: challenge.name,
        task: result.task.name,
        quantity: result.quantity,
        points: result.points,
      });
      return c.json(await familyView(tenant, playerId), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/family/players/{playerId}/challenges/{challengeId}/submissions/{submissionId}",
      tags: ["Retos"],
      summary: "La familia retira un registro suyo que todavía nadie ha validado",
      security: [{ sessionCookie: [] }],
      middleware: [familyWrite],
      request: {
        params: playerChallengeParam.extend({ submissionId: z.string().uuid() }),
      },
      responses: { 200: json("Retos de la familia", FamilyChallengesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { playerId, challengeId, submissionId } = c.req.valid("param");
      await requireOwnPlayer(c, tenant, playerId);
      const existing = await data.challenges.submissionById(tenant.scope, submissionId);
      if (!existing || existing.player.id !== playerId || existing.challengeId !== challengeId)
        throw notFound("Ese registro no existe o ya está validado.");
      const removed = await data.challenges.removeOwnSubmission(
        tenant.scope,
        submissionId,
        actorId(c),
      );
      if (!removed) throw notFound("Ese registro no existe o ya está validado.");
      await audit(c, tenant, "challenge.submission_removed", playerDisplayName(removed.player), {
        task: removed.task.name,
      });
      return c.json(await familyView(tenant, playerId), 200);
    },
  );

  return app;
}
