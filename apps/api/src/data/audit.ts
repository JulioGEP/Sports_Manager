import { schema, type Database } from "@sportsmanager/db";
import { AUDIT_ACTIONS, type AuditAction } from "@sportsmanager/shared";
import { desc, eq } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

export interface AuditInput {
  actorUserId: string | null;
  organizationId: string | null;
  action: AuditAction;
  target?: string | null;
  details?: unknown;
}

/** Movimiento del propio club (Bloque 13): sin club ni email, para el inicio del club. */
export interface ActivityRecord {
  id: string;
  action: AuditAction;
  actorName: string | null;
  target: string | null;
  createdAt: Date;
}

export interface AuditRecord {
  id: string;
  action: AuditAction;
  actorName: string | null;
  actorEmail: string | null;
  organizationSlug: string | null;
  organizationName: string | null;
  target: string | null;
  details: unknown;
  createdAt: Date;
}

/** Auditoría (Bloque 6): solo escribe y lista. Un fallo al registrar nunca rompe la operación. */
export function auditRepo(db: () => Database) {
  return {
    async record(input: AuditInput): Promise<void> {
      try {
        await db()
          .insert(schema.auditLog)
          .values({
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            action: input.action,
            target: input.target ?? null,
            details: input.details ?? null,
          });
      } catch (error) {
        console.error("[audit] no se pudo registrar", input.action, error);
      }
    },

    /** Últimos movimientos de un club, los más recientes primero. Solo lo suyo (ADR 0015). */
    async listForOrganization(scope: OrgScope, limit = 20): Promise<ActivityRecord[]> {
      const rows = await db()
        .select({
          id: schema.auditLog.id,
          action: schema.auditLog.action,
          actorName: schema.users.name,
          target: schema.auditLog.target,
          createdAt: schema.auditLog.createdAt,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
        .where(eq(schema.auditLog.organizationId, scope.organizationId))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(Math.min(Math.max(limit, 1), 100));
      return rows
        .filter((row) => (AUDIT_ACTIONS as readonly string[]).includes(row.action))
        .map((row) => ({ ...row, action: row.action as AuditAction }));
    },

    async listRecent(limit = 100): Promise<AuditRecord[]> {
      const rows = await db()
        .select({
          id: schema.auditLog.id,
          action: schema.auditLog.action,
          actorName: schema.users.name,
          actorEmail: schema.users.email,
          organizationSlug: schema.organizations.slug,
          organizationName: schema.organizations.name,
          target: schema.auditLog.target,
          details: schema.auditLog.details,
          createdAt: schema.auditLog.createdAt,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
        .leftJoin(schema.organizations, eq(schema.organizations.id, schema.auditLog.organizationId))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(Math.min(Math.max(limit, 1), 500));
      return rows
        .filter((row) => (AUDIT_ACTIONS as readonly string[]).includes(row.action))
        .map((row) => ({ ...row, action: row.action as AuditAction }));
    },
  };
}
