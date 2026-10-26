import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  EXERCISE_CATEGORIES,
  ExerciseCreateSchema,
  ExerciseResponseSchema,
  ExercisesResponseSchema,
  ExerciseUpdateSchema,
  type Exercise,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer, ExerciseRecord } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  auditOf,
  body,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  json,
  orgOf,
  type Ctx,
} from "./fitness-common.ts";

/** Escribe en la biblioteca quien programa: el dueño (`training.write`) y el coach (`write_own`). */
function canWrite(c: Ctx): boolean {
  const permissions = c.get("actor").permissions;
  return permissions.has("org.training.write") || permissions.has("org.training.write_own");
}

function requireWrite(c: Ctx) {
  if (!canWrite(c)) throw forbidden("La biblioteca de ejercicios la escriben el coach y el dueño.");
}

const toDto = (e: ExerciseRecord): Exercise => ({ ...e, updatedAt: e.updatedAt.toISOString() });

/**
 * Biblioteca de ejercicios del box (ADR 0050): la lee todo el club, también el atleta; la
 * escriben el coach y el dueño. Archivar la quita de la lista sin borrar nada.
 */
export function createFitnessExerciseRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  app.use("/api/org/exercises", ...chain);
  app.use("/api/org/exercises/*", ...chain);
  const audit = auditOf(data);

  function saved(c: Ctx, result: Awaited<ReturnType<DataLayer["exercises"]["create"]>>) {
    if (result.outcome === "name_taken") throw conflict("Ya hay un ejercicio con ese nombre.");
    if (result.outcome === "unknown_section") throw badRequest("Esa disciplina no es de este box.");
    if (result.outcome === "not_found") throw notFound("Ese ejercicio no existe.");
    return result.exercise;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/exercises",
      tags: ["Fitness"],
      summary:
        "Ejercicios del box por nombre, con búsqueda y categoría. Los archivados, solo para quien escribe",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: {
        query: z.object({
          search: z.string().trim().max(80).optional(),
          category: z.enum(EXERCISE_CATEGORIES).optional(),
          archived: z.enum(["1"]).optional(),
        }),
      },
      responses: { 200: json("Ejercicios", ExercisesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const query = c.req.valid("query");
      const writer = canWrite(c);
      const [list, sections] = await Promise.all([
        data.exercises.list(tenant.scope, {
          search: query.search,
          category: query.category,
          includeArchived: writer && query.archived === "1",
        }),
        data.fitness.fitnessSections(tenant.scope),
      ]);
      return c.json({ exercises: list.map(toDto), canWrite: writer, sections }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/exercises/{id}",
      tags: ["Fitness"],
      summary: "Un ejercicio con cómo se hace, puntos clave, errores comunes, escalados y vídeo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: { params: idParam },
      responses: { 200: json("Ejercicio", ExerciseResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const exercise = await data.exercises.byId(orgOf(c).scope, id);
      if (!exercise || (exercise.status === "archived" && !canWrite(c)))
        throw notFound("Ese ejercicio no existe.");
      return c.json({ exercise: toDto(exercise) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/exercises",
      tags: ["Fitness"],
      summary: "Añade un ejercicio a la biblioteca del box",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: body(ExerciseCreateSchema),
      responses: {
        201: json("Ejercicio", ExerciseResponseSchema),
        409: errorResponse("Ya hay un ejercicio con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      requireWrite(c);
      const input = c.req.valid("json");
      const exercise = saved(
        c,
        await data.exercises.create(orgOf(c).scope, input, c.get("sessionUser").id),
      );
      await audit(c, "exercise.created", exercise.name, { category: exercise.category });
      return c.json({ exercise: toDto(exercise) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/exercises/{id}",
      tags: ["Fitness"],
      summary: "Cambia un ejercicio, o lo archiva y lo recupera con `status`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: { params: idParam, ...body(ExerciseUpdateSchema) },
      responses: {
        200: json("Ejercicio", ExerciseResponseSchema),
        409: errorResponse("Ya hay un ejercicio con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      requireWrite(c);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const exercise = saved(c, await data.exercises.update(orgOf(c).scope, id, patch));
      const action =
        patch.status === "archived"
          ? "exercise.archived"
          : patch.status === "active" && Object.keys(patch).length === 1
            ? "exercise.restored"
            : "exercise.updated";
      await audit(c, action, exercise.name, patch);
      return c.json({ exercise: toDto(exercise) }, 200);
    },
  );

  return app;
}
