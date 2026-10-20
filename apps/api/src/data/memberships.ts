import { schema, type Database } from "@sportsmanager/db";
import { isLocale, ROLE_CODES, type RoleCode } from "@sportsmanager/shared";
import { and, asc, eq } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

export interface Member {
  userId: string;
  name: string;
  email: string;
  roles: RoleCode[];
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
  >;
  roles: RoleCode[];
}

export type AssignRoleResult =
  { outcome: "assigned" | "already_assigned"; roles: RoleCode[] } | { outcome: "not_member" };
export type RemoveRoleResult =
  { outcome: "removed"; roles: RoleCode[] } | { outcome: "not_found" } | { outcome: "last_admin" };

function asRole(code: string): RoleCode | null {
  return (ROLE_CODES as readonly string[]).includes(code) ? (code as RoleCode) : null;
}

export function membershipsRepo(db: () => Database) {
  const activeRolesOf = async (scope: OrgScope, userId: string): Promise<RoleCode[]> => {
    const rows = await db()
      .select({ roleCode: schema.memberships.roleCode })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, scope.organizationId),
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.status, "active"),
        ),
      );
    return rows.map((r) => asRole(r.roleCode)).filter((r): r is RoleCode => r !== null);
  };

  return {
    /** Roles activos del usuario en el club del ámbito. Vacío = sin pertenencia. */
    rolesFor: activeRolesOf,

    /** Miembros del club con sus datos personales: exige `org.members.read` en quien llama. */
    async listMembers(scope: OrgScope): Promise<Member[]> {
      const rows = await db()
        .select({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          roleCode: schema.memberships.roleCode,
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
          memberSince: row.createdAt,
        };
        if (role) member.roles.push(role);
        if (row.createdAt < member.memberSince) member.memberSince = row.createdAt;
        byUser.set(row.userId, member);
      }
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

    /** Añade un rol a alguien que ya es miembro del club. El alta de nuevos miembros es por invitación. */
    async assignRole(
      scope: OrgScope,
      userId: string,
      roleCode: RoleCode,
    ): Promise<AssignRoleResult> {
      const current = await activeRolesOf(scope, userId);
      if (current.length === 0) return { outcome: "not_member" };
      if (current.includes(roleCode)) return { outcome: "already_assigned", roles: current };
      await db()
        .insert(schema.memberships)
        .values({ organizationId: scope.organizationId, userId, roleCode })
        .onConflictDoNothing();
      return { outcome: "assigned", roles: await activeRolesOf(scope, userId) };
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
}

export function userLocale(value: string | null | undefined) {
  return isLocale(value) ? value : null;
}
