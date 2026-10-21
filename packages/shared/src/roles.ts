import { z } from "zod";

/**
 * Roles de organización (ADR 0008 y 0014). Son filas de la tabla `roles`; añadir uno es
 * insertar una fila y una entrada en ROLE_PERMISSIONS. Un test compara ambas listas.
 * `platform_admin` no es un rol: es la tabla `platform_admins`.
 *
 * `staff` (Bloque 13, ADR 0030) es el personal del club que no entrena: lleva un cargo
 * descriptivo (`STAFF_POSITIONS`) que añade permisos sobre los del rol.
 */
export const ROLE_CODES = ["org_admin", "staff", "coach", "guardian"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const RoleCodeSchema = z.enum(ROLE_CODES);

export const ROLE_SCOPES = ["organization"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

/** Cargos del personal del club, los del prototipo (docs/dominio.md 3). Solo con el rol `staff`. */
export const STAFF_POSITIONS = [
  "director",
  "coordinator",
  "delegate",
  "physio",
  "fitness",
  "psychologist",
  "scout",
] as const;
export type StaffPosition = (typeof STAFF_POSITIONS)[number];
export const StaffPositionSchema = z.enum(STAFF_POSITIONS);

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
  /** Plantilla de los equipos propios (cuerpo técnico): meter, editar y sacar jugadores. */
  "org.roster.write_own",
  /** Jugadores con sus datos personales y sus familias. */
  "org.players.read",
  "org.players.write",
  /** Valorar: indicadores, objetivo, plan de desarrollo y anotaciones de cualquier jugador. */
  "org.players.assess",
  /** Lo mismo, solo sobre los jugadores de los equipos propios. */
  "org.players.assess_own",
  /** Lo propio de una familia: sus jugadores y los equipos de estos. */
  "org.family.read",
  /** Lo que una familia cambia de los suyos: la foto y los registros del reto. */
  "org.family.write",
  /** Últimos movimientos del club (auditoría del propio club). */
  "org.activity.read",
  /** Retos por puntos (Bloque 13): consultar, gestionar el catálogo y validar registros. */
  "org.challenges.read",
  "org.challenges.manage",
  "org.challenges.review",
  "org.challenges.review_own",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Lo que todo el personal del club puede ver, sea cual sea su cargo. */
const STAFF_READ: readonly Permission[] = [
  "org.settings.read",
  "org.members.read",
  "org.structure.read",
  "org.players.read",
  "org.activity.read",
  "org.challenges.read",
];

/** Permisos que otorga cada rol de club. */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  org_admin: [
    ...STAFF_READ,
    "org.settings.write",
    "org.members.invite",
    "org.members.manage",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
  ],
  staff: [...STAFF_READ],
  coach: [
    ...STAFF_READ,
    "org.roster.write_own",
    "org.players.assess_own",
    "org.challenges.manage",
    "org.challenges.review_own",
  ],
  guardian: ["org.settings.read", "org.family.read", "org.family.write"],
};

/**
 * Permisos que añade cada cargo del personal (ADR 0030). Dirección y coordinación gestionan
 * la estructura, los jugadores y el reto como la administración, sin tocar miembros ni ajustes;
 * el resto valora a cualquier jugador en lo suyo; la delegación solo consulta.
 */
export const STAFF_POSITION_PERMISSIONS: Record<StaffPosition, readonly Permission[]> = {
  director: [
    "org.members.invite",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
  ],
  coordinator: [
    "org.members.invite",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
  ],
  delegate: [],
  physio: ["org.players.assess"],
  fitness: ["org.players.assess"],
  psychologist: ["org.players.assess"],
  scout: ["org.players.assess"],
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
  "org.challenges.read",
];

/** Una pertenencia: el rol y, si es `staff`, su cargo. */
export interface MembershipRole {
  roleCode: RoleCode;
  position: StaffPosition | null;
}

/** Una persona puede tener varios roles en el mismo club (ADR 0014): los permisos son la unión. */
export function permissionsForRoles(roles: Iterable<RoleCode>): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

/** Permisos de una persona en un club: la unión de sus roles más lo que añade su cargo. */
export function permissionsForMemberships(memberships: Iterable<MembershipRole>): Set<Permission> {
  const result = new Set<Permission>();
  for (const { roleCode, position } of memberships) {
    for (const permission of ROLE_PERMISSIONS[roleCode]) result.add(permission);
    if (roleCode === "staff" && position) {
      for (const permission of STAFF_POSITION_PERMISSIONS[position]) result.add(permission);
    }
  }
  return result;
}

export function hasPermission(roles: Iterable<RoleCode>, permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

export const MEMBERSHIP_STATUSES = ["active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
