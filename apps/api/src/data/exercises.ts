import { schema, type Database } from "@sportsmanager/db";
import type {
  ExerciseCategory,
  ExerciseCreate,
  ExerciseEquipment,
  ExerciseStatus,
  ExerciseUpdate,
} from "@sportsmanager/shared";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Biblioteca de ejercicios del box (ADR 0050): cómo se hace cada ejercicio, en qué fijarse, los
 * errores de siempre, cómo se escala y su vídeo. Todo bajo el ámbito del club; el nombre es único
 * en el club sin distinguir mayúsculas.
 */

export interface ExerciseRecord {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: ExerciseEquipment[];
  movementCode: string | null;
  description: string | null;
  coachingPoints: string | null;
  commonFaults: string | null;
  scaling: string | null;
  videoUrl: string | null;
  section: { id: string; name: string } | null;
  status: ExerciseStatus;
  updatedAt: Date;
}

export type ExerciseWriteOutcome =
  | { outcome: "saved"; exercise: ExerciseRecord }
  | { outcome: "name_taken" }
  | { outcome: "unknown_section" }
  | { outcome: "not_found" };

const selection = {
  id: schema.exercises.id,
  name: schema.exercises.name,
  category: schema.exercises.category,
  equipment: schema.exercises.equipment,
  movementCode: schema.exercises.movementCode,
  description: schema.exercises.description,
  coachingPoints: schema.exercises.coachingPoints,
  commonFaults: schema.exercises.commonFaults,
  scaling: schema.exercises.scaling,
  videoUrl: schema.exercises.videoUrl,
  sectionId: schema.exercises.sectionId,
  sectionName: schema.sections.name,
  status: schema.exercises.status,
  updatedAt: schema.exercises.updatedAt,
};

/** Texto opcional: vacío es nulo. */
const blankToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

export function exercisesRepo(db: () => Database) {
  const query = () =>
    db()
      .select(selection)
      .from(schema.exercises)
      .leftJoin(schema.sections, eq(schema.sections.id, schema.exercises.sectionId));
  type Row = Awaited<ReturnType<ReturnType<typeof query>["execute"]>>[number];

  function toRecord(row: Row): ExerciseRecord {
    return {
      id: row.id,
      name: row.name,
      category: row.category as ExerciseCategory,
      equipment: (row.equipment ?? []) as ExerciseEquipment[],
      movementCode: row.movementCode,
      description: row.description,
      coachingPoints: row.coachingPoints,
      commonFaults: row.commonFaults,
      scaling: row.scaling,
      videoUrl: row.videoUrl,
      section:
        row.sectionId && row.sectionName ? { id: row.sectionId, name: row.sectionName } : null,
      status: row.status as ExerciseStatus,
      updatedAt: row.updatedAt,
    };
  }

  async function byId(scope: OrgScope, id: string): Promise<ExerciseRecord | null> {
    const rows = await query()
      .where(
        and(eq(schema.exercises.organizationId, scope.organizationId), eq(schema.exercises.id, id)),
      )
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async function sectionInClub(scope: OrgScope, sectionId: string): Promise<boolean> {
    const rows = await db()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(
        and(
          eq(schema.sections.organizationId, scope.organizationId),
          eq(schema.sections.id, sectionId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  return {
    byId,

    /** Los ejercicios del club por nombre: activos y, si se pide, también los archivados. */
    async list(
      scope: OrgScope,
      filter: {
        search?: string | undefined;
        category?: ExerciseCategory | undefined;
        includeArchived?: boolean;
      } = {},
    ): Promise<ExerciseRecord[]> {
      const search = filter.search?.trim();
      const rows = await query()
        .where(
          and(
            eq(schema.exercises.organizationId, scope.organizationId),
            filter.includeArchived ? undefined : eq(schema.exercises.status, "active"),
            filter.category ? eq(schema.exercises.category, filter.category) : undefined,
            search
              ? or(
                  ilike(schema.exercises.name, `%${search}%`),
                  ilike(schema.exercises.description, `%${search}%`),
                )
              : undefined,
          ),
        )
        .orderBy(asc(sql`lower(${schema.exercises.name})`));
      return rows.map(toRecord);
    },

    /** Los nombres de los ejercicios activos, para el contexto de la propuesta con IA. */
    async names(scope: OrgScope, sectionIds?: string[]): Promise<string[]> {
      const rows = await db()
        .select({ name: schema.exercises.name })
        .from(schema.exercises)
        .where(
          and(
            eq(schema.exercises.organizationId, scope.organizationId),
            eq(schema.exercises.status, "active"),
            sectionIds && sectionIds.length > 0
              ? or(
                  sql`${schema.exercises.sectionId} is null`,
                  inArray(schema.exercises.sectionId, sectionIds),
                )
              : undefined,
          ),
        )
        .orderBy(asc(sql`lower(${schema.exercises.name})`));
      return rows.map((r) => r.name);
    },

    async create(
      scope: OrgScope,
      input: ExerciseCreate,
      createdBy: string,
    ): Promise<ExerciseWriteOutcome> {
      if (input.sectionId && !(await sectionInClub(scope, input.sectionId)))
        return { outcome: "unknown_section" };
      try {
        const rows = await db()
          .insert(schema.exercises)
          .values({
            organizationId: scope.organizationId,
            name: input.name.trim(),
            category: input.category,
            equipment: [...new Set(input.equipment ?? [])],
            movementCode: input.movementCode ?? null,
            description: blankToNull(input.description) ?? null,
            coachingPoints: blankToNull(input.coachingPoints) ?? null,
            commonFaults: blankToNull(input.commonFaults) ?? null,
            scaling: blankToNull(input.scaling) ?? null,
            videoUrl: blankToNull(input.videoUrl) ?? null,
            sectionId: input.sectionId ?? null,
            createdBy,
          })
          .returning({ id: schema.exercises.id });
        const exercise = await byId(scope, rows[0]!.id);
        return { outcome: "saved", exercise: exercise! };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: ExerciseUpdate,
    ): Promise<ExerciseWriteOutcome> {
      if (patch.sectionId && !(await sectionInClub(scope, patch.sectionId)))
        return { outcome: "unknown_section" };
      const values: Partial<typeof schema.exercises.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name.trim();
      if (patch.category !== undefined) values.category = patch.category;
      if (patch.equipment !== undefined) values.equipment = [...new Set(patch.equipment)];
      if (patch.movementCode !== undefined) values.movementCode = patch.movementCode;
      const text = [
        "description",
        "coachingPoints",
        "commonFaults",
        "scaling",
        "videoUrl",
      ] as const;
      for (const key of text) {
        const value = blankToNull(patch[key]);
        if (value !== undefined) values[key] = value;
      }
      if (patch.sectionId !== undefined) values.sectionId = patch.sectionId;
      if (patch.status !== undefined) values.status = patch.status;
      try {
        const rows = await db()
          .update(schema.exercises)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(
              eq(schema.exercises.organizationId, scope.organizationId),
              eq(schema.exercises.id, id),
            ),
          )
          .returning({ id: schema.exercises.id });
        if (!rows[0]) return { outcome: "not_found" };
        const exercise = await byId(scope, id);
        return { outcome: "saved", exercise: exercise! };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },
  };
}
