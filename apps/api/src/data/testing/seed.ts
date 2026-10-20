import { createDb, schema } from "@sportsmanager/db";
import type { RoleCode } from "@sportsmanager/shared";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

/**
 * Datos de prueba para los tests de aislamiento. Vive en la capa de datos porque escribe
 * directamente en la base; los tests solo lo usan para preparar escenarios y después
 * hablan con la API por HTTP.
 */
export function createSeeder(connectionString: string) {
  const handle = createDb({ connectionString, maxConnections: 2 });
  const { db } = handle;

  return {
    async organization(input: {
      slug: string;
      name: string;
    }): Promise<{ id: string; slug: string }> {
      const sport = await db
        .select({ id: schema.sports.id })
        .from(schema.sports)
        .where(eq(schema.sports.code, "futsal"))
        .limit(1);
      const sportId = sport[0]?.id;
      if (!sportId) throw new Error("Falta la semilla de deportes.");
      const rows = await db
        .insert(schema.organizations)
        .values({
          slug: input.slug,
          name: input.name,
          defaultLocale: "es",
          defaultSportId: sportId,
          brandPrimaryColor: "#d71920",
          brandSecondaryColor: "#e8b52a",
        })
        .returning({ id: schema.organizations.id, slug: schema.organizations.slug });
      return rows[0]!;
    },

    async user(input: {
      name: string;
      email: string;
      password: string;
    }): Promise<{ id: string; email: string }> {
      const rows = await db
        .insert(schema.users)
        .values({ name: input.name, email: input.email.toLowerCase(), emailVerified: true })
        .returning({ id: schema.users.id, email: schema.users.email });
      const user = rows[0]!;
      await db.insert(schema.accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(input.password),
      });
      return user;
    },

    async membership(organizationId: string, userId: string, roleCode: RoleCode): Promise<void> {
      await db
        .insert(schema.memberships)
        .values({ organizationId, userId, roleCode })
        .onConflictDoNothing();
    },

    async platformAdmin(userId: string): Promise<void> {
      await db.insert(schema.platformAdmins).values({ userId, note: "test" }).onConflictDoNothing();
    },

    async supportGrant(organizationId: string, userId: string, minutes: number): Promise<void> {
      await db.insert(schema.supportAccessGrants).values({
        organizationId,
        userId,
        expiresAt: new Date(Date.now() + minutes * 60_000),
        reason: "test",
      });
    },

    async rolesOf(organizationId: string, userId: string): Promise<string[]> {
      const rows = await db
        .select({ roleCode: schema.memberships.roleCode })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, organizationId),
            eq(schema.memberships.userId, userId),
          ),
        );
      return rows.map((r) => r.roleCode).sort();
    },

    async close() {
      await handle.close();
    },
  };
}
