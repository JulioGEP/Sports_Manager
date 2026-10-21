import { schema, type Database } from "@sportsmanager/db";
import type {
  RosterAdd,
  RosterUpdate,
  SeasonCreate,
  SeasonUpdate,
  SectionCreate,
  SectionStatus,
  SectionUpdate,
  TeamCreate,
  TeamStatus,
  TeamUpdate,
  PlayerStatus,
} from "@sportsmanager/shared";
import { and, asc, count, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028): temporadas, secciones y equipos con su
 * plantilla y su cuerpo técnico. Toda consulta lleva el ámbito del club (ADR 0015).
 */

export interface SeasonRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  teamsCount: number;
}

export interface SectionRecord {
  id: string;
  name: string;
  status: SectionStatus;
  sortOrder: number;
  teamsCount: number;
}

export interface TeamRecord {
  id: string;
  name: string;
  category: string | null;
  status: TeamStatus;
  section: { id: string; name: string };
  season: { id: string; name: string; isCurrent: boolean };
  playersCount: number;
  staff: { userId: string; name: string }[];
}

export interface RosterRecord {
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  status: PlayerStatus;
  shirtNumber: number | null;
  position: string | null;
  guardiansCount: number;
  photoBlobKey: string | null;
}

export interface StaffRecord {
  userId: string;
  name: string;
  email: string;
}

export interface StructureCounts {
  currentSeason: { id: string; name: string } | null;
  sections: number;
  teams: number;
  players: number;
  guardians: number;
}

export type NameTaken = { outcome: "name_taken" };

export function seasonsRepo(db: () => Database) {
  const selection = {
    id: schema.seasons.id,
    name: schema.seasons.name,
    startsOn: schema.seasons.startsOn,
    endsOn: schema.seasons.endsOn,
    isCurrent: schema.seasons.isCurrent,
    teamsCount: count(schema.teams.id),
  };
  const query = () =>
    db()
      .select(selection)
      .from(schema.seasons)
      .leftJoin(schema.teams, eq(schema.teams.seasonId, schema.seasons.id))
      .groupBy(schema.seasons.id);

  async function byId(scope: OrgScope, id: string): Promise<SeasonRecord | null> {
    const rows = await query().where(
      and(eq(schema.seasons.organizationId, scope.organizationId), eq(schema.seasons.id, id)),
    );
    return rows[0] ?? null;
  }

  return {
    byId,

    /** Temporadas del club, la más reciente primero. */
    async list(scope: OrgScope): Promise<SeasonRecord[]> {
      return query()
        .where(eq(schema.seasons.organizationId, scope.organizationId))
        .orderBy(desc(schema.seasons.startsOn));
    },

    async current(scope: OrgScope): Promise<SeasonRecord | null> {
      const rows = await query().where(
        and(
          eq(schema.seasons.organizationId, scope.organizationId),
          eq(schema.seasons.isCurrent, true),
        ),
      );
      return rows[0] ?? null;
    },

    /** La primera temporada del club pasa a ser la actual aunque no se pida. */
    async create(
      scope: OrgScope,
      input: SeasonCreate,
    ): Promise<{ outcome: "created"; season: SeasonRecord } | NameTaken> {
      try {
        const id = await db().transaction(async (tx) => {
          const existing = await tx
            .select({ id: schema.seasons.id })
            .from(schema.seasons)
            .where(eq(schema.seasons.organizationId, scope.organizationId))
            .limit(1);
          const isCurrent = input.isCurrent === true || existing.length === 0;
          if (isCurrent) {
            await tx
              .update(schema.seasons)
              .set({ isCurrent: false })
              .where(eq(schema.seasons.organizationId, scope.organizationId));
          }
          const rows = await tx
            .insert(schema.seasons)
            .values({
              organizationId: scope.organizationId,
              name: input.name,
              startsOn: input.startsOn,
              endsOn: input.endsOn,
              isCurrent,
            })
            .returning({ id: schema.seasons.id });
          return rows[0]!.id;
        });
        const season = await byId(scope, id);
        if (!season) throw new Error("La temporada recién creada no aparece.");
        return { outcome: "created", season };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: SeasonUpdate,
    ): Promise<
      { outcome: "updated"; season: SeasonRecord } | { outcome: "not_found" } | NameTaken
    > {
      const current = await byId(scope, id);
      if (!current) return { outcome: "not_found" };
      const startsOn = patch.startsOn ?? current.startsOn;
      const endsOn = patch.endsOn ?? current.endsOn;
      try {
        await db().transaction(async (tx) => {
          if (patch.isCurrent) {
            await tx
              .update(schema.seasons)
              .set({ isCurrent: false })
              .where(eq(schema.seasons.organizationId, scope.organizationId));
          }
          await tx
            .update(schema.seasons)
            .set({
              name: patch.name ?? current.name,
              startsOn,
              endsOn,
              ...(patch.isCurrent ? { isCurrent: true } : {}),
            })
            .where(
              and(
                eq(schema.seasons.organizationId, scope.organizationId),
                eq(schema.seasons.id, id),
              ),
            );
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
      const season = await byId(scope, id);
      return season ? { outcome: "updated", season } : { outcome: "not_found" };
    },
  };
}

export function sectionsRepo(db: () => Database) {
  async function list(scope: OrgScope, seasonId: string | null): Promise<SectionRecord[]> {
    const rows = await db()
      .select({
        id: schema.sections.id,
        name: schema.sections.name,
        status: schema.sections.status,
        sortOrder: schema.sections.sortOrder,
      })
      .from(schema.sections)
      .where(eq(schema.sections.organizationId, scope.organizationId))
      .orderBy(asc(schema.sections.sortOrder), asc(schema.sections.name));
    const counts = seasonId
      ? await db()
          .select({ sectionId: schema.teams.sectionId, total: count() })
          .from(schema.teams)
          .where(
            and(
              eq(schema.teams.organizationId, scope.organizationId),
              eq(schema.teams.seasonId, seasonId),
              eq(schema.teams.status, "active"),
            ),
          )
          .groupBy(schema.teams.sectionId)
      : [];
    const byId = new Map(counts.map((c) => [c.sectionId, c.total]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as SectionStatus,
      sortOrder: row.sortOrder,
      teamsCount: byId.get(row.id) ?? 0,
    }));
  }

  async function byId(scope: OrgScope, id: string): Promise<SectionRecord | null> {
    const all = await list(scope, null);
    return all.find((s) => s.id === id) ?? null;
  }

  return {
    list,
    byId,

    async create(
      scope: OrgScope,
      input: SectionCreate,
    ): Promise<{ outcome: "created"; section: SectionRecord } | NameTaken> {
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.sections.sortOrder}), 0)` })
        .from(schema.sections)
        .where(eq(schema.sections.organizationId, scope.organizationId));
      try {
        const rows = await db()
          .insert(schema.sections)
          .values({
            organizationId: scope.organizationId,
            name: input.name,
            sortOrder: Number(last[0]?.max ?? 0) + 10,
          })
          .returning({ id: schema.sections.id });
        const section = await byId(scope, rows[0]!.id);
        if (!section) throw new Error("La sección recién creada no aparece.");
        return { outcome: "created", section };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: SectionUpdate,
    ): Promise<
      { outcome: "updated"; section: SectionRecord } | { outcome: "not_found" } | NameTaken
    > {
      const values: Partial<typeof schema.sections.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.status !== undefined) values.status = patch.status;
      try {
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.sections)
            .set(values)
            .where(
              and(
                eq(schema.sections.organizationId, scope.organizationId),
                eq(schema.sections.id, id),
              ),
            )
            .returning({ id: schema.sections.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
      const section = await byId(scope, id);
      return section ? { outcome: "updated", section } : { outcome: "not_found" };
    },
  };
}

export function teamsRepo(db: () => Database) {
  const selection = {
    id: schema.teams.id,
    name: schema.teams.name,
    category: schema.teams.category,
    status: schema.teams.status,
    sectionId: schema.sections.id,
    sectionName: schema.sections.name,
    seasonId: schema.seasons.id,
    seasonName: schema.seasons.name,
    seasonIsCurrent: schema.seasons.isCurrent,
    playersCount: count(schema.teamPlayers.id),
  };
  const query = () =>
    db()
      .select(selection)
      .from(schema.teams)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .leftJoin(schema.teamPlayers, eq(schema.teamPlayers.teamId, schema.teams.id))
      .groupBy(schema.teams.id, schema.sections.id, schema.seasons.id);

  async function staffFor(scope: OrgScope, teamIds: string[]): Promise<Map<string, StaffRecord[]>> {
    const map = new Map<string, StaffRecord[]>();
    if (teamIds.length === 0) return map;
    const rows = await db()
      .select({
        teamId: schema.teamStaff.teamId,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
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
    for (const row of rows) {
      const list = map.get(row.teamId) ?? [];
      list.push({ userId: row.userId, name: row.name, email: row.email });
      map.set(row.teamId, list);
    }
    return map;
  }

  type Row = Awaited<ReturnType<ReturnType<typeof query>["execute"]>>[number];
  const toRecord = (row: Row, staff: StaffRecord[]): TeamRecord => ({
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status as TeamStatus,
    section: { id: row.sectionId, name: row.sectionName },
    season: { id: row.seasonId, name: row.seasonName, isCurrent: row.seasonIsCurrent },
    playersCount: row.playersCount,
    staff: staff.map((s) => ({ userId: s.userId, name: s.name })),
  });

  async function byId(scope: OrgScope, id: string): Promise<TeamRecord | null> {
    const rows = await query().where(
      and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, id)),
    );
    const row = rows[0];
    if (!row) return null;
    const staff = await staffFor(scope, [row.id]);
    return toRecord(row, staff.get(row.id) ?? []);
  }

  return {
    byId,

    /** Equipos de una temporada, por sección y nombre. */
    async list(scope: OrgScope, seasonId: string): Promise<TeamRecord[]> {
      const rows = await query()
        .where(
          and(
            eq(schema.teams.organizationId, scope.organizationId),
            eq(schema.teams.seasonId, seasonId),
          ),
        )
        .orderBy(asc(schema.sections.sortOrder), asc(schema.sections.name), asc(schema.teams.name));
      const staff = await staffFor(
        scope,
        rows.map((r) => r.id),
      );
      return rows.map((row) => toRecord(row, staff.get(row.id) ?? []));
    },

    async roster(scope: OrgScope, teamId: string): Promise<RosterRecord[]> {
      const rows = await db()
        .select({
          playerId: schema.players.id,
          firstName: schema.players.firstName,
          lastName: schema.players.lastName,
          birthDate: schema.players.birthDate,
          status: schema.players.status,
          shirtNumber: schema.teamPlayers.shirtNumber,
          position: schema.teamPlayers.position,
          guardiansCount: count(schema.playerGuardians.id),
          photoBlobKey: schema.players.photoBlobKey,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
        .leftJoin(schema.playerGuardians, eq(schema.playerGuardians.playerId, schema.players.id))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, teamId),
          ),
        )
        .groupBy(schema.players.id, schema.teamPlayers.id)
        .orderBy(
          sql`${schema.teamPlayers.shirtNumber} nulls last`,
          asc(schema.players.lastName),
          asc(schema.players.firstName),
        );
      return rows.map((row) => ({ ...row, status: row.status as PlayerStatus }));
    },

    async staff(scope: OrgScope, teamId: string): Promise<StaffRecord[]> {
      const map = await staffFor(scope, [teamId]);
      return map.get(teamId) ?? [];
    },

    async create(
      scope: OrgScope,
      input: TeamCreate,
    ): Promise<
      | { outcome: "created"; team: TeamRecord }
      | { outcome: "unknown_section" }
      | { outcome: "unknown_season" }
      | NameTaken
    > {
      const section = await db()
        .select({ id: schema.sections.id })
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.sections.id, input.sectionId),
          ),
        )
        .limit(1);
      if (!section[0]) return { outcome: "unknown_section" };
      const season = await db()
        .select({ id: schema.seasons.id })
        .from(schema.seasons)
        .where(
          and(
            eq(schema.seasons.organizationId, scope.organizationId),
            eq(schema.seasons.id, input.seasonId),
          ),
        )
        .limit(1);
      if (!season[0]) return { outcome: "unknown_season" };
      try {
        const rows = await db()
          .insert(schema.teams)
          .values({
            organizationId: scope.organizationId,
            sectionId: input.sectionId,
            seasonId: input.seasonId,
            name: input.name,
            category: input.category?.trim() ? input.category.trim() : null,
          })
          .returning({ id: schema.teams.id });
        const team = await byId(scope, rows[0]!.id);
        if (!team) throw new Error("El equipo recién creado no aparece.");
        return { outcome: "created", team };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: TeamUpdate,
    ): Promise<
      | { outcome: "updated"; team: TeamRecord }
      | { outcome: "not_found" }
      | { outcome: "unknown_section" }
      | NameTaken
    > {
      const values: Partial<typeof schema.teams.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.category !== undefined)
        values.category = patch.category?.trim() ? patch.category.trim() : null;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.sectionId !== undefined) {
        const section = await db()
          .select({ id: schema.sections.id })
          .from(schema.sections)
          .where(
            and(
              eq(schema.sections.organizationId, scope.organizationId),
              eq(schema.sections.id, patch.sectionId),
            ),
          )
          .limit(1);
        if (!section[0]) return { outcome: "unknown_section" };
        values.sectionId = patch.sectionId;
      }
      try {
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.teams)
            .set(values)
            .where(
              and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, id)),
            )
            .returning({ id: schema.teams.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
      const team = await byId(scope, id);
      return team ? { outcome: "updated", team } : { outcome: "not_found" };
    },

    /** Mete a un jugador del club en la plantilla. */
    async addPlayer(
      scope: OrgScope,
      teamId: string,
      input: RosterAdd,
    ): Promise<"added" | "already_in_team" | "unknown_player" | "unknown_team"> {
      const team = await db()
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(
          and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, teamId)),
        )
        .limit(1);
      if (!team[0]) return "unknown_team";
      const player = await db()
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, input.playerId),
          ),
        )
        .limit(1);
      if (!player[0]) return "unknown_player";
      try {
        await db()
          .insert(schema.teamPlayers)
          .values({
            organizationId: scope.organizationId,
            teamId,
            playerId: input.playerId,
            shirtNumber: input.shirtNumber ?? null,
            position: input.position?.trim() ? input.position.trim() : null,
          });
        return "added";
      } catch (error) {
        if (isUniqueViolation(error)) return "already_in_team";
        throw error;
      }
    },

    async updatePlayer(
      scope: OrgScope,
      teamId: string,
      playerId: string,
      patch: RosterUpdate,
    ): Promise<boolean> {
      const values: Partial<typeof schema.teamPlayers.$inferInsert> = {};
      if (patch.shirtNumber !== undefined) values.shirtNumber = patch.shirtNumber;
      if (patch.position !== undefined)
        values.position = patch.position?.trim() ? patch.position.trim() : null;
      if (Object.keys(values).length === 0) return true;
      const rows = await db()
        .update(schema.teamPlayers)
        .set(values)
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, teamId),
            eq(schema.teamPlayers.playerId, playerId),
          ),
        )
        .returning({ id: schema.teamPlayers.id });
      return rows.length > 0;
    },

    async removePlayer(scope: OrgScope, teamId: string, playerId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.teamPlayers)
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, teamId),
            eq(schema.teamPlayers.playerId, playerId),
          ),
        )
        .returning({ id: schema.teamPlayers.id });
      return rows.length > 0;
    },

    /** Cuerpo técnico: solo miembros activos del club. */
    async addStaff(
      scope: OrgScope,
      teamId: string,
      userId: string,
    ): Promise<"added" | "already_staff" | "not_member" | "unknown_team"> {
      const team = await db()
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(
          and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, teamId)),
        )
        .limit(1);
      if (!team[0]) return "unknown_team";
      const member = await db()
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.status, "active"),
          ),
        )
        .limit(1);
      if (!member[0]) return "not_member";
      try {
        await db()
          .insert(schema.teamStaff)
          .values({ organizationId: scope.organizationId, teamId, userId });
        return "added";
      } catch (error) {
        if (isUniqueViolation(error)) return "already_staff";
        throw error;
      }
    },

    async removeStaff(scope: OrgScope, teamId: string, userId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.teamStaff)
        .where(
          and(
            eq(schema.teamStaff.organizationId, scope.organizationId),
            eq(schema.teamStaff.teamId, teamId),
            eq(schema.teamStaff.userId, userId),
          ),
        )
        .returning({ id: schema.teamStaff.id });
      return rows.length > 0;
    },

    /** Miembros con rol de entrenador, personal o administración, elegibles para el cuerpo técnico. */
    async eligibleStaff(scope: OrgScope): Promise<StaffRecord[]> {
      const rows = await db()
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
            inArray(schema.memberships.roleCode, ["coach", "staff", "org_admin"]),
          ),
        )
        .orderBy(asc(schema.users.name));
      return rows;
    },

    /** Cifras de la portada y de la vista de soporte. Sin datos personales. */
    async counts(scope: OrgScope): Promise<StructureCounts> {
      const current = await db()
        .select({ id: schema.seasons.id, name: schema.seasons.name })
        .from(schema.seasons)
        .where(
          and(
            eq(schema.seasons.organizationId, scope.organizationId),
            eq(schema.seasons.isCurrent, true),
          ),
        )
        .limit(1);
      const currentSeason = current[0] ?? null;
      const sections = await db()
        .select({ total: count() })
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.sections.status, "active"),
          ),
        );
      const teams = currentSeason
        ? await db()
            .select({ total: count() })
            .from(schema.teams)
            .where(
              and(
                eq(schema.teams.organizationId, scope.organizationId),
                eq(schema.teams.seasonId, currentSeason.id),
                eq(schema.teams.status, "active"),
              ),
            )
        : [];
      const players = await db()
        .select({ total: count() })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.status, "active"),
          ),
        );
      const guardians = await db()
        .select({ total: countDistinct(schema.playerGuardians.userId) })
        .from(schema.playerGuardians)
        .where(eq(schema.playerGuardians.organizationId, scope.organizationId));
      return {
        currentSeason,
        sections: sections[0]?.total ?? 0,
        teams: teams[0]?.total ?? 0,
        players: players[0]?.total ?? 0,
        guardians: guardians[0]?.total ?? 0,
      };
    },
  };
}
