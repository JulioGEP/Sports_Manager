import { schema, type Database } from "@sportsmanager/db";
import {
  DEFAULT_FITNESS_PREFERENCES,
  type Capacity,
  type DayRole,
  type PlanStructure,
  type TimeDomain,
  type WorkoutTrack,
  type BenchmarkResultCreate,
  type BodyMeasurementCreate,
  type FitnessPreferences,
  type PersonalRecordCreate,
  type Score,
  type ScoreType,
  type WorkoutBlockKind,
  type WorkoutLevel,
  type WorkoutResult,
  type WorkoutStatus,
  type WorkoutUpsert,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Programación del WOD, resultados, marcas personales, benchmarks, medidas y privacidad del atleta
 * (ADR 0049). El WOD es de un día y una disciplina (sección) o de un tipo de clase. Sus bloques se
 * actualizan en su sitio: los resultados cuelgan del bloque y no se pierden al corregir un texto.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export interface WorkoutBlockRecord {
  id: string;
  sortOrder: number;
  kind: WorkoutBlockKind;
  title: string;
  description: string | null;
  scoreType: ScoreType;
  timeCapSeconds: number | null;
  movementCode: string | null;
  percent: number | null;
  rmReps: number | null;
  foundations: string | null;
  scaled: string | null;
  rx: string | null;
  rxPlus: string | null;
  /** Planificación (ADR 0052). */
  capacity: Capacity | null;
  plannedMinutes: number | null;
  exerciseIds: string[];
  /** Los ejercicios enlazados que siguen en la biblioteca, con su nombre. */
  exercises: { id: string; name: string }[];
  track: WorkoutTrack;
}

export interface WorkoutRecord {
  id: string;
  onDate: string;
  section: { id: string; name: string };
  team: { id: string; name: string } | null;
  title: string | null;
  notes: string | null;
  status: WorkoutStatus;
  publishAt: Date | null;
  blocks: WorkoutBlockRecord[];
  createdBy: string | null;
  updatedAt: Date;
  /** Planificación (ADR 0052): el plan al que sirve, su semana, papel, intención y porqué. */
  plan: {
    id: string;
    name: string;
    startsOn: string;
    weeks: number;
    structure: PlanStructure;
  } | null;
  planWeek: number | null;
  dayRole: DayRole | null;
  intentDomain: TimeDomain | null;
  intentEffort: number | null;
  intentFeel: string | null;
  why: string | null;
}

/** Publicado y con la hora de publicación ya pasada: lo ven los atletas. */
export function workoutVisible(w: { status: WorkoutStatus; publishAt: Date | null }, now: Date) {
  return w.status === "published" && (!w.publishAt || w.publishAt.getTime() <= now.getTime());
}

export interface ResultRecord {
  id: string;
  blockId: string;
  playerId: string;
  level: WorkoutLevel;
  score: Score;
  completed: boolean;
  effort: number | null;
  note: string | null;
  updatedAt: Date;
}

export interface ResultWithPlayer extends ResultRecord {
  firstName: string;
  lastName: string;
  hidden: boolean;
}

export interface PersonalRecordRow {
  id: string;
  movementCode: string;
  reps: number;
  loadKg: number;
  onDate: string;
  note: string | null;
  source: "manual" | "result";
}

export interface BenchmarkRow {
  id: string;
  benchmarkCode: string;
  level: WorkoutLevel;
  score: Score;
  completed: boolean;
  onDate: string;
  note: string | null;
}

export interface BodyRow {
  id: string;
  onDate: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  note: string | null;
}

function scoreOf(r: {
  timeSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  loadKg: string | null;
  distanceM: number | null;
  calories: number | null;
}): Score {
  return {
    timeSeconds: r.timeSeconds,
    rounds: r.rounds,
    reps: r.reps,
    loadKg: num(r.loadKg),
    distanceM: r.distanceM,
    calories: r.calories,
  };
}

function scoreValues(score: Score) {
  return {
    timeSeconds: score.timeSeconds ?? null,
    rounds: score.rounds ?? null,
    reps: score.reps ?? null,
    loadKg: score.loadKg === null || score.loadKg === undefined ? null : String(score.loadKg),
    distanceM: score.distanceM ?? null,
    calories: score.calories ?? null,
  };
}

export function workoutsRepo(db: () => Database) {
  const base = () =>
    db()
      .select({
        workout: schema.workouts,
        sectionName: schema.sections.name,
        teamName: schema.teams.name,
        planName: schema.boxPlans.name,
        planStartsOn: schema.boxPlans.startsOn,
        planWeeks: schema.boxPlans.weeks,
        planStructure: schema.boxPlans.structure,
      })
      .from(schema.workouts)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.workouts.sectionId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.workouts.teamId))
      .leftJoin(schema.boxPlans, eq(schema.boxPlans.id, schema.workouts.planId));
  type Row = Awaited<ReturnType<ReturnType<typeof base>["execute"]>>[number];

  async function blocksFor(scope: OrgScope, ids: string[]) {
    const map = new Map<string, WorkoutBlockRecord[]>();
    if (ids.length === 0) return map;
    const rows = await db()
      .select()
      .from(schema.workoutBlocks)
      .where(
        and(
          eq(schema.workoutBlocks.organizationId, scope.organizationId),
          inArray(schema.workoutBlocks.workoutId, ids),
        ),
      )
      .orderBy(asc(schema.workoutBlocks.sortOrder));
    const exerciseIds = [...new Set(rows.flatMap((b) => b.exerciseIds ?? []))];
    const names = new Map<string, string>();
    if (exerciseIds.length > 0) {
      const found = await db()
        .select({ id: schema.exercises.id, name: schema.exercises.name })
        .from(schema.exercises)
        .where(
          and(
            eq(schema.exercises.organizationId, scope.organizationId),
            inArray(schema.exercises.id, exerciseIds),
          ),
        );
      for (const e of found) names.set(e.id, e.name);
    }
    for (const b of rows) {
      const list = map.get(b.workoutId) ?? [];
      list.push({
        id: b.id,
        sortOrder: b.sortOrder,
        kind: b.kind as WorkoutBlockKind,
        title: b.title,
        description: b.description,
        scoreType: b.scoreType as ScoreType,
        timeCapSeconds: b.timeCapSeconds,
        movementCode: b.movementCode,
        percent: b.percent,
        rmReps: b.rmReps,
        foundations: b.foundations,
        scaled: b.scaled,
        rx: b.rx,
        rxPlus: b.rxPlus,
        capacity: b.capacity as Capacity | null,
        plannedMinutes: b.plannedMinutes,
        exerciseIds: b.exerciseIds ?? [],
        exercises: (b.exerciseIds ?? [])
          .filter((id) => names.has(id))
          .map((id) => ({ id, name: names.get(id)! })),
        track: b.track as WorkoutTrack,
      });
      map.set(b.workoutId, list);
    }
    return map;
  }

  async function toRecords(scope: OrgScope, rows: Row[]): Promise<WorkoutRecord[]> {
    const blocks = await blocksFor(
      scope,
      rows.map((r) => r.workout.id),
    );
    return rows.map((r) => ({
      id: r.workout.id,
      onDate: r.workout.onDate,
      section: { id: r.workout.sectionId, name: r.sectionName },
      team: r.workout.teamId && r.teamName ? { id: r.workout.teamId, name: r.teamName } : null,
      title: r.workout.title,
      notes: r.workout.notes,
      status: r.workout.status as WorkoutStatus,
      publishAt: r.workout.publishAt,
      blocks: blocks.get(r.workout.id) ?? [],
      createdBy: r.workout.createdBy,
      updatedAt: r.workout.updatedAt,
      plan:
        r.workout.planId && r.planName && r.planStructure
          ? {
              id: r.workout.planId,
              name: r.planName,
              startsOn: r.planStartsOn ?? r.workout.onDate,
              weeks: r.planWeeks ?? r.planStructure.weeks.length,
              structure: r.planStructure,
            }
          : null,
      planWeek: r.workout.planWeek,
      dayRole: r.workout.dayRole as DayRole | null,
      intentDomain: r.workout.intentDomain as TimeDomain | null,
      intentEffort: r.workout.intentEffort,
      intentFeel: r.workout.intentFeel,
      why: r.workout.why,
    }));
  }

  async function byId(scope: OrgScope, id: string): Promise<WorkoutRecord | null> {
    const rows = await base().where(
      and(eq(schema.workouts.organizationId, scope.organizationId), eq(schema.workouts.id, id)),
    );
    return (await toRecords(scope, rows))[0] ?? null;
  }

  async function writeBlocks(tx: Tx, scope: OrgScope, workoutId: string, input: WorkoutUpsert) {
    const existing = await tx
      .select({ id: schema.workoutBlocks.id, sortOrder: schema.workoutBlocks.sortOrder })
      .from(schema.workoutBlocks)
      .where(eq(schema.workoutBlocks.workoutId, workoutId))
      .orderBy(asc(schema.workoutBlocks.sortOrder));
    for (const [i, block] of input.blocks.entries()) {
      const values = {
        sortOrder: i,
        kind: block.kind,
        title: block.title,
        description: block.description?.trim() ? block.description.trim() : null,
        scoreType: block.scoreType,
        timeCapSeconds: block.timeCapSeconds ?? null,
        movementCode: block.movementCode ?? null,
        percent: block.percent ?? null,
        rmReps: block.rmReps ?? null,
        foundations: block.foundations?.trim() ? block.foundations.trim() : null,
        scaled: block.scaled?.trim() ? block.scaled.trim() : null,
        rx: block.rx?.trim() ? block.rx.trim() : null,
        rxPlus: block.rxPlus?.trim() ? block.rxPlus.trim() : null,
        capacity: block.capacity ?? null,
        plannedMinutes: block.plannedMinutes ?? null,
        exerciseIds: [...new Set(block.exerciseIds ?? [])],
        track: block.track ?? "class",
      };
      const current = existing[i];
      if (current) {
        await tx
          .update(schema.workoutBlocks)
          .set(values)
          .where(eq(schema.workoutBlocks.id, current.id));
      } else {
        await tx.insert(schema.workoutBlocks).values({
          organizationId: scope.organizationId,
          workoutId,
          ...values,
        });
      }
    }
    const extra = existing.slice(input.blocks.length).map((b) => b.id);
    if (extra.length > 0)
      await tx.delete(schema.workoutBlocks).where(inArray(schema.workoutBlocks.id, extra));
  }

  async function knownSectionAndTeam(scope: OrgScope, sectionId: string, teamId: string | null) {
    const section = await db()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(
        and(
          eq(schema.sections.organizationId, scope.organizationId),
          eq(schema.sections.id, sectionId),
        ),
      )
      .limit(1);
    if (!section[0]) return false;
    if (!teamId) return true;
    const team = await db()
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.organizationId, scope.organizationId),
          eq(schema.teams.id, teamId),
          eq(schema.teams.sectionId, sectionId),
        ),
      )
      .limit(1);
    return Boolean(team[0]);
  }

  const resultSelection = {
    id: schema.workoutResults.id,
    blockId: schema.workoutResults.blockId,
    playerId: schema.workoutResults.playerId,
    level: schema.workoutResults.level,
    timeSeconds: schema.workoutResults.timeSeconds,
    rounds: schema.workoutResults.rounds,
    reps: schema.workoutResults.reps,
    loadKg: schema.workoutResults.loadKg,
    distanceM: schema.workoutResults.distanceM,
    calories: schema.workoutResults.calories,
    completed: schema.workoutResults.completed,
    effort: schema.workoutResults.effort,
    note: schema.workoutResults.note,
    updatedAt: schema.workoutResults.updatedAt,
  };
  type ResultRow = {
    id: string;
    blockId: string;
    playerId: string;
    level: string;
    timeSeconds: number | null;
    rounds: number | null;
    reps: number | null;
    loadKg: string | null;
    distanceM: number | null;
    calories: number | null;
    completed: boolean;
    effort: number | null;
    note: string | null;
    updatedAt: Date;
  };
  const toResult = (r: ResultRow): ResultRecord => ({
    id: r.id,
    blockId: r.blockId,
    playerId: r.playerId,
    level: r.level as WorkoutLevel,
    score: scoreOf(r),
    completed: r.completed,
    effort: r.effort,
    note: r.note,
    updatedAt: r.updatedAt,
  });

  return {
    byId,

    /** WODs de un rango de días, de las disciplinas dadas (todas, si no se dicen). */
    async list(
      scope: OrgScope,
      from: string,
      to: string,
      filter: { sectionIds?: string[] | undefined; teamId?: string | undefined } = {},
    ): Promise<WorkoutRecord[]> {
      if (filter.sectionIds && filter.sectionIds.length === 0) return [];
      const rows = await base()
        .where(
          and(
            eq(schema.workouts.organizationId, scope.organizationId),
            gte(schema.workouts.onDate, from),
            lte(schema.workouts.onDate, to),
            filter.sectionIds ? inArray(schema.workouts.sectionId, filter.sectionIds) : undefined,
            filter.teamId
              ? or(eq(schema.workouts.teamId, filter.teamId), isNull(schema.workouts.teamId))
              : undefined,
          ),
        )
        .orderBy(asc(schema.workouts.onDate), asc(schema.sections.name));
      return toRecords(scope, rows);
    },

    /** El WOD de una clase: el de su tipo de clase ese día o, si no hay, el de su disciplina. */
    async forClass(
      scope: OrgScope,
      sectionId: string,
      teamId: string | null,
      date: string,
    ): Promise<WorkoutRecord | null> {
      const rows = await base().where(
        and(
          eq(schema.workouts.organizationId, scope.organizationId),
          eq(schema.workouts.sectionId, sectionId),
          eq(schema.workouts.onDate, date),
          teamId
            ? or(eq(schema.workouts.teamId, teamId), isNull(schema.workouts.teamId))
            : isNull(schema.workouts.teamId),
        ),
      );
      const records = await toRecords(scope, rows);
      return records.find((r) => r.team) ?? records[0] ?? null;
    },

    async upsert(
      scope: OrgScope,
      input: WorkoutUpsert,
      userId: string,
      id: string | null = null,
    ): Promise<
      | { outcome: "saved"; workout: WorkoutRecord; created: boolean }
      | { outcome: "not_found" }
      | { outcome: "unknown_section" }
      | { outcome: "taken" }
    > {
      const teamId = input.teamId ?? null;
      if (!(await knownSectionAndTeam(scope, input.sectionId, teamId)))
        return { outcome: "unknown_section" };
      if (input.planId) {
        const plan = await db()
          .select({ id: schema.boxPlans.id })
          .from(schema.boxPlans)
          .where(
            and(
              eq(schema.boxPlans.organizationId, scope.organizationId),
              eq(schema.boxPlans.id, input.planId),
              eq(schema.boxPlans.sectionId, input.sectionId),
            ),
          )
          .limit(1);
        if (!plan[0]) return { outcome: "unknown_section" };
      }
      // Solo ejercicios de la biblioteca del club.
      const wanted = [...new Set(input.blocks.flatMap((b) => b.exerciseIds ?? []))];
      if (wanted.length > 0) {
        const known = new Set(
          (
            await db()
              .select({ id: schema.exercises.id })
              .from(schema.exercises)
              .where(
                and(
                  eq(schema.exercises.organizationId, scope.organizationId),
                  inArray(schema.exercises.id, wanted),
                ),
              )
          ).map((e) => e.id),
        );
        input = {
          ...input,
          blocks: input.blocks.map((b) => ({
            ...b,
            exerciseIds: (b.exerciseIds ?? []).filter((id) => known.has(id)),
          })),
        };
      }
      const values = {
        sectionId: input.sectionId,
        teamId,
        onDate: input.onDate,
        title: input.title?.trim() ? input.title.trim() : null,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        status: input.status,
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        planId: input.planId ?? null,
        planWeek: input.planId ? (input.planWeek ?? null) : null,
        dayRole: input.dayRole ?? null,
        intentDomain: input.intentDomain ?? null,
        intentEffort: input.intentEffort ?? null,
        intentFeel: input.intentFeel?.trim() ? input.intentFeel.trim() : null,
        why: input.why?.trim() ? input.why.trim() : null,
      };
      try {
        const result = await db().transaction(async (tx) => {
          let workoutId = id;
          if (workoutId) {
            const updated = await tx
              .update(schema.workouts)
              .set(values)
              .where(
                and(
                  eq(schema.workouts.organizationId, scope.organizationId),
                  eq(schema.workouts.id, workoutId),
                ),
              )
              .returning({ id: schema.workouts.id });
            if (!updated[0]) return null;
          } else {
            const inserted = await tx
              .insert(schema.workouts)
              .values({ organizationId: scope.organizationId, ...values, createdBy: userId })
              .returning({ id: schema.workouts.id });
            workoutId = inserted[0]!.id;
          }
          await writeBlocks(tx, scope, workoutId, input);
          return workoutId;
        });
        if (!result) return { outcome: "not_found" };
        const workout = await byId(scope, result);
        if (!workout) return { outcome: "not_found" };
        return { outcome: "saved", workout, created: id === null };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "taken" };
        throw error;
      }
    },

    /**
     * Publica los borradores de un rango en unas disciplinas, ya (sin hora de publicación).
     * Devuelve cuántos.
     */
    async publishRange(
      scope: OrgScope,
      from: string,
      to: string,
      sectionIds: string[],
    ): Promise<number> {
      if (sectionIds.length === 0) return 0;
      const rows = await db()
        .update(schema.workouts)
        .set({ status: "published", publishAt: null })
        .where(
          and(
            eq(schema.workouts.organizationId, scope.organizationId),
            gte(schema.workouts.onDate, from),
            lte(schema.workouts.onDate, to),
            eq(schema.workouts.status, "draft"),
            inArray(schema.workouts.sectionId, sectionIds),
          ),
        )
        .returning({ id: schema.workouts.id });
      return rows.length;
    },

    async remove(scope: OrgScope, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.workouts)
        .where(
          and(eq(schema.workouts.organizationId, scope.organizationId), eq(schema.workouts.id, id)),
        )
        .returning({ id: schema.workouts.id });
      return rows.length > 0;
    },

    /** El bloque y su WOD, para registrar un resultado o ver la clasificación. */
    async blockById(
      scope: OrgScope,
      blockId: string,
    ): Promise<{ block: WorkoutBlockRecord; workout: WorkoutRecord } | null> {
      const rows = await db()
        .select({ workoutId: schema.workoutBlocks.workoutId })
        .from(schema.workoutBlocks)
        .where(
          and(
            eq(schema.workoutBlocks.organizationId, scope.organizationId),
            eq(schema.workoutBlocks.id, blockId),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      const workout = await byId(scope, rows[0].workoutId);
      const block = workout?.blocks.find((b) => b.id === blockId);
      return workout && block ? { block, workout } : null;
    },

    results: {
      async save(
        scope: OrgScope,
        blockId: string,
        playerId: string,
        input: WorkoutResult,
        recordedBy: string,
      ): Promise<ResultRecord> {
        const values = {
          level: input.level,
          ...scoreValues(input.score),
          completed: input.completed ?? true,
          effort: input.effort ?? null,
          note: input.note?.trim() ? input.note.trim() : null,
          recordedBy,
        };
        const rows = await db()
          .insert(schema.workoutResults)
          .values({ organizationId: scope.organizationId, blockId, playerId, ...values })
          .onConflictDoUpdate({
            target: [schema.workoutResults.blockId, schema.workoutResults.playerId],
            set: values,
          })
          .returning(resultSelection);
        return toResult(rows[0]!);
      },

      async remove(scope: OrgScope, blockId: string, playerId: string): Promise<boolean> {
        const rows = await db()
          .delete(schema.workoutResults)
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              eq(schema.workoutResults.blockId, blockId),
              eq(schema.workoutResults.playerId, playerId),
            ),
          )
          .returning({ id: schema.workoutResults.id });
        return rows.length > 0;
      },

      /** Los resultados de un atleta en unos bloques. */
      async ofPlayer(
        scope: OrgScope,
        playerId: string,
        blockIds: string[],
      ): Promise<Map<string, ResultRecord>> {
        const map = new Map<string, ResultRecord>();
        if (blockIds.length === 0) return map;
        const rows = await db()
          .select(resultSelection)
          .from(schema.workoutResults)
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              eq(schema.workoutResults.playerId, playerId),
              inArray(schema.workoutResults.blockId, blockIds),
            ),
          );
        for (const r of rows) map.set(r.blockId, toResult(r));
        return map;
      },

      /** Cuántos resultados tiene cada bloque. */
      async counts(scope: OrgScope, blockIds: string[]): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        if (blockIds.length === 0) return map;
        const rows = await db()
          .select({ blockId: schema.workoutResults.blockId, n: sql<number>`count(*)` })
          .from(schema.workoutResults)
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              inArray(schema.workoutResults.blockId, blockIds),
            ),
          )
          .groupBy(schema.workoutResults.blockId);
        for (const r of rows) map.set(r.blockId, Number(r.n));
        return map;
      },

      /** Todos los resultados de un bloque con el nombre del atleta y si prefiere no salir. */
      async forBlock(scope: OrgScope, blockId: string): Promise<ResultWithPlayer[]> {
        const rows = await db()
          .select({
            ...resultSelection,
            firstName: schema.people.firstName,
            lastName: schema.people.lastName,
            hidden: schema.fitnessPreferences.hideFromLeaderboards,
          })
          .from(schema.workoutResults)
          .innerJoin(schema.players, eq(schema.players.id, schema.workoutResults.playerId))
          .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
          .leftJoin(
            schema.fitnessPreferences,
            eq(schema.fitnessPreferences.playerId, schema.workoutResults.playerId),
          )
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              eq(schema.workoutResults.blockId, blockId),
            ),
          );
        return rows.map((r) => ({
          ...toResult(r),
          firstName: r.firstName,
          lastName: r.lastName,
          hidden: r.hidden ?? false,
        }));
      },

      /** Tipos de bloque trabajados por el atleta desde una fecha (para el reparto del trabajo). */
      async kindsSince(scope: OrgScope, playerId: string, since: string) {
        const rows = await db()
          .select({ kind: schema.workoutBlocks.kind, n: sql<number>`count(*)` })
          .from(schema.workoutResults)
          .innerJoin(
            schema.workoutBlocks,
            eq(schema.workoutBlocks.id, schema.workoutResults.blockId),
          )
          .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutBlocks.workoutId))
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              eq(schema.workoutResults.playerId, playerId),
              gte(schema.workouts.onDate, since),
            ),
          )
          .groupBy(schema.workoutBlocks.kind);
        return rows.map((r) => ({ kind: r.kind as WorkoutBlockKind, count: Number(r.n) }));
      },
    },

    records: {
      async list(scope: OrgScope, playerIds: string[]): Promise<Map<string, PersonalRecordRow[]>> {
        const map = new Map<string, PersonalRecordRow[]>();
        if (playerIds.length === 0) return map;
        const rows = await db()
          .select()
          .from(schema.personalRecords)
          .where(
            and(
              eq(schema.personalRecords.organizationId, scope.organizationId),
              inArray(schema.personalRecords.playerId, playerIds),
            ),
          )
          .orderBy(desc(schema.personalRecords.onDate), desc(schema.personalRecords.createdAt));
        for (const r of rows) {
          const list = map.get(r.playerId) ?? [];
          list.push({
            id: r.id,
            movementCode: r.movementCode,
            reps: r.reps,
            loadKg: Number(r.loadKg),
            onDate: r.onDate,
            note: r.note,
            source: r.source as "manual" | "result",
          });
          map.set(r.playerId, list);
        }
        return map;
      },

      async add(
        scope: OrgScope,
        playerId: string,
        input: PersonalRecordCreate,
        extra: { source?: "manual" | "result"; resultId?: string | null } = {},
      ): Promise<PersonalRecordRow> {
        const rows = await db()
          .insert(schema.personalRecords)
          .values({
            organizationId: scope.organizationId,
            playerId,
            movementCode: input.movementCode,
            reps: input.reps,
            loadKg: String(input.loadKg),
            onDate: input.onDate,
            note: input.note?.trim() ? input.note.trim() : null,
            source: extra.source ?? "manual",
            resultId: extra.resultId ?? null,
          })
          .returning();
        const r = rows[0]!;
        return {
          id: r.id,
          movementCode: r.movementCode,
          reps: r.reps,
          loadKg: Number(r.loadKg),
          onDate: r.onDate,
          note: r.note,
          source: r.source as "manual" | "result",
        };
      },

      /** El registro que salió de un resultado: se actualiza si el atleta corrige el resultado. */
      async forResult(scope: OrgScope, resultId: string) {
        const rows = await db()
          .select({ id: schema.personalRecords.id })
          .from(schema.personalRecords)
          .where(
            and(
              eq(schema.personalRecords.organizationId, scope.organizationId),
              eq(schema.personalRecords.resultId, resultId),
            ),
          )
          .limit(1);
        return rows[0]?.id ?? null;
      },

      async updateLoad(scope: OrgScope, id: string, loadKg: number, onDate: string) {
        await db()
          .update(schema.personalRecords)
          .set({ loadKg: String(loadKg), onDate })
          .where(
            and(
              eq(schema.personalRecords.organizationId, scope.organizationId),
              eq(schema.personalRecords.id, id),
            ),
          );
      },

      async remove(scope: OrgScope, playerId: string, id: string): Promise<boolean> {
        const rows = await db()
          .delete(schema.personalRecords)
          .where(
            and(
              eq(schema.personalRecords.organizationId, scope.organizationId),
              eq(schema.personalRecords.playerId, playerId),
              eq(schema.personalRecords.id, id),
            ),
          )
          .returning({ id: schema.personalRecords.id });
        return rows.length > 0;
      },
    },

    benchmarks: {
      async list(scope: OrgScope, playerId: string): Promise<BenchmarkRow[]> {
        const rows = await db()
          .select()
          .from(schema.benchmarkResults)
          .where(
            and(
              eq(schema.benchmarkResults.organizationId, scope.organizationId),
              eq(schema.benchmarkResults.playerId, playerId),
            ),
          )
          .orderBy(desc(schema.benchmarkResults.onDate), desc(schema.benchmarkResults.createdAt));
        return rows.map((r) => ({
          id: r.id,
          benchmarkCode: r.benchmarkCode,
          level: r.level as WorkoutLevel,
          score: scoreOf(r),
          completed: r.completed,
          onDate: r.onDate,
          note: r.note,
        }));
      },

      async add(scope: OrgScope, playerId: string, input: BenchmarkResultCreate): Promise<string> {
        const rows = await db()
          .insert(schema.benchmarkResults)
          .values({
            organizationId: scope.organizationId,
            playerId,
            benchmarkCode: input.benchmarkCode,
            level: input.level,
            ...scoreValues(input.score),
            completed: input.completed ?? true,
            onDate: input.onDate,
            note: input.note?.trim() ? input.note.trim() : null,
          })
          .returning({ id: schema.benchmarkResults.id });
        return rows[0]!.id;
      },

      async remove(scope: OrgScope, playerId: string, id: string): Promise<boolean> {
        const rows = await db()
          .delete(schema.benchmarkResults)
          .where(
            and(
              eq(schema.benchmarkResults.organizationId, scope.organizationId),
              eq(schema.benchmarkResults.playerId, playerId),
              eq(schema.benchmarkResults.id, id),
            ),
          )
          .returning({ id: schema.benchmarkResults.id });
        return rows.length > 0;
      },
    },

    body: {
      async list(scope: OrgScope, playerId: string): Promise<BodyRow[]> {
        const rows = await db()
          .select()
          .from(schema.bodyMeasurements)
          .where(
            and(
              eq(schema.bodyMeasurements.organizationId, scope.organizationId),
              eq(schema.bodyMeasurements.playerId, playerId),
            ),
          )
          .orderBy(desc(schema.bodyMeasurements.onDate), desc(schema.bodyMeasurements.createdAt));
        return rows.map((r) => ({
          id: r.id,
          onDate: r.onDate,
          weightKg: num(r.weightKg),
          bodyFatPct: num(r.bodyFatPct),
          waistCm: num(r.waistCm),
          hipCm: num(r.hipCm),
          chestCm: num(r.chestCm),
          armCm: num(r.armCm),
          thighCm: num(r.thighCm),
          note: r.note,
        }));
      },

      async add(scope: OrgScope, playerId: string, input: BodyMeasurementCreate): Promise<string> {
        const str = (v: number | null | undefined) =>
          v === null || v === undefined ? null : String(v);
        const rows = await db()
          .insert(schema.bodyMeasurements)
          .values({
            organizationId: scope.organizationId,
            playerId,
            onDate: input.onDate,
            weightKg: str(input.weightKg),
            bodyFatPct: str(input.bodyFatPct),
            waistCm: str(input.waistCm),
            hipCm: str(input.hipCm),
            chestCm: str(input.chestCm),
            armCm: str(input.armCm),
            thighCm: str(input.thighCm),
            note: input.note?.trim() ? input.note.trim() : null,
          })
          .returning({ id: schema.bodyMeasurements.id });
        return rows[0]!.id;
      },

      async remove(scope: OrgScope, playerId: string, id: string): Promise<boolean> {
        const rows = await db()
          .delete(schema.bodyMeasurements)
          .where(
            and(
              eq(schema.bodyMeasurements.organizationId, scope.organizationId),
              eq(schema.bodyMeasurements.playerId, playerId),
              eq(schema.bodyMeasurements.id, id),
            ),
          )
          .returning({ id: schema.bodyMeasurements.id });
        return rows.length > 0;
      },
    },

    preferences: {
      async get(scope: OrgScope, playerId: string): Promise<FitnessPreferences> {
        const rows = await db()
          .select()
          .from(schema.fitnessPreferences)
          .where(
            and(
              eq(schema.fitnessPreferences.organizationId, scope.organizationId),
              eq(schema.fitnessPreferences.playerId, playerId),
            ),
          )
          .limit(1);
        const r = rows[0];
        return r
          ? {
              hideFromAttendees: r.hideFromAttendees,
              hideFromLeaderboards: r.hideFromLeaderboards,
              shareBodyWithCoach: r.shareBodyWithCoach,
            }
          : DEFAULT_FITNESS_PREFERENCES;
      },

      async set(
        scope: OrgScope,
        playerId: string,
        patch: Partial<FitnessPreferences>,
      ): Promise<FitnessPreferences> {
        const next = { ...(await this.get(scope, playerId)), ...patch };
        await db()
          .insert(schema.fitnessPreferences)
          .values({ organizationId: scope.organizationId, playerId, ...next })
          .onConflictDoUpdate({ target: schema.fitnessPreferences.playerId, set: next });
        return next;
      },
    },
  };
}
