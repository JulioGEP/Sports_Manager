import { schema, type Database } from "@sportsmanager/db";
import {
  isLocale,
  ROLE_CODES,
  STAFF_POSITIONS,
  type MembershipRole,
  type RoleCode,
  type StaffPosition,
} from "@sportsmanager/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

export interface Member {
  userId: string;
  name: string;
  email: string;
  roles: RoleCode[];
  /** Cargo del personal (Bloque 13), si tiene el rol `staff`. */
  position: StaffPosition | null;
  /** Equipos de la temporada actual en los que está como cuerpo técnico. */
  teams: { teamId: string; teamName: string }[];
  memberSince: Date;
}

export interface UserMembership {
  organization: Pick<
    typeof schema.organizations.$inferSelect,
    | "id"
    | "slug"
    | "name"
    | "status"
    | "defaultLocale"
    | "brandPrimaryColor"
    | "brandSecondaryColor"
    | "logoBlobKey"
  >;
  roles: RoleCode[];
}

export type AssignRoleResult =
  | { outcome: "assigned" | "already_assigned"; roles: RoleCode[]; position: StaffPosition | null }
  | { outcome: "not_member" };
export type RemoveRoleResult =
  { outcome: "removed"; roles: RoleCode[] } | { outcome: "not_found" } | { outcome: "last_admin" };

function asRole(code: string): RoleCode | null {
  return (ROLE_CODES as readonly string[]).includes(code) ? (code as RoleCode) : null;
}

function asPosition(value: string | null): StaffPosition | null {
  return value && (STAFF_POSITIONS as readonly string[]).includes(value)
    ? (value as StaffPosition)
    : null;
}

export function membershipsRepo(db: () => Database) {
  const activeMembershipsOf = async (
    scope: OrgScope,
    userId: string,
  ): Promise<MembershipRole[]> => {
    const rows = await db()
      .select({ roleCode: schema.memberships.roleCode, position: schema.memberships.position })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, scope.organizationId),
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.status, "active"),
        ),
      );
    return rows
      .map((r) => ({ roleCode: asRole(r.roleCode), position: asPosition(r.position) }))
      .filter((r): r is MembershipRole => r.roleCode !== null);
  };
  const activeRolesOf = async (scope: OrgScope, userId: string): Promise<RoleCode[]> =>
    (await activeMembershipsOf(scope, userId)).map((m) => m.roleCode);
  const positionOf = async (scope: OrgScope, userId: string): Promise<StaffPosition | null> =>
    (await activeMembershipsOf(scope, userId)).find((m) => m.roleCode === "staff")?.position ??
    null;

  /** Cuerpo técnico en la temporada actual, por usuario. */
  async function currentTeamsByUser(
    scope: OrgScope,
    userIds: string[],
  ): Promise<Map<string, { teamId: string; teamName: string }[]>> {
    const map = new Map<string, { teamId: string; teamName: string }[]>();
    if (userIds.length === 0) return map;
    const rows = await db()
      .select({
        userId: schema.teamStaff.userId,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
      })
      .from(schema.teamStaff)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamStaff.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamStaff.organizationId, scope.organizationId),
          inArray(schema.teamStaff.userId, userIds),
          eq(schema.seasons.isCurrent, true),
          eq(schema.teams.status, "active"),
        ),
      )
      .orderBy(asc(schema.teams.name));
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push({ teamId: row.teamId, teamName: row.teamName });
      map.set(row.userId, list);
    }
    return map;
  }

  return {
    /** Roles activos del usuario en el club del ámbito. Vacío = sin pertenencia. */
    rolesFor: activeRolesOf,

    /** Roles activos con su cargo (Bloque 13): de aquí salen los permisos del actor. */
    membershipsFor: activeMembershipsOf,

    /** Equipos de la temporada actual que lleva una persona como cuerpo técnico: su ámbito "propio". */
    async ownTeamIds(scope: OrgScope, userId: string): Promise<string[]> {
      const map = await currentTeamsByUser(scope, [userId]);
      return (map.get(userId) ?? []).map((t) => t.teamId);
    },

    /** Miembros del club con sus datos personales: exige `org.members.read` en quien llama. */
    async listMembers(scope: OrgScope): Promise<Member[]> {
      const rows = await db()
        .select({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          roleCode: schema.memberships.roleCode,
          position: schema.memberships.position,
          createdAt: schema.memberships.createdAt,
        })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
          ),
        )
        .orderBy(asc(schema.users.name), asc(schema.memberships.createdAt));
      const byUser = new Map<string, Member>();
      for (const row of rows) {
        const role = asRole(row.roleCode);
        const member = byUser.get(row.userId) ?? {
          userId: row.userId,
          name: row.name,
          email: row.email,
          roles: [],
          position: null,
          teams: [],
          memberSince: row.createdAt,
        };
        if (role) member.roles.push(role);
        if (role === "staff") member.position = asPosition(row.position);
        if (row.createdAt < member.memberSince) member.memberSince = row.createdAt;
        byUser.set(row.userId, member);
      }
      const teams = await currentTeamsByUser(scope, [...byUser.keys()]);
      for (const member of byUser.values()) member.teams = teams.get(member.userId) ?? [];
      return [...byUser.values()];
    },

    /**
     * Clubes del propio usuario, con sus roles. Única consulta sin ámbito de club por diseño:
     * el filtro es el usuario de la sesión y solo devuelve lo suyo (alimenta el selector de club).
     */
    async listForUser(userId: string): Promise<UserMembership[]> {
      const rows = await db()
        .select({
          id: schema.organizations.id,
          slug: schema.organizations.slug,
          name: schema.organizations.name,
          status: schema.organizations.status,
          defaultLocale: schema.organizations.defaultLocale,
          brandPrimaryColor: schema.organizations.brandPrimaryColor,
          brandSecondaryColor: schema.organizations.brandSecondaryColor,
          logoBlobKey: schema.organizations.logoBlobKey,
          roleCode: schema.memberships.roleCode,
        })
        .from(schema.memberships)
        .innerJoin(
          schema.organizations,
          eq(schema.organizations.id, schema.memberships.organizationId),
        )
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")))
        .orderBy(asc(schema.organizations.name));
      const byOrg = new Map<string, UserMembership>();
      for (const row of rows) {
        const { roleCode, ...organization } = row;
        const entry = byOrg.get(organization.id) ?? { organization, roles: [] };
        const role = asRole(roleCode);
        if (role) entry.roles.push(role);
        byOrg.set(organization.id, entry);
      }
      return [...byOrg.values()];
    },

    /**
     * Alta en el club con un rol, al aceptar una invitación (ADR 0019). Si ya era miembro,
     * solo añade el rol. Con el rol `staff`, fija el cargo. Devuelve los roles resultantes.
     */
    async join(
      scope: OrgScope,
      userId: string,
      roleCode: RoleCode,
      position: StaffPosition | null = null,
    ): Promise<RoleCode[]> {
      await db()
        .insert(schema.memberships)
        .values({
          organizationId: scope.organizationId,
          userId,
          roleCode,
          position: roleCode === "staff" ? position : null,
        })
        .onConflictDoNothing();
      if (roleCode === "staff" && position) await setPosition(scope, userId, position);
      return activeRolesOf(scope, userId);
    },

    /**
     * Añade un rol a alguien que ya es miembro del club. El alta de nuevos miembros es por
     * invitación. Con el rol `staff` y un cargo, lo fija aunque el rol ya existiera.
     */
    async assignRole(
      scope: OrgScope,
      userId: string,
      roleCode: RoleCode,
      position: StaffPosition | null = null,
    ): Promise<AssignRoleResult> {
      const current = await activeRolesOf(scope, userId);
      if (current.length === 0) return { outcome: "not_member" };
      if (current.includes(roleCode)) {
        if (roleCode === "staff" && position) await setPosition(scope, userId, position);
        return {
          outcome: "already_assigned",
          roles: current,
          position: await positionOf(scope, userId),
        };
      }
      await db()
        .insert(schema.memberships)
        .values({
          organizationId: scope.organizationId,
          userId,
          roleCode,
          position: roleCode === "staff" ? position : null,
        })
        .onConflictDoNothing();
      return {
        outcome: "assigned",
        roles: await activeRolesOf(scope, userId),
        position: await positionOf(scope, userId),
      };
    },

    /** Quita un rol. Nunca deja un club sin `org_admin`. */
    async removeRole(
      scope: OrgScope,
      userId: string,
      roleCode: RoleCode,
    ): Promise<RemoveRoleResult> {
      const current = await activeRolesOf(scope, userId);
      if (!current.includes(roleCode)) return { outcome: "not_found" };
      if (roleCode === "org_admin") {
        const admins = await db()
          .select({ userId: schema.memberships.userId })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.organizationId, scope.organizationId),
              eq(schema.memberships.roleCode, "org_admin"),
              eq(schema.memberships.status, "active"),
            ),
          );
        if (admins.length <= 1) return { outcome: "last_admin" };
      }
      await db()
        .delete(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.roleCode, roleCode),
          ),
        );
      return { outcome: "removed", roles: await activeRolesOf(scope, userId) };
    },
  };

  async function setPosition(scope: OrgScope, userId: string, position: StaffPosition) {
    await db()
      .update(schema.memberships)
      .set({ position })
      .where(
        and(
          eq(schema.memberships.organizationId, scope.organizationId),
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.roleCode, "staff"),
        ),
      );
  }
}

export function userLocale(value: string | null | undefined) {
  return isLocale(value) ? value : null;
}
