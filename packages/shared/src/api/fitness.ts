import { z } from "zod";
import {
  ANNOUNCEMENT_AUDIENCES,
  SUBSCRIPTION_STATUSES,
  BOOKING_BLOCKS,
  BOOKING_STATUSES,
  BookingPolicySchema,
  FitnessPreferencesSchema,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PLAN_BILLINGS,
  PLAN_ENTITLEMENTS,
  ScoreSchema,
  SCORE_TYPES,
  WORKOUT_BLOCK_KINDS,
  WORKOUT_LEVELS,
  WORKOUT_STATUSES,
  WorkoutBlockInputSchema,
} from "../fitness.ts";
import { FEE_PERIODS } from "../fees.ts";
import { DateOnlySchema, TEAM_STATUSES } from "../structure.ts";
import { STORED_AVAILABILITY_STATUSES } from "../training.ts";
import { AI_FAILURES, AI_GENERATION_STATUSES } from "../training-ai.ts";
import { AiQuotaSchema } from "./training-ai.ts";

/** Contratos de los clubs de fitness (ADR 0049). */

const Ref = z.object({ id: z.string(), name: z.string() });

// --- Tarifas ---

/** Lo que lleva gastado el atleta en el periodo de hoy (o de la clase que se mira). */
export const PlanUsageSchema = z.object({
  limit: z.number().int().nullable(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nullable(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
});
export type PlanUsage = z.infer<typeof PlanUsageSchema>;

export const SubscriptionSchema = z.object({
  id: z.string(),
  player: z.object({ id: z.string(), name: z.string() }),
  personId: z.string(),
  plan: z.object({
    id: z.string(),
    name: z.string(),
    entitlement: z.enum(PLAN_ENTITLEMENTS),
    sessions: z.number().int().nullable(),
    validityDays: z.number().int().nullable(),
    amountCents: z.number().int(),
    period: z.enum(FEE_PERIODS),
  }),
  status: z.enum(SUBSCRIPTION_STATUSES),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  /** Último día que vale: el fin o la caducidad del bono. */
  expiresOn: z.string().nullable(),
  pausedUntil: z.string().nullable(),
  billing: z.enum(PLAN_BILLINGS),
  /** Estado de la domiciliación en Stripe (`active`, `past_due`…), si la hay. */
  stripeStatus: z.string().nullable(),
  usage: PlanUsageSchema,
});
export type Subscription = z.infer<typeof SubscriptionSchema>;
export const SubscriptionsResponseSchema = z.object({ plans: z.array(SubscriptionSchema) });
export type SubscriptionsResponse = z.infer<typeof SubscriptionsResponseSchema>;
export const SubscriptionResponseSchema = z.object({ plan: SubscriptionSchema });

/** La tarifa propia y si el club cobra por Stripe (para ofrecer domiciliarla). */
export const MyPlanResponseSchema = z.object({
  plans: z.array(SubscriptionSchema),
  canSubscribe: z.boolean(),
});
export type MyPlanResponse = z.infer<typeof MyPlanResponseSchema>;

export const PlanChargesGeneratedSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

// --- Clases ---

export const MyBookingSchema = z.object({
  bookingId: z.string(),
  status: z.enum(BOOKING_STATUSES),
  /** En la espera: su puesto. */
  position: z.number().int().nullable(),
});

/** Una clase del horario tal como la ve quien pregunta: plazas, su reserva y si puede reservar. */
export const ClassSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  /** Día de la clase en la zona del club. */
  date: z.string(),
  section: Ref.nullable(),
  team: Ref.nullable(),
  facility: Ref.nullable(),
  coach: z.object({ userId: z.string(), name: z.string() }).nullable(),
  capacity: z.number().int().nullable(),
  booked: z.number().int().nonnegative(),
  waitlist: z.number().int().nonnegative(),
  my: MyBookingSchema.nullable(),
  /** Para el atleta: si puede reservar ahora, a plaza o a la espera, o por qué no. */
  action: z.enum(["book", "waitlist"]).nullable(),
  block: z.enum(BOOKING_BLOCKS).nullable(),
  opensAt: z.string(),
  closesAt: z.string(),
  freeCancelUntil: z.string(),
  /** Hay WOD publicado para esta clase. */
  hasWorkout: z.boolean(),
  /** Check-in hecho por el coach (para el personal). */
  checkedIn: z.number().int().nonnegative(),
});
export type ClassSummary = z.infer<typeof ClassSummarySchema>;

export const ClassesResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  classes: z.array(ClassSummarySchema),
  policy: BookingPolicySchema,
  /** Para el atleta: su tarifa vigente hoy (la primera que vale). */
  plan: SubscriptionSchema.nullable(),
  /** Si quien pregunta reserva para sí (atleta) o gestiona (personal). */
  role: z.enum(["athlete", "staff"]),
});
export type ClassesResponse = z.infer<typeof ClassesResponseSchema>;

export const AttendeeSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  initials: z.string(),
  photoUrl: z.string().nullable(),
  isMe: z.boolean(),
  /** Para el personal: el estado de su reserva. */
  status: z.enum(BOOKING_STATUSES).nullable(),
  /** Para el personal: nivel habitual (último resultado) y una nota corta. */
  note: z.string().nullable(),
});
export type Attendee = z.infer<typeof AttendeeSchema>;

/** El brief de la clase para el coach: lo que conviene saber antes de empezar. */
export const ClassBriefSchema = z.object({
  newcomers: z.array(
    z.object({ playerId: z.string(), name: z.string(), visits: z.number().int() }),
  ),
  restrictions: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      status: z.enum(STORED_AVAILABILITY_STATUSES),
      note: z.string().nullable(),
    }),
  ),
  returning: z.array(
    z.object({ playerId: z.string(), name: z.string(), daysAway: z.number().int() }),
  ),
  loads: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      movement: z.string(),
      percent: z.number().int(),
      oneRmKg: z.number(),
      loadKg: z.number(),
    }),
  ),
});
export type ClassBrief = z.infer<typeof ClassBriefSchema>;

// --- Programación ---

export const ResultViewSchema = z.object({
  level: z.enum(WORKOUT_LEVELS),
  score: ScoreSchema,
  completed: z.boolean(),
  effort: z.number().int().nullable(),
  note: z.string().nullable(),
  display: z.string(),
  recordedAt: z.string(),
});
export type ResultView = z.infer<typeof ResultViewSchema>;

export const WorkoutBlockViewSchema = z.object({
  id: z.string(),
  /** A, B, C… por orden. */
  label: z.string(),
  kind: z.enum(WORKOUT_BLOCK_KINDS),
  title: z.string(),
  description: z.string().nullable(),
  scoreType: z.enum(SCORE_TYPES),
  timeCapSeconds: z.number().int().nullable(),
  movement: z.object({ code: z.string(), name: z.string() }).nullable(),
  percent: z.number().int().nullable(),
  rmReps: z.number().int().nullable(),
  scaled: z.string().nullable(),
  rx: z.string().nullable(),
  rxPlus: z.string().nullable(),
  /** Para el atleta: su 1RM del movimiento (real o estimada) y los kilos del porcentaje. */
  mine: z
    .object({
      oneRmKg: z.number().nullable(),
      estimated: z.boolean(),
      loadKg: z.number().nullable(),
      result: ResultViewSchema.nullable(),
    })
    .nullable(),
  /** Resultados registrados en el bloque. */
  results: z.number().int().nonnegative(),
});
export type WorkoutBlockView = z.infer<typeof WorkoutBlockViewSchema>;

export const WorkoutViewSchema = z.object({
  id: z.string(),
  onDate: z.string(),
  section: Ref,
  team: Ref.nullable(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(WORKOUT_STATUSES),
  publishAt: z.string().nullable(),
  /** Publicado y ya visible para los atletas. */
  visible: z.boolean(),
  blocks: z.array(WorkoutBlockViewSchema),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type WorkoutView = z.infer<typeof WorkoutViewSchema>;
export const WorkoutsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  workouts: z.array(WorkoutViewSchema),
  /** Disciplinas en las que quien pregunta puede programar. */
  writableSections: z.array(z.string()),
});
export type WorkoutsResponse = z.infer<typeof WorkoutsResponseSchema>;
export const WorkoutResponseSchema = z.object({ workout: WorkoutViewSchema });
/** Los WODs publicados de un día para el atleta, con sus kilos y sus resultados. */
export const MyWorkoutsResponseSchema = z.object({
  date: z.string(),
  workouts: z.array(WorkoutViewSchema),
});
export type MyWorkoutsResponse = z.infer<typeof MyWorkoutsResponseSchema>;
export type WorkoutResponse = z.infer<typeof WorkoutResponseSchema>;

export const ClassDetailResponseSchema = z.object({
  class: ClassSummarySchema,
  attendees: z.array(AttendeeSchema),
  /** Quienes reservaron y prefieren no salir en la lista. */
  hiddenCount: z.number().int().nonnegative(),
  /** Para el personal: la lista de espera en orden. */
  waitlist: z.array(AttendeeSchema),
  /** Para el personal. */
  brief: ClassBriefSchema.nullable(),
  workout: WorkoutViewSchema.nullable(),
  /** Para el personal: puede hacer check-in y cerrar la clase. */
  canCheckIn: z.boolean(),
});
export type ClassDetailResponse = z.infer<typeof ClassDetailResponseSchema>;

export const BookingResultSchema = z.object({
  booking: MyBookingSchema,
  class: ClassSummarySchema,
});
export type BookingResult = z.infer<typeof BookingResultSchema>;

export const CancelResultSchema = z.object({
  /** Cómo quedó: cancelada a tiempo o cancelación tardía. */
  status: z.enum(["cancelled", "late_cancel"]),
  /** Si alguien de la espera ha entrado. */
  promoted: z.boolean(),
  class: ClassSummarySchema,
});
export type CancelResult = z.infer<typeof CancelResultSchema>;

export const MyBookingsResponseSchema = z.object({
  upcoming: z.array(ClassSummarySchema),
  history: z.array(ClassSummarySchema),
});
export type MyBookingsResponse = z.infer<typeof MyBookingsResponseSchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  playerId: z.string(),
  name: z.string(),
  isMe: z.boolean(),
  level: z.enum(WORKOUT_LEVELS),
  display: z.string(),
  completed: z.boolean(),
});
export const LeaderboardResponseSchema = z.object({
  block: z.object({
    id: z.string(),
    title: z.string(),
    scoreType: z.enum(SCORE_TYPES),
    label: z.string(),
  }),
  entries: z.array(LeaderboardEntrySchema),
  /** Resultados de quien prefiere no salir. */
  hiddenCount: z.number().int().nonnegative(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

export const ResultSavedResponseSchema = z.object({
  result: ResultViewSchema,
  /** Si el resultado es una marca nueva del atleta (máxima o benchmark). */
  personalRecord: z.boolean(),
});

// --- Progreso ---

export const PersonalRecordSchema = z.object({
  id: z.string(),
  movementCode: z.string(),
  reps: z.number().int(),
  loadKg: z.number(),
  onDate: z.string(),
  note: z.string().nullable(),
  source: z.enum(["manual", "result"]),
});
export type PersonalRecord = z.infer<typeof PersonalRecordSchema>;

/** La mejor marca de cada movimiento, con su historia. */
export const MovementProgressSchema = z.object({
  movementCode: z.string(),
  oneRm: z.object({ kg: z.number(), estimated: z.boolean() }).nullable(),
  best: z.array(PersonalRecordSchema),
  history: z.array(PersonalRecordSchema),
});
export type MovementProgress = z.infer<typeof MovementProgressSchema>;
/** Las marcas del atleta tras apuntar o borrar una. */
export const RecordsResponseSchema = z.object({ movements: z.array(MovementProgressSchema) });

export const BenchmarkResultSchema = z.object({
  id: z.string(),
  benchmarkCode: z.string(),
  level: z.enum(WORKOUT_LEVELS),
  score: ScoreSchema,
  completed: z.boolean(),
  display: z.string(),
  onDate: z.string(),
  note: z.string().nullable(),
  /** La mejor del atleta en ese benchmark. */
  isBest: z.boolean(),
});
export type BenchmarkResultView = z.infer<typeof BenchmarkResultSchema>;

export const BodyMeasurementSchema = z.object({
  id: z.string(),
  onDate: z.string(),
  weightKg: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  waistCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  armCm: z.number().nullable(),
  thighCm: z.number().nullable(),
  note: z.string().nullable(),
});
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>;

export const ProgressResponseSchema = z.object({
  month: z.string(),
  /** Días del mes con clase hecha o reservada. */
  days: z.array(z.object({ date: z.string(), attended: z.boolean(), booked: z.boolean() })),
  streak: z.object({ current: z.number().int(), best: z.number().int() }),
  classesThisMonth: z.number().int().nonnegative(),
  totalClasses: z.number().int().nonnegative(),
  movements: z.array(MovementProgressSchema),
  benchmarks: z.array(BenchmarkResultSchema),
  body: z.array(BodyMeasurementSchema),
  preferences: FitnessPreferencesSchema,
  /** Reparto del trabajo de los últimos 30 días por tipo de bloque. */
  workMix: z.array(z.object({ kind: z.enum(WORKOUT_BLOCK_KINDS), count: z.number().int() })),
});
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;

export const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  section: Ref.nullable(),
  pinned: z.boolean(),
  author: z.string().nullable(),
  publishedAt: z.string(),
  read: z.boolean(),
  /** Para quien escribe anuncios: cuántas personas lo han leído. */
  readCount: z.number().int().nullable(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;
export const AnnouncementsResponseSchema = z.object({
  announcements: z.array(AnnouncementSchema),
  canWrite: z.boolean(),
});
export type AnnouncementsResponse = z.infer<typeof AnnouncementsResponseSchema>;
export const AnnouncementResponseSchema = z.object({ announcement: AnnouncementSchema });

export const FitnessHomeResponseSchema = z.object({
  athlete: z.object({ playerId: z.string(), firstName: z.string() }),
  nextClass: ClassSummarySchema.nullable(),
  todayWorkout: WorkoutViewSchema.nullable(),
  plan: SubscriptionSchema.nullable(),
  streak: z.object({ current: z.number().int(), best: z.number().int() }),
  classesThisMonth: z.number().int().nonnegative(),
  lastRecord: PersonalRecordSchema.nullable(),
  announcement: AnnouncementSchema.nullable(),
  unreadAnnouncements: z.number().int().nonnegative(),
  unreadMessages: z.number().int().nonnegative(),
  /** Restricción abierta del cuerpo técnico: el WOD la tiene en cuenta. */
  restriction: z
    .object({ status: z.enum(STORED_AVAILABILITY_STATUSES), until: z.string().nullable() })
    .nullable(),
});
export type FitnessHomeResponse = z.infer<typeof FitnessHomeResponseSchema>;

// --- Comunidad ---

export const MessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.object({ userId: z.string().nullable(), name: z.string() }),
  /** Lo escribió el atleta (no el box). */
  fromAthlete: z.boolean(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;
export const MessageThreadResponseSchema = z.object({
  athlete: z.object({ playerId: z.string(), name: z.string() }),
  messages: z.array(MessageSchema),
  canWrite: z.boolean(),
});
export type MessageThreadResponse = z.infer<typeof MessageThreadResponseSchema>;
export const MessageThreadsResponseSchema = z.object({
  threads: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      lastMessage: MessageSchema,
      unread: z.number().int().nonnegative(),
    }),
  ),
});
export type MessageThreadsResponse = z.infer<typeof MessageThreadsResponseSchema>;

// --- Atletas (para el box) ---

export const FitnessAthleteRowSchema = z.object({
  playerId: z.string(),
  personId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  email: z.string().nullable(),
  hasAccess: z.boolean(),
  plan: z
    .object({
      id: z.string(),
      name: z.string(),
      status: z.enum(SUBSCRIPTION_STATUSES),
      remaining: z.number().int().nullable(),
      expiresOn: z.string().nullable(),
    })
    .nullable(),
  lastVisit: z.string().nullable(),
  visits30: z.number().int().nonnegative(),
  joinedOn: z.string().nullable(),
  restriction: z.enum(STORED_AVAILABILITY_STATUSES).nullable(),
});
export type FitnessAthleteRow = z.infer<typeof FitnessAthleteRowSchema>;
export const FitnessAthletesResponseSchema = z.object({
  athletes: z.array(FitnessAthleteRowSchema),
});
export type FitnessAthletesResponse = z.infer<typeof FitnessAthletesResponseSchema>;

export const FitnessAthleteDetailResponseSchema = z.object({
  athlete: FitnessAthleteRowSchema.extend({
    phone: z.string().nullable(),
    birthDate: z.string().nullable(),
    adult: z.boolean(),
  }),
  plans: z.array(SubscriptionSchema),
  bookings: z.array(ClassSummarySchema),
  movements: z.array(MovementProgressSchema),
  benchmarks: z.array(BenchmarkResultSchema),
  /** Solo si el atleta las comparte con su coach. */
  body: z.array(BodyMeasurementSchema).nullable(),
  streak: z.object({ current: z.number().int(), best: z.number().int() }),
});
export type FitnessAthleteDetailResponse = z.infer<typeof FitnessAthleteDetailResponseSchema>;

// --- Tipos de clase y horario ---

export const ClassSlotSchema = z.object({
  id: z.string(),
  weekday: z.number().int().min(1).max(7),
  startsAt: z.string(),
  endsAt: z.string(),
  facility: Ref.nullable(),
  coach: z.object({ userId: z.string(), name: z.string() }).nullable(),
  capacity: z.number().int().nullable(),
});
export type ClassSlot = z.infer<typeof ClassSlotSchema>;

export const ClassTypeSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  section: Ref,
  capacity: z.number().int().nullable(),
  description: z.string().nullable(),
  /** Archivado: no se reserva ni se genera; se puede recuperar. */
  status: z.enum(TEAM_STATUSES),
  slots: z.array(ClassSlotSchema),
  /** Clases futuras ya generadas. */
  upcoming: z.number().int().nonnegative(),
});
export type ClassType = z.infer<typeof ClassTypeSchema>;
export const ClassTypesResponseSchema = z.object({
  classTypes: z.array(ClassTypeSchema),
  sections: z.array(Ref),
  coaches: z.array(z.object({ userId: z.string(), name: z.string() })),
  facilities: z.array(Ref),
  policy: BookingPolicySchema,
});
export type ClassTypesResponse = z.infer<typeof ClassTypesResponseSchema>;
export const ClassTypeResponseSchema = z.object({
  classType: ClassTypeSchema,
  generated: z.number().int().nonnegative().optional(),
});

// --- Leads ---

export const LeadSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  source: z.enum(LEAD_SOURCES),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().nullable(),
  trialClass: z.object({ id: z.string(), title: z.string(), startsAt: z.string() }).nullable(),
  convertedPlayerId: z.string().nullable(),
  createdAt: z.string(),
});
export type Lead = z.infer<typeof LeadSchema>;
export const LeadsResponseSchema = z.object({ leads: z.array(LeadSchema) });
export type LeadsResponse = z.infer<typeof LeadsResponseSchema>;
export const LeadResponseSchema = z.object({ lead: LeadSchema });

// --- Métricas del box ---

export const FITNESS_ALERTS = [
  "inactive_athletes",
  "packs_expiring",
  "trials_pending",
  "workout_missing",
  "charges_failed",
  "plans_paused_ending",
] as const;
export type FitnessAlert = (typeof FITNESS_ALERTS)[number];

export const FitnessMetricsResponseSchema = z.object({
  activeAthletes: z.number().int().nonnegative(),
  joinedThisMonth: z.number().int().nonnegative(),
  leftThisMonth: z.number().int().nonnegative(),
  /** Plazas ocupadas sobre ofrecidas en las clases de esta semana (0 a 1). */
  occupancyWeek: z.number().min(0).max(1).nullable(),
  occupancyLastWeek: z.number().min(0).max(1).nullable(),
  /** Lo que suman al mes las tarifas recurrentes activas. */
  recurringMonthlyCents: z.number().int().nonnegative(),
  trialsThisWeek: z.number().int().nonnegative(),
  trialsConvertedThisMonth: z.number().int().nonnegative(),
  /** Asistencia media por atleta activo en los últimos 30 días. */
  visitsPerAthlete30: z.number().nonnegative(),
  alerts: z.array(
    z.object({
      kind: z.enum(FITNESS_ALERTS),
      count: z.number().int().positive(),
      /** Para el aviso de programación: el día sin WOD publicado. */
      date: z.string().nullable(),
      /** Hasta tres nombres o pistas para que el aviso se entienda sin abrirlo. */
      sample: z.array(z.string()),
    }),
  ),
  /** Ocupación por franja horaria en las últimas cuatro semanas. */
  byHour: z.array(
    z.object({ hour: z.string(), offered: z.number().int(), taken: z.number().int() }),
  ),
  /** Semana de programación desde hoy: qué días tienen WOD publicado, en borrador o nada. */
  programming: z.array(
    z.object({
      date: z.string(),
      /** `partial`: lo programado está publicado, pero alguna disciplina con clase no tiene WOD. */
      status: z.enum(["published", "partial", "draft", "missing"]),
      title: z.string().nullable(),
      /** Disciplinas con clase ese día y sin WOD. */
      missing: z.array(z.string()),
    }),
  ),
});
export type FitnessMetricsResponse = z.infer<typeof FitnessMetricsResponseSchema>;

/** Ranking del mes del box: constancia (clases hechas) y benchmarks. */
export const RankingResponseSchema = z.object({
  month: z.string(),
  consistency: z.array(
    z.object({
      rank: z.number().int().positive(),
      playerId: z.string(),
      name: z.string(),
      classes: z.number().int().nonnegative(),
      isMe: z.boolean(),
    }),
  ),
  hiddenCount: z.number().int().nonnegative(),
});
export type RankingResponse = z.infer<typeof RankingResponseSchema>;

/** Librería de movimientos del box para el atleta: lo de la biblioteca con vídeo. */
export const LibraryResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      coachingPoints: z.string().nullable(),
      videoUrl: z.string().nullable(),
      section: z.string().nullable(),
    }),
  ),
});
export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;

/** Domiciliar la tarifa: la URL de Stripe Checkout en modo suscripción. */
export const SubscribeResponseSchema = z.object({ url: z.string() });

// --- Web del box (API pública con clave publicable) ---

export const PublicClassesResponseSchema = z.object({
  club: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
  classes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      discipline: z.string().nullable(),
      classType: z.string().nullable(),
      coach: z.string().nullable(),
      /** Plazas libres; nulo si la clase no tiene aforo. */
      spotsLeft: z.number().int().nullable(),
    }),
  ),
});
export type PublicClassesResponse = z.infer<typeof PublicClassesResponseSchema>;
export const PublicTrialResponseSchema = z.object({ received: z.literal(true) });

// --- Propuesta de WOD con IA (ADR 0049) ---

/**
 * El coach pide a la IA un WOD para un día de una disciplina (y, si quiere, de un tipo de clase).
 * Se genera en segundo plano con la misma cuota semanal que el resto de propuestas (ADR 0044); el
 * coach lo revisa en el editor y solo se guarda cuando él lo guarda.
 */
export const AiWodRequestSchema = z.object({
  sectionId: z.string().uuid(),
  teamId: z.string().uuid().nullable().optional(),
  onDate: DateOnlySchema,
  /** Lo que busca ese día, en palabras del coach: "motor largo, sin barra", "fuerza de piernas". */
  focus: z.string().trim().max(300).nullable().optional(),
  /** Minutos de la clase. */
  durationMinutes: z.number().int().min(20).max(120).optional(),
});
export type AiWodRequest = z.infer<typeof AiWodRequestSchema>;

export const AiWodGenerationSchema = z.object({
  id: z.string(),
  status: z.enum(AI_GENERATION_STATUSES),
  failure: z.enum(AI_FAILURES).nullable(),
  onDate: z.string(),
  section: Ref,
  team: Ref.nullable(),
  /** La propuesta lista para cargar en el editor; nula hasta que está lista. */
  proposal: z
    .object({
      title: z.string().nullable(),
      notes: z.string().nullable(),
      blocks: z.array(WorkoutBlockInputSchema),
    })
    .nullable(),
  quota: AiQuotaSchema,
});
export type AiWodGeneration = z.infer<typeof AiWodGenerationSchema>;
export const AiWodGenerationResponseSchema = z.object({ generation: AiWodGenerationSchema });
export type AiWodGenerationResponse = z.infer<typeof AiWodGenerationResponseSchema>;
