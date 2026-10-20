import { schema, type Database } from "@sportsmanager/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

export function platformRepo(db: () => Database) {
  return {
    /** Solo lectura: la tabla se alimenta por migración de datos o script de operaciones (ADR 0008). */
    async isPlatformAdmin(userId: string): Promise<boolean> {
      const rows = await db()
        .select({ userId: schema.platformAdmins.userId })
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.userId, userId))
        .limit(1);
      return rows.length > 0;
    },

    /** Autorización de soporte vigente (ADR 0017): concedida por el club, no caducada ni revocada. */
    async hasActiveSupportGrant(scope: OrgScope, userId: string): Promise<boolean> {
      const rows = await db()
        .select({ id: schema.supportAccessGrants.id })
        .from(schema.supportAccessGrants)
        .where(
          and(
            eq(schema.supportAccessGrants.organizationId, scope.organizationId),
            eq(schema.supportAccessGrants.userId, userId),
            isNull(schema.supportAccessGrants.revokedAt),
            sql`${schema.supportAccessGrants.expiresAt} > now()`,
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
