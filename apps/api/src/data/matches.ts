import { schema, type Database } from "@sportsmanager/db";
import {
  actionCodeFromName,
  defaultMatchActions,
  defaultMatchSettings,
  resolveMatchSettings,
  type AttackDirection,
  type HomeAway,
  type Locale,
  type MatchActionCategory,
  type MatchActionScope,
  type MatchActionStatus,
  type MatchActionTypeCreate,
  type MatchActionTypeUpdate,
  type MatchCard,
  type MatchCreate,
  type MatchEventCreate,
  type MatchEventKind,
  type MatchSettings,
  type MatchSettingsPatch,
  type MatchSide,
  type MatchSquadEntry,
  type MatchStatus,
  type MatchUpdate,
  type MatchZone,
} from "@sportsmanager/shared";
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Partido en directo (Fase 1, Bloque 20, ADR 0034). Toda consulta lleva el ámbito del club
 * (ADR 0015). El catálogo de acciones vive en la sección; el partido, en el equipo; y las
 * estadísticas se calculan fuera, con el motor compartido, a partir de los eventos.
 */

export interface MatchActionTypeRecord {
  id: string;
  code: string;
  name: string;
  category: MatchActionCategory;
  scope: MatchActionScope;
  ownScore: number;
  opponentScore: number;
  countsFoul: boolean;
  card: MatchCard | null;
  requiresZone: boolean;
  keeperOnly: boolean;
  weight: number;
  quick: boolean;
  mirrorOf: string | null;
  sortOrder: number;
  status: MatchActionStatus;
}

export interface SectionMatchConfigRecord {
  section: { id: string; name: string; sportCode: string };
  settings: MatchSettings;
  customized: boolean;
  actionTypes: MatchActionTypeRecord[];
}

export interface MatchRecord {
  id: string;
  team: { id: string; name: string };
  section: { id: string; name: string; sportCode: string };
  season: { id: string; name: string };
  opponent: string;
  homeAway: HomeAway;
  playedOn: string;
  status: MatchStatus;
  settings: MatchSettings;
  formation: string | null;
  attackDirection: AttackDirection;
  ownScore: number;
  opponentScore: number;
  eventsCount: number;
  squadCount: number;
  clock: { period: number; elapsedMs: number; runningSince: Date | null };
  event: { id: string; title: string; startsAt: Date } | null;
  notes: string | null;
  finishedAt: Date | null;
  updatedAt: Date;
}

export interface MatchSquadRecord {
  playerId: string;
  firstName: string;
  lastName: string;
  photoBlobKey: string | null;
  shirtNumber: number | null;
  position: string | null;
  isGoalkeeper: boolean;
  starter: boolean;
  slot: number | null;
}

export interface MatchEventRecord {
  id: string;
  seq: number;
  kind: MatchEventKind;
  actionTypeId: string | null;
  actionCode: string | null;
  playerId: string | null;
  relatedPlayerId: string | null;
  side: MatchSide;
  period: number;
  clockMs: number;
  zone: MatchZone | null;
  onCourt: string[];
  ownScoreDelta: number;
  opponentScoreDelta: number;
  note: string | null;
  clientId: string | null;
  createdAt: Date;
}

/** Posición que suena a portero, para proponer quién lo es al convocar. */
const KEEPER_POSITION = /port|keeper|goalie/i;

export function matchesRepo(db: () => Database) {
  // --- Catálogo por sección ---

  const typeSelection = {
    id: schema.matchActionTypes.id,
    code: schema.matchActionTypes.code,
    name: schema.matchActionTypes.name,
    category: schema.matchActionTypes.category,
    scope: schema.matchActionTypes.scope,
    ownScore: schema.matchActionTypes.ownScore,
    opponentScore: schema.matchActionTypes.opponentScore,
    countsFoul: schema.matchActionTypes.countsFoul,
    card: schema.matchActionTypes.card,
    requiresZone: schema.matchActionTypes.requiresZone,
    keeperOnly: schema.matchActionTypes.keeperOnly,
    weight: schema.matchActionTypes.weight,
    quick: schema.matchActionTypes.quick,
    mirrorOf: schema.matchActionTypes.mirrorOf,
    sortOrder: schema.matchActionTypes.sortOrder,
    status: schema.matchActionTypes.status,
  };
  interface TypeRow {
    id: string;
    code: string;
    name: string;
    category: string;
    scope: string;
    ownScore: number;
    opponentScore: number;
    countsFoul: boolean;
    card: string | null;
    requiresZone: boolean;
    keeperOnly: boolean;
    weight: string;
    quick: boolean;
    mirrorOf: string | null;
    sortOrder: number;
    status: string;
  }
  const toType = (row: TypeRow): MatchActionTypeRecord => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as MatchActionCategory,
    scope: row.scope as MatchActionScope,
    ownScore: row.ownScore,
    opponentScore: row.opponentScore,
    countsFoul: row.countsFoul,
    card: (row.card as MatchCard | null) ?? null,
    requiresZone: row.requiresZone,
    keeperOnly: row.keeperOnly,
    weight: Number(row.weight),
    quick: row.quick,
    mirrorOf: row.mirrorOf,
    sortOrder: row.sortOrder,
    status: row.status as MatchActionStatus,
  });

  async function sectionOf(scope: OrgScope, sectionId: string) {
    const rows = await db()
      .select({
        id: schema.sections.id,
        name: schema.sections.name,
        sportCode: schema.sports.code,
        matchSettings: schema.sections.matchSettings,
      })
      .from(schema.sections)
      .innerJoin(schema.sports, eq(schema.sports.id, schema.sections.sportId))
      .where(
        and(
          eq(schema.sections.organizationId, scope.organizationId),
          eq(schema.sections.id, sectionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function listTypes(scope: OrgScope, sectionId: string): Promise<MatchActionTypeRecord[]> {
    const rows = await db()
      .select(typeSelection)
      .from(schema.matchActionTypes)
      .where(
        and(
          eq(schema.matchActionTypes.organizationId, scope.organizationId),
          eq(schema.matchActionTypes.sectionId, sectionId),
        ),
      )
      .orderBy(asc(schema.matchActionTypes.sortOrder), asc(schema.matchActionTypes.createdAt));
    return rows.map(toType);
  }

  const typeValues = (
    scope: OrgScope,
    sectionId: string,
    input: MatchActionTypeCreate,
    sortOrder: number,
  ) => ({
    organizationId: scope.organizationId,
    sectionId,
    code: input.code ?? actionCodeFromName(input.name),
    name: input.name,
    category: input.category,
    scope: input.scope,
    ownScore: input.ownScore ?? 0,
    opponentScore: input.opponentScore ?? 0,
    countsFoul: input.countsFoul ?? false,
    card: input.card ?? null,
    requiresZone: input.requiresZone ?? false,
    keeperOnly: input.keeperOnly ?? false,
    weight: String(input.weight ?? 0),
    quick: input.quick ?? false,
    mirrorOf: input.mirrorOf ?? null,
    sortOrder,
    status: "active" as const,
  });

  /** Si la sección no tiene catálogo, nace con el que propone su deporte. */
  async function ensureCatalog(
    scope: OrgScope,
    sectionId: string,
    sportCode: string,
    locale: Locale,
  ): Promise<MatchActionTypeRecord[]> {
    const existing = await listTypes(scope, sectionId);
    if (existing.length > 0) return existing;
    const seeds = defaultMatchActions(sportCode, locale);
    await db()
      .insert(schema.matchActionTypes)
      .values(seeds.map((seed, i) => typeValues(scope, sectionId, seed, (i + 1) * 10)))
      .onConflictDoNothing();
    return listTypes(scope, sectionId);
  }

  async function configOf(
    scope: OrgScope,
    sectionId: string,
    locale: Locale,
  ): Promise<SectionMatchConfigRecord | null> {
    const section = await sectionOf(scope, sectionId);
    if (!section) return null;
    const actionTypes = await ensureCatalog(scope, sectionId, section.sportCode, locale);
    return {
      section: { id: section.id, name: section.name, sportCode: section.sportCode },
      settings: resolveMatchSettings(section.sportCode, section.matchSettings),
      customized: section.matchSettings !== null && Object.keys(section.matchSettings).length > 0,
      actionTypes,
    };
  }

  // --- Partidos ---

  const matchQuery = () =>
    db()
      .select({
        id: schema.matches.id,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        sectionId: schema.sections.id,
        sectionName: schema.sections.name,
        sectionSettings: schema.sections.matchSettings,
        sportCode: schema.sports.code,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        opponent: schema.matches.opponent,
        homeAway: schema.matches.homeAway,
        playedOn: schema.matches.playedOn,
        status: schema.matches.status,
        settings: schema.matches.settings,
        formation: schema.matches.formation,
        attackDirection: schema.matches.attackDirection,
        ownScore: schema.matches.ownScore,
        opponentScore: schema.matches.opponentScore,
        clockPeriod: schema.matches.clockPeriod,
        clockElapsedMs: schema.matches.clockElapsedMs,
        clockRunningSince: schema.matches.clockRunningSince,
        eventId: schema.events.id,
        eventTitle: schema.events.title,
        eventStartsAt: schema.events.startsAt,
        notes: schema.matches.notes,
        finishedAt: schema.matches.finishedAt,
        updatedAt: schema.matches.updatedAt,
        eventsCount: sql<number>`(select count(*) from ${schema.matchEvents} e where e.match_id = ${schema.matches.id})`,
        squadCount: sql<number>`(select count(*) from ${schema.matchPlayers} p where p.match_id = ${schema.matches.id})`,
      })
      .from(schema.matches)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.matches.teamId))
      .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
      .innerJoin(schema.sports, eq(schema.sports.id, schema.sections.sportId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.matches.seasonId))
      .leftJoin(schema.events, eq(schema.events.id, schema.matches.eventId));
  type MatchRow = Awaited<ReturnType<ReturnType<typeof matchQuery>["execute"]>>[number];
  const toMatch = (row: MatchRow): MatchRecord => ({
    id: row.id,
    team: { id: row.teamId, name: row.teamName },
    section: { id: row.sectionId, name: row.sectionName, sportCode: row.sportCode },
    season: { id: row.seasonId, name: row.seasonName },
    opponent: row.opponent,
    homeAway: row.homeAway as HomeAway,
    playedOn: row.playedOn,
    status: row.status as MatchStatus,
    settings: resolveMatchSettings(row.sportCode, row.sectionSettings, row.settings),
    formation: row.formation,
    attackDirection: row.attackDirection as AttackDirection,
    ownScore: row.ownScore,
    opponentScore: row.opponentScore,
    eventsCount: Number(row.eventsCount),
    squadCount: Number(row.squadCount),
    clock: {
      period: row.clockPeriod,
      elapsedMs: row.clockElapsedMs,
      runningSince: row.clockRunningSince,
    },
    event:
      row.eventId && row.eventTitle && row.eventStartsAt
        ? { id: row.eventId, title: row.eventTitle, startsAt: row.eventStartsAt }
        : null,
    notes: row.notes,
    finishedAt: row.finishedAt,
    updatedAt: row.updatedAt,
  });

  async function byId(scope: OrgScope, id: string): Promise<MatchRecord | null> {
    const rows = await matchQuery().where(
      and(eq(schema.matches.organizationId, scope.organizationId), eq(schema.matches.id, id)),
    );
    const row = rows[0];
    return row ? toMatch(row) : null;
  }

  async function teamOf(scope: OrgScope, teamId: string) {
    const rows = await db()
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        seasonId: schema.teams.seasonId,
        sectionId: schema.teams.sectionId,
        sportCode: schema.sports.code,
      })
      .from(schema.teams)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
      .innerJoin(schema.sports, eq(schema.sports.id, schema.sections.sportId))
      .where(
        and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, teamId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function squadOf(scope: OrgScope, matchId: string): Promise<MatchSquadRecord[]> {
    const rows = await db()
      .select({
        playerId: schema.matchPlayers.playerId,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        photoBlobKey: schema.people.photoBlobKey,
        shirtNumber: schema.matchPlayers.shirtNumber,
        position: schema.matchPlayers.position,
        isGoalkeeper: schema.matchPlayers.isGoalkeeper,
        starter: schema.matchPlayers.starter,
        slot: schema.matchPlayers.slot,
      })
      .from(schema.matchPlayers)
      .innerJoin(schema.players, eq(schema.players.id, schema.matchPlayers.playerId))
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .where(
        and(
          eq(schema.matchPlayers.organizationId, scope.organizationId),
          eq(schema.matchPlayers.matchId, matchId),
        ),
      )
      .orderBy(
        asc(schema.matchPlayers.sortOrder),
        sql`${schema.matchPlayers.shirtNumber} nulls last`,
        asc(schema.people.lastName),
      );
    return rows;
  }

  const eventSelection = {
    id: schema.matchEvents.id,
    seq: schema.matchEvents.seq,
    kind: schema.matchEvents.kind,
    actionTypeId: schema.matchEvents.actionTypeId,
    actionCode: schema.matchEvents.actionCode,
    playerId: schema.matchEvents.playerId,
    relatedPlayerId: schema.matchEvents.relatedPlayerId,
    side: schema.matchEvents.side,
    period: schema.matchEvents.period,
    clockMs: schema.matchEvents.clockMs,
    zone: schema.matchEvents.zone,
    onCourt: schema.matchEvents.onCourt,
    ownScoreDelta: schema.matchEvents.ownScoreDelta,
    opponentScoreDelta: schema.matchEvents.opponentScoreDelta,
    note: schema.matchEvents.note,
    clientId: schema.matchEvents.clientId,
    createdAt: schema.matchEvents.createdAt,
  };
  interface EventRow {
    id: string;
    seq: number;
    kind: string;
    actionTypeId: string | null;
    actionCode: string | null;
    playerId: string | null;
    relatedPlayerId: string | null;
    side: string;
    period: number;
    clockMs: number;
    zone: string | null;
    onCourt: unknown;
    ownScoreDelta: number;
    opponentScoreDelta: number;
    note: string | null;
    clientId: string | null;
    createdAt: Date;
  }
  const toEvent = (row: EventRow): MatchEventRecord => ({
    ...row,
    kind: row.kind as MatchEventKind,
    side: row.side as MatchSide,
    zone: (row.zone as MatchZone | null) ?? null,
    onCourt: Array.isArray(row.onCourt) ? (row.onCourt as string[]) : [],
  });

  async function eventsOf(scope: OrgScope, matchId: string): Promise<MatchEventRecord[]> {
    const rows = await db()
      .select(eventSelection)
      .from(schema.matchEvents)
      .where(
        and(
          eq(schema.matchEvents.organizationId, scope.organizationId),
          eq(schema.matchEvents.matchId, matchId),
        ),
      )
      .orderBy(asc(schema.matchEvents.seq));
    return rows.map(toEvent);
  }

  /**
   * Convocatorias, eventos y catálogos de muchos partidos de una vez (ADR 0060): el histórico de un
   * equipo o de un jugador eran dos o tres consultas por partido. Mismo orden que de uno en uno.
   */
  async function squadsOf(
    scope: OrgScope,
    matchIds: string[],
  ): Promise<Map<string, MatchSquadRecord[]>> {
    const map = new Map<string, MatchSquadRecord[]>();
    if (matchIds.length === 0) return map;
    const rows = await db()
      .select({
        matchId: schema.matchPlayers.matchId,
        playerId: schema.matchPlayers.playerId,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        photoBlobKey: schema.people.photoBlobKey,
        shirtNumber: schema.matchPlayers.shirtNumber,
        position: schema.matchPlayers.position,
        isGoalkeeper: schema.matchPlayers.isGoalkeeper,
        starter: schema.matchPlayers.starter,
        slot: schema.matchPlayers.slot,
      })
      .from(schema.matchPlayers)
      .innerJoin(schema.players, eq(schema.players.id, schema.matchPlayers.playerId))
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .where(
        and(
          eq(schema.matchPlayers.organizationId, scope.organizationId),
          inArray(schema.matchPlayers.matchId, matchIds),
        ),
      )
      .orderBy(
        asc(schema.matchPlayers.sortOrder),
        sql`${schema.matchPlayers.shirtNumber} nulls last`,
        asc(schema.people.lastName),
      );
    for (const { matchId, ...row } of rows) {
      const list = map.get(matchId) ?? [];
      list.push(row);
      map.set(matchId, list);
    }
    return map;
  }

  async function eventsOfMatches(
    scope: OrgScope,
    matchIds: string[],
  ): Promise<Map<string, MatchEventRecord[]>> {
    const map = new Map<string, MatchEventRecord[]>();
    if (matchIds.length === 0) return map;
    const rows = await db()
      .select({ matchId: schema.matchEvents.matchId, ...eventSelection })
      .from(schema.matchEvents)
      .where(
        and(
          eq(schema.matchEvents.organizationId, scope.organizationId),
          inArray(schema.matchEvents.matchId, matchIds),
        ),
      )
      .orderBy(asc(schema.matchEvents.seq));
    for (const { matchId, ...row } of rows) {
      const list = map.get(matchId) ?? [];
      list.push(toEvent(row));
      map.set(matchId, list);
    }
    return map;
  }

  async function typesOfSections(
    scope: OrgScope,
    sectionIds: string[],
  ): Promise<Map<string, MatchActionTypeRecord[]>> {
    const map = new Map<string, MatchActionTypeRecord[]>();
    if (sectionIds.length === 0) return map;
    const rows = await db()
      .select({ sectionId: schema.matchActionTypes.sectionId, ...typeSelection })
      .from(schema.matchActionTypes)
      .where(
        and(
          eq(schema.matchActionTypes.organizationId, scope.organizationId),
          inArray(schema.matchActionTypes.sectionId, sectionIds),
        ),
      )
      .orderBy(asc(schema.matchActionTypes.sortOrder), asc(schema.matchActionTypes.createdAt));
    for (const { sectionId, ...row } of rows) {
      const list = map.get(sectionId) ?? [];
      list.push(toType(row));
      map.set(sectionId, list);
    }
    return map;
  }

  /** El marcador se recalcula de los eventos cada vez que cambian. */
  async function recomputeScore(scope: OrgScope, matchId: string): Promise<void> {
    const rows = await db()
      .select({
        own: sql<number>`coalesce(sum(${schema.matchEvents.ownScoreDelta}), 0)`,
        opponent: sql<number>`coalesce(sum(${schema.matchEvents.opponentScoreDelta}), 0)`,
      })
      .from(schema.matchEvents)
      .where(
        and(
          eq(schema.matchEvents.organizationId, scope.organizationId),
          eq(schema.matchEvents.matchId, matchId),
        ),
      );
    await db()
      .update(schema.matches)
      .set({ ownScore: Number(rows[0]?.own ?? 0), opponentScore: Number(rows[0]?.opponent ?? 0) })
      .where(
        and(
          eq(schema.matches.organizationId, scope.organizationId),
          eq(schema.matches.id, matchId),
        ),
      );
  }

  return {
    configOf,
    listTypes,
    byId,
    squadOf,
    eventsOf,

    /** Ajustes del partido de la sección: un parche sobre los del deporte, o nulo para volver a ellos. */
    async updateSectionSettings(
      scope: OrgScope,
      sectionId: string,
      patch: MatchSettingsPatch | null,
    ): Promise<boolean> {
      const current = await sectionOf(scope, sectionId);
      if (!current) return false;
      const next = patch === null ? null : { ...(current.matchSettings ?? {}), ...patch };
      await db()
        .update(schema.sections)
        .set({ matchSettings: next })
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.sections.id, sectionId),
          ),
        );
      return true;
    },

    /** Vuelve al catálogo y a los ajustes del deporte: lo que no esté en él queda archivado. */
    async resetToSport(scope: OrgScope, sectionId: string, locale: Locale): Promise<boolean> {
      const section = await sectionOf(scope, sectionId);
      if (!section) return false;
      const seeds = defaultMatchActions(section.sportCode, locale);
      await db().transaction(async (tx) => {
        await tx
          .update(schema.sections)
          .set({ matchSettings: null })
          .where(eq(schema.sections.id, sectionId));
        await tx
          .update(schema.matchActionTypes)
          .set({ status: "archived" })
          .where(
            and(
              eq(schema.matchActionTypes.organizationId, scope.organizationId),
              eq(schema.matchActionTypes.sectionId, sectionId),
            ),
          );
        for (const [i, seed] of seeds.entries()) {
          const values = typeValues(scope, sectionId, seed, (i + 1) * 10);
          const { organizationId: _o, sectionId: _s, code: _c, ...fields } = values;
          await tx
            .insert(schema.matchActionTypes)
            .values(values)
            .onConflictDoUpdate({
              target: [schema.matchActionTypes.sectionId, schema.matchActionTypes.code],
              set: fields,
            });
        }
      });
      return true;
    },

    async createType(
      scope: OrgScope,
      sectionId: string,
      input: MatchActionTypeCreate,
    ): Promise<MatchActionTypeRecord | "code_taken" | "not_found"> {
      if (!(await sectionOf(scope, sectionId))) return "not_found";
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.matchActionTypes.sortOrder}), 0)` })
        .from(schema.matchActionTypes)
        .where(eq(schema.matchActionTypes.sectionId, sectionId));
      try {
        const rows = await db()
          .insert(schema.matchActionTypes)
          .values(typeValues(scope, sectionId, input, Number(last[0]?.max ?? 0) + 10))
          .returning(typeSelection);
        return toType(rows[0]!);
      } catch (error) {
        if (isUniqueViolation(error)) return "code_taken";
        throw error;
      }
    },

    async updateType(
      scope: OrgScope,
      sectionId: string,
      id: string,
      patch: MatchActionTypeUpdate,
    ): Promise<MatchActionTypeRecord | null> {
      const set: Partial<typeof schema.matchActionTypes.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.category !== undefined) set.category = patch.category;
      if (patch.scope !== undefined) set.scope = patch.scope;
      if (patch.ownScore !== undefined) set.ownScore = patch.ownScore;
      if (patch.opponentScore !== undefined) set.opponentScore = patch.opponentScore;
      if (patch.countsFoul !== undefined) set.countsFoul = patch.countsFoul;
      if (patch.card !== undefined) set.card = patch.card;
      if (patch.requiresZone !== undefined) set.requiresZone = patch.requiresZone;
      if (patch.keeperOnly !== undefined) set.keeperOnly = patch.keeperOnly;
      if (patch.weight !== undefined) set.weight = String(patch.weight);
      if (patch.quick !== undefined) set.quick = patch.quick;
      if (patch.mirrorOf !== undefined) set.mirrorOf = patch.mirrorOf;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
      const rows = await db()
        .update(schema.matchActionTypes)
        .set(set)
        .where(
          and(
            eq(schema.matchActionTypes.organizationId, scope.organizationId),
            eq(schema.matchActionTypes.sectionId, sectionId),
            eq(schema.matchActionTypes.id, id),
          ),
        )
        .returning(typeSelection);
      return rows[0] ? toType(rows[0]) : null;
    },

    /** Quita una acción: si ya hay eventos con ella, se archiva para no perder el historial. */
    async removeType(
      scope: OrgScope,
      sectionId: string,
      id: string,
    ): Promise<"removed" | "archived" | "not_found"> {
      const used = await db()
        .select({ n: count() })
        .from(schema.matchEvents)
        .where(
          and(
            eq(schema.matchEvents.organizationId, scope.organizationId),
            eq(schema.matchEvents.actionTypeId, id),
          ),
        );
      const where = and(
        eq(schema.matchActionTypes.organizationId, scope.organizationId),
        eq(schema.matchActionTypes.sectionId, sectionId),
        eq(schema.matchActionTypes.id, id),
      );
      if (Number(used[0]?.n ?? 0) > 0) {
        const rows = await db()
          .update(schema.matchActionTypes)
          .set({ status: "archived" })
          .where(where)
          .returning({ id: schema.matchActionTypes.id });
        return rows.length > 0 ? "archived" : "not_found";
      }
      const rows = await db()
        .delete(schema.matchActionTypes)
        .where(where)
        .returning({ id: schema.matchActionTypes.id });
      return rows.length > 0 ? "removed" : "not_found";
    },

    /** Partidos de un equipo, del más reciente al más antiguo. */
    async listForTeam(scope: OrgScope, teamId: string): Promise<MatchRecord[]> {
      const rows = await matchQuery()
        .where(
          and(
            eq(schema.matches.organizationId, scope.organizationId),
            eq(schema.matches.teamId, teamId),
          ),
        )
        .orderBy(desc(schema.matches.playedOn), desc(schema.matches.createdAt));
      return rows.map(toMatch);
    },

    /** Partidos de la agenda del equipo que todavía no tienen registro. */
    async upcomingEventsOf(
      scope: OrgScope,
      teamId: string,
      from: Date,
    ): Promise<
      {
        id: string;
        title: string;
        startsAt: Date;
        opponent: string | null;
        homeAway: HomeAway | null;
      }[]
    > {
      const rows = await db()
        .select({
          id: schema.events.id,
          title: schema.events.title,
          startsAt: schema.events.startsAt,
          opponent: schema.events.opponent,
          homeAway: schema.events.homeAway,
        })
        .from(schema.events)
        .leftJoin(schema.matches, eq(schema.matches.eventId, schema.events.id))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            eq(schema.events.kind, "match"),
            gt(schema.events.endsAt, new Date(from.getTime() - 7 * 24 * 3600 * 1000)),
            isNull(schema.matches.id),
          ),
        )
        .orderBy(asc(schema.events.startsAt))
        .limit(10);
      return rows.map((r) => ({ ...r, homeAway: (r.homeAway as HomeAway | null) ?? null }));
    },

    /**
     * Crea un partido con la plantilla del equipo como convocatoria inicial (todos en el
     * banquillo; el portero, por su posición). El cuerpo técnico la ajusta antes de empezar.
     */
    async create(
      scope: OrgScope,
      teamId: string,
      input: MatchCreate,
      createdBy: string,
      locale: Locale,
    ): Promise<MatchRecord | "unknown_team" | "unknown_event"> {
      const team = await teamOf(scope, teamId);
      if (!team) return "unknown_team";
      if (input.eventId) {
        const ev = await db()
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(
            and(
              eq(schema.events.organizationId, scope.organizationId),
              eq(schema.events.id, input.eventId),
              eq(schema.events.teamId, teamId),
            ),
          )
          .limit(1);
        if (ev.length === 0) return "unknown_event";
      }
      await ensureCatalog(scope, team.sectionId, team.sportCode, locale);
      const roster = await db()
        .select({
          playerId: schema.teamPlayers.playerId,
          shirtNumber: schema.teamPlayers.shirtNumber,
          position: schema.teamPlayers.position,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, teamId),
            eq(schema.players.status, "active"),
          ),
        )
        .orderBy(sql`${schema.teamPlayers.shirtNumber} nulls last`);
      const id = await db().transaction(async (tx) => {
        const rows = await tx
          .insert(schema.matches)
          .values({
            organizationId: scope.organizationId,
            teamId,
            seasonId: team.seasonId,
            eventId: input.eventId ?? null,
            opponent: input.opponent,
            homeAway: input.homeAway,
            playedOn: input.playedOn,
            settings: input.settings ?? {},
            attackDirection: "right",
            notes: input.notes?.trim() ? input.notes.trim() : null,
            createdBy,
          })
          .returning({ id: schema.matches.id });
        const matchId = rows[0]!.id;
        if (roster.length > 0) {
          await tx.insert(schema.matchPlayers).values(
            roster.map((p, i) => ({
              organizationId: scope.organizationId,
              matchId,
              playerId: p.playerId,
              shirtNumber: p.shirtNumber,
              position: p.position,
              isGoalkeeper: p.position ? KEEPER_POSITION.test(p.position) : false,
              starter: false,
              slot: null,
              sortOrder: (i + 1) * 10,
            })),
          );
        }
        return matchId;
      });
      const match = await byId(scope, id);
      if (!match) throw new Error("El partido recién creado no aparece.");
      return match;
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: MatchUpdate,
    ): Promise<MatchRecord | "not_found" | "unknown_event"> {
      const before = await byId(scope, id);
      if (!before) return "not_found";
      if (patch.eventId) {
        const ev = await db()
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(
            and(
              eq(schema.events.organizationId, scope.organizationId),
              eq(schema.events.id, patch.eventId),
              eq(schema.events.teamId, before.team.id),
            ),
          )
          .limit(1);
        if (ev.length === 0) return "unknown_event";
      }
      const set: Partial<typeof schema.matches.$inferInsert> = {};
      if (patch.opponent !== undefined) set.opponent = patch.opponent;
      if (patch.homeAway !== undefined) set.homeAway = patch.homeAway;
      if (patch.playedOn !== undefined) set.playedOn = patch.playedOn;
      if (patch.eventId !== undefined) set.eventId = patch.eventId;
      if (patch.settings !== undefined) set.settings = patch.settings;
      if (patch.notes !== undefined) set.notes = patch.notes?.trim() ? patch.notes.trim() : null;
      if (patch.formation !== undefined) set.formation = patch.formation;
      if (patch.attackDirection !== undefined) set.attackDirection = patch.attackDirection;
      if (patch.clock !== undefined) {
        set.clockPeriod = patch.clock.period;
        set.clockElapsedMs = patch.clock.elapsedMs;
        set.clockRunningSince = patch.clock.runningSince
          ? new Date(patch.clock.runningSince)
          : null;
      }
      if (patch.status !== undefined) {
        set.status = patch.status;
        if (patch.status === "finished") {
          set.finishedAt = new Date();
          set.clockRunningSince = null;
        } else if (before.status === "finished") set.finishedAt = null;
      }
      await db()
        .update(schema.matches)
        .set(set)
        .where(
          and(eq(schema.matches.organizationId, scope.organizationId), eq(schema.matches.id, id)),
        );
      return (await byId(scope, id)) ?? "not_found";
    },

    async remove(scope: OrgScope, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.matches)
        .where(
          and(eq(schema.matches.organizationId, scope.organizationId), eq(schema.matches.id, id)),
        )
        .returning({ id: schema.matches.id });
      return rows.length > 0;
    },

    /** Plantilla del equipo que no está convocada. */
    async rosterNotInSquad(
      scope: OrgScope,
      match: MatchRecord,
    ): Promise<
      {
        playerId: string;
        firstName: string;
        lastName: string;
        photoBlobKey: string | null;
        shirtNumber: number | null;
        position: string | null;
      }[]
    > {
      const rows = await db()
        .select({
          playerId: schema.teamPlayers.playerId,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
          shirtNumber: schema.teamPlayers.shirtNumber,
          position: schema.teamPlayers.position,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, match.team.id),
            sql`not exists (select 1 from ${schema.matchPlayers} mp where mp.match_id = ${match.id} and mp.player_id = ${schema.teamPlayers.playerId})`,
          ),
        )
        .orderBy(sql`${schema.teamPlayers.shirtNumber} nulls last`, asc(schema.people.lastName));
      return rows;
    },

    /** Sustituye la convocatoria: quien no venga sale; quien venga entra o se actualiza. */
    async setSquad(
      scope: OrgScope,
      matchId: string,
      entries: MatchSquadEntry[],
    ): Promise<MatchSquadRecord[] | "unknown_player"> {
      const ids = entries.map((e) => e.playerId);
      if (ids.length > 0) {
        const known = await db()
          .select({ id: schema.players.id })
          .from(schema.players)
          .where(
            and(
              eq(schema.players.organizationId, scope.organizationId),
              inArray(schema.players.id, ids),
            ),
          );
        if (known.length !== new Set(ids).size) return "unknown_player";
      }
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.matchPlayers)
          .where(
            and(
              eq(schema.matchPlayers.organizationId, scope.organizationId),
              eq(schema.matchPlayers.matchId, matchId),
              ...(ids.length > 0 ? [sql`${schema.matchPlayers.playerId} not in ${ids}`] : []),
            ),
          );
        for (const [i, e] of entries.entries()) {
          const values = {
            organizationId: scope.organizationId,
            matchId,
            playerId: e.playerId,
            shirtNumber: e.shirtNumber ?? null,
            position: e.position?.trim() ? e.position.trim() : null,
            isGoalkeeper: e.isGoalkeeper ?? false,
            starter: e.starter ?? false,
            slot: e.slot ?? null,
            sortOrder: (i + 1) * 10,
          };
          const { organizationId: _o, matchId: _m, playerId: _p, ...fields } = values;
          await tx
            .insert(schema.matchPlayers)
            .values(values)
            .onConflictDoUpdate({
              target: [schema.matchPlayers.matchId, schema.matchPlayers.playerId],
              set: fields,
            });
        }
      });
      return squadOf(scope, matchId);
    },

    /**
     * Añade eventos al final del partido. Las acciones cogen del catálogo lo que suman al
     * marcador y su clave, para que el historial no dependa de cambios posteriores. Un
     * `clientId` repetido no duplica.
     */
    async appendEvents(
      scope: OrgScope,
      match: MatchRecord,
      inputs: MatchEventCreate[],
      recordedBy: string,
    ): Promise<MatchEventRecord[] | "unknown_action" | "unknown_player"> {
      const types = new Map((await listTypes(scope, match.section.id)).map((t) => [t.id, t]));
      const playerIds = new Set(
        inputs
          .flatMap((e) => [e.playerId, e.relatedPlayerId])
          .filter((id): id is string => Boolean(id)),
      );
      if (playerIds.size > 0) {
        const squad = await squadOf(scope, match.id);
        const inSquad = new Set(squad.map((p) => p.playerId));
        for (const id of playerIds) if (!inSquad.has(id)) return "unknown_player";
      }
      const rows: (typeof schema.matchEvents.$inferInsert)[] = [];
      for (const input of inputs) {
        const type = input.actionTypeId ? types.get(input.actionTypeId) : undefined;
        if (input.kind === "action" && (!type || type.status !== "active")) return "unknown_action";
        rows.push({
          organizationId: scope.organizationId,
          matchId: match.id,
          seq: 0,
          kind: input.kind,
          actionTypeId: type?.id ?? null,
          actionCode: type?.code ?? null,
          playerId: input.playerId ?? null,
          relatedPlayerId: input.relatedPlayerId ?? null,
          side: type?.scope === "opponent" ? "opponent" : "own",
          period: input.period,
          clockMs: input.clockMs,
          zone: input.zone ?? null,
          onCourt: input.onCourt,
          ownScoreDelta: type?.ownScore ?? 0,
          opponentScoreDelta: type?.opponentScore ?? 0,
          note: input.note?.trim() ? input.note.trim() : null,
          clientId: input.clientId ?? null,
          recordedBy,
        });
      }
      await db().transaction(async (tx) => {
        const last = await tx
          .select({ max: sql<number>`coalesce(max(${schema.matchEvents.seq}), 0)` })
          .from(schema.matchEvents)
          .where(eq(schema.matchEvents.matchId, match.id));
        let seq = Number(last[0]?.max ?? 0);
        for (const row of rows) {
          seq += 1;
          await tx
            .insert(schema.matchEvents)
            .values({ ...row, seq })
            .onConflictDoNothing();
        }
      });
      await recomputeScore(scope, match.id);
      return eventsOf(scope, match.id);
    },

    /** Deshacer: borra un evento (el último, normalmente) y recalcula el marcador. */
    async removeEvent(scope: OrgScope, matchId: string, eventId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.matchEvents)
        .where(
          and(
            eq(schema.matchEvents.organizationId, scope.organizationId),
            eq(schema.matchEvents.matchId, matchId),
            eq(schema.matchEvents.id, eventId),
          ),
        )
        .returning({ id: schema.matchEvents.id });
      if (rows.length === 0) return false;
      await recomputeScore(scope, matchId);
      return true;
    },

    /** Histórico de un equipo en una temporada: partidos con convocatoria y eventos. */
    async historyOf(
      scope: OrgScope,
      teamId: string,
    ): Promise<{ match: MatchRecord; squad: MatchSquadRecord[]; events: MatchEventRecord[] }[]> {
      const matches = (
        await matchQuery()
          .where(
            and(
              eq(schema.matches.organizationId, scope.organizationId),
              eq(schema.matches.teamId, teamId),
            ),
          )
          .orderBy(asc(schema.matches.playedOn), asc(schema.matches.createdAt))
      ).map(toMatch);
      const ids = matches.map((m) => m.id);
      const [squads, events] = await Promise.all([
        squadsOf(scope, ids),
        eventsOfMatches(scope, ids),
      ]);
      return matches.map((match) => ({
        match,
        squad: squads.get(match.id) ?? [],
        events: events.get(match.id) ?? [],
      }));
    },

    /** Partidos en los que un jugador fue convocado, con todo lo necesario para calcular su línea. */
    async matchesOfPlayer(
      scope: OrgScope,
      playerId: string,
    ): Promise<
      {
        match: MatchRecord;
        squad: MatchSquadRecord[];
        events: MatchEventRecord[];
        actionTypes: MatchActionTypeRecord[];
      }[]
    > {
      const ids = await db()
        .select({ matchId: schema.matchPlayers.matchId })
        .from(schema.matchPlayers)
        .where(
          and(
            eq(schema.matchPlayers.organizationId, scope.organizationId),
            eq(schema.matchPlayers.playerId, playerId),
          ),
        );
      if (ids.length === 0) return [];
      const matches = (
        await matchQuery()
          .where(
            and(
              eq(schema.matches.organizationId, scope.organizationId),
              inArray(
                schema.matches.id,
                ids.map((r) => r.matchId),
              ),
            ),
          )
          .orderBy(desc(schema.matches.playedOn), desc(schema.matches.createdAt))
      ).map(toMatch);
      const matchIds = matches.map((m) => m.id);
      const [squads, events, types] = await Promise.all([
        squadsOf(scope, matchIds),
        eventsOfMatches(scope, matchIds),
        typesOfSections(scope, [...new Set(matches.map((m) => m.section.id))]),
      ]);
      return matches.map((match) => ({
        match,
        squad: squads.get(match.id) ?? [],
        events: events.get(match.id) ?? [],
        actionTypes: types.get(match.section.id) ?? [],
      }));
    },

    /** Para proponer ajustes y catálogo del deporte en la configuración. */
    sportDefaults(sportCode: string, locale: Locale) {
      return {
        settings: defaultMatchSettings(sportCode),
        actionTypes: defaultMatchActions(sportCode, locale),
      };
    },
  };
}
