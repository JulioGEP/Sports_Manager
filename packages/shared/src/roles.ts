import { z } from "zod";

/**
 * Roles de organización (ADR 0008 y 0014). Son filas de la tabla `roles`; añadir uno es
 * insertar una fila y una entrada en ROLE_PERMISSIONS. Un test compara ambas listas.
 * `platform_admin` no es un rol: es la tabla `platform_admins`.
 */
export const ROLE_CODES = ["org_admin", "coach", "guardian"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const RoleCodeSchema = z.enum(ROLE_CODES);

export const ROLE_SCOPES = ["organization"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

/** Permisos que la API comprueba. Nunca se comprueban nombres de rol. */
export const PERMISSIONS = [
  "org.settings.read",
  "org.settings.write",
  "org.members.read",
  "org.members.invite",
  "org.members.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  org_admin: [...PERMISSIONS],
  coach: ["org.settings.read", "org.members.read"],
  guardian: ["org.settings.read"],
};

/** Una persona puede tener varios roles en el mismo club (ADR 0014): los permisos son la unión. */
export function permissionsForRoles(roles: Iterable<RoleCode>): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

export function hasPermission(roles: Iterable<RoleCode>, permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

export const MEMBERSHIP_STATUSES = ["active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
