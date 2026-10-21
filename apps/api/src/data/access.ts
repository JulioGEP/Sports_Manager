import { schema, type Database } from "@sportsmanager/db";
import {
  scopeKindsOf,
  STAFF_POSITIONS,
  type AccessArea,
  type AccessEffect,
  type AccessProfile,
  type AccessRule,
  type AccessScope,
  type MembershipRole,
  type StaffPosition,
} from "@sportsmanager/shared";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Alcance y visibilidad por rol (Bloque 19, ADR 0033): las reglas que fija la administración,
 * las secciones y los deportistas a cargo de cada persona, y el ámbito resuelto de un actor.
 * Toda consulta lleva el ámbito del club (ADR 0015).
 */

export interface PlayerStaffRecord {
  userId: string;
  name: string;
  position: StaffPosition | null;
}

export interface SectionRef {
  sectionId: string;
  sectionName: string;
}

function asPosition(value: string | null): StaffPosition | null {
  return value && (STAFF_POSITIONS as readonly string[]).includes(value)
    ? (value as StaffPosition)
    : null;
}

export function accessRepo(
  db: () => Database,
  memberships: { ownTeamIds(scope: OrgScope, userId: string): Promise<string[]> },
) {
  const toRule = (row: {
    profile: string | null;
    userId: string | null;
    area: string;
    effect: string;
  }): AccessRule => ({
    profile: row.profile as AccessProfile | null,
    userId: row.userId,
    area: row.area as AccessArea,
    effect: row.effect as AccessEffect,
  });

  /** Secciones a cargo de unas personas: las que coordinan y las asignadas por la administración. */
  async function sectionsByUser(
    scope: OrgScope,
    userIds: string[],
  ): Promise<Map<string, SectionRef[]>> {
    const map = new Map<string, SectionRef[]>();
    if (userIds.length === 0) return map;
    const [assigned, coordinated] = await Promise.all([
      db()
        .select({
          userId: schema.sectionStaff.userId,
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          sortOrder: schema.sections.sortOrder,
        })
        .from(schema.sectionStaff)
        .innerJoin(schema.sections, eq(schema.sections.id, schema.sectionStaff.sectionId))
        .where(
          and(
            eq(schema.sectionStaff.organizationId, scope.organizationId),
            inArray(schema.sectionStaff.userId, userIds),
          ),
        ),
      db()
        .select({
          userId: schema.sections.coordinatorUserId,
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          sortOrder: schema.sections.sortOrder,
        })
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            inArray(schema.sections.coordinatorUserId, userIds),
          ),
        ),
    ]);
    const rows = [...assigned, ...coordinated]
      .filter((r): r is typeof r & { userId: string } => r.userId !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.sectionName.localeCompare(b.sectionName));
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      if (!list.some((s) => s.sectionId === row.sectionId))
        list.push({ sectionId: row.sectionId, sectionName: row.sectionName });
      map.set(row.userId, list);
    }
    return map;
  }

  /** Equipos activos de la temporada actual en unas secciones. */
  async function teamIdsInSections(scope: OrgScope, sectionIds: string[]): Promise<string[]> {
    if (sectionIds.length === 0) return [];
    const rows = await db()
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teams.organizationId, scope.organizationId),
          inArray(schema.teams.sectionId, sectionIds),
          eq(schema.seasons.isCurrent, true),
          eq(schema.teams.status, "active"),
        ),
      );
    return rows.map((r) => r.id);
  }

  async function sectionIdsOfTeams(scope: OrgScope, teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];
    const rows = await db()
      .selectDistinct({ sectionId: schema.teams.sectionId })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.organizationId, scope.organizationId),
          inArray(schema.teams.id, teamIds),
        ),
      );
    return rows.map((r) => r.sectionId);
  }

  /**
   * Deportistas que una persona ha atendido: los que le asignaron y aquellos sobre los que dejó
   * una valoración, una anotación, un objetivo o un plan. Los de sus equipos van por el ámbito.
   */
  async function attendedPlayerIds(scope: OrgScope, userId: string): Promise<string[]> {
    const org = scope.organizationId;
    const rows = await db().execute<{ player_id: string }>(sql`
      select ps.player_id from ${schema.playerStaff} ps
        where ps.organization_id = ${org} and ps.user_id = ${userId}
      union
      select e.player_id from ${schema.playerEvents} e
        where e.organization_id = ${org} and e.actor_user_id = ${userId}
      union
      select i.player_id from ${schema.playerIndicators} i
        where i.organization_id = ${org} and i.updated_by = ${userId}
      union
      select o.player_id from ${schema.playerObjectives} o
        where o.organization_id = ${org} and o.owner_user_id = ${userId}
      union
      select d.player_id from ${schema.playerDevelopmentPlans} d
        where d.organization_id = ${org} and d.coordinator_user_id = ${userId}
    `);
    return rows.rows.map((r) => r.player_id);
  }

  return {
    sectionsByUser,
    teamIdsInSections,
    attendedPlayerIds,

    // --- Reglas ---

    /** Las reglas que afectan a una persona: las de todos los perfiles y sus exclusiones. */
    async rulesFor(scope: OrgScope, userId: string): Promise<AccessRule[]> {
      const rows = await db()
        .select({
          profile: schema.accessRules.profile,
          userId: schema.accessRules.userId,
          area: schema.accessRules.area,
          effect: schema.accessRules.effect,
        })
        .from(schema.accessRules)
        .where(
          and(
            eq(schema.accessRules.organizationId, scope.organizationId),
            or(isNotNull(schema.accessRules.profile), eq(schema.accessRules.userId, userId)),
          ),
        );
      return rows.map(toRule);
    },

    /** Todas las reglas del club, con el nombre de las personas excluidas. */
    async listRules(scope: OrgScope): Promise<{
      profiles: AccessRule[];
      users: { userId: string; name: string; area: AccessArea }[];
    }> {
      const [profiles, users] = await Promise.all([
        db()
          .select({
            profile: schema.accessRules.profile,
            userId: schema.accessRules.userId,
            area: schema.accessRules.area,
            effect: schema.accessRules.effect,
          })
          .from(schema.accessRules)
          .where(
            and(
              eq(schema.accessRules.organizationId, scope.organizationId),
              isNotNull(schema.accessRules.profile),
            ),
          ),
        db()
          .select({
            userId: schema.users.id,
            name: schema.users.name,
            area: schema.accessRules.area,
          })
          .from(schema.accessRules)
          .innerJoin(schema.users, eq(schema.users.id, schema.accessRules.userId))
          .where(
            and(
              eq(schema.accessRules.organizationId, scope.organizationId),
              isNull(schema.accessRules.profile),
              eq(schema.accessRules.effect, "deny"),
            ),
          )
          .orderBy(asc(schema.users.name)),
      ]);
      return {
        profiles: profiles.map(toRule),
        users: users.map((u) => ({ ...u, area: u.area as AccessArea })),
      };
    },

    /** Fija (o borra, con `null`) la regla de un perfil sobre un área. */
    async setProfileRule(
      scope: OrgScope,
      profile: AccessProfile,
      area: AccessArea,
      effect: AccessEffect | null,
    ): Promise<void> {
      const where = and(
        eq(schema.accessRules.organizationId, scope.organizationId),
        eq(schema.accessRules.profile, profile),
        eq(schema.accessRules.area, area),
      );
      if (effect === null) {
        await db().delete(schema.accessRules).where(where);
        return;
      }
      const updated = await db()
        .update(schema.accessRules)
        .set({ effect })
        .where(where)
        .returning({ id: schema.accessRules.id });
      if (updated.length === 0) {
        await db()
          .insert(schema.accessRules)
          .values({ organizationId: scope.organizationId, profile, area, effect });
      }
    },

    /** Sustituye las áreas excluidas a una persona. */
    async setUserExclusions(
      scope: OrgScope,
      userId: string,
      areas: AccessArea[],
    ): Promise<AccessArea[]> {
      const unique = [...new Set(areas)];
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.accessRules)
          .where(
            and(
              eq(schema.accessRules.organizationId, scope.organizationId),
              eq(schema.accessRules.userId, userId),
            ),
          );
        if (unique.length > 0) {
          await tx.insert(schema.accessRules).values(
            unique.map((area) => ({
              organizationId: scope.organizationId,
              userId,
              area,
              effect: "deny" as const,
            })),
          );
        }
      });
      return unique;
    },

    async exclusionsByUser(scope: OrgScope, userIds: string[]): Promise<Map<string, AccessArea[]>> {
      const map = new Map<string, AccessArea[]>();
      if (userIds.length === 0) return map;
      const rows = await db()
        .select({ userId: schema.accessRules.userId, area: schema.accessRules.area })
        .from(schema.accessRules)
        .where(
          and(
            eq(schema.accessRules.organizationId, scope.organizationId),
            inArray(schema.accessRules.userId, userIds),
            eq(schema.accessRules.effect, "deny"),
          ),
        );
      for (const row of rows) {
        if (!row.userId) continue;
        const list = map.get(row.userId) ?? [];
        list.push(row.area as AccessArea);
        map.set(row.userId, list);
      }
      return map;
    },

    // --- Secciones a cargo ---

    /** Sustituye las secciones asignadas a alguien. Las que coordina siguen por `sections`. */
    async setUserSections(
      scope: OrgScope,
      userId: string,
      sectionIds: string[],
    ): Promise<"saved" | "unknown_section"> {
      const unique = [...new Set(sectionIds)];
      if (unique.length > 0) {
        const known = await db()
          .select({ id: schema.sections.id })
          .from(schema.sections)
          .where(
            and(
              eq(schema.sections.organizationId, scope.organizationId),
              inArray(schema.sections.id, unique),
            ),
          );
        if (known.length !== unique.length) return "unknown_section";
      }
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.sectionStaff)
          .where(
            and(
              eq(schema.sectionStaff.organizationId, scope.organizationId),
              eq(schema.sectionStaff.userId, userId),
            ),
          );
        if (unique.length > 0) {
          await tx.insert(schema.sectionStaff).values(
            unique.map((sectionId) => ({
              organizationId: scope.organizationId,
              sectionId,
              userId,
            })),
          );
        }
      });
      return "saved";
    },

    // --- Personal asignado a un deportista ---

    async staffOfPlayer(scope: OrgScope, playerId: string): Promise<PlayerStaffRecord[]> {
      const rows = await db()
        .select({ userId: schema.users.id, name: schema.users.name })
        .from(schema.playerStaff)
        .innerJoin(schema.users, eq(schema.users.id, schema.playerStaff.userId))
        .where(
          and(
            eq(schema.playerStaff.organizationId, scope.organizationId),
            eq(schema.playerStaff.playerId, playerId),
          ),
        )
        .orderBy(asc(schema.users.name));
      if (rows.length === 0) return [];
      const positions = await db()
        .select({ userId: schema.memberships.userId, position: schema.memberships.position })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.roleCode, "staff"),
            inArray(
              schema.memberships.userId,
              rows.map((r) => r.userId),
            ),
          ),
        );
      const positionBy = new Map(positions.map((p) => [p.userId, asPosition(p.position)]));
      return rows.map((r) => ({ ...r, position: positionBy.get(r.userId) ?? null }));
    },

    /** Asigna a alguien del personal (o cuerpo técnico, o administración) a un deportista. */
    async assignPlayerStaff(
      scope: OrgScope,
      playerId: string,
      userId: string,
      assignedBy: string | null,
    ): Promise<"assigned" | "already_assigned" | "unknown_player" | "not_staff"> {
      const player = await db()
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, playerId),
          ),
        )
        .limit(1);
      if (!player[0]) return "unknown_player";
      const member = await db()
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.status, "active"),
            inArray(schema.memberships.roleCode, ["coach", "staff", "org_admin"]),
          ),
        )
        .limit(1);
      if (!member[0]) return "not_staff";
      try {
        await db()
          .insert(schema.playerStaff)
          .values({ organizationId: scope.organizationId, playerId, userId, assignedBy });
        return "assigned";
      } catch (error) {
        if (isUniqueViolation(error)) return "already_assigned";
        throw error;
      }
    },

    async unassignPlayerStaff(scope: OrgScope, playerId: string, userId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.playerStaff)
        .where(
          and(
            eq(schema.playerStaff.organizationId, scope.organizationId),
            eq(schema.playerStaff.playerId, playerId),
            eq(schema.playerStaff.userId, userId),
          ),
        )
        .returning({ id: schema.playerStaff.id });
      return rows.length > 0;
    },

    // --- Instalaciones que usan unos equipos ---

    /** Instalaciones donde entrenan o juegan unos equipos: su horario semanal y sus eventos. */
    async facilityIdsForTeams(scope: OrgScope, teamIds: string[]): Promise<string[]> {
      if (teamIds.length === 0) return [];
      const [scheduled, booked] = await Promise.all([
        db()
          .selectDistinct({ id: schema.teamSchedules.facilityId })
          .from(schema.teamSchedules)
          .where(
            and(
              eq(schema.teamSchedules.organizationId, scope.organizationId),
              inArray(schema.teamSchedules.teamId, teamIds),
              isNotNull(schema.teamSchedules.facilityId),
            ),
          ),
        db()
          .selectDistinct({ id: schema.events.facilityId })
          .from(schema.events)
          .where(
            and(
              eq(schema.events.organizationId, scope.organizationId),
              inArray(schema.events.teamId, teamIds),
              isNotNull(schema.events.facilityId),
            ),
          ),
      ]);
      return [
        ...new Set(
          [...scheduled, ...booked].map((r) => r.id).filter((id): id is string => id !== null),
        ),
      ];
    },

    // --- Ámbito ---

    /**
     * Lo que ve una persona según sus perfiles (`PROFILE_SCOPE`): con uno de ámbito `club`, todo;
     * si no, la unión de sus secciones (y sus equipos), sus equipos (y sus secciones) y los
     * deportistas que ha atendido.
     */
    async scopeFor(
      scope: OrgScope,
      userId: string,
      roles: Iterable<MembershipRole>,
    ): Promise<AccessScope> {
      const kinds = scopeKindsOf(roles);
      if (kinds.size === 0 || kinds.has("club")) return { kind: "club" };
      const sectionIds = new Set<string>();
      const teamIds = new Set<string>();
      const playerIds = new Set<string>();
      if (kinds.has("sections")) {
        const own = (await sectionsByUser(scope, [userId])).get(userId) ?? [];
        for (const s of own) sectionIds.add(s.sectionId);
        for (const t of await teamIdsInSections(scope, [...sectionIds])) teamIds.add(t);
      }
      if (kinds.has("teams") || kinds.has("attended")) {
        const own = await memberships.ownTeamIds(scope, userId);
        for (const t of own) teamIds.add(t);
        for (const s of await sectionIdsOfTeams(scope, own)) sectionIds.add(s);
      }
      if (kinds.has("attended")) {
        for (const p of await attendedPlayerIds(scope, userId)) playerIds.add(p);
      }
      return {
        kind: "restricted",
        sectionIds: [...sectionIds],
        teamIds: [...teamIds],
        playerIds: [...playerIds],
      };
    },

    /** Si un deportista cae dentro de un ámbito: en uno de sus equipos esta temporada o en la lista. */
    async isPlayerVisible(
      scope: OrgScope,
      access: AccessScope,
      playerId: string,
    ): Promise<boolean> {
      if (access.kind === "club") return true;
      if (access.playerIds.includes(playerId)) return true;
      if (access.teamIds.length === 0) return false;
      const rows = await db()
        .select({ id: schema.teamPlayers.id })
        .from(schema.teamPlayers)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.playerId, playerId),
            inArray(schema.teamPlayers.teamId, access.teamIds),
            eq(schema.seasons.isCurrent, true),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
