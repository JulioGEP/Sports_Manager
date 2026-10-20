import { schema, type Database } from "@sportsmanager/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { ApiConfig } from "../config.ts";
import type { OrgScope } from "./scope.ts";

export function platformRepo(db: () => Database, config: ApiConfig) {
  return {
    /**
     * Administrador de plataforma: por email en `PLATFORM_ADMIN_EMAILS` (ADR 0023) o por fila en
     * `platform_admins` (ADR 0008). Ningún endpoint escribe en esa tabla.
     */
    async isPlatformAdmin(user: { id: string; email: string }): Promise<boolean> {
      if (config.platformAdminEmails.includes(user.email.toLowerCase())) return true;
      const rows = await db()
        .select({ userId: schema.platformAdmins.userId })
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.userId, user.id))
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
