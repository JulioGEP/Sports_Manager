import { schema, type Database } from "@sportsmanager/db";
import type {
  GuardianRelationship,
  PlayerCreate,
  PlayerStatus,
  PlayerUpdate,
} from "@sportsmanager/shared";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Jugadores y familias (Fase 1, Bloque 11, ADR 0028). Datos de menores: solo salen con
 * `org.players.read`, o a su propia familia con `org.family.read`. Siempre con ámbito de club.
 */

export interface PlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  status: PlayerStatus;
  createdAt: Date;
}

export interface PlayerSummaryRecord extends PlayerRow {
  teams: { teamId: string; teamName: string }[];
  guardiansCount: number;
}

export interface PlayerTeamRecord {
  teamId: string;
  teamName: string;
  sectionName: string;
  seasonId: string;
  seasonName: string;
  seasonIsCurrent: boolean;
  shirtNumber: number | null;
  position: string | null;
}

export interface GuardianRecord {
  userId: string;
  name: string;
  email: string;
  relationship: GuardianRelationship;
}

export interface FamilyPlayerRecord extends PlayerRow {
  relationship: GuardianRelationship;
  teams: {
    teamId: string;
    teamName: string;
    sectionName: string;
    seasonName: string;
    shirtNumber: number | null;
    staff: { userId: string; name: string }[];
  }[];
}

const playerSelection = {
  id: schema.players.id,
  firstName: schema.players.firstName,
  lastName: schema.players.lastName,
  birthDate: schema.players.birthDate,
  status: schema.players.status,
  createdAt: schema.players.createdAt,
};

const toRow = (row: {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  status: string;
  createdAt: Date;
}): PlayerRow => ({ ...row, status: row.status as PlayerStatus });

export function playersRepo(db: () => Database) {
  async function byId(scope: OrgScope, id: string): Promise<PlayerRow | null> {
    const rows = await db()
      .select(playerSelection)
      .from(schema.players)
      .where(
        and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
      )
      .limit(1);
    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Equipos de la temporada actual de una lista de jugadores. */
  async function currentTeamsFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, { teamId: string; teamName: string }[]>> {
    const map = new Map<string, { teamId: string; teamName: string }[]>();
    if (playerIds.length === 0) return map;
    const rows = await db()
      .select({
        playerId: schema.teamPlayers.playerId,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
      })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          inArray(schema.teamPlayers.playerId, playerIds),
          eq(schema.seasons.isCurrent, true),
        ),
      )
      .orderBy(asc(schema.teams.name));
    for (const row of rows) {
      const list = map.get(row.playerId) ?? [];
      list.push({ teamId: row.teamId, teamName: row.teamName });
      map.set(row.playerId, list);
    }
    return map;
  }

  async function guardiansCountFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();
    const rows = await db()
      .select({ playerId: schema.playerGuardians.playerId, total: count() })
      .from(schema.playerGuardians)
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          inArray(schema.playerGuardians.playerId, playerIds),
        ),
      )
      .groupBy(schema.playerGuardians.playerId);
    return new Map(rows.map((r) => [r.playerId, r.total]));
  }

  return {
    byId,

    /** Jugadores del club con sus equipos de la temporada actual. Búsqueda por nombre. */
    async list(
      scope: OrgScope,
      filter: { query?: string | undefined; teamId?: string | undefined } = {},
    ): Promise<PlayerSummaryRecord[]> {
      const conditions = [eq(schema.players.organizationId, scope.organizationId)];
      const q = filter.query?.trim();
      if (q) {
        const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        conditions.push(
          or(
            ilike(schema.players.firstName, pattern),
            ilike(schema.players.lastName, pattern),
            ilike(sql`${schema.players.firstName} || ' ' || ${schema.players.lastName}`, pattern),
          )!,
        );
      }
      if (filter.teamId) {
        conditions.push(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.teamPlayers.playerId })
              .from(schema.teamPlayers)
              .where(
                and(
                  eq(schema.teamPlayers.organizationId, scope.organizationId),
                  eq(schema.teamPlayers.teamId, filter.teamId),
                ),
              ),
          ),
        );
      }
      const rows = await db()
        .select(playerSelection)
        .from(schema.players)
        .where(and(...conditions))
        .orderBy(asc(schema.players.lastName), asc(schema.players.firstName))
        .limit(500);
      const ids = rows.map((r) => r.id);
      const teams = await currentTeamsFor(scope, ids);
      const guardians = await guardiansCountFor(scope, ids);
      return rows.map((row) => ({
        ...toRow(row),
        teams: teams.get(row.id) ?? [],
        guardiansCount: guardians.get(row.id) ?? 0,
      }));
    },

    /** Todos los equipos (de cualquier temporada) de un jugador. */
    async teamsOf(scope: OrgScope, playerId: string): Promise<PlayerTeamRecord[]> {
      return db()
        .select({
          teamId: schema.teams.id,
          teamName: schema.teams.name,
          sectionName: schema.sections.name,
          seasonId: schema.seasons.id,
          seasonName: schema.seasons.name,
          seasonIsCurrent: schema.seasons.isCurrent,
          shirtNumber: schema.teamPlayers.shirtNumber,
          position: schema.teamPlayers.position,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.playerId, playerId),
          ),
        )
        .orderBy(sql`${schema.seasons.startsOn} desc`, asc(schema.teams.name));
    },

    async guardiansOf(scope: OrgScope, playerId: string): Promise<GuardianRecord[]> {
      const rows = await db()
        .select({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          relationship: schema.playerGuardians.relationship,
        })
        .from(schema.playerGuardians)
        .innerJoin(schema.users, eq(schema.users.id, schema.playerGuardians.userId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.playerId, playerId),
          ),
        )
        .orderBy(asc(schema.users.name));
      return rows.map((r) => ({ ...r, relationship: r.relationship as GuardianRelationship }));
    },

    async create(scope: OrgScope, input: PlayerCreate): Promise<PlayerRow> {
      const rows = await db()
        .insert(schema.players)
        .values({
          organizationId: scope.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate ?? null,
        })
        .returning(playerSelection);
      return toRow(rows[0]!);
    },

    async update(scope: OrgScope, id: string, patch: PlayerUpdate): Promise<PlayerRow | null> {
      const values: Partial<typeof schema.players.$inferInsert> = {};
      if (patch.firstName !== undefined) values.firstName = patch.firstName;
      if (patch.lastName !== undefined) values.lastName = patch.lastName;
      if (patch.birthDate !== undefined) values.birthDate = patch.birthDate;
      if (patch.status !== undefined) values.status = patch.status;
      if (Object.keys(values).length === 0) return byId(scope, id);
      const rows = await db()
        .update(schema.players)
        .set(values)
        .where(
          and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
        )
        .returning(playerSelection);
      return rows[0] ? toRow(rows[0]) : null;
    },

    /** Vincula una cuenta al jugador. Si ya estaba, actualiza la relación. */
    async linkGuardian(
      scope: OrgScope,
      playerId: string,
      userId: string,
      relationship: GuardianRelationship,
    ): Promise<"linked" | "updated"> {
      try {
        await db()
          .insert(schema.playerGuardians)
          .values({ organizationId: scope.organizationId, playerId, userId, relationship });
        return "linked";
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await db()
          .update(schema.playerGuardians)
          .set({ relationship })
          .where(
            and(
              eq(schema.playerGuardians.organizationId, scope.organizationId),
              eq(schema.playerGuardians.playerId, playerId),
              eq(schema.playerGuardians.userId, userId),
            ),
          );
        return "updated";
      }
    },

    async unlinkGuardian(scope: OrgScope, playerId: string, userId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.playerGuardians)
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.playerId, playerId),
            eq(schema.playerGuardians.userId, userId),
          ),
        )
        .returning({ id: schema.playerGuardians.id });
      return rows.length > 0;
    },

    /** Lo que ve una familia: sus jugadores con el equipo de la temporada actual y quién lo entrena. */
    async familyOf(scope: OrgScope, userId: string): Promise<FamilyPlayerRecord[]> {
      const rows = await db()
        .select({ ...playerSelection, relationship: schema.playerGuardians.relationship })
        .from(schema.playerGuardians)
        .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
          ),
        )
        .orderBy(asc(schema.players.firstName), asc(schema.players.lastName));
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const teams = await db()
        .select({
          playerId: schema.teamPlayers.playerId,
          teamId: schema.teams.id,
          teamName: schema.teams.name,
          sectionName: schema.sections.name,
          seasonName: schema.seasons.name,
          shirtNumber: schema.teamPlayers.shirtNumber,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            inArray(schema.teamPlayers.playerId, ids),
            eq(schema.seasons.isCurrent, true),
            eq(schema.teams.status, "active"),
          ),
        )
        .orderBy(asc(schema.teams.name));
      const teamIds = [...new Set(teams.map((t) => t.teamId))];
      const staff =
        teamIds.length === 0
          ? []
          : await db()
              .select({
                teamId: schema.teamStaff.teamId,
                userId: schema.users.id,
                name: schema.users.name,
              })
              .from(schema.teamStaff)
              .innerJoin(schema.users, eq(schema.users.id, schema.teamStaff.userId))
              .where(
                and(
                  eq(schema.teamStaff.organizationId, scope.organizationId),
                  inArray(schema.teamStaff.teamId, teamIds),
                ),
              )
              .orderBy(asc(schema.users.name));
      const staffBy = new Map<string, { userId: string; name: string }[]>();
      for (const s of staff) {
        const list = staffBy.get(s.teamId) ?? [];
        list.push({ userId: s.userId, name: s.name });
        staffBy.set(s.teamId, list);
      }
      return rows.map((row) => ({
        ...toRow(row),
        relationship: row.relationship as GuardianRelationship,
        teams: teams
          .filter((t) => t.playerId === row.id)
          .map((t) => ({
            teamId: t.teamId,
            teamName: t.teamName,
            sectionName: t.sectionName,
            seasonName: t.seasonName,
            shirtNumber: t.shirtNumber,
            staff: staffBy.get(t.teamId) ?? [],
          })),
      }));
    },

    /** Miembros activos del club, para vincular como familia a quien ya tiene cuenta. */
    async eligibleGuardians(
      scope: OrgScope,
    ): Promise<{ userId: string; name: string; email: string }[]> {
      return db()
        .selectDistinct({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
          ),
        )
        .orderBy(asc(schema.users.name));
    },
  };
}
