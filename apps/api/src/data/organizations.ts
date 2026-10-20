import { schema, type Database } from "@sportsmanager/db";
import type { ORGANIZATION_STATUSES } from "@sportsmanager/shared";
import { ROLE_CODES, type LocalizedText, type RoleCode } from "@sportsmanager/shared";
import { and, count, eq, sql } from "drizzle-orm";
import { mintOrgScope, type OrgScope } from "./scope.ts";

export type OrganizationRow = typeof schema.organizations.$inferSelect;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export interface ResolvedOrganization {
  organization: OrganizationRow;
  scope: OrgScope;
}

export interface OrganizationSport {
  code: string;
  name: LocalizedText;
}

export interface SupportCounts {
  membersByRole: Record<RoleCode, number>;
  pendingInvitations: number;
}

export function organizationsRepo(db: () => Database) {
  return {
    /** Único punto de entrada al ámbito de un club: por su slug, resuelto desde el subdominio. */
    async findBySlug(slug: string): Promise<ResolvedOrganization | null> {
      const rows = await db()
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.slug, slug))
        .limit(1);
      const organization = rows[0];
      if (!organization) return null;
      return { organization, scope: mintOrgScope(organization.id) };
    },

    async getSport(scope: OrgScope): Promise<OrganizationSport> {
      const rows = await db()
        .select({ code: schema.sports.code, name: schema.sports.name })
        .from(schema.organizations)
        .innerJoin(schema.sports, eq(schema.sports.id, schema.organizations.defaultSportId))
        .where(eq(schema.organizations.id, scope.organizationId))
        .limit(1);
      const sport = rows[0];
      if (!sport) throw new Error("La organización no tiene deporte por defecto.");
      return sport;
    },

    /** Agregados para la vista de soporte (ADR 0017). Nunca datos personales. */
    async supportCounts(scope: OrgScope): Promise<SupportCounts> {
      const byRole = await db()
        .select({ roleCode: schema.memberships.roleCode, total: count() })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
          ),
        )
        .groupBy(schema.memberships.roleCode);
      const membersByRole = Object.fromEntries(ROLE_CODES.map((code) => [code, 0])) as Record<
        RoleCode,
        number
      >;
      for (const row of byRole) {
        if ((ROLE_CODES as readonly string[]).includes(row.roleCode))
          membersByRole[row.roleCode as RoleCode] = row.total;
      }
      const pending = await db()
        .select({ total: count() })
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.status, "pending"),
            sql`${schema.invitations.expiresAt} > now()`,
          ),
        );
      return { membersByRole, pendingInvitations: pending[0]?.total ?? 0 };
    },
  };
}
