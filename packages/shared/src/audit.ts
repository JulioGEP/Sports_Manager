/**
 * Acciones que quedan en `audit_log` (Bloque 6): quién hizo qué, sobre qué club y a quién.
 * Añadir una acción es añadirla aquí; la base la acepta como texto.
 */
export const AUDIT_ACTIONS = [
  "organization.created",
  "organization.updated",
  "organization.logo_updated",
  "organization.logo_removed",
  "invitation.created",
  "invitation.resent",
  "invitation.revoked",
  "invitation.accepted",
  "membership.role_assigned",
  "membership.role_removed",
  "platform.admin_created",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
