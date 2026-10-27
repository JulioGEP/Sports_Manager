import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  benchmarkByCode,
  BenchmarkResultCreateSchema,
  bestOneRm,
  BodyMeasurementCreateSchema,
  compareScores,
  DateOnlySchema,
  FitnessHomeResponseSchema,
  FitnessPreferencesSchema,
  FitnessPreferencesUpdateSchema,
  formatScore,
  LeaderboardResponseSchema,
  MyWorkoutsResponseSchema,
  RecordsResponseSchema,
  PersonalRecordCreateSchema,
  ProgressResponseSchema,
  ResultSavedResponseSchema,
  scoreIsComplete,
  scoreValue,
  weeklyStreaks,
  daysBetween,
  WorkoutResponseSchema,
  WorkoutResultSchema,
  WorkoutsCopiedResponseSchema,
  WorkoutsCopySchema,
  WorkoutsPublishedResponseSchema,
  WorkoutsPublishSchema,
  WorkoutsResponseSchema,
  WorkoutUpsertSchema,
  WORKOUT_LEVELS,
  planWeekOf,
  roleOn,
  type BenchmarkResultView,
  type MovementProgress,
  type PersonalRecord,
  type RankedScore,
  type RepMax,
  type Score,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  workoutVisible,
  type BenchmarkRow,
  type DataLayer,
  type PersonalRecordRow,
  type WorkoutRecord,
} from "../data/index.ts";
import { accessScopeOf, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  athleteWorkoutDto,
  auditOf,
  body,
  classDto,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  json,
  localeOf,
  orgOf,
  personName,
  requireSelfPlayer,
  subscriptionDto,
  todayIn,
  workoutDto,
  type Ctx,
} from "./fitness-common.ts";
import { athleteLevels, mainPlanOf, upcomingRoles } from "./planning-athlete.ts";

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

function rankedOf(
  scoreType: Parameters<typeof scoreValue>[0],
  r: { level: WorkoutLevel; score: Score; completed: boolean },
): RankedScore {
  return {
    level: r.level,
    value: scoreValue(scoreType, r.score) ?? 0,
    completed: r.completed,
    capReps: r.score.reps ?? 0,
  };
}

/**
 * Al copiar un WOD a otro día, sigue en su plan si el día nuevo cae dentro (con la semana y el papel
 * de ese día); si no, sale del plan. La intención y el porqué viajan con él.
 */
function copiedPlanFields(w: WorkoutRecord, onDate: string) {
  const week = w.plan ? planWeekOf(w.plan.startsOn, w.plan.weeks, onDate) : null;
  return {
    planId: w.plan && week ? w.plan.id : null,
    planWeek: week,
    dayRole: w.plan && week ? roleOn(w.plan.structure, w.plan.startsOn, onDate) : w.dayRole,
    intentDomain: w.intentDomain,
    intentEffort: w.intentEffort,
    intentFeel: w.intentFeel,
    why: w.why,
  };
}

export function recordDto(r: PersonalRecordRow): PersonalRecord {
  return { ...r };
}

/** Marcas de un atleta por movimiento: la 1RM (real o estimada), la mejor a cada repetición y la historia. */
export function movementsOf(records: readonly PersonalRecordRow[]): MovementProgress[] {
  const by = new Map<string, PersonalRecordRow[]>();
  for (const r of records) by.set(r.movementCode, [...(by.get(r.movementCode) ?? []), r]);
  return [...by.entries()]
    .map(([movementCode, list]) => {
      const bestByReps = new Map<number, PersonalRecordRow>();
      for (const r of list) {
        const current = bestByReps.get(r.reps);
        if (!current || r.loadKg > current.loadKg) bestByReps.set(r.reps, r);
      }
      return {
        movementCode,
        oneRm: bestOneRm(list),
        best: [...bestByReps.values()].sort((a, b) => a.reps - b.reps).map(recordDto),
        history: [...list].sort((a, b) => b.onDate.localeCompare(a.onDate)).map(recordDto),
      };
    })
    .sort((a, b) => (b.history[0]?.onDate ?? "").localeCompare(a.history[0]?.onDate ?? ""));
}

/** Benchmarks de un atleta con la mejor marca de cada uno señalada. */
export function benchmarksOf(
  rows: readonly BenchmarkRow[],
  locale: "es" | "ca" | "en",
): BenchmarkResultView[] {
  const best = new Map<string, BenchmarkRow>();
  for (const r of rows) {
    const bench = benchmarkByCode(r.benchmarkCode);
    if (!bench) continue;
    const current = best.get(r.benchmarkCode);
    if (
      !current ||
      compareScores(
        bench.scoreType,
        rankedOf(bench.scoreType, r),
        rankedOf(bench.scoreType, current),
      ) < 0
    )
      best.set(r.benchmarkCode, r);
  }
  return rows.map((r) => {
    const bench = benchmarkByCode(r.benchmarkCode);
    return {
      id: r.id,
      benchmarkCode: r.benchmarkCode,
      level: r.level,
      score: r.score,
      completed: r.completed,
      display: bench ? formatScore(bench.scoreType, r.score, r.completed, locale) : "",
      onDate: r.onDate,
      note: r.note,
      isBest: best.get(r.benchmarkCode)?.id === r.id,
    };
  });
}

/**
 * El WOD (ADR 0049). Quien programa (entrenamiento con escritura, en todo o en las disciplinas de
 * sus clases) escribe el WOD de cada día; el atleta ve el publicado con sus kilos calculados y
 * registra su resultado, que entra en la clasificación y, si es una máxima, en sus marcas. Lo
 * suyo (marcas, benchmarks, medidas, privacidad, progreso) solo lo toca el propio atleta.
 */
export function createFitnessWorkoutRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  app.use("/api/org/workouts", ...chain);
  app.use("/api/org/workouts/*", ...chain);
  for (const path of [
    "/api/org/me/workouts",
    "/api/org/me/results/*",
    "/api/org/me/records",
    "/api/org/me/records/*",
    "/api/org/me/benchmarks",
    "/api/org/me/benchmarks/*",
    "/api/org/me/body",
    "/api/org/me/body/*",
    "/api/org/me/fitness-preferences",
    "/api/org/me/progress",
    "/api/org/me/fitness",
  ])
    app.use(path, ...chain);
  const audit = auditOf(data);

  /** Disciplinas que ve y en las que programa quien pregunta. */
  async function sectionsOf(c: Ctx) {
    const tenant = orgOf(c);
    const actor = c.get("actor");
    const access = await accessScopeOf(data, c);
    const all = (await data.fitness.fitnessSections(tenant.scope)).map((s) => s.id);
    const visible =
      access.kind === "club" ? all : all.filter((id) => access.sectionIds.includes(id));
    const writable = actor.permissions.has("org.training.write")
      ? visible
      : actor.permissions.has("org.training.write_own")
        ? visible.filter((id) => access.kind === "club" || access.sectionIds.includes(id))
        : [];
    return { visible, writable };
  }

  /** Si quien pide programa en una disciplina: toda, o las de las clases que da. */
  async function canWrite(c: Ctx, sectionId: string): Promise<boolean> {
    const actor = c.get("actor");
    if (actor.permissions.has("org.training.write")) return true;
    if (!actor.permissions.has("org.training.write_own")) return false;
    const tenant = orgOf(c);
    const own = await data.memberships.ownTeamIds(tenant.scope, actor.userId);
    const season = await data.seasons.current(tenant.scope);
    const teams = season ? await data.teams.list(tenant.scope, season.id, sectionId, own) : [];
    return teams.length > 0;
  }

  async function requireWritable(c: Ctx, sectionId: string) {
    const actor = c.get("actor");
    if (
      !actor.permissions.has("org.training.write") &&
      !actor.permissions.has("org.training.write_own")
    )
      throw forbidden();
    if (!(await canWrite(c, sectionId)))
      throw forbidden("Solo programas en las disciplinas de tus clases.");
  }

  /**
   * Las disciplinas sobre las que actúa una acción de semana: la pedida (si es del club y se ve)
   * o todas las que se ven, y de ellas, en las que quien pide programa. Sin ninguna, prohibido.
   */
  async function weekSections(c: Ctx, sectionId: string | undefined): Promise<string[]> {
    const { visible } = await sectionsOf(c);
    if (sectionId && !visible.includes(sectionId)) throw notFound("Esa disciplina no existe.");
    const candidates = sectionId ? [sectionId] : visible;
    const writable: string[] = [];
    for (const id of candidates) if (await canWrite(c, id)) writable.push(id);
    // Quien programa todo el club y aún no tiene disciplinas no tiene nada que hacer; el coach
    // sin clases no programa.
    if (writable.length === 0 && !c.get("actor").permissions.has("org.training.write"))
      throw forbidden("Solo programas en las disciplinas de tus clases.");
    return writable;
  }

  // --- Programación ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/workouts",
      tags: ["Fitness"],
      summary:
        "WODs de un rango de días (por defecto, esta semana y la siguiente) en las disciplinas que se ven",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: {
        query: z.object({
          from: DateOnlySchema.optional(),
          to: DateOnlySchema.optional(),
          section: z.string().uuid().optional(),
          /** También las sesiones de los planes propios activos (ADR 0057), con `specific`. */
          own: z.enum(["1"]).optional(),
        }),
      },
      responses: { 200: json("WODs", WorkoutsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const query = c.req.valid("query");
      const today = todayIn(tenant.organization.timezone);
      const from = query.from ?? today;
      const to = query.to ?? addDays(from, 13);
      if (to < from) throw badRequest("El final tiene que ir después del inicio.");
      const sections = await sectionsOf(c);
      const ids = query.section
        ? sections.visible.filter((s) => s === query.section)
        : sections.visible;
      const alsoPlans = query.own
        ? (await data.planning.plans.list(tenant.scope, ids))
            .filter((p) => p.status === "active" && p.audience !== "section")
            .map((p) => p.id)
        : [];
      const list = await data.workouts.list(tenant.scope, from, to, { sectionIds: ids, alsoPlans });
      const counts = await data.workouts.results.counts(
        tenant.scope,
        list.flatMap((w) => w.blocks.map((b) => b.id)),
      );
      const now = new Date();
      return c.json(
        {
          from,
          to,
          workouts: list.map((w) => workoutDto(w, now, localeOf(c), { counts })),
          writableSections: sections.writable,
        },
        200,
      );
    },
  );

  async function workoutFor(c: Ctx, id: string): Promise<WorkoutRecord> {
    const w = await data.workouts.byId(orgOf(c).scope, id);
    if (!w) throw notFound("Ese WOD no existe.");
    const sections = await sectionsOf(c);
    if (!sections.visible.includes(w.section.id)) throw notFound("Ese WOD no existe.");
    return w;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/workouts/{id}",
      tags: ["Fitness"],
      summary: "Un WOD con sus bloques y cuántos resultados tiene cada uno",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: { params: idParam },
      responses: { 200: json("WOD", WorkoutResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const w = await workoutFor(c, id);
      const counts = await data.workouts.results.counts(
        orgOf(c).scope,
        w.blocks.map((b) => b.id),
      );
      return c.json({ workout: workoutDto(w, new Date(), localeOf(c), { counts }) }, 200);
    },
  );

  async function save(c: Ctx, id: string | null, input: z.infer<typeof WorkoutUpsertSchema>) {
    const tenant = orgOf(c);
    await requireWritable(c, input.sectionId);
    if (id) await workoutFor(c, id);
    const result = await data.workouts.upsert(tenant.scope, input, c.get("sessionUser").id, id);
    if (result.outcome === "unknown_section")
      throw badRequest("Esa disciplina o ese tipo de clase no son de este club.");
    if (result.outcome === "taken")
      throw conflict("Ya hay un WOD para ese día en esa disciplina o tipo de clase.");
    if (result.outcome === "not_found") throw notFound("Ese WOD no existe.");
    await audit(c, result.created ? "workout.created" : "workout.updated", input.onDate, {
      sectionId: input.sectionId,
      status: input.status,
      blocks: input.blocks.length,
    });
    return result.workout;
  }

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/workouts",
      tags: ["Fitness"],
      summary: "Programa el WOD de un día (borrador o publicado, ya o a una hora)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: body(WorkoutUpsertSchema),
      responses: {
        201: json("WOD", WorkoutResponseSchema),
        409: errorResponse("Ya hay un WOD ese día"),
        ...errors,
      },
    }),
    async (c) => {
      const w = await save(c, null, c.req.valid("json"));
      return c.json({ workout: workoutDto(w, new Date(), localeOf(c)) }, 201);
    },
  );

  // --- Acciones de semana (ADR 0050) ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/workouts/publish",
      tags: ["Fitness"],
      summary:
        "Publica ya los borradores de un rango (la semana) en las disciplinas en que quien pide programa, o en una",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: body(WorkoutsPublishSchema),
      responses: { 200: json("Publicados", WorkoutsPublishedResponseSchema), ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const sections = await weekSections(c, input.sectionId);
      const published = await data.workouts.publishRange(
        orgOf(c).scope,
        input.from,
        input.to,
        sections,
      );
      if (published > 0)
        await audit(c, "workout.updated", `${input.from} – ${input.to}`, {
          action: "publish_week",
          published,
          sectionId: input.sectionId ?? null,
        });
      return c.json({ published }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/workouts/copy",
      tags: ["Fitness"],
      summary:
        "Copia los WODs de unos días (la semana anterior) a otros como borradores, sin pisar los días que ya tienen WOD",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: body(WorkoutsCopySchema),
      responses: { 200: json("Copiados", WorkoutsCopiedResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const sections = await weekSections(c, input.sectionId);
      const source = await data.workouts.list(
        tenant.scope,
        input.from,
        addDays(input.from, input.days - 1),
        { sectionIds: sections },
      );
      let created = 0;
      let skipped = 0;
      for (const w of source) {
        const result = await data.workouts.upsert(
          tenant.scope,
          {
            sectionId: w.section.id,
            teamId: w.team?.id ?? null,
            onDate: addDays(input.to, daysBetween(input.from, w.onDate)),
            title: w.title,
            notes: w.notes,
            status: "draft",
            publishAt: null,
            blocks: w.blocks.map((b) => ({
              kind: b.kind,
              title: b.title,
              description: b.description,
              scoreType: b.scoreType,
              timeCapSeconds: b.timeCapSeconds,
              movementCode: b.movementCode,
              percent: b.percent,
              rmReps: b.rmReps as RepMax | null,
              foundations: b.foundations,
              scaled: b.scaled,
              rx: b.rx,
              rxPlus: b.rxPlus,
              capacity: b.capacity,
              plannedMinutes: b.plannedMinutes,
              exerciseIds: b.exerciseIds,
              track: b.track,
            })),
            ...copiedPlanFields(w, addDays(input.to, daysBetween(input.from, w.onDate))),
          },
          c.get("sessionUser").id,
        );
        if (result.outcome === "saved") created += 1;
        else skipped += 1;
      }
      if (created > 0)
        await audit(c, "workout.created", `${input.to} (${input.days})`, {
          action: "copy_week",
          from: input.from,
          created,
          skipped,
        });
      return c.json({ created, skipped }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/workouts/{id}",
      tags: ["Fitness"],
      summary:
        "Rehace un WOD. Los bloques se actualizan en su sitio: los resultados ya registrados se conservan",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: { params: idParam, ...body(WorkoutUpsertSchema) },
      responses: { 200: json("WOD", WorkoutResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const w = await save(c, id, c.req.valid("json"));
      return c.json({ workout: workoutDto(w, new Date(), localeOf(c)) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/workouts/{id}",
      tags: ["Fitness"],
      summary: "Borra un WOD con sus resultados",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.training.read")],
      request: { params: idParam },
      responses: { 204: { description: "Borrado" }, ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const w = await workoutFor(c, id);
      await requireWritable(c, w.section.id);
      await data.workouts.remove(orgOf(c).scope, id);
      await audit(c, "workout.removed", w.onDate, { sectionId: w.section.id });
      return c.body(null, 204);
    },
  );

  // --- El atleta ---

  /**
   * Los WODs visibles de un día para el atleta, uno por disciplina (o tipo de clase). Si tiene plan
   * propio, su sesión de ese día sustituye al WOD del box en esa disciplina.
   */
  async function athleteWorkouts(c: Ctx, playerId: string, date: string) {
    const tenant = orgOf(c);
    const now = new Date();
    const own = await data.planning.plans.specificOf(tenant.scope, playerId);
    const all = (
      await data.workouts.list(tenant.scope, date, date, { alsoPlans: own ? [own.id] : undefined })
    ).filter((w) => workoutVisible(w, now));
    const mine = all.filter((w) => w.specific);
    const list = all.filter((w) => w.specific || !mine.some((m) => m.section.id === w.section.id));
    const out = [];
    for (const w of list) out.push(await athleteWorkoutDto(data, c, w, playerId, now));
    return out;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/workouts",
      tags: ["Fitness"],
      summary:
        "Los WODs publicados de un día (hoy, por defecto) con los kilos y los resultados del atleta",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { query: z.object({ date: DateOnlySchema.optional() }) },
      responses: {
        200: json("WODs", MyWorkoutsResponseSchema),
        ...errors,
      },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      const tenant = orgOf(c);
      const today = todayIn(tenant.organization.timezone);
      const date = c.req.valid("query").date ?? today;
      const [workouts, levels, plan, plusEntitled] = await Promise.all([
        athleteWorkouts(c, player.id, date),
        athleteLevels(data, tenant.scope, player.id, today),
        mainPlanOf(data, tenant.scope, player.id, tenant.organization.timezone),
        data.planning.plusEntitled(tenant.scope, player.id, today),
      ]);
      const upcoming = await upcomingRoles(data, tenant.scope, plan, today);
      return c.json({ date, workouts, levels, upcoming, plusEntitled }, 200);
    },
  );

  /** Un bloque de un WOD que el atleta puede ver ya (el de un plan propio, solo si es suyo). */
  async function visibleBlock(c: Ctx, blockId: string, playerId: string | null) {
    const scope = orgOf(c).scope;
    const found = await data.workouts.blockById(scope, blockId);
    if (!found || !workoutVisible(found.workout, new Date()))
      throw notFound("Ese bloque no existe.");
    const plan = found.workout.specific ? found.workout.plan : null;
    if (
      plan &&
      !(await data.planning.plans.members(scope, plan.id)).some((m) => m.playerId === playerId)
    )
      throw notFound("Ese bloque no existe.");
    return found;
  }

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/me/results/{id}",
      tags: ["Fitness"],
      summary:
        "Registra (o corrige) el resultado del atleta en un bloque publicado. Si el bloque busca una máxima y la supera, entra en sus marcas",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam, ...body(WorkoutResultSchema) },
      responses: { 200: json("Resultado", ResultSavedResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const player = await requireSelfPlayer(data, c);
      const { block, workout } = await visibleBlock(c, id, player.id);
      if (workout.onDate > todayIn(tenant.organization.timezone))
        throw conflict("Ese WOD es de un día que aún no ha llegado.");
      const completed = input.completed ?? true;
      if (!scoreIsComplete(block.scoreType, input.score, completed))
        throw badRequest("Falta el marcador que pide este bloque.");
      const result = await data.workouts.results.save(
        tenant.scope,
        id,
        player.id,
        input,
        c.get("sessionUser").id,
      );
      let personalRecord = false;
      if (block.rmReps && block.movementCode && input.score.loadKg) {
        const records =
          (await data.workouts.records.list(tenant.scope, [player.id])).get(player.id) ?? [];
        const linked = await data.workouts.records.forResult(tenant.scope, result.id);
        const others = records.filter(
          (r) =>
            r.movementCode === block.movementCode && r.reps === block.rmReps && r.id !== linked,
        );
        const best = Math.max(0, ...others.map((r) => r.loadKg));
        if (linked) {
          await data.workouts.records.updateLoad(
            tenant.scope,
            linked,
            input.score.loadKg,
            workout.onDate,
          );
          personalRecord = input.score.loadKg > best;
        } else if (input.score.loadKg > best) {
          await data.workouts.records.add(
            tenant.scope,
            player.id,
            {
              movementCode: block.movementCode,
              reps: block.rmReps as 1 | 2 | 3 | 5 | 10,
              loadKg: input.score.loadKg,
              onDate: workout.onDate,
            },
            { source: "result", resultId: result.id },
          );
          personalRecord = true;
        }
      }
      return c.json(
        {
          result: {
            level: result.level,
            score: result.score,
            completed: result.completed,
            effort: result.effort,
            note: result.note,
            display: formatScore(block.scoreType, result.score, result.completed, localeOf(c)),
            recordedAt: result.updatedAt.toISOString(),
          },
          personalRecord,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/me/results/{id}",
      tags: ["Fitness"],
      summary: "Borra el resultado propio en un bloque",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam },
      responses: { 204: { description: "Borrado" }, ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const player = await requireSelfPlayer(data, c);
      await visibleBlock(c, id, player.id);
      await data.workouts.results.remove(orgOf(c).scope, id, player.id);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/workouts/blocks/{id}/leaderboard",
      tags: ["Fitness"],
      summary:
        "Clasificación de un bloque: por nivel y marcador, sin quien prefiere no salir (el personal los ve, salvo con `public=1`, la de la pantalla del box). Con `class`, solo quienes vinieron a esa clase",
      security: [{ sessionCookie: [] }],
      request: {
        params: idParam,
        query: z.object({
          level: z.enum(WORKOUT_LEVELS).optional(),
          class: z.string().uuid().optional(),
          /** Para la pantalla del box: el personal ve lo mismo que un atleta, sin quien no quiere salir. */
          public: z.enum(["1"]).optional(),
        }),
      },
      responses: { 200: json("Clasificación", LeaderboardResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      const actor = c.get("actor");
      const staff = actor.permissions.has("org.training.read");
      const player = actor.permissions.has("org.family.read")
        ? await data.load.athleteOf(tenant.scope, actor.userId)
        : null;
      if (!staff && !player) throw forbidden();
      const found = staff
        ? await data.workouts.blockById(tenant.scope, id)
        : await visibleBlock(c, id, player?.id ?? null);
      if (!found) throw notFound("Ese bloque no existe.");
      const policy = await data.bookings.policy(tenant.scope);
      if (!staff && !policy.showLeaderboards)
        throw forbidden("El club no publica clasificaciones.");
      let results = await data.workouts.results.forBlock(tenant.scope, id);
      if (query.class) {
        const attendees = await data.bookings.attendees(tenant.scope, query.class);
        const came = new Set(
          attendees
            .filter((a) => a.status === "attended" || a.status === "booked")
            .map((a) => a.playerId),
        );
        results = results.filter((r) => came.has(r.playerId));
      }
      if (query.level) results = results.filter((r) => r.level === query.level);
      const scoreType = found.block.scoreType;
      const everyone = staff && query.public !== "1";
      const visible = results.filter((r) => everyone || !r.hidden || r.playerId === player?.id);
      const sorted = [...visible].sort((a, b) =>
        compareScores(scoreType, rankedOf(scoreType, a), rankedOf(scoreType, b)),
      );
      const index = found.workout.blocks.findIndex((b) => b.id === id);
      return c.json(
        {
          block: {
            id,
            title: found.block.title,
            scoreType,
            label: String.fromCharCode(65 + Math.max(0, index)),
          },
          entries: sorted.map((r, i) => ({
            rank: i + 1,
            playerId: r.playerId,
            name: personName(r),
            isMe: r.playerId === player?.id,
            level: r.level,
            display: formatScore(scoreType, r.score, r.completed, localeOf(c)),
            completed: r.completed,
          })),
          hiddenCount: results.length - visible.length,
        },
        200,
      );
    },
  );

  // --- Marcas, benchmarks, medidas y privacidad del atleta ---

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/me/records",
      tags: ["Fitness"],
      summary: "Apunta una máxima del atleta (kilos a tantas repeticiones)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(PersonalRecordCreateSchema),
      responses: { 201: json("Marcas", RecordsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      await data.workouts.records.add(tenant.scope, player.id, c.req.valid("json"));
      const records =
        (await data.workouts.records.list(tenant.scope, [player.id])).get(player.id) ?? [];
      return c.json({ movements: movementsOf(records) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/me/records/{id}",
      tags: ["Fitness"],
      summary: "Borra una máxima propia",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam },
      responses: { 204: { description: "Borrada" }, ...errors },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      if (!(await data.workouts.records.remove(orgOf(c).scope, player.id, c.req.valid("param").id)))
        throw notFound("Esa marca no existe.");
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/me/benchmarks",
      tags: ["Fitness"],
      summary: "Apunta un benchmark del atleta (Fran, Murph…)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(BenchmarkResultCreateSchema),
      responses: { 201: json("Hecho", z.object({ id: z.string() })), ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const bench = benchmarkByCode(input.benchmarkCode)!;
      if (!scoreIsComplete(bench.scoreType, input.score, input.completed ?? true))
        throw badRequest("Falta el marcador que pide este benchmark.");
      const player = await requireSelfPlayer(data, c);
      const id = await data.workouts.benchmarks.add(orgOf(c).scope, player.id, input);
      return c.json({ id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/me/benchmarks/{id}",
      tags: ["Fitness"],
      summary: "Borra un benchmark propio",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam },
      responses: { 204: { description: "Borrado" }, ...errors },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      if (
        !(await data.workouts.benchmarks.remove(orgOf(c).scope, player.id, c.req.valid("param").id))
      )
        throw notFound("Ese benchmark no existe.");
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/me/body",
      tags: ["Fitness"],
      summary: "Apunta medidas corporales (privadas; para el coach solo si el atleta las comparte)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(BodyMeasurementCreateSchema),
      responses: { 201: json("Hecho", z.object({ id: z.string() })), ...errors },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      const id = await data.workouts.body.add(orgOf(c).scope, player.id, c.req.valid("json"));
      return c.json({ id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/me/body/{id}",
      tags: ["Fitness"],
      summary: "Borra una medida propia",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: { params: idParam },
      responses: { 204: { description: "Borrada" }, ...errors },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      if (!(await data.workouts.body.remove(orgOf(c).scope, player.id, c.req.valid("param").id)))
        throw notFound("Esa medida no existe.");
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/me/fitness-preferences",
      tags: ["Fitness"],
      summary:
        "Privacidad del atleta: salir en la lista de la clase y en la clasificación, compartir medidas",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(FitnessPreferencesUpdateSchema),
      responses: { 200: json("Preferencias", FitnessPreferencesSchema), ...errors },
    }),
    async (c) => {
      const player = await requireSelfPlayer(data, c);
      const patch = Object.fromEntries(
        Object.entries(c.req.valid("json")).filter(([, v]) => v !== undefined),
      );
      return c.json(await data.workouts.preferences.set(orgOf(c).scope, player.id, patch), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/progress",
      tags: ["Fitness"],
      summary:
        "Progreso del atleta: calendario del mes, racha, marcas, benchmarks, medidas, privacidad y reparto del trabajo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: {
        query: z.object({
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        }),
      },
      responses: { 200: json("Progreso", ProgressResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      const timezone = tenant.organization.timezone;
      const today = todayIn(timezone);
      const month = c.req.valid("query").month ?? today.slice(0, 7);
      const now = new Date();
      const [trained, upcoming, records, benchmarks, body, preferences, mix] = await Promise.all([
        data.bookings.trainedDates(tenant.scope, player.id, timezone, now),
        data.bookings.ofPlayer(tenant.scope, player.id, timezone, { from: now }),
        data.workouts.records.list(tenant.scope, [player.id]),
        data.workouts.benchmarks.list(tenant.scope, player.id),
        data.workouts.body.list(tenant.scope, player.id),
        data.workouts.preferences.get(tenant.scope, player.id),
        data.workouts.results.kindsSince(tenant.scope, player.id, addDays(today, -30)),
      ]);
      const trainedSet = new Set(trained);
      const bookedSet = new Set(
        upcoming
          .filter((u) => u.booking.status === "booked" || u.booking.status === "waitlist")
          .map((u) => u.cls.date),
      );
      const days = [...new Set([...trainedSet, ...bookedSet])]
        .filter((d) => d.startsWith(month))
        .sort()
        .map((date) => ({ date, attended: trainedSet.has(date), booked: bookedSet.has(date) }));
      return c.json(
        {
          month,
          days,
          streak: weeklyStreaks(trained, today),
          classesThisMonth: trained.filter((d) => d.startsWith(month)).length,
          totalClasses: trained.length,
          movements: movementsOf(records.get(player.id) ?? []),
          benchmarks: benchmarksOf(benchmarks, localeOf(c)),
          body,
          preferences,
          workMix: mix,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/fitness",
      tags: ["Fitness"],
      summary:
        "El día del atleta: su próxima clase, el WOD de hoy con sus kilos, su tarifa, su racha, su última marca y lo que tiene sin leer",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Hoy", FitnessHomeResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      const timezone = tenant.organization.timezone;
      const today = todayIn(timezone);
      const now = new Date();
      const policy = await data.bookings.policy(tenant.scope);
      const [upcoming, trained, records, context, announcements, unreadMessages, availability] =
        await Promise.all([
          data.bookings.ofPlayer(tenant.scope, player.id, timezone, {
            from: new Date(now.getTime() - 3 * 3600_000),
            to: new Date(now.getTime() + 30 * DAY),
          }),
          data.bookings.trainedDates(tenant.scope, player.id, timezone, now),
          data.workouts.records.list(tenant.scope, [player.id]),
          data.bookings.context(tenant.scope, player.id, timezone, policy),
          data.community.announcements.list(tenant.scope, c.get("actor").userId, {
            all: false,
            limit: 20,
          }),
          data.community.messages.unreadForAthlete(tenant.scope, player.id),
          data.load.currentFor(tenant.scope, [player.id]),
        ]);
      const next = upcoming.find(
        (u) =>
          u.cls.endsAt.getTime() > now.getTime() &&
          (u.booking.status === "booked" || u.booking.status === "waitlist"),
      );
      const workouts = await athleteWorkouts(c, player.id, today);
      const todayWorkout =
        workouts.find(
          (w) => next && next.cls.date === today && w.section.id === next.cls.section?.id,
        ) ??
        workouts[0] ??
        null;
      const subscription = context.subscriptions.find(
        (s) => s.status === "active" || s.status === "paused",
      );
      const lastRecord = (records.get(player.id) ?? [])[0] ?? null;
      const unread = announcements.filter((a) => !a.read);
      const pick = announcements.find((a) => a.pinned) ?? unread[0] ?? null;
      const a = availability.get(player.id);
      return c.json(
        {
          athlete: { playerId: player.id, firstName: player.firstName },
          nextClass: next ? classDto(next.cls, policy, { my: next.booking }) : null,
          todayWorkout,
          plan: subscription ? subscriptionDto(subscription, context, today) : null,
          streak: weeklyStreaks(trained, today),
          classesThisMonth: trained.filter((d) => d.startsWith(today.slice(0, 7))).length,
          lastRecord: lastRecord ? recordDto(lastRecord) : null,
          announcement: pick
            ? {
                id: pick.id,
                title: pick.title,
                body: pick.body,
                audience: pick.audience,
                section: pick.section,
                pinned: pick.pinned,
                author: pick.author,
                publishedAt: pick.publishedAt.toISOString(),
                read: pick.read,
                readCount: null,
              }
            : null,
          unreadAnnouncements: unread.length,
          unreadMessages,
          restriction:
            a && a.status !== "available" ? { status: a.status, until: a.expectedReturnOn } : null,
        },
        200,
      );
    },
  );

  return app;
}
