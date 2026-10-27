import { schema, type Database } from "@sportsmanager/db";
import {
  PLAN_TESTS,
  WORKOUT_LEVELS,
  estimateOneRm,
  type AthletePreview,
  type BoxEquipmentKind,
  type Capacity,
  type Emphasis,
  type EquipmentItemInput,
  type InventoryLine,
  type LevelCapacity,
  type PlanAudience,
  type PlanningSettings,
  type ProgrammingFeeStatus,
  type PlanStatus,
  type PlanStructure,
  type PlanTemplateCode,
  type Projection,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql, sum } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Planificación del box (ADR 0053): el material de la sala, los ajustes de la programación, los
 * planes con su estructura, lo que se decide en la revisión del domingo y el nivel que cada atleta
 * fija. Y las consultas que alimentan el plan: horario de la disciplina, quién viene y cómo, el
 * reparto de niveles, los resultados de una semana y las marcas de los tests. Todo bajo el ámbito
 * del club (ADR 0015).
 */

export interface EquipmentRecord {
  id: string;
  kind: BoxEquipmentKind;
  name: string;
  quantity: number;
  outOfService: number;
  repairUntil: string | null;
  minKg: number | null;
  maxKg: number | null;
  facility: { id: string; name: string } | null;
  notes: string | null;
}

export interface BoxPlanRecord {
  id: string;
  section: { id: string; name: string };
  name: string;
  templateCode: PlanTemplateCode;
  goal: string | null;
  eventName: string | null;
  eventDate: string | null;
  startsOn: string;
  weeks: number;
  emphasis: Emphasis;
  frequency: number;
  tests: string[];
  closures: string[];
  structure: PlanStructure;
  projection: Projection | null;
  status: PlanStatus;
  /** Para quién (ADR 0054): todo el box, un nivel, un grupo o una persona. */
  audience: PlanAudience;
  audienceLevel: WorkoutLevel | null;
  audienceName: string | null;
  /** Días de entreno; vacío, los días con clase de la disciplina. */
  weekdays: number[];
  /** Atletas del plan (0 en uno de todo el box). */
  members: number;
  createdAt: Date;
}

/** Un atleta de la lista de un plan, o que podría entrar en él. */
export interface PlanAthleteRow {
  playerId: string;
  firstName: string;
  lastName: string;
  photoBlobKey: string | null;
}

/** El plan propio activo de un atleta, para avisar antes de solaparlo. */
export interface ActivePlanRef {
  id: string;
  name: string;
  audience: PlanAudience;
  sectionId: string;
}

export interface NewBoxPlan {
  sectionId: string;
  name: string;
  templateCode: PlanTemplateCode;
  goal: string | null;
  eventName: string | null;
  eventDate: string | null;
  startsOn: string;
  weeks: number;
  emphasis: Emphasis;
  frequency: number;
  tests: string[];
  closures: string[];
  structure: PlanStructure;
  projection: Projection | null;
  status: PlanStatus;
  audience?: PlanAudience;
  audienceLevel?: WorkoutLevel | null;
  audienceName?: string | null;
  weekdays?: number[];
}

export interface BlockResultRow {
  blockId: string;
  playerId: string;
  level: WorkoutLevel;
  timeSeconds: number | null;
  reps: number | null;
  completed: boolean;
  effort: number | null;
}

/** Una marca de un test: la 1RM (real o estimada), un tiempo, rondas o repeticiones, y su fecha. */
export interface TestMark {
  playerId: string;
  code: string;
  value: number;
  date: string;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));
const DEFAULT_SETTINGS: PlanningSettings = {
  levelNames: { foundations: null, scaled: null, rx: null, rx_plus: null },
  athletePreview: "roles",
};

export function planningRepo(db: () => Database) {
  const e = schema.boxEquipment;
  const p = schema.boxPlans;

  const equipmentSelection = {
    id: e.id,
    kind: e.kind,
    name: e.name,
    quantity: e.quantity,
    outOfService: e.outOfService,
    repairUntil: e.repairUntil,
    minKg: e.minKg,
    maxKg: e.maxKg,
    facilityId: e.facilityId,
    facilityName: schema.facilities.name,
    notes: e.notes,
  };
  type EquipmentRow = {
    id: string;
    kind: string;
    name: string;
    quantity: number;
    outOfService: number;
    repairUntil: string | null;
    minKg: string | null;
    maxKg: string | null;
    facilityId: string | null;
    facilityName: string | null;
    notes: string | null;
  };
  const toEquipment = (r: EquipmentRow): EquipmentRecord => ({
    id: r.id,
    kind: r.kind as BoxEquipmentKind,
    name: r.name,
    quantity: r.quantity,
    outOfService: r.outOfService,
    repairUntil: r.repairUntil,
    minKg: num(r.minKg),
    maxKg: num(r.maxKg),
    facility: r.facilityId && r.facilityName ? { id: r.facilityId, name: r.facilityName } : null,
    notes: r.notes,
  });

  async function knownFacility(scope: OrgScope, id: string | null | undefined) {
    if (!id) return true;
    const rows = await db()
      .select({ id: schema.facilities.id })
      .from(schema.facilities)
      .where(
        and(
          eq(schema.facilities.organizationId, scope.organizationId),
          eq(schema.facilities.id, id),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  const equipmentValues = (input: EquipmentItemInput) => ({
    kind: input.kind,
    name: input.name.trim(),
    quantity: input.quantity,
    outOfService: input.outOfService,
    repairUntil: input.outOfService > 0 ? (input.repairUntil ?? null) : null,
    minKg: input.minKg == null ? null : String(input.minKg),
    maxKg: input.maxKg == null ? null : String(input.maxKg),
    facilityId: input.facilityId ?? null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  });

  const m = schema.boxPlanMembers;
  const planSelection = {
    plan: p,
    sectionName: schema.sections.name,
    members: sql<number>`(select count(*)::int from ${m} where ${m.planId} = ${p.id})`,
  };
  const planBase = () =>
    db()
      .select(planSelection)
      .from(p)
      .innerJoin(schema.sections, eq(schema.sections.id, p.sectionId));
  type PlanRow = Awaited<ReturnType<ReturnType<typeof planBase>["execute"]>>[number];
  const toPlan = (r: PlanRow): BoxPlanRecord => ({
    id: r.plan.id,
    section: { id: r.plan.sectionId, name: r.sectionName },
    name: r.plan.name,
    templateCode: r.plan.templateCode as PlanTemplateCode,
    goal: r.plan.goal,
    eventName: r.plan.eventName,
    eventDate: r.plan.eventDate,
    startsOn: r.plan.startsOn,
    weeks: r.plan.weeks,
    emphasis: r.plan.emphasis,
    frequency: r.plan.frequency,
    tests: r.plan.tests,
    closures: r.plan.closures,
    structure: r.plan.structure,
    projection: (r.plan.projection as Projection | null) ?? null,
    status: r.plan.status as PlanStatus,
    audience: r.plan.audience as PlanAudience,
    audienceLevel: (r.plan.audienceLevel as WorkoutLevel | null) ?? null,
    audienceName: r.plan.audienceName,
    weekdays: r.plan.weekdays,
    members: Number(r.members ?? 0),
    createdAt: r.plan.createdAt,
  });

  /**
   * Saca a unos atletas de los planes propios activos en los que estén (salvo `keep`): es "anular
   * su programación" antes de pasarlos a otra. Un plan de una persona que se queda sin nadie se
   * archiva.
   */
  async function detachFromActive(
    tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
    scope: OrgScope,
    playerIds: string[],
    keep: string | null,
  ) {
    if (playerIds.length === 0) return;
    const rows = await tx
      .select({ id: m.id, planId: m.planId })
      .from(m)
      .innerJoin(p, eq(p.id, m.planId))
      .where(
        and(
          eq(m.organizationId, scope.organizationId),
          inArray(m.playerId, playerIds),
          eq(p.status, "active"),
          ne(p.audience, "section"),
          keep ? ne(p.id, keep) : undefined,
        ),
      );
    if (rows.length === 0) return;
    await tx.delete(m).where(
      inArray(
        m.id,
        rows.map((r) => r.id),
      ),
    );
    const touched = [...new Set(rows.map((r) => r.planId))];
    const empty = await tx
      .select({ id: p.id })
      .from(p)
      .where(
        and(
          inArray(p.id, touched),
          eq(p.audience, "athlete"),
          sql`not exists (select 1 from ${m} where ${m.planId} = ${p.id})`,
        ),
      );
    if (empty.length > 0)
      await tx
        .update(p)
        .set({ status: "archived" })
        .where(
          inArray(
            p.id,
            empty.map((e) => e.id),
          ),
        );
  }

  /** Fecha local de una clase en SQL. */
  const localDay = (timezone: string) =>
    sql<string>`to_char((${schema.events.startsAt} AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD')`;

  return {
    // --- Material ---

    equipment: {
      async list(scope: OrgScope): Promise<EquipmentRecord[]> {
        const rows = await db()
          .select(equipmentSelection)
          .from(e)
          .leftJoin(schema.facilities, eq(schema.facilities.id, e.facilityId))
          .where(eq(e.organizationId, scope.organizationId))
          .orderBy(asc(e.sortOrder), asc(e.name));
        return rows.map(toEquipment);
      },

      /** Líneas del inventario como las usa el planificador. */
      async lines(
        scope: OrgScope,
      ): Promise<(InventoryLine & { name: string; weights: string | null })[]> {
        const list = await this.list(scope);
        return list.map((x) => ({
          kind: x.kind,
          name: x.name,
          quantity: x.quantity,
          outOfService: x.outOfService,
          repairUntil: x.repairUntil,
          weights: x.minKg !== null && x.maxKg !== null ? `${x.minKg}-${x.maxKg} kg` : x.notes,
        }));
      },

      async byId(scope: OrgScope, id: string): Promise<EquipmentRecord | null> {
        const rows = await db()
          .select(equipmentSelection)
          .from(e)
          .leftJoin(schema.facilities, eq(schema.facilities.id, e.facilityId))
          .where(and(eq(e.organizationId, scope.organizationId), eq(e.id, id)))
          .limit(1);
        return rows[0] ? toEquipment(rows[0]) : null;
      },

      async create(
        scope: OrgScope,
        input: EquipmentItemInput,
      ): Promise<EquipmentRecord | "unknown_facility"> {
        if (!(await knownFacility(scope, input.facilityId))) return "unknown_facility";
        const max = await db()
          .select({ sort: sql<number>`coalesce(max(${e.sortOrder}), 0)` })
          .from(e)
          .where(eq(e.organizationId, scope.organizationId));
        const rows = await db()
          .insert(e)
          .values({
            organizationId: scope.organizationId,
            ...equipmentValues(input),
            sortOrder: Number(max[0]?.sort ?? 0) + 10,
          })
          .returning({ id: e.id });
        return (await this.byId(scope, rows[0]!.id))!;
      },

      async update(
        scope: OrgScope,
        id: string,
        input: EquipmentItemInput,
      ): Promise<EquipmentRecord | "unknown_facility" | null> {
        if (!(await knownFacility(scope, input.facilityId))) return "unknown_facility";
        const rows = await db()
          .update(e)
          .set(equipmentValues(input))
          .where(and(eq(e.organizationId, scope.organizationId), eq(e.id, id)))
          .returning({ id: e.id });
        return rows[0] ? this.byId(scope, id) : null;
      },

      async remove(scope: OrgScope, id: string): Promise<boolean> {
        const rows = await db()
          .delete(e)
          .where(and(eq(e.organizationId, scope.organizationId), eq(e.id, id)))
          .returning({ id: e.id });
        return rows.length > 0;
      },
    },

    // --- Ajustes ---

    settings: {
      async get(scope: OrgScope): Promise<PlanningSettings> {
        const rows = await db()
          .select()
          .from(schema.planningSettings)
          .where(eq(schema.planningSettings.organizationId, scope.organizationId))
          .limit(1);
        const row = rows[0];
        if (!row) return DEFAULT_SETTINGS;
        const names = row.levelNames ?? {};
        return {
          levelNames: {
            foundations: names.foundations ?? null,
            scaled: names.scaled ?? null,
            rx: names.rx ?? null,
            rx_plus: names.rx_plus ?? null,
          },
          athletePreview: row.athletePreview as AthletePreview,
        };
      },

      async update(scope: OrgScope, patch: Partial<PlanningSettings>): Promise<PlanningSettings> {
        const current = await this.get(scope);
        const next: PlanningSettings = {
          levelNames: { ...current.levelNames, ...(patch.levelNames ?? {}) },
          athletePreview: patch.athletePreview ?? current.athletePreview,
        };
        const levelNames = Object.fromEntries(
          Object.entries(next.levelNames).filter(([, v]) => v !== null && v.trim() !== ""),
        );
        await db()
          .insert(schema.planningSettings)
          .values({
            organizationId: scope.organizationId,
            levelNames,
            athletePreview: next.athletePreview,
          })
          .onConflictDoUpdate({
            target: schema.planningSettings.organizationId,
            set: { levelNames, athletePreview: next.athletePreview },
          });
        return this.get(scope);
      },
    },

    // --- Planes ---

    plans: {
      async list(scope: OrgScope, sectionIds?: string[]): Promise<BoxPlanRecord[]> {
        if (sectionIds && sectionIds.length === 0) return [];
        const rows = await planBase()
          .where(
            and(
              eq(p.organizationId, scope.organizationId),
              sectionIds ? inArray(p.sectionId, sectionIds) : undefined,
            ),
          )
          .orderBy(desc(p.startsOn));
        return rows.map(toPlan);
      },

      async byId(scope: OrgScope, id: string): Promise<BoxPlanRecord | null> {
        const rows = await planBase()
          .where(and(eq(p.organizationId, scope.organizationId), eq(p.id, id)))
          .limit(1);
        return rows[0] ? toPlan(rows[0]) : null;
      },

      /** Los planes activos de todo el box de cada disciplina (uno por disciplina). */
      async active(scope: OrgScope, sectionIds?: string[]): Promise<BoxPlanRecord[]> {
        if (sectionIds && sectionIds.length === 0) return [];
        const rows = await planBase().where(
          and(
            eq(p.organizationId, scope.organizationId),
            eq(p.status, "active"),
            eq(p.audience, "section"),
            sectionIds ? inArray(p.sectionId, sectionIds) : undefined,
          ),
        );
        return rows.map(toPlan);
      },

      /**
       * Crea un plan con sus atletas. `replace`: atletas que salen de su plan propio activo para
       * entrar en este. `replaceActive`: en uno de todo el box, termina el activo de la disciplina.
       */
      async create(
        scope: OrgScope,
        input: NewBoxPlan,
        userId: string,
        options: { members?: string[]; replace?: string[]; replaceActive?: boolean } = {},
      ): Promise<BoxPlanRecord | "active_taken"> {
        try {
          const id = await db().transaction(async (tx) => {
            if (
              options.replaceActive &&
              input.status === "active" &&
              (input.audience ?? "section") === "section"
            )
              await tx
                .update(p)
                .set({ status: "finished" })
                .where(
                  and(
                    eq(p.organizationId, scope.organizationId),
                    eq(p.sectionId, input.sectionId),
                    eq(p.status, "active"),
                    eq(p.audience, "section"),
                  ),
                );
            const rows = await tx
              .insert(p)
              .values({ organizationId: scope.organizationId, ...input, createdBy: userId })
              .returning({ id: p.id });
            const planId = rows[0]!.id;
            const members = [...new Set(options.members ?? [])];
            if (members.length > 0) {
              await detachFromActive(tx, scope, options.replace ?? [], planId);
              await tx.insert(m).values(
                members.map((playerId) => ({
                  organizationId: scope.organizationId,
                  planId,
                  playerId,
                  addedBy: userId,
                })),
              );
            }
            return planId;
          });
          return (await this.byId(scope, id))!;
        } catch (error) {
          if (isUniqueViolation(error)) return "active_taken";
          throw error;
        }
      },

      /** Atletas de un plan, por nombre. */
      async members(scope: OrgScope, planId: string): Promise<PlanAthleteRow[]> {
        return db()
          .select({
            playerId: m.playerId,
            firstName: schema.people.firstName,
            lastName: schema.people.lastName,
            photoBlobKey: schema.people.photoBlobKey,
          })
          .from(m)
          .innerJoin(schema.players, eq(schema.players.id, m.playerId))
          .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
          .where(and(eq(m.organizationId, scope.organizationId), eq(m.planId, planId)))
          .orderBy(asc(schema.people.firstName), asc(schema.people.lastName));
      },

      /**
       * El plan propio activo (de un nivel, un grupo o una persona) de cada uno de unos atletas,
       * sin contar `exclude`: lo que se solaparía si entran en otro.
       */
      async activeOf(
        scope: OrgScope,
        playerIds: string[],
        exclude: string | null = null,
      ): Promise<Map<string, ActivePlanRef>> {
        const out = new Map<string, ActivePlanRef>();
        if (playerIds.length === 0) return out;
        const rows = await db()
          .select({
            playerId: m.playerId,
            id: p.id,
            name: p.name,
            audience: p.audience,
            sectionId: p.sectionId,
          })
          .from(m)
          .innerJoin(p, eq(p.id, m.planId))
          .where(
            and(
              eq(m.organizationId, scope.organizationId),
              inArray(m.playerId, playerIds),
              eq(p.status, "active"),
              ne(p.audience, "section"),
              exclude ? ne(p.id, exclude) : undefined,
            ),
          );
        for (const r of rows)
          out.set(r.playerId, {
            id: r.id,
            name: r.name,
            audience: r.audience as PlanAudience,
            sectionId: r.sectionId,
          });
        return out;
      },

      /** El plan propio activo de un atleta, entero. */
      async specificOf(scope: OrgScope, playerId: string): Promise<BoxPlanRecord | null> {
        const rows = await planBase()
          .innerJoin(m, eq(m.planId, p.id))
          .where(
            and(
              eq(p.organizationId, scope.organizationId),
              eq(m.playerId, playerId),
              eq(p.status, "active"),
              ne(p.audience, "section"),
            ),
          )
          .orderBy(desc(p.startsOn))
          .limit(1);
        return rows[0] ? toPlan(rows[0]) : null;
      },

      /** Añade y quita atletas; los de `replace` salen antes de su plan propio activo. */
      async setMembers(
        scope: OrgScope,
        planId: string,
        change: { add: string[]; remove: string[]; replace: string[] },
        userId: string,
      ): Promise<void> {
        await db().transaction(async (tx) => {
          await detachFromActive(tx, scope, change.replace, planId);
          if (change.remove.length > 0)
            await tx
              .delete(m)
              .where(
                and(
                  eq(m.organizationId, scope.organizationId),
                  eq(m.planId, planId),
                  inArray(m.playerId, change.remove),
                ),
              );
          const add = [...new Set(change.add)].filter((id) => !change.remove.includes(id));
          if (add.length > 0)
            await tx
              .insert(m)
              .values(
                add.map((playerId) => ({
                  organizationId: scope.organizationId,
                  planId,
                  playerId,
                  addedBy: userId,
                })),
              )
              .onConflictDoNothing();
        });
      },

      async update(
        scope: OrgScope,
        id: string,
        patch: Partial<NewBoxPlan>,
      ): Promise<BoxPlanRecord | "active_taken" | null> {
        try {
          const rows = await db()
            .update(p)
            .set(patch)
            .where(and(eq(p.organizationId, scope.organizationId), eq(p.id, id)))
            .returning({ id: p.id });
          return rows[0] ? this.byId(scope, id) : null;
        } catch (error) {
          if (isUniqueViolation(error)) return "active_taken";
          throw error;
        }
      },

      /** Borra un plan: los WODs del box se quedan sin plan; las sesiones propias, con él. */
      async remove(scope: OrgScope, id: string): Promise<boolean> {
        return db().transaction(async (tx) => {
          await tx
            .delete(schema.workouts)
            .where(
              and(
                eq(schema.workouts.organizationId, scope.organizationId),
                eq(schema.workouts.planId, id),
                eq(schema.workouts.specific, true),
              ),
            );
          const rows = await tx
            .delete(p)
            .where(and(eq(p.organizationId, scope.organizationId), eq(p.id, id)))
            .returning({ id: p.id });
          return rows.length > 0;
        });
      },

      async workoutCount(scope: OrgScope, planId: string): Promise<number> {
        const rows = await db()
          .select({ n: count() })
          .from(schema.workouts)
          .where(
            and(
              eq(schema.workouts.organizationId, scope.organizationId),
              eq(schema.workouts.planId, planId),
            ),
          );
        return rows[0]?.n ?? 0;
      },
    },

    // --- Revisión del domingo ---

    adjustments: {
      async of(
        scope: OrgScope,
        planId: string,
        week: number,
      ): Promise<Map<string, "accepted" | "discarded">> {
        const rows = await db()
          .select({ key: schema.planAdjustments.key, status: schema.planAdjustments.status })
          .from(schema.planAdjustments)
          .where(
            and(
              eq(schema.planAdjustments.organizationId, scope.organizationId),
              eq(schema.planAdjustments.planId, planId),
              eq(schema.planAdjustments.week, week),
            ),
          );
        return new Map(rows.map((r) => [r.key, r.status as "accepted" | "discarded"]));
      },

      async decide(
        scope: OrgScope,
        planId: string,
        week: number,
        key: string,
        status: "accepted" | "discarded",
        userId: string,
      ): Promise<void> {
        await db()
          .insert(schema.planAdjustments)
          .values({
            organizationId: scope.organizationId,
            planId,
            week,
            key,
            status,
            decidedBy: userId,
          })
          .onConflictDoUpdate({
            target: [
              schema.planAdjustments.planId,
              schema.planAdjustments.week,
              schema.planAdjustments.key,
            ],
            set: { status, decidedBy: userId, decidedAt: new Date() },
          });
      },

      /** Cuántos ajustes se han aceptado y cuántos se han decidido en un plan. */
      async tally(scope: OrgScope, planId: string): Promise<{ accepted: number; decided: number }> {
        const rows = await db()
          .select({ status: schema.planAdjustments.status, n: count() })
          .from(schema.planAdjustments)
          .where(
            and(
              eq(schema.planAdjustments.organizationId, scope.organizationId),
              eq(schema.planAdjustments.planId, planId),
            ),
          )
          .groupBy(schema.planAdjustments.status);
        const accepted = rows.find((r) => r.status === "accepted")?.n ?? 0;
        return { accepted, decided: rows.reduce((s, r) => s + r.n, 0) };
      },
    },

    // --- Niveles del atleta ---

    levels: {
      async of(scope: OrgScope, playerId: string): Promise<Map<LevelCapacity, WorkoutLevel>> {
        const rows = await db()
          .select({ capacity: schema.athleteLevels.capacity, level: schema.athleteLevels.level })
          .from(schema.athleteLevels)
          .where(
            and(
              eq(schema.athleteLevels.organizationId, scope.organizationId),
              eq(schema.athleteLevels.playerId, playerId),
            ),
          );
        return new Map(rows.map((r) => [r.capacity as LevelCapacity, r.level as WorkoutLevel]));
      },

      async set(
        scope: OrgScope,
        playerId: string,
        capacity: LevelCapacity,
        level: WorkoutLevel | null,
      ): Promise<void> {
        if (level === null) {
          await db()
            .delete(schema.athleteLevels)
            .where(
              and(
                eq(schema.athleteLevels.organizationId, scope.organizationId),
                eq(schema.athleteLevels.playerId, playerId),
                eq(schema.athleteLevels.capacity, capacity),
              ),
            );
          return;
        }
        await db()
          .insert(schema.athleteLevels)
          .values({ organizationId: scope.organizationId, playerId, capacity, level })
          .onConflictDoUpdate({
            target: [schema.athleteLevels.playerId, schema.athleteLevels.capacity],
            set: { level },
          });
      },
    },

    // --- Lo que alimenta el plan ---

    /**
     * El horario de una disciplina: días con clase (lunes = 1), minutos de la clase más habitual y
     * plazas de la más grande, de los tipos de clase abiertos y activos de la temporada actual.
     */
    async schedule(
      scope: OrgScope,
      sectionId: string,
    ): Promise<{ weekdays: number[]; minutes: number; capacity: number }> {
      const rows = await db()
        .select({
          weekday: schema.teamSchedules.weekday,
          startsAt: schema.teamSchedules.startsAt,
          endsAt: schema.teamSchedules.endsAt,
          capacity: schema.teamSchedules.capacity,
          teamCapacity: schema.teams.capacity,
        })
        .from(schema.teamSchedules)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamSchedules.teamId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamSchedules.organizationId, scope.organizationId),
            eq(schema.teams.sectionId, sectionId),
            eq(schema.teams.bookingMode, "open"),
            eq(schema.teams.status, "active"),
            eq(schema.seasons.isCurrent, true),
          ),
        );
      const minutesOf = (a: string, b: string) => {
        const [ah, am] = a.split(":").map(Number);
        const [bh, bm] = b.split(":").map(Number);
        return bh! * 60 + bm! - (ah! * 60 + am!);
      };
      const durations = new Map<number, number>();
      for (const r of rows) {
        const m = minutesOf(r.startsAt, r.endsAt);
        if (m > 0) durations.set(m, (durations.get(m) ?? 0) + 1);
      }
      const minutes =
        [...durations.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 60;
      return {
        weekdays: [...new Set(rows.map((r) => r.weekday))].sort((a, b) => a - b),
        minutes: Math.min(minutes, 120),
        capacity: Math.max(0, ...rows.map((r) => r.capacity ?? r.teamCapacity ?? 0)),
      };
    },

    /** Asistencias (check-in o reserva hecha) a clases de una disciplina entre dos instantes. */
    async attendance(
      scope: OrgScope,
      sectionId: string | null,
      from: Date,
      to: Date,
      timezone: string,
      players?: string | string[],
    ): Promise<{ playerId: string; date: string; eventId: string }[]> {
      if (Array.isArray(players) && players.length === 0) return [];
      const rows = await db()
        .select({
          playerId: schema.bookings.playerId,
          date: localDay(timezone),
          eventId: schema.bookings.eventId,
        })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.status, "attended"),
            sectionId ? eq(schema.events.sectionId, sectionId) : undefined,
            typeof players === "string"
              ? eq(schema.bookings.playerId, players)
              : players
                ? inArray(schema.bookings.playerId, players)
                : undefined,
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        );
      return rows;
    },

    /** Reservas (hechas o por venir) de un atleta entre dos instantes, con su día. */
    async bookingsOf(
      scope: OrgScope,
      playerId: string,
      from: Date,
      to: Date,
      timezone: string,
    ): Promise<{ date: string; status: string; sectionId: string | null }[]> {
      return db()
        .select({
          date: localDay(timezone),
          status: schema.bookings.status,
          sectionId: schema.events.sectionId,
        })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.playerId, playerId),
            inArray(schema.bookings.status, ["booked", "waitlist", "attended"]),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        );
    },

    /** Clases abiertas de una disciplina por día: cuántas y las plazas de la más grande. */
    async classesByDay(
      scope: OrgScope,
      sectionId: string,
      from: Date,
      to: Date,
      timezone: string,
    ): Promise<Map<string, { count: number; capacity: number }>> {
      const rows = await db()
        .select({
          date: localDay(timezone),
          n: count(),
          capacity: sql<number>`coalesce(max(${schema.events.capacity}), 0)`,
        })
        .from(schema.events)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.sectionId, sectionId),
            eq(schema.teams.bookingMode, "open"),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        )
        // Por posición: con la zona como parámetro, dos expresiones iguales no son la misma para PG.
        .groupBy(sql`1`);
      return new Map(rows.map((r) => [r.date, { count: r.n, capacity: Number(r.capacity) }]));
    },

    /** El nivel que más usa cada atleta en los resultados de una disciplina desde una fecha. */
    async levelMix(
      scope: OrgScope,
      sectionId: string,
      since: string,
    ): Promise<Record<WorkoutLevel, number>> {
      const rows = await db()
        .select({
          playerId: schema.workoutResults.playerId,
          level: schema.workoutResults.level,
          n: count(),
        })
        .from(schema.workoutResults)
        .innerJoin(schema.workoutBlocks, eq(schema.workoutBlocks.id, schema.workoutResults.blockId))
        .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutBlocks.workoutId))
        .where(
          and(
            eq(schema.workoutResults.organizationId, scope.organizationId),
            eq(schema.workouts.sectionId, sectionId),
            gte(schema.workouts.onDate, since),
          ),
        )
        .groupBy(schema.workoutResults.playerId, schema.workoutResults.level);
      const best = new Map<string, { level: WorkoutLevel; n: number }>();
      for (const r of rows) {
        const cur = best.get(r.playerId);
        if (!cur || r.n > cur.n) best.set(r.playerId, { level: r.level as WorkoutLevel, n: r.n });
      }
      const out = Object.fromEntries(WORKOUT_LEVELS.map((l) => [l, 0])) as Record<
        WorkoutLevel,
        number
      >;
      for (const v of best.values()) out[v.level] += 1;
      return out;
    },

    /** Los atletas activos del club: a quién se le puede poner un plan propio. */
    async athletes(scope: OrgScope): Promise<PlanAthleteRow[]> {
      return db()
        .select({
          playerId: schema.players.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
        })
        .from(schema.players)
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.status, "active"),
          ),
        )
        .orderBy(asc(schema.people.firstName), asc(schema.people.lastName));
    },

    /** El nivel general de cada atleta: el que más usa en sus resultados desde una fecha. */
    async primaryLevels(
      scope: OrgScope,
      since: string,
      playerIds?: string[],
    ): Promise<Map<string, WorkoutLevel>> {
      const out = new Map<string, WorkoutLevel>();
      if (playerIds && playerIds.length === 0) return out;
      const rows = await db()
        .select({
          playerId: schema.workoutResults.playerId,
          level: schema.workoutResults.level,
          n: count(),
        })
        .from(schema.workoutResults)
        .innerJoin(schema.workoutBlocks, eq(schema.workoutBlocks.id, schema.workoutResults.blockId))
        .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutBlocks.workoutId))
        .where(
          and(
            eq(schema.workoutResults.organizationId, scope.organizationId),
            gte(schema.workouts.onDate, since),
            playerIds ? inArray(schema.workoutResults.playerId, playerIds) : undefined,
          ),
        )
        .groupBy(schema.workoutResults.playerId, schema.workoutResults.level);
      const best = new Map<string, number>();
      for (const r of rows)
        if (r.n > (best.get(r.playerId) ?? 0)) {
          best.set(r.playerId, r.n);
          out.set(r.playerId, r.level as WorkoutLevel);
        }
      return out;
    },

    /**
     * La cuota de programación de unos atletas (ADR 0054): nula si el box no tiene ninguna tarifa
     * de programación; si no, por atleta, si la paga (último cargo pagado), la tiene pendiente o
     * vencida, o no la tiene.
     */
    async programmingFees(
      scope: OrgScope,
      playerIds: string[],
      today: string,
    ): Promise<Map<string, ProgrammingFeeStatus> | null> {
      const plans = await db()
        .select({ id: schema.feePlans.id })
        .from(schema.feePlans)
        .where(
          and(
            eq(schema.feePlans.organizationId, scope.organizationId),
            eq(schema.feePlans.includesProgramming, true),
            eq(schema.feePlans.status, "active"),
          ),
        );
      if (plans.length === 0) return null;
      const out = new Map<string, ProgrammingFeeStatus>(playerIds.map((id) => [id, "none"]));
      if (playerIds.length === 0) return out;
      const planIds = plans.map((x) => x.id);
      const subs = await db()
        .select({ playerId: schema.subscriptions.playerId, personId: schema.players.personId })
        .from(schema.subscriptions)
        .innerJoin(schema.players, eq(schema.players.id, schema.subscriptions.playerId))
        .where(
          and(
            eq(schema.subscriptions.organizationId, scope.organizationId),
            inArray(schema.subscriptions.playerId, playerIds),
            inArray(schema.subscriptions.feePlanId, planIds),
            inArray(schema.subscriptions.status, ["active", "paused"]),
            lte(schema.subscriptions.startsOn, today),
            sql`(${schema.subscriptions.endsOn} is null or ${schema.subscriptions.endsOn} >= ${today})`,
          ),
        );
      if (subs.length === 0) return out;
      const charges = await db()
        .select({
          personId: schema.feeCharges.personId,
          status: schema.feeCharges.status,
          dueOn: schema.feeCharges.dueOn,
        })
        .from(schema.feeCharges)
        .where(
          and(
            eq(schema.feeCharges.organizationId, scope.organizationId),
            inArray(
              schema.feeCharges.personId,
              subs.map((x) => x.personId),
            ),
            inArray(schema.feeCharges.feePlanId, planIds),
            ne(schema.feeCharges.status, "cancelled"),
          ),
        )
        .orderBy(desc(schema.feeCharges.dueOn));
      const latest = new Map<string, { status: string; dueOn: string }>();
      for (const c of charges) if (!latest.has(c.personId)) latest.set(c.personId, c);
      for (const s of subs) {
        const c = latest.get(s.personId);
        // Con la tarifa y sin cargo todavía: pendiente del primero.
        const status: ProgrammingFeeStatus = !c
          ? "pending"
          : c.status === "paid"
            ? "paid"
            : c.status === "overdue" || c.dueOn < today
              ? "overdue"
              : "pending";
        out.set(s.playerId, status);
      }
      return out;
    },

    /** Resultados de unos bloques: lo que necesita la revisión del domingo. */
    async blockResults(scope: OrgScope, blockIds: string[]): Promise<BlockResultRow[]> {
      if (blockIds.length === 0) return [];
      const rows = await db()
        .select({
          blockId: schema.workoutResults.blockId,
          playerId: schema.workoutResults.playerId,
          level: schema.workoutResults.level,
          timeSeconds: schema.workoutResults.timeSeconds,
          reps: schema.workoutResults.reps,
          completed: schema.workoutResults.completed,
          effort: schema.workoutResults.effort,
        })
        .from(schema.workoutResults)
        .where(
          and(
            eq(schema.workoutResults.organizationId, scope.organizationId),
            inArray(schema.workoutResults.blockId, blockIds),
          ),
        );
      return rows.map((r) => ({ ...r, level: r.level as WorkoutLevel }));
    },

    /** Resultados de un atleta por capacidad del bloque, para sugerirle su nivel. */
    async athleteResults(
      scope: OrgScope,
      playerId: string,
      since: string,
    ): Promise<{ capacity: Capacity; level: WorkoutLevel; completed: boolean; date: string }[]> {
      const rows = await db()
        .select({
          capacity: schema.workoutBlocks.capacity,
          level: schema.workoutResults.level,
          completed: schema.workoutResults.completed,
          date: schema.workouts.onDate,
        })
        .from(schema.workoutResults)
        .innerJoin(schema.workoutBlocks, eq(schema.workoutBlocks.id, schema.workoutResults.blockId))
        .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutBlocks.workoutId))
        .where(
          and(
            eq(schema.workoutResults.organizationId, scope.organizationId),
            eq(schema.workoutResults.playerId, playerId),
            gte(schema.workouts.onDate, since),
          ),
        );
      return rows
        .filter((r) => r.capacity !== null)
        .map((r) => ({
          capacity: r.capacity as Capacity,
          level: r.level as WorkoutLevel,
          completed: r.completed,
          date: r.date,
        }));
    },

    /** Cuántas marcas personales nuevas entre dos días, de todos o de un atleta. */
    async prCount(
      scope: OrgScope,
      from: string,
      to: string,
      players?: string | string[],
    ): Promise<{ total: number; athletes: number }> {
      if (Array.isArray(players) && players.length === 0) return { total: 0, athletes: 0 };
      const rows = await db()
        .select({
          total: count(),
          athletes: sql<number>`count(distinct ${schema.personalRecords.playerId})`,
        })
        .from(schema.personalRecords)
        .where(
          and(
            eq(schema.personalRecords.organizationId, scope.organizationId),
            gte(schema.personalRecords.onDate, from),
            lte(schema.personalRecords.onDate, to),
            typeof players === "string"
              ? eq(schema.personalRecords.playerId, players)
              : players
                ? inArray(schema.personalRecords.playerId, players)
                : undefined,
          ),
        );
      return { total: rows[0]?.total ?? 0, athletes: Number(rows[0]?.athletes ?? 0) };
    },

    /**
     * Las marcas de los tests de un plan: 1RM (real o estimada) en los de movimiento, el marcador del
     * benchmark en los de benchmark y las repeticiones de los bloques del test en los de repeticiones.
     */
    async testMarks(
      scope: OrgScope,
      codes: readonly string[],
      playerId?: string,
    ): Promise<TestMark[]> {
      const tests = PLAN_TESTS.filter((t) => codes.includes(t.code));
      const out: TestMark[] = [];
      const movements = tests.filter((t) => t.kind === "movement" && t.ref);
      if (movements.length > 0) {
        const rows = await db()
          .select({
            playerId: schema.personalRecords.playerId,
            movementCode: schema.personalRecords.movementCode,
            reps: schema.personalRecords.reps,
            loadKg: schema.personalRecords.loadKg,
            date: schema.personalRecords.onDate,
          })
          .from(schema.personalRecords)
          .where(
            and(
              eq(schema.personalRecords.organizationId, scope.organizationId),
              inArray(
                schema.personalRecords.movementCode,
                movements.map((m) => m.ref!),
              ),
              playerId ? eq(schema.personalRecords.playerId, playerId) : undefined,
            ),
          );
        for (const r of rows) {
          const test = movements.find((m) => m.ref === r.movementCode)!;
          out.push({
            playerId: r.playerId,
            code: test.code,
            value: Math.round(estimateOneRm(Number(r.loadKg), r.reps) * 2) / 2,
            date: r.date,
          });
        }
      }
      const benchmarks = tests.filter((t) => t.kind === "benchmark" && t.ref);
      if (benchmarks.length > 0) {
        const rows = await db()
          .select({
            playerId: schema.benchmarkResults.playerId,
            code: schema.benchmarkResults.benchmarkCode,
            timeSeconds: schema.benchmarkResults.timeSeconds,
            rounds: schema.benchmarkResults.rounds,
            reps: schema.benchmarkResults.reps,
            completed: schema.benchmarkResults.completed,
            date: schema.benchmarkResults.onDate,
          })
          .from(schema.benchmarkResults)
          .where(
            and(
              eq(schema.benchmarkResults.organizationId, scope.organizationId),
              inArray(
                schema.benchmarkResults.benchmarkCode,
                benchmarks.map((b) => b.ref!),
              ),
              playerId ? eq(schema.benchmarkResults.playerId, playerId) : undefined,
            ),
          );
        for (const r of rows) {
          const test = benchmarks.find((b) => b.ref === r.code)!;
          const value = test.lowerIsBetter
            ? r.completed
              ? r.timeSeconds
              : null
            : (r.rounds ?? 0) * 100 + (r.reps ?? 0);
          if (value !== null && value > 0)
            out.push({ playerId: r.playerId, code: test.code, value, date: r.date });
        }
      }
      const reps = tests.filter((t) => t.kind === "reps");
      if (reps.length > 0) {
        const titles = reps.flatMap((t) => Object.values(t.name).map((n) => n.toLowerCase()));
        const rows = await db()
          .select({
            playerId: schema.workoutResults.playerId,
            title: schema.workoutBlocks.title,
            reps: schema.workoutResults.reps,
            date: schema.workouts.onDate,
          })
          .from(schema.workoutResults)
          .innerJoin(
            schema.workoutBlocks,
            eq(schema.workoutBlocks.id, schema.workoutResults.blockId),
          )
          .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutBlocks.workoutId))
          .where(
            and(
              eq(schema.workoutResults.organizationId, scope.organizationId),
              eq(schema.workoutBlocks.scoreType, "reps"),
              inArray(sql`lower(${schema.workoutBlocks.title})`, titles),
              playerId ? eq(schema.workoutResults.playerId, playerId) : undefined,
            ),
          );
        for (const r of rows) {
          const test = reps.find((t) =>
            Object.values(t.name).some((n) => n.toLowerCase() === r.title.toLowerCase()),
          );
          if (test && r.reps)
            out.push({ playerId: r.playerId, code: test.code, value: r.reps, date: r.date });
        }
      }
      return out;
    },

    /** Si un atleta tiene hoy una tarifa activa que incluye Clase+. */
    async plusEntitled(scope: OrgScope, playerId: string, today: string): Promise<boolean> {
      const rows = await db()
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .innerJoin(schema.feePlans, eq(schema.feePlans.id, schema.subscriptions.feePlanId))
        .where(
          and(
            eq(schema.subscriptions.organizationId, scope.organizationId),
            eq(schema.subscriptions.playerId, playerId),
            eq(schema.subscriptions.status, "active"),
            eq(schema.feePlans.includesPlus, true),
            lte(schema.subscriptions.startsOn, today),
            sql`(${schema.subscriptions.endsOn} is null or ${schema.subscriptions.endsOn} >= ${today})`,
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** Cuándo empezó un atleta en el club. */
    async joinedOn(scope: OrgScope, playerId: string): Promise<string | null> {
      const rows = await db()
        .select({ joinedOn: schema.players.joinedOn })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, playerId),
          ),
        )
        .limit(1);
      return rows[0]?.joinedOn ?? null;
    },

    /** Lo que ha costado la IA de la planificación desde una fecha, por tipo. */
    async aiUsage(
      scope: OrgScope,
      since: Date,
    ): Promise<{ kind: string; count: number; costMicros: number }[]> {
      const g = schema.aiGenerations;
      const rows = await db()
        .select({ kind: g.kind, n: count(), cost: sum(g.costMicros) })
        .from(g)
        .where(
          and(
            eq(g.organizationId, scope.organizationId),
            inArray(g.kind, ["plan_architect", "plan_week", "plan_copilot"]),
            gte(g.createdAt, since),
          ),
        )
        .groupBy(g.kind);
      return rows.map((r) => ({ kind: r.kind, count: r.n, costMicros: Number(r.cost ?? 0) }));
    },

    /** Cuántos atletas activos (con alguna asistencia) tiene una disciplina desde una fecha. */
    async activeAthletes(scope: OrgScope, sectionId: string, from: Date): Promise<number> {
      const rows = await db()
        .select({ n: sql<number>`count(distinct ${schema.bookings.playerId})` })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.events.sectionId, sectionId),
            inArray(schema.bookings.status, ["attended", "booked"]),
            gte(schema.events.startsAt, from),
          ),
        );
      return Number(rows[0]?.n ?? 0);
    },
  };
}

export type PlanningRepo = ReturnType<typeof planningRepo>;
