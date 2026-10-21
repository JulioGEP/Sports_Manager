import { z } from "zod";
import {
  CHALLENGE_AREAS,
  CHALLENGE_STATUSES,
  CHALLENGE_TASK_KINDS,
  CHALLENGE_TASK_STATUSES,
  SUBMISSION_STATUSES,
} from "../challenges.ts";

/**
 * Contratos del reto por puntos (Bloque 13, ADR 0030; ámbito por sección o equipo, ADR 0032).
 * Todo bajo el club de la petición.
 */

const PersonRef = z.object({ userId: z.string(), name: z.string() });
const NamedRef = z.object({ id: z.string(), name: z.string() });

export const ChallengeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(CHALLENGE_STATUSES),
  /** Sección del reto. Siempre hay una. */
  section: NamedRef,
  /** Equipo concreto, o nulo si el reto es de toda la sección. */
  team: NamedRef.nullable(),
  season: NamedRef.nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  minPoints: z.number().int(),
  targetPoints: z.number().int(),
  tasksCount: z.number().int().nonnegative(),
  /** Jugadores con algún registro. */
  participantsCount: z.number().int().nonnegative(),
  /** Registros a la espera de validación. */
  pendingCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type ChallengeSummary = z.infer<typeof ChallengeSummarySchema>;

/**
 * Hasta dónde llega quien pregunta al gestionar retos: `club`, cualquier sección o equipo;
 * `own`, solo retos de equipo de los equipos que lleva (`ownTeamIds`); `none`, no gestiona.
 */
export const ChallengeManageScopeSchema = z.object({
  scope: z.enum(["club", "own", "none"]),
  ownTeamIds: z.array(z.string()),
});
export type ChallengeManageScope = z.infer<typeof ChallengeManageScopeSchema>;

export const ChallengesResponseSchema = z.object({
  challenges: z.array(ChallengeSummarySchema),
  manage: ChallengeManageScopeSchema,
});
export type ChallengesResponse = z.infer<typeof ChallengesResponseSchema>;
export const ChallengeResponseSchema = z.object({ challenge: ChallengeSummarySchema });

export const ChallengeTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.enum(CHALLENGE_AREAS),
  kind: z.enum(CHALLENGE_TASK_KINDS),
  pointsPerUnit: z.number().int(),
  maxPoints: z.number().int().nullable(),
  status: z.enum(CHALLENGE_TASK_STATUSES),
  sortOrder: z.number().int(),
  submissionsCount: z.number().int().nonnegative(),
});
export type ChallengeTask = z.infer<typeof ChallengeTaskSchema>;

export const ChallengeDetailResponseSchema = z.object({
  challenge: ChallengeSummarySchema,
  tasks: z.array(ChallengeTaskSchema),
  /** Lo que quien pregunta puede hacer con este reto: la web enseña solo lo que se puede. */
  access: z.object({ manage: z.boolean(), review: z.boolean() }),
  manage: ChallengeManageScopeSchema,
});
export type ChallengeDetailResponse = z.infer<typeof ChallengeDetailResponseSchema>;

export const ChallengeTotalsSchema = z.object({
  approved: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  byArea: z.object({
    training: z.number().int().nonnegative(),
    technique: z.number().int().nonnegative(),
    habits: z.number().int().nonnegative(),
  }),
});
export type ChallengeTotals = z.infer<typeof ChallengeTotalsSchema>;

export const ChallengeSubmissionSchema = z.object({
  id: z.string(),
  task: z.object({ id: z.string(), name: z.string(), area: z.enum(CHALLENGE_AREAS) }),
  player: z.object({ id: z.string(), name: z.string(), photoUrl: z.string().nullable() }),
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  quantity: z.number().int(),
  points: z.number().int(),
  note: z.string().nullable(),
  happenedOn: z.string(),
  status: z.enum(SUBMISSION_STATUSES),
  submittedBy: PersonRef.nullable(),
  reviewedBy: PersonRef.nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
});
export type ChallengeSubmission = z.infer<typeof ChallengeSubmissionSchema>;
export const ChallengeSubmissionsResponseSchema = z.object({
  submissions: z.array(ChallengeSubmissionSchema),
  /** `own`: solo los equipos del cuerpo técnico que pregunta. */
  scope: z.enum(["club", "own"]),
});
export type ChallengeSubmissionsResponse = z.infer<typeof ChallengeSubmissionsResponseSchema>;
export const ChallengeSubmissionResponseSchema = z.object({
  submission: ChallengeSubmissionSchema,
});

/** Participación de un jugador en el reto. Solo la ve el personal: las familias nunca comparan. */
export const ChallengeStandingSchema = z.object({
  player: z.object({ id: z.string(), name: z.string(), photoUrl: z.string().nullable() }),
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  totals: ChallengeTotalsSchema,
  submissionsCount: z.number().int().nonnegative(),
  reachedMin: z.boolean(),
  reachedTarget: z.boolean(),
});
export type ChallengeStanding = z.infer<typeof ChallengeStandingSchema>;
export const ChallengeStandingsResponseSchema = z.object({
  standings: z.array(ChallengeStandingSchema),
  scope: z.enum(["club", "own"]),
});
export type ChallengeStandingsResponse = z.infer<typeof ChallengeStandingsResponseSchema>;

/** Lo que ve una familia de un reto de uno de sus jugadores: sus puntos y sus registros, nada más. */
export const FamilyChallengeViewSchema = z.object({
  challenge: ChallengeSummarySchema,
  tasks: z.array(ChallengeTaskSchema),
  totals: ChallengeTotalsSchema,
  submissions: z.array(ChallengeSubmissionSchema),
});
export type FamilyChallengeView = z.infer<typeof FamilyChallengeViewSchema>;

/**
 * Los retos activos de un jugador para su familia: los de su sección y los de su equipo, los de
 * toda la sección antes. Vacío si ahora mismo no participa en ninguno.
 */
export const FamilyChallengesResponseSchema = z.object({
  challenges: z.array(FamilyChallengeViewSchema),
});
export type FamilyChallengesResponse = z.infer<typeof FamilyChallengesResponseSchema>;
