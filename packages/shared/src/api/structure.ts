import { z } from "zod";
import { LocaleSchema } from "../locales.ts";
import {
  CATEGORY_GENDERS,
  CATEGORY_STATUSES,
  DOMINANT_FEET,
  GUARDIAN_RELATIONSHIPS,
  PERSON_GENDERS,
  PLAYER_STATUSES,
  SECTION_STATUSES,
  TEAM_BOOKING_MODES,
  TEAM_STAFF_ROLES,
  TEAM_STATUSES,
} from "../structure.ts";
import { LocalizedTextSchema } from "../locales.ts";
import { SectionKindSchema } from "../sports.ts";
import { EventSummarySchema } from "./events.ts";
import {
  DEVELOPMENT_PLAN_STATUSES,
  PLAYER_EVENT_KINDS,
  PLAYER_INDICATOR_DIMENSIONS,
} from "../player-profile.ts";
import { INVITATION_STATES } from "../invitations.ts";
import { StaffPositionSchema } from "../roles.ts";

/** Contratos de la estructura del club (Fase 1, Bloque 11). Todo bajo el club de la petición. */

export const SeasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  isCurrent: z.boolean(),
  teamsCount: z.number().int().nonnegative(),
});
export type Season = z.infer<typeof SeasonSchema>;
export const SeasonsResponseSchema = z.object({ seasons: z.array(SeasonSchema) });
export type SeasonsResponse = z.infer<typeof SeasonsResponseSchema>;
export const SeasonResponseSchema = z.object({ season: SeasonSchema });

export const SectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(SECTION_STATUSES),
  sortOrder: z.number().int(),
  /** Deporte de la sección (Bloque 14): de él salen el icono, las posiciones y las categorías sugeridas. */
  sport: z.object({ code: z.string(), name: LocalizedTextSchema }),
  kind: SectionKindSchema,
  coordinator: z.object({ userId: z.string(), name: z.string() }).nullable(),
  description: z.string().nullable(),
  categoriesCount: z.number().int().nonnegative(),
  /** Equipos de la sección en la temporada pedida (la actual por defecto). */
  teamsCount: z.number().int().nonnegative(),
  /** Deportistas distintos en esas plantillas. */
  playersCount: z.number().int().nonnegative(),
  /** Equipos de la temporada sin nadie en el cuerpo técnico: el aviso de la tarjeta. */
  teamsWithoutStaff: z.number().int().nonnegative(),
});
export type Section = z.infer<typeof SectionSchema>;
export const SectionsResponseSchema = z.object({
  season: z.object({ id: z.string(), name: z.string(), isCurrent: z.boolean() }).nullable(),
  sections: z.array(SectionSchema),
});
export type SectionsResponse = z.infer<typeof SectionsResponseSchema>;
export const SectionResponseSchema = z.object({ section: SectionSchema });

export const CategorySchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  name: z.string(),
  gender: z.enum(CATEGORY_GENDERS).nullable(),
  birthYearFrom: z.number().int().nullable(),
  birthYearTo: z.number().int().nullable(),
  sortOrder: z.number().int(),
  status: z.enum(CATEGORY_STATUSES),
  /** Equipos de la categoría en la temporada pedida. */
  teamsCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof CategorySchema>;
export const CategoriesResponseSchema = z.object({ categories: z.array(CategorySchema) });
export type CategoriesResponse = z.infer<typeof CategoriesResponseSchema>;
export const CategoryResponseSchema = z.object({ category: CategorySchema });

export const TeamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Nombre de la categoría ("Alevín"); `categoryId` para editar. */
  category: z.string().nullable(),
  categoryId: z.string(),
  capacity: z.number().int().nullable(),
  /** Plantilla fija o clase abierta a quien reserve (ADR 0049). */
  bookingMode: z.enum(TEAM_BOOKING_MODES),
  status: z.enum(TEAM_STATUSES),
  section: z.object({ id: z.string(), name: z.string(), kind: SectionKindSchema }),
  season: z.object({ id: z.string(), name: z.string(), isCurrent: z.boolean() }),
  playersCount: z.number().int().nonnegative(),
  staff: z.array(
    z.object({ userId: z.string(), name: z.string(), roleInTeam: z.enum(TEAM_STAFF_ROLES) }),
  ),
});
export type TeamSummary = z.infer<typeof TeamSummarySchema>;
export const TeamsResponseSchema = z.object({
  season: z.object({ id: z.string(), name: z.string(), isCurrent: z.boolean() }).nullable(),
  teams: z.array(TeamSummarySchema),
});
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;
export const TeamResponseSchema = z.object({ team: TeamSummarySchema });

export const RosterEntrySchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  status: z.enum(PLAYER_STATUSES),
  shirtNumber: z.number().int().nullable(),
  position: z.string().nullable(),
  guardiansCount: z.number().int().nonnegative(),
  photoUrl: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const TeamScheduleSlotResponseSchema = z.object({
  id: z.string(),
  weekday: z.number().int().min(1).max(7),
  startsAt: z.string(),
  endsAt: z.string(),
  facility: z.object({ id: z.string(), name: z.string() }).nullable(),
  coach: z.object({ userId: z.string(), name: z.string() }).nullable(),
  capacity: z.number().int().nullable(),
});
export type TeamScheduleSlotResponse = z.infer<typeof TeamScheduleSlotResponseSchema>;

/** Respuesta de leer o guardar el horario semanal (Bloque 16): franjas y entrenamientos generados. */
export const TeamScheduleResponseSchema = z.object({
  schedule: z.array(TeamScheduleSlotResponseSchema),
  generated: z.number().int().nonnegative(),
});
export type TeamScheduleResponse = z.infer<typeof TeamScheduleResponseSchema>;

export const TeamDetailResponseSchema = z.object({
  team: TeamSummarySchema,
  roster: z.array(RosterEntrySchema),
  staff: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      roleInTeam: z.enum(TEAM_STAFF_ROLES),
    }),
  ),
  /** Horario semanal del equipo o grupo (Bloque 16). */
  schedule: z.array(TeamScheduleSlotResponseSchema),
  /** Lo que quien pregunta puede hacer aquí (Bloque 13): la plantilla la cambia también su cuerpo técnico. */
  access: z.object({ roster: z.boolean(), events: z.boolean(), attendance: z.boolean() }),
});
export type TeamDetailResponse = z.infer<typeof TeamDetailResponseSchema>;

export const PlayerTeamSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  /** Categoría del equipo ("Alevín"): la del jugador en esa temporada. */
  category: z.string().nullable(),
  sectionName: z.string(),
  seasonId: z.string(),
  seasonName: z.string(),
  seasonIsCurrent: z.boolean(),
  shirtNumber: z.number().int().nullable(),
  position: z.string().nullable(),
});

export const PlayerSummarySchema = z.object({
  id: z.string(),
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  status: z.enum(PLAYER_STATUSES),
  /** Equipos de la temporada actual, con su sección y categoría para filtrar. */
  teams: z.array(
    z.object({
      teamId: z.string(),
      teamName: z.string(),
      sectionId: z.string(),
      categoryId: z.string(),
    }),
  ),
  /** Número de socio si la persona también es socia (Bloque 14). */
  memberNumber: z.number().int().nullable(),
  guardiansCount: z.number().int().nonnegative(),
  /** Invitaciones de familia pendientes (Bloque 13). */
  pendingInvitationsCount: z.number().int().nonnegative(),
  photoUrl: z.string().nullable(),
});
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;

/** Filtros de la lista de jugadores: lo que falta en la ficha (alertas del inicio). */
export const PLAYER_MISSING_FILTERS = ["photo", "objective", "team", "family", "member"] as const;
export type PlayerMissingFilter = (typeof PLAYER_MISSING_FILTERS)[number];
export const PlayersResponseSchema = z.object({ players: z.array(PlayerSummarySchema) });
export type PlayersResponse = z.infer<typeof PlayersResponseSchema>;

export const GuardianSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS),
});
export type Guardian = z.infer<typeof GuardianSchema>;

/** Quién lleva algo del jugador (responsable del objetivo, coordinación del PDI): un miembro del club. */
const PersonRef = z.object({ userId: z.string(), name: z.string() });

/** Indicador del jugador (Bloque 12): dimensión, puntuación de 0 a 100 y lectura corta. */
export const PlayerIndicatorSchema = z.object({
  dimension: z.enum(PLAYER_INDICATOR_DIMENSIONS),
  score: z.number().int().min(0).max(100),
  note: z.string().nullable(),
  updatedAt: z.string(),
});
export type PlayerIndicator = z.infer<typeof PlayerIndicatorSchema>;

/** Objetivo individual vigente, con progreso, responsable y fecha de revisión. */
export const PlayerObjectiveSchema = z.object({
  title: z.string(),
  progress: z.number().int().min(0).max(100),
  owner: PersonRef.nullable(),
  reviewOn: z.string().nullable(),
  updatedAt: z.string(),
});
export type PlayerObjective = z.infer<typeof PlayerObjectiveSchema>;

/** Plan de desarrollo individual: una línea por área, coordinación, estado y próxima revisión. */
export const DevelopmentPlanSchema = z.object({
  technical: z.string().nullable(),
  tactical: z.string().nullable(),
  physical: z.string().nullable(),
  emotional: z.string().nullable(),
  habits: z.string().nullable(),
  person: z.string().nullable(),
  coordinator: PersonRef.nullable(),
  nextReviewOn: z.string().nullable(),
  status: z.enum(DEVELOPMENT_PLAN_STATUSES),
  updatedAt: z.string(),
});
export type DevelopmentPlan = z.infer<typeof DevelopmentPlanSchema>;

/** Registro del timeline. `details` lleva solo lo que el texto necesita: nombres y cifras. */
export const PlayerEventSchema = z.object({
  id: z.string(),
  kind: z.enum(PLAYER_EVENT_KINDS),
  happenedOn: z.string(),
  details: z.record(z.string(), z.union([z.string(), z.number()])),
  actorName: z.string().nullable(),
});
export type PlayerEvent = z.infer<typeof PlayerEventSchema>;

/** Lo que de un deportista ve cualquiera con acceso a él (también su familia): sin contacto ni documento. */
export const PlayerBasicSchema = z.object({
  id: z.string(),
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  status: z.enum(PLAYER_STATUSES),
  createdAt: z.string(),
  /** Fecha de alta en el club (Bloque 13); nula si no se indicó: entonces cuenta `createdAt`. */
  joinedOn: z.string().nullable(),
  photoUrl: z.string().nullable(),
  dominantFoot: z.enum(DOMINANT_FEET).nullable(),
  heightCm: z.number().int().nullable(),
});
export const PlayerBasicResponseSchema = z.object({ player: PlayerBasicSchema });

export const PlayerDetailResponseSchema = z.object({
  player: PlayerBasicSchema.extend({
    /** Datos de la persona (Bloque 14): contacto y documento; solo con `org.players.read`. */
    gender: z.enum(PERSON_GENDERS).nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    nationalId: z.string().nullable(),
    /** Si la persona tiene cuenta propia (deportista adulto), su usuario. */
    userId: z.string().nullable(),
    /** Ficha de socio de la persona, si la tiene. */
    clubMember: z
      .object({ id: z.string(), memberNumber: z.number().int(), status: z.string() })
      .nullable(),
  }),
  teams: z.array(PlayerTeamSchema),
  guardians: z.array(GuardianSchema),
  /** Invitaciones de familia pendientes o caducadas para este jugador. */
  pendingInvitations: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      relationship: z.enum(GUARDIAN_RELATIONSHIPS).nullable(),
      state: z.enum(INVITATION_STATES),
      expiresAt: z.string(),
    }),
  ),
  objective: PlayerObjectiveSchema.nullable(),
  indicators: z.array(PlayerIndicatorSchema),
  developmentPlan: DevelopmentPlanSchema.nullable(),
  /** Del más reciente al más antiguo; el último es siempre el alta en el club. */
  timeline: z.array(PlayerEventSchema),
  /**
   * Personal asignado al deportista (Bloque 19): quien le atiende aunque no lleve su equipo
   * (fisioterapia, preparación física, psicología). Es lo que le abre la ficha a ese personal.
   */
  staff: z.array(
    z.object({ userId: z.string(), name: z.string(), position: StaffPositionSchema.nullable() }),
  ),
  /**
   * Lo que quien pregunta puede hacer en esta ficha (Bloque 13): valorar (objetivo, indicadores,
   * PDI, anotaciones) con permiso de club o como cuerpo técnico del jugador; cambiar la foto;
   * asignar personal (Bloque 19).
   */
  access: z.object({ assess: z.boolean(), photo: z.boolean(), staff: z.boolean() }),
});

/** Asignar a alguien del personal a un deportista: un miembro con rol de personal, entrenador o administración. */
export const PlayerStaffAssignSchema = z.object({ userId: z.string().uuid() });
export type PlayerStaffAssign = z.infer<typeof PlayerStaffAssignSchema>;
export type PlayerDetailResponse = z.infer<typeof PlayerDetailResponseSchema>;
export const PlayerResponseSchema = z.object({ player: PlayerDetailResponseSchema.shape.player });

/** Lo que ve una familia: sus jugadores, con el equipo de la temporada actual y quién lo entrena. */
export const FamilyPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  status: z.enum(PLAYER_STATUSES),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS),
  photoUrl: z.string().nullable(),
  teams: z.array(
    z.object({
      teamId: z.string(),
      teamName: z.string(),
      sectionName: z.string(),
      seasonName: z.string(),
      shirtNumber: z.number().int().nullable(),
      staff: z.array(z.object({ userId: z.string(), name: z.string() })),
    }),
  ),
});
export const FamilyResponseSchema = z.object({ players: z.array(FamilyPlayerSchema) });
export type FamilyResponse = z.infer<typeof FamilyResponseSchema>;

/**
 * Ficha de un jugador vista por su familia (Bloque 13, ADR 0030): foto, datos deportivos, equipo,
 * objetivo, el PDI solo si el club lo ha compartido, los movimientos no sensibles del timeline y
 * sus puntos del reto. Nunca indicadores ni anotaciones del personal, nunca comparativas.
 */
export const FamilyPlayerDetailResponseSchema = z.object({
  player: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: z.string().nullable(),
    status: z.enum(PLAYER_STATUSES),
    createdAt: z.string(),
    joinedOn: z.string().nullable(),
    photoUrl: z.string().nullable(),
    dominantFoot: z.enum(DOMINANT_FEET).nullable(),
    heightCm: z.number().int().nullable(),
    relationship: z.enum(GUARDIAN_RELATIONSHIPS),
  }),
  teams: z.array(
    PlayerTeamSchema.extend({
      staff: z.array(z.object({ userId: z.string(), name: z.string() })),
    }),
  ),
  objective: PlayerObjectiveSchema.nullable(),
  /** Solo cuando el estado del plan es `shared`. */
  developmentPlan: DevelopmentPlanSchema.nullable(),
  timeline: z.array(PlayerEventSchema),
  /** Los retos activos en los que participa (su sección y su equipo, ADR 0032), con sus puntos. */
  challenges: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      section: z.object({ id: z.string(), name: z.string() }),
      team: z.object({ id: z.string(), name: z.string() }).nullable(),
      minPoints: z.number().int(),
      targetPoints: z.number().int(),
      approvedPoints: z.number().int().nonnegative(),
      pendingPoints: z.number().int().nonnegative(),
    }),
  ),
});
export type FamilyPlayerDetailResponse = z.infer<typeof FamilyPlayerDetailResponseSchema>;

/** Alertas de operación del inicio (Bloque 13): recuentos de lo que hace falta hoy. */
export const OperationsSummarySchema = z.object({
  pendingInvitations: z.number().int().nonnegative(),
  playersWithoutPhoto: z.number().int().nonnegative(),
  playersWithoutObjective: z.number().int().nonnegative(),
  playersWithoutTeam: z.number().int().nonnegative(),
  playersWithoutFamily: z.number().int().nonnegative(),
  objectivesOverdue: z.number().int().nonnegative(),
  plansOverdue: z.number().int().nonnegative(),
  challengeSubmissionsPending: z.number().int().nonnegative(),
  /** Bloque 14: equipos de la temporada sin cuerpo técnico y deportistas sin ficha de socio. */
  teamsWithoutStaff: z.number().int().nonnegative(),
  playersWithoutMembership: z.number().int().nonnegative(),
  /** Bloque 16 y 18: instalaciones sin franjas de apertura y cargos vencidos. */
  facilitiesWithoutHours: z.number().int().nonnegative(),
  feesOverdue: z.number().int().nonnegative(),
  /** Tienda (ADR 0041): pedidos sin preparar y opciones agotadas de lo que está a la venta. */
  storeOrdersToPrepare: z.number().int().nonnegative(),
  storeOutOfStock: z.number().int().nonnegative(),
});
export type OperationsSummary = z.infer<typeof OperationsSummarySchema>;

/** Preparación de las fichas: cuántas cumplen cada comprobación y el porcentaje global. */
export const ReadinessSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
  withPhoto: z.number().int().nonnegative(),
  withBirthDate: z.number().int().nonnegative(),
  withTeam: z.number().int().nonnegative(),
  withFamily: z.number().int().nonnegative(),
  withObjective: z.number().int().nonnegative(),
  withIndicators: z.number().int().nonnegative(),
  withPlan: z.number().int().nonnegative(),
});
export type ReadinessSummary = z.infer<typeof ReadinessSummarySchema>;

/**
 * Cifras de la portada del club. Sin datos personales: también vale para la vista de soporte.
 * `operations` y `readiness` solo llegan a quien lee jugadores; para el resto van en nulo.
 */
export const StructureSummarySchema = z.object({
  currentSeason: z.object({ id: z.string(), name: z.string() }).nullable(),
  sections: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
  players: z.number().int().nonnegative(),
  guardians: z.number().int().nonnegative(),
  /** Bloque 14: socios activos y altas del mes, personal e instalaciones. */
  clubMembers: z.number().int().nonnegative(),
  clubMembersJoinedThisMonth: z.number().int().nonnegative(),
  staff: z.number().int().nonnegative(),
  facilities: z.number().int().nonnegative(),
  /** Cuotas pendientes (Bloque 18): importe y número de cargos. Nulo sin `org.fees.read`. */
  fees: z
    .object({
      pendingCents: z.number().int().nonnegative(),
      pendingCount: z.number().int().nonnegative(),
      overdueCount: z.number().int().nonnegative(),
    })
    .nullable(),
  /** Tarjetas de sección del inicio (temporada actual). */
  sectionCards: z.array(SectionSchema),
  /** Eventos de hoy en la zona del club (Bloque 16). Vacío sin `org.events.read`. */
  today: z.array(EventSummarySchema),
  nextEvent: EventSummarySchema.nullable(),
  operations: OperationsSummarySchema.nullable(),
  readiness: ReadinessSummarySchema.nullable(),
});
export type StructureSummary = z.infer<typeof StructureSummarySchema>;

/** Últimos movimientos del club (Bloque 13): la auditoría del propio club, sin otros clubes. */
export const ActivityEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorName: z.string().nullable(),
  target: z.string().nullable(),
  createdAt: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
export const ActivityResponseSchema = z.object({ entries: z.array(ActivityEntrySchema) });
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

/**
 * Vista de conjunto de los jugadores para los paneles del personal (Bloque 13): lo justo para
 * que cada cargo encuentre a quién mirar hoy. Datos de menores: solo con `org.players.read`.
 */
export const PlayerOverviewSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.enum(PLAYER_STATUSES),
  photoUrl: z.string().nullable(),
  birthDate: z.string().nullable(),
  heightCm: z.number().int().nullable(),
  dominantFoot: z.enum(DOMINANT_FEET).nullable(),
  teams: z.array(z.object({ teamId: z.string(), teamName: z.string() })),
  guardiansCount: z.number().int().nonnegative(),
  indicators: z.object({
    sport: z.number().int().nullable(),
    body: z.number().int().nullable(),
    wellbeing: z.number().int().nullable(),
    commitment: z.number().int().nullable(),
  }),
  objective: z.object({ progress: z.number().int(), reviewOn: z.string().nullable() }).nullable(),
  plan: z
    .object({
      status: z.enum(DEVELOPMENT_PLAN_STATUSES),
      nextReviewOn: z.string().nullable(),
      physical: z.boolean(),
      emotional: z.boolean(),
    })
    .nullable(),
  /** Fecha de la última anotación del personal, si la hay. */
  lastNoteOn: z.string().nullable(),
});
export type PlayerOverview = z.infer<typeof PlayerOverviewSchema>;
export const PlayersOverviewResponseSchema = z.object({
  players: z.array(PlayerOverviewSchema),
  /** `own`: solo los jugadores de los equipos del cuerpo técnico que pregunta. */
  scope: z.enum(["club", "own"]),
});
export type PlayersOverviewResponse = z.infer<typeof PlayersOverviewResponseSchema>;

/** Ficha de una sección (Bloque 14): categorías con sus equipos, resumen y avisos. */
export const SectionDetailResponseSchema = z.object({
  section: SectionSchema,
  season: z.object({ id: z.string(), name: z.string(), isCurrent: z.boolean() }).nullable(),
  categories: z.array(
    CategorySchema.extend({
      teams: z.array(TeamSummarySchema.extend({ nextEvent: EventSummarySchema.nullable() })),
    }),
  ),
  summary: z.object({
    players: z.number().int().nonnegative(),
    guardians: z.number().int().nonnegative(),
    readinessPercent: z.number().int().min(0).max(100).nullable(),
    staff: z.array(
      z.object({
        userId: z.string(),
        name: z.string(),
        teams: z.array(z.object({ teamId: z.string(), teamName: z.string() })),
      }),
    ),
    eventsThisWeek: z.number().int().nonnegative(),
  }),
  /** `removable`: sin equipos en ninguna temporada, se puede eliminar; con ellos, solo archivar. */
  access: z.object({ write: z.boolean(), removable: z.boolean() }),
});
export type SectionDetailResponse = z.infer<typeof SectionDetailResponseSchema>;

/** Miembros del club elegibles para el cuerpo técnico o como familia, sin más datos que los de contacto. */
export const EligibleMembersResponseSchema = z.object({
  members: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string() })),
});
export type EligibleMembersResponse = z.infer<typeof EligibleMembersResponseSchema>;

export const GuardianInvitationLocaleSchema = LocaleSchema;
