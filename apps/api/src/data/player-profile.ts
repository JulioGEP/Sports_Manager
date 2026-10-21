import { schema, type Database } from "@sportsmanager/db";
import {
  PLAYER_INDICATOR_DIMENSIONS,
  type DevelopmentPlanStatus,
  type DevelopmentPlanUpdate,
  type PlayerEventKind,
  type PlayerIndicatorDimension,
  type PlayerIndicatorsUpdate,
  type PlayerObjectiveUpdate,
  type PlayerPhotoContentType,
} from "@sportsmanager/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { BlobStore } from "./logos.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Ficha ampliada del jugador (Fase 1, Bloque 12, ADR 0029): foto, objetivo individual,
 * indicadores, plan de desarrollo y registros del timeline. Datos de menores: solo salen con
 * `org.players.read` (la foto, además, a su propia familia). Siempre con ámbito de club.
 */

export interface PersonRef {
  userId: string;
  name: string;
}

export interface PlayerObjectiveRecord {
  title: string;
  progress: number;
  owner: PersonRef | null;
  reviewOn: string | null;
  updatedAt: Date;
}

export interface PlayerIndicatorRecord {
  dimension: PlayerIndicatorDimension;
  score: number;
  note: string | null;
  updatedAt: Date;
}

export interface DevelopmentPlanRecord {
  technical: string | null;
  tactical: string | null;
  physical: string | null;
  emotional: string | null;
  habits: string | null;
  person: string | null;
  coordinator: PersonRef | null;
  nextReviewOn: string | null;
  status: DevelopmentPlanStatus;
  updatedAt: Date;
}

/** Solo nombres y cifras: lo que el texto del registro necesita en cada idioma. */
export type PlayerEventDetails = Record<string, string | number>;

export interface PlayerEventRecord {
  id: string;
  kind: PlayerEventKind;
  happenedOn: string;
  details: PlayerEventDetails;
  actorName: string | null;
}

/** Fecha de calendario de hoy (`AAAA-MM-DD`), en UTC como el resto de fechas sin hora. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Versión pública de la foto para la URL: la parte aleatoria de la clave, sin ids. */
function photoVersion(key: string): string {
  return key.split("/").at(-1) ?? key;
}

/**
 * Ruta de la foto. Lleva el club en la query porque un `<img>` no manda cabeceras (ADR 0027)
 * y la versión invalida la caché. La API comprueba sesión y permiso al servirla.
 */
export function playerPhotoUrlFor(
  key: string | null,
  slug: string,
  playerId: string,
): string | null {
  return key
    ? `/api/org/players/${playerId}/photo?club=${encodeURIComponent(slug)}&v=${photoVersion(key)}`
    : null;
}

function cleanDetails(details: PlayerEventDetails | null | undefined): PlayerEventDetails {
  const out: PlayerEventDetails = {};
  if (details && typeof details === "object") {
    for (const [k, v] of Object.entries(details)) {
      if (typeof v === "string" || typeof v === "number") out[k] = v;
    }
  }
  return out;
}

export function playerProfileRepo(db: () => Database, photos: BlobStore) {
  const personOf = (userId: string | null, name: string | null): PersonRef | null =>
    userId && name ? { userId, name } : null;

  /** La foto vive en la persona (Bloque 14): se localiza desde el jugador. */
  async function personIdOf(scope: OrgScope, playerId: string): Promise<string | null> {
    const rows = await db()
      .select({ personId: schema.players.personId })
      .from(schema.players)
      .where(
        and(
          eq(schema.players.organizationId, scope.organizationId),
          eq(schema.players.id, playerId),
        ),
      )
      .limit(1);
    return rows[0]?.personId ?? null;
  }

  async function photoKeyOf(scope: OrgScope, playerId: string): Promise<string | null> {
    const rows = await db()
      .select({ key: schema.people.photoBlobKey })
      .from(schema.players)
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .where(
        and(
          eq(schema.players.organizationId, scope.organizationId),
          eq(schema.players.id, playerId),
        ),
      )
      .limit(1);
    return rows[0]?.key ?? null;
  }

  async function planOf(scope: OrgScope, playerId: string): Promise<DevelopmentPlanRecord | null> {
    const rows = await db()
      .select({
        technical: schema.playerDevelopmentPlans.technical,
        tactical: schema.playerDevelopmentPlans.tactical,
        physical: schema.playerDevelopmentPlans.physical,
        emotional: schema.playerDevelopmentPlans.emotional,
        habits: schema.playerDevelopmentPlans.habits,
        person: schema.playerDevelopmentPlans.person,
        nextReviewOn: schema.playerDevelopmentPlans.nextReviewOn,
        status: schema.playerDevelopmentPlans.status,
        updatedAt: schema.playerDevelopmentPlans.updatedAt,
        coordinatorId: schema.users.id,
        coordinatorName: schema.users.name,
      })
      .from(schema.playerDevelopmentPlans)
      .leftJoin(schema.users, eq(schema.users.id, schema.playerDevelopmentPlans.coordinatorUserId))
      .where(
        and(
          eq(schema.playerDevelopmentPlans.organizationId, scope.organizationId),
          eq(schema.playerDevelopmentPlans.playerId, playerId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      technical: row.technical,
      tactical: row.tactical,
      physical: row.physical,
      emotional: row.emotional,
      habits: row.habits,
      person: row.person,
      coordinator: personOf(row.coordinatorId, row.coordinatorName),
      nextReviewOn: row.nextReviewOn,
      status: row.status as DevelopmentPlanStatus,
      updatedAt: row.updatedAt,
    };
  }

  async function objectiveOf(
    scope: OrgScope,
    playerId: string,
  ): Promise<PlayerObjectiveRecord | null> {
    const rows = await db()
      .select({
        title: schema.playerObjectives.title,
        progress: schema.playerObjectives.progress,
        reviewOn: schema.playerObjectives.reviewOn,
        updatedAt: schema.playerObjectives.updatedAt,
        ownerId: schema.users.id,
        ownerName: schema.users.name,
      })
      .from(schema.playerObjectives)
      .leftJoin(schema.users, eq(schema.users.id, schema.playerObjectives.ownerUserId))
      .where(
        and(
          eq(schema.playerObjectives.organizationId, scope.organizationId),
          eq(schema.playerObjectives.playerId, playerId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      title: row.title,
      progress: row.progress,
      owner: personOf(row.ownerId, row.ownerName),
      reviewOn: row.reviewOn,
      updatedAt: row.updatedAt,
    };
  }

  /** Indicadores en el orden del catálogo; solo los valorados. */
  async function indicatorsOf(scope: OrgScope, playerId: string): Promise<PlayerIndicatorRecord[]> {
    const rows = await db()
      .select({
        dimension: schema.playerIndicators.dimension,
        score: schema.playerIndicators.score,
        note: schema.playerIndicators.note,
        updatedAt: schema.playerIndicators.updatedAt,
      })
      .from(schema.playerIndicators)
      .where(
        and(
          eq(schema.playerIndicators.organizationId, scope.organizationId),
          eq(schema.playerIndicators.playerId, playerId),
        ),
      );
    const order = new Map(PLAYER_INDICATOR_DIMENSIONS.map((d, i) => [d, i] as const));
    return rows
      .filter((r) => order.has(r.dimension as PlayerIndicatorDimension))
      .map((r) => ({ ...r, dimension: r.dimension as PlayerIndicatorDimension }))
      .sort((a, b) => order.get(a.dimension)! - order.get(b.dimension)!);
  }

  return {
    objectiveOf,
    planOf,
    indicatorsOf,

    /** Fija el objetivo vigente. Si ya había uno, lo sustituye. */
    async setObjective(
      scope: OrgScope,
      playerId: string,
      input: PlayerObjectiveUpdate,
    ): Promise<PlayerObjectiveRecord> {
      const values = {
        title: input.title,
        progress: input.progress,
        ownerUserId: input.ownerUserId ?? null,
        reviewOn: input.reviewOn ?? null,
      };
      await db()
        .insert(schema.playerObjectives)
        .values({ organizationId: scope.organizationId, playerId, ...values })
        .onConflictDoUpdate({
          target: schema.playerObjectives.playerId,
          set: { ...values, updatedAt: new Date() },
        });
      const objective = await objectiveOf(scope, playerId);
      if (!objective) throw new Error("El objetivo recién guardado no aparece.");
      return objective;
    },

    async clearObjective(scope: OrgScope, playerId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.playerObjectives)
        .where(
          and(
            eq(schema.playerObjectives.organizationId, scope.organizationId),
            eq(schema.playerObjectives.playerId, playerId),
          ),
        )
        .returning({ id: schema.playerObjectives.id });
      return rows.length > 0;
    },

    /** Cambia las dimensiones que vienen; el resto se queda como estaba. */
    async setIndicators(
      scope: OrgScope,
      playerId: string,
      input: PlayerIndicatorsUpdate,
      actorUserId: string,
    ): Promise<PlayerIndicatorRecord[]> {
      for (const dimension of PLAYER_INDICATOR_DIMENSIONS) {
        const value = input[dimension];
        if (!value) continue;
        const values = {
          score: value.score,
          note: value.note?.trim() ? value.note.trim() : null,
          updatedBy: actorUserId,
        };
        await db()
          .insert(schema.playerIndicators)
          .values({ organizationId: scope.organizationId, playerId, dimension, ...values })
          .onConflictDoUpdate({
            target: [schema.playerIndicators.playerId, schema.playerIndicators.dimension],
            set: { ...values, updatedAt: new Date() },
          });
      }
      return indicatorsOf(scope, playerId);
    },

    /** Guarda el plan. Al crearlo, las áreas que no vienen quedan vacías; al editarlo, solo cambian las que vienen. */
    async setPlan(
      scope: OrgScope,
      playerId: string,
      input: DevelopmentPlanUpdate,
    ): Promise<DevelopmentPlanRecord> {
      const goal = (v: string | null | undefined) =>
        v === undefined ? undefined : v?.trim() || null;
      const patch: Partial<typeof schema.playerDevelopmentPlans.$inferInsert> = {};
      for (const area of [
        "technical",
        "tactical",
        "physical",
        "emotional",
        "habits",
        "person",
      ] as const) {
        const v = goal(input[area]);
        if (v !== undefined) patch[area] = v;
      }
      if (input.coordinatorUserId !== undefined) patch.coordinatorUserId = input.coordinatorUserId;
      if (input.nextReviewOn !== undefined) patch.nextReviewOn = input.nextReviewOn;
      if (input.status !== undefined) patch.status = input.status;
      const existing = await planOf(scope, playerId);
      if (existing) {
        if (Object.keys(patch).length > 0) {
          await db()
            .update(schema.playerDevelopmentPlans)
            .set(patch)
            .where(
              and(
                eq(schema.playerDevelopmentPlans.organizationId, scope.organizationId),
                eq(schema.playerDevelopmentPlans.playerId, playerId),
              ),
            );
        }
      } else {
        await db()
          .insert(schema.playerDevelopmentPlans)
          .values({ organizationId: scope.organizationId, playerId, ...patch });
      }
      const plan = await planOf(scope, playerId);
      if (!plan) throw new Error("El plan recién guardado no aparece.");
      return plan;
    },

    /**
     * Registros del jugador, del más reciente al más antiguo. Con `kinds`, solo esos tipos: la
     * familia no ve anotaciones del personal ni cambios de indicadores (Bloque 13).
     */
    async eventsOf(
      scope: OrgScope,
      playerId: string,
      options: { limit?: number; kinds?: readonly PlayerEventKind[] } = {},
    ): Promise<PlayerEventRecord[]> {
      const limit = options.limit ?? 50;
      const rows = await db()
        .select({
          id: schema.playerEvents.id,
          kind: schema.playerEvents.kind,
          happenedOn: schema.playerEvents.happenedOn,
          details: schema.playerEvents.details,
          actorName: schema.users.name,
        })
        .from(schema.playerEvents)
        .leftJoin(schema.users, eq(schema.users.id, schema.playerEvents.actorUserId))
        .where(
          and(
            eq(schema.playerEvents.organizationId, scope.organizationId),
            eq(schema.playerEvents.playerId, playerId),
            ...(options.kinds ? [inArray(schema.playerEvents.kind, [...options.kinds])] : []),
          ),
        )
        .orderBy(desc(schema.playerEvents.happenedOn), desc(schema.playerEvents.createdAt))
        .limit(Math.min(Math.max(limit, 1), 200));
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind as PlayerEventKind,
        happenedOn: row.happenedOn,
        details: cleanDetails(row.details as PlayerEventDetails | null),
        actorName: row.actorName ?? null,
      }));
    },

    /** Deja un registro. Un fallo al registrar nunca rompe la operación que lo originó. */
    async recordEvent(
      scope: OrgScope,
      input: {
        playerId: string;
        kind: Exclude<PlayerEventKind, "joined">;
        happenedOn?: string | undefined;
        details?: PlayerEventDetails | undefined;
        actorUserId?: string | null | undefined;
      },
    ): Promise<void> {
      try {
        await db()
          .insert(schema.playerEvents)
          .values({
            organizationId: scope.organizationId,
            playerId: input.playerId,
            kind: input.kind,
            happenedOn: input.happenedOn ?? today(),
            details: cleanDetails(input.details),
            actorUserId: input.actorUserId ?? null,
          });
      } catch (error) {
        console.error("[player-events] no se pudo registrar", input.kind, error);
      }
    },

    // --- Foto ---

    photoKeyOf,

    async readPhoto(scope: OrgScope, playerId: string) {
      const key = await photoKeyOf(scope, playerId);
      if (!key) return null;
      const blob = await photos.get(key);
      return blob ? { key, ...blob } : null;
    },

    /**
     * Guarda una foto nueva y la activa. `cleanup` borra la anterior: solo en producción, porque
     * las previews comparten el store con producción (mismo criterio que los logos, ADR 0024).
     */
    async uploadPhoto(
      scope: OrgScope,
      playerId: string,
      body: ArrayBuffer,
      contentType: PlayerPhotoContentType,
      options: { cleanup: boolean },
    ): Promise<string | null> {
      const personId = await personIdOf(scope, playerId);
      if (!personId) return null;
      const previous = await photoKeyOf(scope, playerId);
      const key = `${scope.organizationId}/${playerId}/${randomUUID()}`;
      await photos.set(key, body, contentType);
      const rows = await db()
        .update(schema.people)
        .set({ photoBlobKey: key })
        .where(
          and(
            eq(schema.people.organizationId, scope.organizationId),
            eq(schema.people.id, personId),
          ),
        )
        .returning({ id: schema.people.id });
      if (!rows[0]) {
        await photos.delete(key).catch(() => undefined);
        return null;
      }
      if (previous && options.cleanup) await photos.delete(previous).catch(() => undefined);
      return key;
    },

    async removePhoto(
      scope: OrgScope,
      playerId: string,
      options: { cleanup: boolean },
    ): Promise<boolean> {
      const previous = await photoKeyOf(scope, playerId);
      const personId = await personIdOf(scope, playerId);
      if (!previous || !personId) return false;
      await db()
        .update(schema.people)
        .set({ photoBlobKey: null })
        .where(
          and(
            eq(schema.people.organizationId, scope.organizationId),
            eq(schema.people.id, personId),
          ),
        );
      if (options.cleanup) await photos.delete(previous).catch(() => undefined);
      return true;
    },
  };
}
