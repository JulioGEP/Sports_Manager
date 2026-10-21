import { z } from "zod";
import { LocaleSchema } from "../locales.ts";
import {
  DOMINANT_FEET,
  GUARDIAN_RELATIONSHIPS,
  PLAYER_STATUSES,
  SECTION_STATUSES,
  TEAM_STATUSES,
} from "../structure.ts";
import {
  DEVELOPMENT_PLAN_STATUSES,
  PLAYER_EVENT_KINDS,
  PLAYER_INDICATOR_DIMENSIONS,
} from "../player-profile.ts";
import { INVITATION_STATES } from "../invitations.ts";

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
  /** Equipos de la sección en la temporada pedida (la actual por defecto). */
  teamsCount: z.number().int().nonnegative(),
});
export type Section = z.infer<typeof SectionSchema>;
export const SectionsResponseSchema = z.object({ sections: z.array(SectionSchema) });
export type SectionsResponse = z.infer<typeof SectionsResponseSchema>;
export const SectionResponseSchema = z.object({ section: SectionSchema });

export const TeamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  status: z.enum(TEAM_STATUSES),
  section: z.object({ id: z.string(), name: z.string() }),
  season: z.object({ id: z.string(), name: z.string(), isCurrent: z.boolean() }),
  playersCount: z.number().int().nonnegative(),
  staff: z.array(z.object({ userId: z.string(), name: z.string() })),
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

export const TeamDetailResponseSchema = z.object({
  team: TeamSummarySchema,
  roster: z.array(RosterEntrySchema),
  staff: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string() })),
  /** Lo que quien pregunta puede hacer aquí (Bloque 13): la plantilla la cambia también su cuerpo técnico. */
  access: z.object({ roster: z.boolean() }),
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
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  status: z.enum(PLAYER_STATUSES),
  /** Equipos de la temporada actual. */
  teams: z.array(z.object({ teamId: z.string(), teamName: z.string() })),
  guardiansCount: z.number().int().nonnegative(),
  /** Invitaciones de familia pendientes (Bloque 13). */
  pendingInvitationsCount: z.number().int().nonnegative(),
  photoUrl: z.string().nullable(),
});
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;

/** Filtros de la lista de jugadores: lo que falta en la ficha (alertas del inicio). */
export const PLAYER_MISSING_FILTERS = ["photo", "objective", "team", "family"] as const;
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

export const PlayerDetailResponseSchema = z.object({
  player: z.object({
    id: z.string(),
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
   * Lo que quien pregunta puede hacer en esta ficha (Bloque 13): valorar (objetivo, indicadores,
   * PDI, anotaciones) con permiso de club o como cuerpo técnico del jugador; cambiar la foto.
   */
  access: z.object({ assess: z.boolean(), photo: z.boolean() }),
});
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
  challenge: z
    .object({
      id: z.string(),
      name: z.string(),
      minPoints: z.number().int(),
      targetPoints: z.number().int(),
      approvedPoints: z.number().int().nonnegative(),
      pendingPoints: z.number().int().nonnegative(),
    })
    .nullable(),
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

/** Miembros del club elegibles para el cuerpo técnico o como familia, sin más datos que los de contacto. */
export const EligibleMembersResponseSchema = z.object({
  members: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string() })),
});
export type EligibleMembersResponse = z.infer<typeof EligibleMembersResponseSchema>;

export const GuardianInvitationLocaleSchema = LocaleSchema;
