import { schema, type Database } from "@sportsmanager/db";
import {
  DEFAULT_PHYSICAL_TESTS,
  trainingCodeFromName,
  wellnessScore,
  type AvailabilitySet,
  type AvailabilityStatus,
  type ExtraLoadCreate,
  type InsightOutcome,
  type Locale,
  type LoadSource,
  type Participation,
  type PhysicalTestCreate,
  type PhysicalTestDirection,
  type PhysicalTestUnit,
  type PhysicalTestUpdate,
  type RestrictionTag,
  type WellnessEntry,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Carga, bienestar, disponibilidad, tests físicos, objetivo de trabajo del jugador y respuestas a
 * las recomendaciones (bloques 22, 23, 24 y 25, ADR 0038). Toda consulta lleva el ámbito del club
 * (ADR 0015). Nada de esto es diagnóstico: la salud vive en `health.ts`.
 */

export interface LoadRecord {
  id: string;
  playerId: string;
  source: LoadSource;
  eventId: string | null;
  matchId: string | null;
  date: string;
  minutes: number;
  rpe: number | null;
  participation: Participation;
  note: string | null;
}

export interface WellnessRecord {
  playerId: string;
  date: string;
  sleep: number;
  fatigue: number;
  soreness: number;
  stress: number;
  mood: number;
  score: number;
  sorenessArea: string | null;
  note: string | null;
}

export interface AvailabilityPeriodRecord {
  id: string;
  playerId: string;
  status: Exclude<AvailabilityStatus, "available">;
  restrictions: RestrictionTag[];
  maxMinutes: number | null;
  fromOn: string;
  expectedReturnOn: string | null;
  endedOn: string | null;
  note: string | null;
  injuryId: string | null;
}

export interface CurrentAvailability {
  status: AvailabilityStatus;
  restrictions: RestrictionTag[];
  maxMinutes: number | null;
  fromOn: string | null;
  expectedReturnOn: string | null;
  note: string | null;
}

export const AVAILABLE: CurrentAvailability = {
  status: "available",
  restrictions: [],
  maxMinutes: null,
  fromOn: null,
  expectedReturnOn: null,
  note: null,
};

export interface PhysicalTestRecord {
  id: string;
  code: string;
  name: string;
  unit: PhysicalTestUnit;
  direction: PhysicalTestDirection;
  status: "active" | "archived";
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function loadRepo(db: () => Database) {
  const loadSelection = {
    id: schema.playerLoads.id,
    playerId: schema.playerLoads.playerId,
    source: schema.playerLoads.source,
    eventId: schema.playerLoads.eventId,
    matchId: schema.playerLoads.matchId,
    date: schema.playerLoads.onDate,
    minutes: schema.playerLoads.minutes,
    rpe: schema.playerLoads.rpe,
    participation: schema.playerLoads.participation,
    note: schema.playerLoads.note,
  };
  const toLoad = (r: {
    id: string;
    playerId: string;
    source: string;
    eventId: string | null;
    matchId: string | null;
    date: string;
    minutes: number;
    rpe: number | null;
    participation: string;
    note: string | null;
  }): LoadRecord => ({
    ...r,
    source: r.source as LoadSource,
    participation: r.participation as Participation,
  });

  const toWellness = (r: {
    playerId: string;
    date: string;
    sleep: number;
    fatigue: number;
    soreness: number;
    stress: number;
    mood: number;
    sorenessArea: string | null;
    note: string | null;
  }): WellnessRecord => ({ ...r, score: wellnessScore(r) });

  const periodSelection = {
    id: schema.playerAvailability.id,
    playerId: schema.playerAvailability.playerId,
    status: schema.playerAvailability.status,
    restrictions: schema.playerAvailability.restrictions,
    maxMinutes: schema.playerAvailability.maxMinutes,
    fromOn: schema.playerAvailability.fromOn,
    expectedReturnOn: schema.playerAvailability.expectedReturnOn,
    endedOn: schema.playerAvailability.endedOn,
    note: schema.playerAvailability.note,
    injuryId: schema.playerAvailability.injuryId,
  };
  const toPeriod = (r: {
    id: string;
    playerId: string;
    status: string;
    restrictions: unknown;
    maxMinutes: number | null;
    fromOn: string;
    expectedReturnOn: string | null;
    endedOn: string | null;
    note: string | null;
    injuryId: string | null;
  }): AvailabilityPeriodRecord => ({
    ...r,
    status: r.status as AvailabilityPeriodRecord["status"],
    restrictions: Array.isArray(r.restrictions) ? (r.restrictions as RestrictionTag[]) : [],
  });

  async function playersExist(scope: OrgScope, ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const rows = await db()
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(
        and(
          eq(schema.players.organizationId, scope.organizationId),
          inArray(schema.players.id, ids),
        ),
      );
    return rows.length === new Set(ids).size;
  }

  const testSelection = {
    id: schema.physicalTests.id,
    code: schema.physicalTests.code,
    name: schema.physicalTests.name,
    unit: schema.physicalTests.unit,
    direction: schema.physicalTests.direction,
    status: schema.physicalTests.status,
  };
  const toTest = (r: {
    id: string;
    code: string;
    name: string;
    unit: string;
    direction: string;
    status: string;
  }): PhysicalTestRecord => ({
    ...r,
    unit: r.unit as PhysicalTestUnit,
    direction: r.direction as PhysicalTestDirection,
    status: r.status as "active" | "archived",
  });

  async function listTests(scope: OrgScope): Promise<PhysicalTestRecord[]> {
    const rows = await db()
      .select(testSelection)
      .from(schema.physicalTests)
      .where(eq(schema.physicalTests.organizationId, scope.organizationId))
      .orderBy(asc(schema.physicalTests.sortOrder), asc(schema.physicalTests.name));
    return rows.map(toTest);
  }

  return {
    playersExist,

    // --- Carga ---

    /** Cargas de sesión, partido y extra de unos jugadores entre dos fechas. */
    async loadsFor(
      scope: OrgScope,
      playerIds: string[],
      from: string,
      to: string,
    ): Promise<LoadRecord[]> {
      if (playerIds.length === 0) return [];
      const rows = await db()
        .select(loadSelection)
        .from(schema.playerLoads)
        .where(
          and(
            eq(schema.playerLoads.organizationId, scope.organizationId),
            inArray(schema.playerLoads.playerId, playerIds),
            gte(schema.playerLoads.onDate, from),
            lte(schema.playerLoads.onDate, to),
          ),
        )
        .orderBy(asc(schema.playerLoads.onDate));
      return rows.map(toLoad);
    },

    /** Cargas de unos entrenamientos (cierre de sesión). */
    async loadsForEvents(scope: OrgScope, eventIds: string[]): Promise<LoadRecord[]> {
      if (eventIds.length === 0) return [];
      const rows = await db()
        .select(loadSelection)
        .from(schema.playerLoads)
        .where(
          and(
            eq(schema.playerLoads.organizationId, scope.organizationId),
            inArray(schema.playerLoads.eventId, eventIds),
          ),
        );
      return rows.map(toLoad);
    },

    /** Guarda la carga de sesión de varios jugadores (una por jugador y entrenamiento). */
    async setSessionLoads(
      scope: OrgScope,
      eventId: string,
      date: string,
      entries: {
        playerId: string;
        minutes: number;
        rpe: number | null;
        participation: Participation;
      }[],
      recordedBy: string | null,
    ): Promise<void> {
      await db().transaction(async (tx) => {
        for (const e of entries) {
          const values = {
            minutes: e.minutes,
            rpe: e.rpe,
            participation: e.participation,
            onDate: date,
            recordedBy,
          };
          const updated = await tx
            .update(schema.playerLoads)
            .set(values)
            .where(
              and(
                eq(schema.playerLoads.organizationId, scope.organizationId),
                eq(schema.playerLoads.eventId, eventId),
                eq(schema.playerLoads.playerId, e.playerId),
              ),
            )
            .returning({ id: schema.playerLoads.id });
          if (updated.length === 0)
            await tx.insert(schema.playerLoads).values({
              organizationId: scope.organizationId,
              playerId: e.playerId,
              source: "session",
              eventId,
              ...values,
            });
        }
      });
    },

    /** Quita la carga de sesión de quien no vino. */
    async clearSessionLoads(scope: OrgScope, eventId: string, playerIds: string[]): Promise<void> {
      if (playerIds.length === 0) return;
      await db()
        .delete(schema.playerLoads)
        .where(
          and(
            eq(schema.playerLoads.organizationId, scope.organizationId),
            eq(schema.playerLoads.eventId, eventId),
            inArray(schema.playerLoads.playerId, playerIds),
          ),
        );
    },

    /** El RPE que declara un jugador adulto de una sesión: actualiza su carga o la crea. */
    async setOwnSessionRpe(
      scope: OrgScope,
      eventId: string,
      playerId: string,
      date: string,
      minutes: number,
      rpe: number,
      recordedBy: string,
    ): Promise<void> {
      const updated = await db()
        .update(schema.playerLoads)
        .set({ rpe, recordedBy })
        .where(
          and(
            eq(schema.playerLoads.organizationId, scope.organizationId),
            eq(schema.playerLoads.eventId, eventId),
            eq(schema.playerLoads.playerId, playerId),
          ),
        )
        .returning({ id: schema.playerLoads.id });
      if (updated.length === 0)
        await db().insert(schema.playerLoads).values({
          organizationId: scope.organizationId,
          playerId,
          source: "session",
          eventId,
          onDate: date,
          minutes,
          rpe,
          participation: "full",
          recordedBy,
        });
    },

    async addExtraLoad(
      scope: OrgScope,
      playerId: string,
      input: ExtraLoadCreate,
      recordedBy: string,
    ): Promise<LoadRecord> {
      const rows = await db()
        .insert(schema.playerLoads)
        .values({
          organizationId: scope.organizationId,
          playerId,
          source: "extra",
          onDate: input.date,
          minutes: input.minutes,
          rpe: input.rpe,
          participation: "full",
          note: clean(input.note),
          recordedBy,
        })
        .returning(loadSelection);
      return toLoad(rows[0]!);
    },

    async removeExtraLoad(scope: OrgScope, playerId: string, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.playerLoads)
        .where(
          and(
            eq(schema.playerLoads.organizationId, scope.organizationId),
            eq(schema.playerLoads.playerId, playerId),
            eq(schema.playerLoads.id, id),
            eq(schema.playerLoads.source, "extra"),
          ),
        )
        .returning({ id: schema.playerLoads.id });
      return rows.length > 0;
    },

    /** RPE de un partido: el del equipo en `matches` y el de cada jugador en `player_loads`. */
    async setMatchLoads(
      scope: OrgScope,
      matchId: string,
      playedOn: string,
      rpe: number | null,
      players: { playerId: string; rpe: number | null }[],
      recordedBy: string,
    ): Promise<void> {
      await db().transaction(async (tx) => {
        await tx
          .update(schema.matches)
          .set({ rpe })
          .where(
            and(
              eq(schema.matches.organizationId, scope.organizationId),
              eq(schema.matches.id, matchId),
            ),
          );
        for (const p of players) {
          await tx
            .delete(schema.playerLoads)
            .where(
              and(
                eq(schema.playerLoads.organizationId, scope.organizationId),
                eq(schema.playerLoads.matchId, matchId),
                eq(schema.playerLoads.playerId, p.playerId),
              ),
            );
          if (p.rpe !== null)
            await tx.insert(schema.playerLoads).values({
              organizationId: scope.organizationId,
              playerId: p.playerId,
              source: "match",
              matchId,
              onDate: playedOn,
              minutes: 0,
              rpe: p.rpe,
              participation: "full",
              recordedBy,
            });
        }
      });
    },

    /** RPE de partidos: el del equipo y el de cada jugador si se puso. */
    async matchRpes(
      scope: OrgScope,
      matchIds: string[],
    ): Promise<{ team: Map<string, number | null>; players: Map<string, number> }> {
      const team = new Map<string, number | null>();
      const players = new Map<string, number>();
      if (matchIds.length === 0) return { team, players };
      const [teamRows, playerRows] = await Promise.all([
        db()
          .select({ id: schema.matches.id, rpe: schema.matches.rpe })
          .from(schema.matches)
          .where(
            and(
              eq(schema.matches.organizationId, scope.organizationId),
              inArray(schema.matches.id, matchIds),
            ),
          ),
        db()
          .select({
            matchId: schema.playerLoads.matchId,
            playerId: schema.playerLoads.playerId,
            rpe: schema.playerLoads.rpe,
          })
          .from(schema.playerLoads)
          .where(
            and(
              eq(schema.playerLoads.organizationId, scope.organizationId),
              inArray(schema.playerLoads.matchId, matchIds),
            ),
          ),
      ]);
      for (const r of teamRows) team.set(r.id, r.rpe);
      for (const r of playerRows)
        if (r.matchId && r.rpe !== null) players.set(`${r.matchId}:${r.playerId}`, r.rpe);
      return { team, players };
    },

    // --- Bienestar ---

    async setWellness(
      scope: OrgScope,
      playerId: string,
      input: WellnessEntry,
      recordedBy: string,
    ): Promise<WellnessRecord> {
      const values = {
        sleep: input.sleep,
        fatigue: input.fatigue,
        soreness: input.soreness,
        stress: input.stress,
        mood: input.mood,
        sorenessArea: clean(input.sorenessArea),
        note: clean(input.note),
        recordedBy,
      };
      await db()
        .insert(schema.wellnessEntries)
        .values({ organizationId: scope.organizationId, playerId, onDate: input.date, ...values })
        .onConflictDoUpdate({
          target: [schema.wellnessEntries.playerId, schema.wellnessEntries.onDate],
          set: values,
        });
      return toWellness({ playerId, date: input.date, ...values });
    },

    async wellnessFor(
      scope: OrgScope,
      playerIds: string[],
      from: string,
      to: string,
    ): Promise<WellnessRecord[]> {
      if (playerIds.length === 0) return [];
      const rows = await db()
        .select({
          playerId: schema.wellnessEntries.playerId,
          date: schema.wellnessEntries.onDate,
          sleep: schema.wellnessEntries.sleep,
          fatigue: schema.wellnessEntries.fatigue,
          soreness: schema.wellnessEntries.soreness,
          stress: schema.wellnessEntries.stress,
          mood: schema.wellnessEntries.mood,
          sorenessArea: schema.wellnessEntries.sorenessArea,
          note: schema.wellnessEntries.note,
        })
        .from(schema.wellnessEntries)
        .where(
          and(
            eq(schema.wellnessEntries.organizationId, scope.organizationId),
            inArray(schema.wellnessEntries.playerId, playerIds),
            gte(schema.wellnessEntries.onDate, from),
            lte(schema.wellnessEntries.onDate, to),
          ),
        )
        .orderBy(asc(schema.wellnessEntries.onDate));
      return rows.map(toWellness);
    },

    // --- Disponibilidad ---

    /** Disponibilidad vigente de unos jugadores: el periodo abierto o disponible. */
    async currentFor(
      scope: OrgScope,
      playerIds: string[],
    ): Promise<
      Map<string, CurrentAvailability & { periodId: string | null; injuryId: string | null }>
    > {
      const out = new Map<
        string,
        CurrentAvailability & { periodId: string | null; injuryId: string | null }
      >();
      for (const id of playerIds) out.set(id, { ...AVAILABLE, periodId: null, injuryId: null });
      if (playerIds.length === 0) return out;
      const rows = await db()
        .select(periodSelection)
        .from(schema.playerAvailability)
        .where(
          and(
            eq(schema.playerAvailability.organizationId, scope.organizationId),
            inArray(schema.playerAvailability.playerId, playerIds),
            isNull(schema.playerAvailability.endedOn),
          ),
        );
      for (const r of rows.map(toPeriod))
        out.set(r.playerId, {
          status: r.status,
          restrictions: r.restrictions,
          maxMinutes: r.maxMinutes,
          fromOn: r.fromOn,
          expectedReturnOn: r.expectedReturnOn,
          note: r.note,
          periodId: r.id,
          injuryId: r.injuryId,
        });
      return out;
    },

    /** Todos los periodos de unos jugadores, del más reciente al más antiguo. */
    async periodsFor(scope: OrgScope, playerIds: string[]): Promise<AvailabilityPeriodRecord[]> {
      if (playerIds.length === 0) return [];
      const rows = await db()
        .select(periodSelection)
        .from(schema.playerAvailability)
        .where(
          and(
            eq(schema.playerAvailability.organizationId, scope.organizationId),
            inArray(schema.playerAvailability.playerId, playerIds),
          ),
        )
        .orderBy(desc(schema.playerAvailability.fromOn), desc(schema.playerAvailability.createdAt));
      return rows.map(toPeriod);
    },

    /**
     * Cambia la disponibilidad: cierra el periodo abierto (con fecha de hoy) y, si no vuelve a
     * estar disponible, abre otro. Un periodo abierto el mismo día se sustituye.
     */
    async setAvailability(
      scope: OrgScope,
      playerId: string,
      input: AvailabilitySet,
      today: string,
      setBy: string,
    ): Promise<void> {
      const fromOn = input.fromOn ?? today;
      await db().transaction(async (tx) => {
        const open = await tx
          .select({ id: schema.playerAvailability.id, fromOn: schema.playerAvailability.fromOn })
          .from(schema.playerAvailability)
          .where(
            and(
              eq(schema.playerAvailability.organizationId, scope.organizationId),
              eq(schema.playerAvailability.playerId, playerId),
              isNull(schema.playerAvailability.endedOn),
            ),
          );
        for (const o of open) {
          if (o.fromOn >= fromOn)
            await tx
              .delete(schema.playerAvailability)
              .where(eq(schema.playerAvailability.id, o.id));
          else
            await tx
              .update(schema.playerAvailability)
              .set({ endedOn: fromOn })
              .where(eq(schema.playerAvailability.id, o.id));
        }
        if (input.status !== "available")
          await tx.insert(schema.playerAvailability).values({
            organizationId: scope.organizationId,
            playerId,
            status: input.status,
            restrictions: input.status === "limited" ? (input.restrictions ?? []) : [],
            maxMinutes: input.status === "limited" ? (input.maxMinutes ?? null) : null,
            fromOn,
            expectedReturnOn: input.expectedReturnOn ?? null,
            note: clean(input.note),
            injuryId: input.injuryId ?? null,
            setBy,
          });
      });
    },

    /** Jugadores del club con un periodo abierto (enfermería). */
    async openPeriods(scope: OrgScope): Promise<AvailabilityPeriodRecord[]> {
      const rows = await db()
        .select(periodSelection)
        .from(schema.playerAvailability)
        .where(
          and(
            eq(schema.playerAvailability.organizationId, scope.organizationId),
            isNull(schema.playerAvailability.endedOn),
          ),
        )
        .orderBy(asc(schema.playerAvailability.fromOn));
      return rows.map(toPeriod);
    },

    // --- Objetivo de trabajo ---

    async focusOf(scope: OrgScope, playerIds: string[]): Promise<Map<string, string[]>> {
      const out = new Map<string, string[]>();
      if (playerIds.length === 0) return out;
      const rows = await db()
        .select({
          playerId: schema.playerFocusContents.playerId,
          contentId: schema.playerFocusContents.contentId,
        })
        .from(schema.playerFocusContents)
        .where(
          and(
            eq(schema.playerFocusContents.organizationId, scope.organizationId),
            inArray(schema.playerFocusContents.playerId, playerIds),
          ),
        );
      for (const r of rows) out.set(r.playerId, [...(out.get(r.playerId) ?? []), r.contentId]);
      return out;
    },

    async setFocus(scope: OrgScope, playerId: string, contentIds: string[]): Promise<void> {
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.playerFocusContents)
          .where(
            and(
              eq(schema.playerFocusContents.organizationId, scope.organizationId),
              eq(schema.playerFocusContents.playerId, playerId),
            ),
          );
        const unique = [...new Set(contentIds)];
        if (unique.length > 0)
          await tx.insert(schema.playerFocusContents).values(
            unique.map((contentId) => ({
              organizationId: scope.organizationId,
              playerId,
              contentId,
            })),
          );
      });
    },

    /** Objetivos individuales (título y revisión) de unos jugadores. */
    async objectivesOf(scope: OrgScope, playerIds: string[]) {
      const out = new Map<string, { title: string; reviewOn: string | null }>();
      if (playerIds.length === 0) return out;
      const rows = await db()
        .select({
          playerId: schema.playerObjectives.playerId,
          title: schema.playerObjectives.title,
          reviewOn: schema.playerObjectives.reviewOn,
        })
        .from(schema.playerObjectives)
        .where(
          and(
            eq(schema.playerObjectives.organizationId, scope.organizationId),
            inArray(schema.playerObjectives.playerId, playerIds),
          ),
        );
      for (const r of rows) out.set(r.playerId, { title: r.title, reviewOn: r.reviewOn });
      return out;
    },

    // --- Respuestas a las recomendaciones ---

    /** Huellas silenciadas de un equipo en una fecha. */
    async silencedFingerprints(
      scope: OrgScope,
      teamId: string,
      today: string,
    ): Promise<Set<string>> {
      const rows = await db()
        .select({ fingerprint: schema.insightFeedback.fingerprint })
        .from(schema.insightFeedback)
        .where(
          and(
            eq(schema.insightFeedback.organizationId, scope.organizationId),
            eq(schema.insightFeedback.teamId, teamId),
            gte(schema.insightFeedback.snoozeUntil, today),
          ),
        );
      return new Set(rows.map((r) => r.fingerprint));
    },

    async answerInsight(
      scope: OrgScope,
      teamId: string,
      input: {
        rule: string;
        fingerprint: string;
        playerId: string | null;
        outcome: InsightOutcome;
        reason: string | null;
        snoozeUntil: string;
      },
      userId: string,
    ): Promise<void> {
      const values = {
        rule: input.rule,
        playerId: input.playerId,
        outcome: input.outcome,
        reason: clean(input.reason),
        snoozeUntil: input.snoozeUntil,
        userId,
      };
      await db()
        .insert(schema.insightFeedback)
        .values({
          organizationId: scope.organizationId,
          teamId,
          fingerprint: input.fingerprint,
          ...values,
        })
        .onConflictDoUpdate({
          target: [schema.insightFeedback.teamId, schema.insightFeedback.fingerprint],
          set: values,
        });
    },

    /** Utilidad de cada regla: aplicadas y descartadas por regla en un equipo. */
    async insightAnswers(scope: OrgScope, teamId: string) {
      const rows = await db()
        .select({
          rule: schema.insightFeedback.rule,
          outcome: schema.insightFeedback.outcome,
          n: sql<number>`count(*)`,
        })
        .from(schema.insightFeedback)
        .where(
          and(
            eq(schema.insightFeedback.organizationId, scope.organizationId),
            eq(schema.insightFeedback.teamId, teamId),
          ),
        )
        .groupBy(schema.insightFeedback.rule, schema.insightFeedback.outcome);
      return rows.map((r) => ({ rule: r.rule, outcome: r.outcome, count: Number(r.n) }));
    },

    // --- Tests físicos ---

    /** El catálogo del club; nace con los tests habituales en el idioma del club. */
    async ensureTests(scope: OrgScope, locale: Locale): Promise<PhysicalTestRecord[]> {
      const existing = await listTests(scope);
      if (existing.length > 0) return existing;
      await db()
        .insert(schema.physicalTests)
        .values(
          DEFAULT_PHYSICAL_TESTS.map((t, i) => ({
            organizationId: scope.organizationId,
            code: t.code,
            name: t.name[locale],
            unit: t.unit,
            direction: t.direction,
            sortOrder: (i + 1) * 10,
          })),
        )
        .onConflictDoNothing();
      return listTests(scope);
    },

    listTests,

    async createTest(
      scope: OrgScope,
      input: PhysicalTestCreate,
    ): Promise<PhysicalTestRecord | "code_taken"> {
      try {
        const last = await db()
          .select({ max: sql<number>`coalesce(max(${schema.physicalTests.sortOrder}), 0)` })
          .from(schema.physicalTests)
          .where(eq(schema.physicalTests.organizationId, scope.organizationId));
        const rows = await db()
          .insert(schema.physicalTests)
          .values({
            organizationId: scope.organizationId,
            code: input.code ?? trainingCodeFromName(input.name),
            name: input.name,
            unit: input.unit,
            direction: input.direction,
            sortOrder: Number(last[0]?.max ?? 0) + 10,
          })
          .returning(testSelection);
        return toTest(rows[0]!);
      } catch (error) {
        if (isUniqueViolation(error)) return "code_taken";
        throw error;
      }
    },

    async updateTest(
      scope: OrgScope,
      id: string,
      patch: PhysicalTestUpdate,
    ): Promise<PhysicalTestRecord | null> {
      const set: Partial<typeof schema.physicalTests.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.unit !== undefined) set.unit = patch.unit;
      if (patch.direction !== undefined) set.direction = patch.direction;
      if (patch.status !== undefined) set.status = patch.status;
      const rows = await db()
        .update(schema.physicalTests)
        .set(set)
        .where(
          and(
            eq(schema.physicalTests.organizationId, scope.organizationId),
            eq(schema.physicalTests.id, id),
          ),
        )
        .returning(testSelection);
      return rows[0] ? toTest(rows[0]) : null;
    },

    async setTestResults(
      scope: OrgScope,
      testId: string,
      date: string,
      results: { playerId: string; value: number; note?: string | null | undefined }[],
      recordedBy: string,
    ): Promise<"saved" | "unknown_test"> {
      const test = await db()
        .select({ id: schema.physicalTests.id })
        .from(schema.physicalTests)
        .where(
          and(
            eq(schema.physicalTests.organizationId, scope.organizationId),
            eq(schema.physicalTests.id, testId),
          ),
        )
        .limit(1);
      if (test.length === 0) return "unknown_test";
      await db().transaction(async (tx) => {
        for (const r of results) {
          const values = { value: String(r.value), note: clean(r.note), recordedBy };
          await tx
            .insert(schema.physicalTestResults)
            .values({
              organizationId: scope.organizationId,
              testId,
              playerId: r.playerId,
              onDate: date,
              ...values,
            })
            .onConflictDoUpdate({
              target: [
                schema.physicalTestResults.testId,
                schema.physicalTestResults.playerId,
                schema.physicalTestResults.onDate,
              ],
              set: values,
            });
        }
      });
      return "saved";
    },

    async testResultsFor(scope: OrgScope, playerIds: string[]) {
      if (playerIds.length === 0) return [];
      const rows = await db()
        .select({
          testId: schema.physicalTestResults.testId,
          playerId: schema.physicalTestResults.playerId,
          date: schema.physicalTestResults.onDate,
          value: schema.physicalTestResults.value,
        })
        .from(schema.physicalTestResults)
        .where(
          and(
            eq(schema.physicalTestResults.organizationId, scope.organizationId),
            inArray(schema.physicalTestResults.playerId, playerIds),
          ),
        )
        .orderBy(asc(schema.physicalTestResults.onDate));
      return rows.map((r) => ({ ...r, value: Number(r.value) }));
    },

    // --- Deportista con cuenta propia ---

    /** El deportista cuya persona tiene esta cuenta (un adulto que entra con su usuario). */
    async athleteOf(scope: OrgScope, userId: string) {
      const rows = await db()
        .select({
          id: schema.players.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.players)
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.people.userId, userId),
            eq(schema.players.status, "active"),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
