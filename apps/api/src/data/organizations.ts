import { schema, type Database } from "@sportsmanager/db";
import type { ORGANIZATION_STATUSES } from "@sportsmanager/shared";
import {
  ROLE_CODES,
  type LocalizedText,
  type OrganizationCreate,
  type OrganizationStatus as SharedOrganizationStatus,
  type OrganizationUpdate,
  type PaymentProvider,
  type RoleCode,
  type StripeAccountStatus,
} from "@sportsmanager/shared";
import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
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
  teams: number;
  players: number;
}

export interface OrganizationCounts {
  members: number;
  pendingInvitations: number;
}

export type CreateOrganizationResult =
  | { outcome: "created"; organization: OrganizationRow; scope: OrgScope }
  | { outcome: "slug_taken" }
  | { outcome: "unknown_sport" };

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

    /** Alta de un club desde el admin interno (Bloque 6). El slug ya viene validado por el esquema. */
    async create(input: OrganizationCreate): Promise<CreateOrganizationResult> {
      const sport = await db()
        .select({ id: schema.sports.id })
        .from(schema.sports)
        .where(eq(schema.sports.code, input.defaultSportCode))
        .limit(1);
      const sportId = sport[0]?.id;
      if (!sportId) return { outcome: "unknown_sport" };
      try {
        const rows = await db()
          .insert(schema.organizations)
          .values({
            slug: input.slug,
            name: input.name,
            defaultLocale: input.defaultLocale,
            defaultSportId: sportId,
            brandPrimaryColor: input.brandPrimaryColor,
            brandSecondaryColor: input.brandSecondaryColor,
          })
          .returning();
        const organization = rows[0]!;
        return { outcome: "created", organization, scope: mintOrgScope(organization.id) };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "slug_taken" };
        throw error;
      }
    },

    /** Todos los clubes con sus recuentos, para el admin interno. Sin datos personales. */
    async listAll(): Promise<
      { organization: OrganizationRow; sport: OrganizationSport; counts: OrganizationCounts }[]
    > {
      const rows = await db()
        .select({
          organization: schema.organizations,
          sport: { code: schema.sports.code, name: schema.sports.name },
        })
        .from(schema.organizations)
        .innerJoin(schema.sports, eq(schema.sports.id, schema.organizations.defaultSportId))
        .orderBy(schema.organizations.name);
      const members = await db()
        .select({
          organizationId: schema.memberships.organizationId,
          total: countDistinct(schema.memberships.userId),
        })
        .from(schema.memberships)
        .where(eq(schema.memberships.status, "active"))
        .groupBy(schema.memberships.organizationId);
      const pending = await db()
        .select({ organizationId: schema.invitations.organizationId, total: count() })
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.status, "pending"),
            sql`${schema.invitations.expiresAt} > now()`,
          ),
        )
        .groupBy(schema.invitations.organizationId);
      const membersBy = new Map(members.map((m) => [m.organizationId, m.total]));
      const pendingBy = new Map(pending.map((p) => [p.organizationId, p.total]));
      return rows.map((row) => ({
        organization: row.organization,
        sport: { code: row.sport.code, name: row.sport.name },
        counts: {
          members: membersBy.get(row.organization.id) ?? 0,
          pendingInvitations: pendingBy.get(row.organization.id) ?? 0,
        },
      }));
    },

    async countsFor(scope: OrgScope): Promise<OrganizationCounts> {
      const members = await db()
        .select({ total: countDistinct(schema.memberships.userId) })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
          ),
        );
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
      return { members: members[0]?.total ?? 0, pendingInvitations: pending[0]?.total ?? 0 };
    },

    /** Ajustes y marca del club del ámbito (Bloque 5). Devuelve la fila actualizada. */
    async update(
      scope: OrgScope,
      patch: OrganizationUpdate & {
        status?: SharedOrganizationStatus | undefined;
        /** Cobros (Bloque 18): proveedor y cuenta conectada de Stripe. */
        paymentsProvider?: PaymentProvider | undefined;
        stripeAccountId?: string | null | undefined;
        /** Lo que Stripe dice de la cuenta conectada (ADR 0042). */
        stripeAccountStatus?: StripeAccountStatus | null | undefined;
      },
    ): Promise<OrganizationRow> {
      const values: Partial<typeof schema.organizations.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.timezone !== undefined) values.timezone = patch.timezone;
      if (patch.paymentsProvider !== undefined) values.paymentsProvider = patch.paymentsProvider;
      if (patch.stripeAccountId !== undefined) values.stripeAccountId = patch.stripeAccountId;
      if (patch.stripeAccountStatus !== undefined)
        values.stripeAccountStatus = patch.stripeAccountStatus;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.defaultLocale !== undefined) values.defaultLocale = patch.defaultLocale;
      if (patch.brandPrimaryColor !== undefined) values.brandPrimaryColor = patch.brandPrimaryColor;
      if (patch.brandSecondaryColor !== undefined)
        values.brandSecondaryColor = patch.brandSecondaryColor;
      if (patch.voice !== undefined) values.voice = patch.voice;
      if (Object.keys(values).length === 0) {
        const rows = await db()
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, scope.organizationId))
          .limit(1);
        return rows[0]!;
      }
      const rows = await db()
        .update(schema.organizations)
        .set(values)
        .where(eq(schema.organizations.id, scope.organizationId))
        .returning();
      return rows[0]!;
    },

    /** El club de un ámbito ya resuelto: para el webhook, que llega sin host de club. */
    async byScope(scope: OrgScope): Promise<OrganizationRow | null> {
      const rows = await db()
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, scope.organizationId))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * El club de una cuenta conectada de Stripe (webhook `account.updated`, ADR 0042). La cuenta
     * la crea la plataforma para un solo club, así que la búsqueda es única.
     */
    async findByStripeAccount(accountId: string): Promise<ResolvedOrganization | null> {
      const rows = await db()
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.stripeAccountId, accountId))
        .limit(2);
      if (rows.length !== 1) return null;
      const organization = rows[0]!;
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
      const teams = await db()
        .select({ total: count() })
        .from(schema.teams)
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teams.organizationId, scope.organizationId),
            eq(schema.teams.status, "active"),
            eq(schema.seasons.isCurrent, true),
          ),
        );
      const players = await db()
        .select({ total: count() })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.status, "active"),
          ),
        );
      return {
        membersByRole,
        pendingInvitations: pending[0]?.total ?? 0,
        teams: teams[0]?.total ?? 0,
        players: players[0]?.total ?? 0,
      };
    },
  };
}
