import { z } from "zod";
import {
  permissionsForMemberships,
  ROLE_CODES,
  STAFF_POSITIONS,
  type MembershipRole,
  type Permission,
  type RoleCode,
  type StaffPosition,
} from "./roles.ts";

/**
 * Alcance y visibilidad por rol (Bloque 19, ADR 0033). Dos piezas que se suman a los permisos:
 *
 * - El ámbito de cada perfil (`PROFILE_SCOPE`): qué parte del club ve. El cuerpo técnico, sus
 *   equipos; dirección y coordinación, sus secciones; fisioterapia, los deportistas que ha
 *   atendido. Va en código: es lo que significa cada cargo.
 * - Las áreas visibles (`ACCESS_AREAS`): lo que la administración incluye o excluye por perfil
 *   desde "Personal", y las exclusiones a personas concretas. Van en la tabla `access_rules`
 *   y se aplican sobre los permisos por defecto del rol y del cargo.
 */

/** Perfil de acceso: el rol o, para el personal, su cargo. Los códigos no chocan entre sí. */
export const ACCESS_PROFILES = [...ROLE_CODES, ...STAFF_POSITIONS] as const;
export type AccessProfile = (typeof ACCESS_PROFILES)[number];
export const AccessProfileSchema = z.enum(ACCESS_PROFILES);

/** Perfiles que la administración puede ajustar: el cuerpo técnico y cada cargo del personal. */
export const CONFIGURABLE_PROFILES = ["coach", ...STAFF_POSITIONS] as const;
export type ConfigurableProfile = (typeof CONFIGURABLE_PROFILES)[number];
export const ConfigurableProfileSchema = z.enum(CONFIGURABLE_PROFILES);

/** El perfil de una pertenencia: el cargo manda sobre el rol `staff`. */
export function profileOf(membership: MembershipRole): AccessProfile {
  return membership.roleCode === "staff" && membership.position
    ? membership.position
    : membership.roleCode;
}

/** La pertenencia que representa un perfil, para calcular sus permisos por defecto. */
export function membershipOfProfile(profile: AccessProfile): MembershipRole {
  return (ROLE_CODES as readonly string[]).includes(profile)
    ? { roleCode: profile as RoleCode, position: null }
    : { roleCode: "staff", position: profile as StaffPosition };
}

/**
 * Ámbito de un perfil: `club` entero; `teams`, los equipos de los que es cuerpo técnico esta
 * temporada; `sections`, las secciones que coordina o que la administración le ha asignado;
 * `attended`, los deportistas que la administración o su cuerpo técnico le han asignado, los de
 * sus equipos y aquellos sobre los que ha dejado una valoración o una anotación.
 */
export const ACCESS_SCOPE_KINDS = ["club", "sections", "teams", "attended"] as const;
export type AccessScopeKind = (typeof ACCESS_SCOPE_KINDS)[number];

export const PROFILE_SCOPE: Record<AccessProfile, AccessScopeKind> = {
  org_admin: "club",
  staff: "club",
  guardian: "club",
  coach: "teams",
  director: "sections",
  coordinator: "sections",
  delegate: "club",
  physio: "attended",
  fitness: "club",
  psychologist: "club",
  scout: "club",
};

/** Ámbitos que se suman en una persona con varios roles. Con `club` entre ellos, ve todo. */
export function scopeKindsOf(memberships: Iterable<MembershipRole>): Set<AccessScopeKind> {
  const kinds = new Set<AccessScopeKind>();
  for (const m of memberships) kinds.add(PROFILE_SCOPE[profileOf(m)]);
  return kinds;
}

/**
 * Lo que una persona ve del club, ya resuelto por la API. `restricted` lleva las secciones, los
 * equipos y los deportistas sueltos (atendidos) a los que llega; un deportista es visible si
 * está en uno de esos equipos esta temporada o en la lista.
 */
export type AccessScope =
  | { kind: "club" }
  | { kind: "restricted"; sectionIds: string[]; teamIds: string[]; playerIds: string[] };

/** Resumen del ámbito para la web: lo justo para avisar de que la vista está acotada. */
export const AccessScopeSummarySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("club") }),
  z.object({
    kind: z.literal("restricted"),
    sections: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
  }),
]);
export type AccessScopeSummary = z.infer<typeof AccessScopeSummarySchema>;

export function summarizeScope(scope: AccessScope): AccessScopeSummary {
  return scope.kind === "club"
    ? { kind: "club" }
    : {
        kind: "restricted",
        sections: scope.sectionIds.length,
        teams: scope.teamIds.length,
        players: scope.playerIds.length,
      };
}

/**
 * Áreas del club que la administración incluye o excluye por rol. Cada una es una entrada de la
 * navegación. `reads` son los permisos que da incluirla; `all`, los que quita excluirla (no se
 * cambia lo que no se ve).
 */
export const ACCESS_AREAS = [
  "sections",
  "players",
  "club_members",
  "staff",
  "agenda",
  "facilities",
  "challenges",
  /** Entrenamiento (ADR 0039): planificación, biblioteca, carga, bienestar y disponibilidad. */
  "training",
  /** Salud (ADR 0039): lesiones con diagnóstico. La administración no la ve por defecto. */
  "health",
  "fees",
  /** Tienda (ADR 0041): productos, stock y pedidos. Se puede abrir a un cargo (material, delegación). */
  "store",
  "activity",
] as const;
export type AccessArea = (typeof ACCESS_AREAS)[number];
export const AccessAreaSchema = z.enum(ACCESS_AREAS);

export const AREA_PERMISSIONS: Record<
  AccessArea,
  { reads: readonly Permission[]; all: readonly Permission[] }
> = {
  /** Secciones, equipos y, con ellos, los partidos en directo (Bloque 20). */
  sections: {
    reads: ["org.structure.read", "org.matches.read"],
    all: [
      "org.structure.read",
      "org.structure.write",
      "org.roster.write_own",
      "org.matches.read",
      "org.matches.write",
      "org.matches.write_own",
      "org.matches.configure",
    ],
  },
  players: {
    reads: ["org.players.read"],
    all: ["org.players.read", "org.players.write", "org.players.assess", "org.players.assess_own"],
  },
  club_members: {
    reads: ["org.club_members.read"],
    all: ["org.club_members.read", "org.club_members.write"],
  },
  staff: {
    reads: ["org.members.read"],
    all: ["org.members.read", "org.members.invite", "org.members.manage"],
  },
  agenda: {
    reads: ["org.events.read", "org.attendance.read"],
    all: [
      "org.events.read",
      "org.events.write",
      "org.events.write_own",
      "org.attendance.read",
      "org.attendance.write_own",
    ],
  },
  facilities: {
    reads: ["org.facilities.read"],
    all: ["org.facilities.read", "org.facilities.write"],
  },
  challenges: {
    reads: ["org.challenges.read"],
    all: [
      "org.challenges.read",
      "org.challenges.manage",
      "org.challenges.review",
      "org.challenges.review_own",
    ],
  },
  training: {
    reads: ["org.training.read", "org.load.read"],
    all: [
      "org.training.read",
      "org.training.write",
      "org.training.write_own",
      "org.training.library",
      "org.load.read",
      "org.load.write",
      "org.load.write_own",
      "org.availability.write",
    ],
  },
  health: { reads: ["org.health.read"], all: ["org.health.read", "org.health.write"] },
  fees: { reads: ["org.fees.read"], all: ["org.fees.read", "org.fees.write"] },
  store: { reads: ["org.store.read"], all: ["org.store.read", "org.store.write"] },
  activity: { reads: ["org.activity.read"], all: ["org.activity.read"] },
};

export const ACCESS_EFFECTS = ["allow", "deny"] as const;
export type AccessEffect = (typeof ACCESS_EFFECTS)[number];

/**
 * Una regla: por perfil (incluir o excluir un área para todo el que tenga ese rol o cargo) o por
 * persona (las excepciones de una persona concreta, ADR 0036: que vea un área que su rol no ve, o
 * que no vea una que su rol sí). La administración nunca se ve afectada.
 */
export interface AccessRule {
  profile: AccessProfile | null;
  userId: string | null;
  area: AccessArea;
  effect: AccessEffect;
}

/** Permisos por defecto de un perfil, sin reglas: lo que dicen el rol y el cargo. */
export function defaultPermissionsOf(profile: AccessProfile): Set<Permission> {
  return permissionsForMemberships([membershipOfProfile(profile)]);
}

/** Un área se ve cuando se tiene su primer permiso de lectura. */
export function isAreaVisible(
  permissions: ReadonlySet<Permission> | readonly Permission[],
  area: AccessArea,
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(AREA_PERMISSIONS[area].reads[0]!);
}

export function visibleAreas(
  permissions: ReadonlySet<Permission> | readonly Permission[],
): AccessArea[] {
  return ACCESS_AREAS.filter((area) => isAreaVisible(permissions, area));
}

/**
 * Áreas que la administración no tiene por defecto y que se le pueden abrir por excepción a una
 * persona concreta (ADR 0039, decisión 2): acceso a la salud por necesidad de conocer.
 */
export const ADMIN_EXCEPTION_AREAS: readonly AccessArea[] = ["health"];

/**
 * Permisos efectivos de una persona: por cada pertenencia, los del rol y el cargo con las reglas
 * de su perfil aplicadas (excluir quita todo lo del área, incluir da su lectura); la unión de
 * todas; y al final las excepciones de la persona, con el mismo criterio. Quien administra no
 * pierde ni gana nada por reglas, salvo en las áreas de `ADMIN_EXCEPTION_AREAS`.
 */
export function effectivePermissions(
  memberships: Iterable<MembershipRole>,
  rules: readonly AccessRule[],
): Set<Permission> {
  const result = new Set<Permission>();
  let admin = false;
  for (const membership of memberships) {
    const profile = profileOf(membership);
    const permissions = permissionsForMemberships([membership]);
    if (profile === "org_admin") admin = true;
    else {
      for (const rule of rules) {
        if (rule.profile !== profile) continue;
        if (rule.effect === "deny")
          for (const p of AREA_PERMISSIONS[rule.area].all) permissions.delete(p);
        else for (const p of AREA_PERMISSIONS[rule.area].reads) permissions.add(p);
      }
    }
    for (const p of permissions) result.add(p);
  }
  for (const rule of rules) {
    if (rule.userId === null) continue;
    if (admin && !ADMIN_EXCEPTION_AREAS.includes(rule.area)) continue;
    if (rule.effect === "deny") for (const p of AREA_PERMISSIONS[rule.area].all) result.delete(p);
    else for (const p of AREA_PERMISSIONS[rule.area].reads) result.add(p);
  }
  return result;
}

/**
 * Lo que una persona ve por su rol: sus pertenencias con las reglas de sus perfiles, sin sus
 * excepciones. Es el punto de partida de la hoja de excepciones.
 */
export function roleVisibleAreas(
  memberships: Iterable<MembershipRole>,
  rules: readonly AccessRule[],
): AccessArea[] {
  return visibleAreas(
    effectivePermissions(
      memberships,
      rules.filter((r) => r.userId === null),
    ),
  );
}

/**
 * Las excepciones que hacen falta para que una persona vea exactamente `wanted`: `allow` lo que su
 * rol no ve y ella sí, `deny` lo que su rol ve y ella no. Lo que coincide con su rol no se guarda.
 */
export function overridesFor(
  byRole: readonly AccessArea[],
  wanted: readonly AccessArea[],
): { allow: AccessArea[]; deny: AccessArea[] } {
  const role = new Set(byRole);
  const want = new Set(wanted);
  return {
    allow: ACCESS_AREAS.filter((a) => want.has(a) && !role.has(a)),
    deny: ACCESS_AREAS.filter((a) => role.has(a) && !want.has(a)),
  };
}

/** Quién puede tener excepciones: el personal y el cuerpo técnico que no administran el club. */
export function canHaveOverrides(roles: readonly string[]): boolean {
  return !roles.includes("org_admin") && roles.some((r) => r === "coach" || r === "staff");
}

/**
 * Áreas en las que una persona admite excepciones: todas para el personal y el cuerpo técnico;
 * para la administración, solo las que no tiene por defecto (Salud); para la familia, ninguna.
 */
export function overridableAreas(roles: readonly string[]): readonly AccessArea[] {
  if (roles.includes("org_admin")) return ADMIN_EXCEPTION_AREAS;
  return canHaveOverrides(roles) ? ACCESS_AREAS : [];
}
