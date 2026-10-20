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
  /** Vista de soporte: estado y agregados del club, sin datos personales. */
  "org.support.read",
  /** Estructura del club (Fase 1): temporadas, secciones y equipos con su cuerpo técnico. */
  "org.structure.read",
  "org.structure.write",
  /** Jugadores con sus datos personales y sus familias. */
  "org.players.read",
  "org.players.write",
  /** Lo propio de una familia: sus jugadores y los equipos de estos. */
  "org.family.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permisos que otorga cada rol de club. */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  org_admin: [
    "org.settings.read",
    "org.settings.write",
    "org.members.read",
    "org.members.invite",
    "org.members.manage",
    "org.structure.read",
    "org.structure.write",
    "org.players.read",
    "org.players.write",
  ],
  coach: ["org.settings.read", "org.members.read", "org.structure.read", "org.players.read"],
  guardian: ["org.settings.read", "org.family.read"],
};

/**
 * Administrador de plataforma dentro de un club sin pertenencia (ADR 0017):
 * entra sin confirmación, pero solo ve estado y agregados. Nada personal.
 */
export const PLATFORM_SUPPORT_PERMISSIONS: readonly Permission[] = ["org.support.read"];

/** Con una autorización de soporte vigente concedida por el club: lectura completa, sin escritura. */
export const SUPPORT_GRANT_PERMISSIONS: readonly Permission[] = [
  "org.support.read",
  "org.settings.read",
  "org.members.read",
  "org.structure.read",
  "org.players.read",
];

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
