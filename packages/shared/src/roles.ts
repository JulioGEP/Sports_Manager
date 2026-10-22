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
  /** Estructura del club (Fase 1): temporadas, secciones, categorías y equipos con su cuerpo técnico. */
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
  /** Socios del club (Bloque 14): la lista con sus datos de contacto y su cuota. */
  "org.club_members.read",
  "org.club_members.write",
  /** Instalaciones: piscina, pistas, salas y sus franjas. */
  "org.facilities.read",
  "org.facilities.write",
  /** Agenda: entrenamientos, partidos, actividades y reservas. `write_own`: los equipos propios. */
  "org.events.read",
  "org.events.write",
  "org.events.write_own",
  /** Pase de lista: ver el resumen; `write_own`: pasar lista en los equipos propios. */
  "org.attendance.read",
  "org.attendance.write_own",
  /** Cuotas y cobros. */
  "org.fees.read",
  "org.fees.write",
  /** Ver el club como otra persona del club sin cambiar de cuenta (solo administración). */
  "org.view_as",
  /**
   * Partido en directo (Bloque 20): consultar partidos y estadísticas; registrarlos en cualquier
   * equipo (`write`) o solo en los propios (`write_own`); configurar el motor por sección.
   */
  "org.matches.read",
  "org.matches.write",
  "org.matches.write_own",
  "org.matches.configure",
  /**
   * Entrenamiento (bloques 21 a 26, ADR 0038): planificación, sesiones, biblioteca, disponibilidad
   * sin diagnóstico y recomendaciones (`read`); planificar en cualquier equipo del ámbito
   * (`write`) o en los propios (`write_own`, por bloques según el papel en el equipo); la
   * biblioteca del club y la metodología (`library`).
   */
  "org.training.read",
  "org.training.write",
  "org.training.write_own",
  "org.training.library",
  /** Carga y bienestar: verlos; registrar RPE, bienestar y tests en cualquier equipo o en los propios. */
  "org.load.read",
  "org.load.write",
  "org.load.write_own",
  /** Poner la disponibilidad y las restricciones de un deportista. */
  "org.availability.write",
  /** Salud: lesiones con diagnóstico, readaptación y consentimiento. Área aparte (decisión 2). */
  "org.health.read",
  "org.health.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Lo que la administración lee en todo el club. */
const CLUB_READ: readonly Permission[] = [
  "org.settings.read",
  "org.members.read",
  "org.structure.read",
  "org.players.read",
  "org.activity.read",
  "org.challenges.read",
  "org.club_members.read",
  "org.facilities.read",
  "org.events.read",
  "org.attendance.read",
  "org.matches.read",
  "org.training.read",
  "org.load.read",
];

/**
 * Lo que el cuerpo técnico y el personal leen por defecto (Bloque 19, ADR 0033): lo deportivo.
 * Ni los socios, ni el personal del club, ni los últimos movimientos: eso lo incluye la
 * administración por rol desde "Personal" si quiere (`access.ts`). Además, lo que leen va
 * acotado a su ámbito: los equipos propios, las secciones propias o los deportistas atendidos.
 */
const STAFF_READ: readonly Permission[] = [
  "org.settings.read",
  "org.structure.read",
  "org.players.read",
  "org.challenges.read",
  "org.facilities.read",
  "org.events.read",
  "org.attendance.read",
  "org.matches.read",
  "org.training.read",
];

/** Permisos que otorga cada rol de club. */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  org_admin: [
    ...CLUB_READ,
    "org.settings.write",
    "org.members.invite",
    "org.members.manage",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
    "org.club_members.write",
    "org.facilities.write",
    "org.events.write",
    "org.fees.read",
    "org.fees.write",
    "org.view_as",
    "org.matches.write",
    "org.matches.configure",
    "org.training.write",
    "org.training.library",
    "org.load.write",
    // Un club sin fisioterapia también tiene que poder decir quién no está disponible.
    "org.availability.write",
    // Salud no: la administración no la ve por defecto (ADR 0038); se le abre por excepción.
  ],
  staff: [...STAFF_READ],
  coach: [
    ...STAFF_READ,
    "org.roster.write_own",
    "org.players.assess_own",
    "org.challenges.manage",
    "org.challenges.review_own",
    "org.events.write_own",
    "org.attendance.write_own",
    "org.matches.write_own",
    "org.training.write_own",
    "org.load.read",
    "org.load.write_own",
  ],
  guardian: ["org.settings.read", "org.family.read", "org.family.write"],
};

/**
 * Permisos que añade cada cargo del personal (ADR 0030 y 0032). Dirección y coordinación
 * gestionan la estructura, los jugadores, la agenda y el reto de sus secciones, e invitan;
 * dirección además lleva las instalaciones. Ni socios ni cuotas ni personal: eso es de la
 * administración, que puede incluirlo por rol. El resto valora a cualquier jugador en lo suyo;
 * la delegación pasa lista en sus equipos.
 */
export const STAFF_POSITION_PERMISSIONS: Record<StaffPosition, readonly Permission[]> = {
  director: [
    "org.members.invite",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
    "org.facilities.write",
    "org.events.write",
    "org.matches.write",
    "org.matches.configure",
    "org.training.write",
    "org.training.library",
    "org.load.read",
    "org.load.write",
  ],
  coordinator: [
    "org.members.invite",
    "org.structure.write",
    "org.players.write",
    "org.players.assess",
    "org.challenges.manage",
    "org.challenges.review",
    "org.events.write",
    "org.matches.write",
    "org.matches.configure",
    "org.training.write",
    "org.training.library",
    "org.load.read",
    "org.load.write",
  ],
  delegate: ["org.events.write_own", "org.attendance.write_own", "org.matches.write_own"],
  physio: [
    "org.players.assess",
    "org.training.write_own",
    "org.load.read",
    "org.availability.write",
    "org.health.read",
    "org.health.write",
  ],
  fitness: [
    "org.players.assess",
    "org.training.write_own",
    "org.load.read",
    "org.load.write",
    "org.availability.write",
    "org.health.read",
  ],
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
  "org.club_members.read",
  "org.facilities.read",
  "org.events.read",
  "org.fees.read",
  "org.matches.read",
  "org.training.read",
  "org.load.read",
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

/**
 * "Ver como" (Bloque 14): la administración mira el club con los ojos de otra persona del club.
 * La web manda el usuario elegido en esta cabecera; la API solo la acepta con `org.view_as` y
 * resuelve los permisos del otro. Los cambios quedan auditados con quien de verdad los hizo.
 */
export const VIEW_AS_HEADER = "x-sm-view-as";
