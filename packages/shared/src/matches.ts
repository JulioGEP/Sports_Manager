import { z } from "zod";
import type { Locale, LocalizedText } from "./locales.ts";
import { DateOnlySchema } from "./structure.ts";
import { HOME_AWAY } from "./events.ts";

/**
 * Partido en directo (Fase 1, Bloque 20, ADR 0034): un motor de registro de lo que pasa en un
 * partido, pensado para la banda con una tableta. Todo lo que se puede registrar es un
 * **catálogo de acciones** por sección (deporte): el club lo edita, añade lo que quiera
 * (saque de esquina, saque de banda, tiempo muerto...) o se queda con lo básico. El deporte
 * solo propone un catálogo y unos ajustes de partido por defecto; nada está en código fijo.
 *
 * El partido es una lista ordenada de eventos (acción, cambio, inicio y fin de periodo) con el
 * cronómetro del partido y la foto de quién estaba en pista. De ahí salen todas las
 * estadísticas (`match-stats.ts`), en la API y en la web con el mismo motor.
 */

// --- Catálogo de acciones ---

/** Favorable, pérdida o sanción, o neutra (saques, tiempos muertos). Solo decide color y grupo. */
export const MATCH_ACTION_CATEGORIES = ["positive", "negative", "neutral"] as const;
export type MatchActionCategory = (typeof MATCH_ACTION_CATEGORIES)[number];
export const MatchActionCategorySchema = z.enum(MATCH_ACTION_CATEGORIES);

/**
 * A quién se aplica: a un jugador en pista (gol, falta), al equipo sin jugador (tiempo muerto)
 * o al rival (gol rival, falta rival). Las del rival nunca llevan jugador.
 */
export const MATCH_ACTION_SCOPES = ["player", "team", "opponent"] as const;
export type MatchActionScope = (typeof MATCH_ACTION_SCOPES)[number];
export const MatchActionScopeSchema = z.enum(MATCH_ACTION_SCOPES);

export const MATCH_CARDS = ["yellow", "red"] as const;
export type MatchCard = (typeof MATCH_CARDS)[number];
export const MatchCardSchema = z.enum(MATCH_CARDS);

export const MATCH_ACTION_STATUSES = ["active", "archived"] as const;
export type MatchActionStatus = (typeof MATCH_ACTION_STATUSES)[number];

export const MATCH_ACTION_NAME_MAX = 40;
export const MATCH_ACTION_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
/** Peso en la valoración del jugador: puntos por cada vez que se registra. */
export const MATCH_ACTION_WEIGHT_MIN = -20;
export const MATCH_ACTION_WEIGHT_MAX = 20;

const Weight = z.number().min(MATCH_ACTION_WEIGHT_MIN).max(MATCH_ACTION_WEIGHT_MAX);
const Points = z.number().int().min(0).max(10);

/** Una acción del catálogo: lo que el club quiere poder registrar de un toque. */
export const MatchActionTypeCreateSchema = z.object({
  /** Clave estable (`goal`, `corner`): es la columna de las estadísticas. Se genera del nombre si falta. */
  code: z.string().regex(MATCH_ACTION_CODE_PATTERN).optional(),
  name: z.string().trim().min(1).max(MATCH_ACTION_NAME_MAX),
  category: MatchActionCategorySchema,
  scope: MatchActionScopeSchema,
  /** Puntos que suma al marcador propio (gol: 1; triple: 3) y al del rival. */
  ownScore: Points.optional(),
  opponentScore: Points.optional(),
  /** Cuenta como falta de equipo (faltas acumuladas del periodo). */
  countsFoul: z.boolean().optional(),
  card: MatchCardSchema.nullable().optional(),
  /** Pide la zona de la pista desde la que se hizo (mapa de finalización). */
  requiresZone: z.boolean().optional(),
  /** Solo la puede hacer el portero (parada). */
  keeperOnly: z.boolean().optional(),
  weight: Weight.optional(),
  /** En la bandeja rápida; si no, dentro de "Más acciones". */
  quick: z.boolean().optional(),
  /**
   * Para la comparativa con el rival: la acción propia de la que esta es el espejo
   * (`opp_goal` es espejo de `goal`). Solo en acciones del rival.
   */
  mirrorOf: z.string().regex(MATCH_ACTION_CODE_PATTERN).nullable().optional(),
});
export type MatchActionTypeCreate = z.infer<typeof MatchActionTypeCreateSchema>;

export const MatchActionTypeUpdateSchema = MatchActionTypeCreateSchema.omit({ code: true })
  .partial()
  .extend({
    status: z.enum(MATCH_ACTION_STATUSES).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  });
export type MatchActionTypeUpdate = z.infer<typeof MatchActionTypeUpdateSchema>;

/** Clave a partir del nombre: "Saque de esquina" → `saque_de_esquina`. */
export function actionCodeFromName(name: string): string {
  const code = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(code) && code.length >= 2 ? code : `a_${code}`.slice(0, 40);
}

// --- Ajustes del partido ---

export const CLOCK_DIRECTIONS = ["up", "down"] as const;
export type ClockDirection = (typeof CLOCK_DIRECTIONS)[number];

/**
 * Cómo se juega en esta sección: periodos, minutos, cuántos en pista, si hay portero, el tope
 * de faltas por periodo (0: sin contador), los sistemas de juego y si se usa el mapa de zonas.
 * Nace del deporte y el club lo cambia; cada partido guarda su copia.
 */
export const MatchSettingsSchema = z.object({
  periods: z.number().int().min(1).max(10),
  periodMinutes: z.number().int().min(1).max(90),
  playersOnCourt: z.number().int().min(1).max(15),
  goalkeeper: z.boolean(),
  foulLimit: z.number().int().min(0).max(20),
  clock: z.enum(CLOCK_DIRECTIONS),
  /** Sistemas de juego ("1-2-1", "2-2"): las líneas sin contar el portero. */
  formations: z.array(z.string().regex(/^\d(-\d){0,4}$/)).max(8),
  zones: z.boolean(),
});
export type MatchSettings = z.infer<typeof MatchSettingsSchema>;

/** Ajustes de la sección: todos opcionales, sobre los del deporte. */
export const MatchSettingsPatchSchema = MatchSettingsSchema.partial();
export type MatchSettingsPatch = z.infer<typeof MatchSettingsPatchSchema>;

export const SectionMatchConfigUpdateSchema = z.object({
  settings: MatchSettingsPatchSchema.optional(),
  /** Vuelve al catálogo y a los ajustes que propone el deporte (archiva lo que no esté en él). */
  resetToSport: z.boolean().optional(),
});
export type SectionMatchConfigUpdate = z.infer<typeof SectionMatchConfigUpdateSchema>;

// --- Partido ---

export const MATCH_STATUSES = ["scheduled", "live", "finished"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const MatchStatusSchema = z.enum(MATCH_STATUSES);

export const ATTACK_DIRECTIONS = ["left", "right"] as const;
export type AttackDirection = (typeof ATTACK_DIRECTIONS)[number];

export const MATCH_OPPONENT_MAX = 60;
export const MATCH_NOTES_MAX = 600;

export const MatchCreateSchema = z.object({
  opponent: z.string().trim().min(1).max(MATCH_OPPONENT_MAX),
  homeAway: z.enum(HOME_AWAY),
  playedOn: DateOnlySchema,
  /** Partido de la agenda al que corresponde, si existe. */
  eventId: z.string().uuid().nullable().optional(),
  /** Cambios sobre los ajustes de la sección para este partido (un torneo a 15 minutos). */
  settings: MatchSettingsPatchSchema.optional(),
  notes: z.string().trim().max(MATCH_NOTES_MAX).nullable().optional(),
});
export type MatchCreate = z.infer<typeof MatchCreateSchema>;

/** Estado del cronómetro que manda la web: el reloj corre en la tableta y la API lo guarda. */
export const MatchClockSchema = z.object({
  period: z.number().int().min(1).max(10),
  elapsedMs: z
    .number()
    .int()
    .min(0)
    .max(6 * 60 * 60 * 1000),
  /** Instante (ISO) en que se puso en marcha, o nulo si está parado. */
  runningSince: z.string().nullable(),
});
export type MatchClock = z.infer<typeof MatchClockSchema>;

export const MatchUpdateSchema = z.object({
  opponent: z.string().trim().min(1).max(MATCH_OPPONENT_MAX).optional(),
  homeAway: z.enum(HOME_AWAY).optional(),
  playedOn: DateOnlySchema.optional(),
  eventId: z.string().uuid().nullable().optional(),
  settings: MatchSettingsPatchSchema.optional(),
  notes: z.string().trim().max(MATCH_NOTES_MAX).nullable().optional(),
  formation: z
    .string()
    .regex(/^\d(-\d){0,4}$/)
    .nullable()
    .optional(),
  attackDirection: z.enum(ATTACK_DIRECTIONS).optional(),
  clock: MatchClockSchema.optional(),
  /** `live` al empezar, `finished` al acabar. Un partido acabado se puede reabrir. */
  status: MatchStatusSchema.optional(),
});
export type MatchUpdate = z.infer<typeof MatchUpdateSchema>;

/** Convocatoria: quién va al partido, con dorsal, posición, si es portero y si sale de inicio. */
export const MatchSquadEntrySchema = z.object({
  playerId: z.string().uuid(),
  shirtNumber: z.number().int().min(0).max(999).nullable().optional(),
  position: z.string().trim().max(40).nullable().optional(),
  isGoalkeeper: z.boolean().optional(),
  starter: z.boolean().optional(),
  /** Hueco del sistema de juego en el que está (0 el portero). Nulo: en el banquillo. */
  slot: z.number().int().min(0).max(14).nullable().optional(),
});
export type MatchSquadEntry = z.infer<typeof MatchSquadEntrySchema>;
export const MatchSquadSetSchema = z.object({ players: z.array(MatchSquadEntrySchema).max(30) });
export type MatchSquadSet = z.infer<typeof MatchSquadSetSchema>;

// --- Eventos ---

/**
 * Lo que pasa en un partido, en orden: una acción del catálogo, un cambio (entra `playerId`,
 * sale `relatedPlayerId`), el inicio o el fin de un periodo, o el quinteto inicial.
 */
export const MATCH_EVENT_KINDS = ["action", "sub", "period_start", "period_end", "lineup"] as const;
export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number];
export const MatchEventKindSchema = z.enum(MATCH_EVENT_KINDS);

export const MATCH_SIDES = ["own", "opponent"] as const;
export type MatchSide = (typeof MATCH_SIDES)[number];

/** Zona del medio campo de ataque: fila 1 pegada a la portería, columna 1 a la izquierda del ataque. */
export const MATCH_ZONES = [
  "r1c1",
  "r1c2",
  "r1c3",
  "r2c1",
  "r2c2",
  "r2c3",
  "r3c1",
  "r3c2",
  "r3c3",
] as const;
export type MatchZone = (typeof MATCH_ZONES)[number];
export const MatchZoneSchema = z.enum(MATCH_ZONES);

export const MatchEventCreateSchema = z
  .object({
    /** Id que pone la web para no duplicar si reenvía (idempotencia dentro del partido). */
    clientId: z.string().min(1).max(64).optional(),
    kind: MatchEventKindSchema,
    actionTypeId: z.string().uuid().nullable().optional(),
    playerId: z.string().uuid().nullable().optional(),
    relatedPlayerId: z.string().uuid().nullable().optional(),
    period: z.number().int().min(1).max(10),
    clockMs: z
      .number()
      .int()
      .min(0)
      .max(6 * 60 * 60 * 1000),
    zone: MatchZoneSchema.nullable().optional(),
    /** Quién estaba en pista en ese momento (ids de jugador). */
    onCourt: z.array(z.string().uuid()).max(15),
    note: z.string().trim().max(140).nullable().optional(),
  })
  .refine((e) => e.kind !== "action" || Boolean(e.actionTypeId), {
    message: "Una acción necesita su tipo.",
    path: ["actionTypeId"],
  })
  .refine((e) => e.kind !== "sub" || (Boolean(e.playerId) && Boolean(e.relatedPlayerId)), {
    message: "Un cambio necesita quién entra y quién sale.",
    path: ["playerId"],
  });
export type MatchEventCreate = z.infer<typeof MatchEventCreateSchema>;

/** Alta en lote: la web encola y manda varios de golpe si la red va lenta. */
export const MatchEventsAppendSchema = z.object({
  events: z.array(MatchEventCreateSchema).min(1).max(200),
});
export type MatchEventsAppend = z.infer<typeof MatchEventsAppendSchema>;

// --- Catálogos por deporte ---

export interface MatchActionSeed {
  code: string;
  name: LocalizedText;
  category: MatchActionCategory;
  scope: MatchActionScope;
  ownScore?: number;
  opponentScore?: number;
  countsFoul?: boolean;
  card?: MatchCard;
  requiresZone?: boolean;
  keeperOnly?: boolean;
  weight?: number;
  quick?: boolean;
  mirrorOf?: string;
}

const t = (es: string, ca: string, en: string): LocalizedText => ({ es, ca, en });

/** Acciones comunes a cualquier deporte de portería: lo mínimo para llevar un partido. */
const GOAL_SPORT_ACTIONS: MatchActionSeed[] = [
  {
    code: "goal",
    name: t("Gol", "Gol", "Goal"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    requiresZone: true,
    weight: 5,
    quick: true,
  },
  {
    code: "assist",
    name: t("Asistencia", "Assistència", "Assist"),
    category: "positive",
    scope: "player",
    weight: 3,
    quick: true,
  },
  {
    code: "shot_on_target",
    name: t("Tiro a puerta", "Xut a porteria", "Shot on target"),
    category: "positive",
    scope: "player",
    requiresZone: true,
    weight: 1,
    quick: true,
  },
  {
    code: "shot_off_target",
    name: t("Tiro fuera", "Xut fora", "Shot off target"),
    category: "positive",
    scope: "player",
    requiresZone: true,
    weight: 0.5,
    quick: true,
  },
  {
    code: "steal",
    name: t("Balón robado", "Pilota robada", "Steal"),
    category: "positive",
    scope: "player",
    weight: 1.5,
    quick: true,
  },
  {
    code: "foul_received",
    name: t("Falta recibida", "Falta rebuda", "Foul received"),
    category: "positive",
    scope: "player",
    weight: 1,
    quick: true,
  },
  {
    code: "save",
    name: t("Parada", "Parada", "Save"),
    category: "positive",
    scope: "player",
    keeperOnly: true,
    weight: 2,
    quick: true,
  },
  {
    code: "key_pass",
    name: t("Pase clave", "Passada clau", "Key pass"),
    category: "positive",
    scope: "player",
    weight: 1,
  },
  {
    code: "turnover",
    name: t("Balón perdido", "Pilota perduda", "Turnover"),
    category: "negative",
    scope: "player",
    weight: -1,
    quick: true,
  },
  {
    code: "foul",
    name: t("Falta cometida", "Falta comesa", "Foul committed"),
    category: "negative",
    scope: "player",
    countsFoul: true,
    weight: -1,
    quick: true,
  },
  {
    code: "yellow_card",
    name: t("Tarjeta amarilla", "Targeta groga", "Yellow card"),
    category: "negative",
    scope: "player",
    card: "yellow",
    weight: -2,
    quick: true,
  },
  {
    code: "red_card",
    name: t("Tarjeta roja", "Targeta vermella", "Red card"),
    category: "negative",
    scope: "player",
    card: "red",
    weight: -5,
    quick: true,
  },
  {
    code: "timeout",
    name: t("Tiempo muerto", "Temps mort", "Timeout"),
    category: "neutral",
    scope: "team",
    quick: true,
  },
  {
    code: "corner",
    name: t("Saque de esquina", "Córner", "Corner"),
    category: "neutral",
    scope: "team",
  },
  {
    code: "opp_goal",
    name: t("Gol del rival", "Gol del rival", "Opponent goal"),
    category: "negative",
    scope: "opponent",
    opponentScore: 1,
    quick: true,
    mirrorOf: "goal",
  },
  {
    code: "opp_shot_on_target",
    name: t("Tiro a puerta del rival", "Xut a porteria del rival", "Opponent shot on target"),
    category: "neutral",
    scope: "opponent",
    quick: true,
    mirrorOf: "shot_on_target",
  },
  {
    code: "opp_shot_off_target",
    name: t("Tiro fuera del rival", "Xut fora del rival", "Opponent shot off target"),
    category: "neutral",
    scope: "opponent",
    mirrorOf: "shot_off_target",
  },
  {
    code: "opp_foul",
    name: t("Falta del rival", "Falta del rival", "Opponent foul"),
    category: "neutral",
    scope: "opponent",
    countsFoul: true,
    quick: true,
    mirrorOf: "foul",
  },
  {
    code: "opp_yellow_card",
    name: t("Amarilla al rival", "Groga al rival", "Opponent yellow card"),
    category: "neutral",
    scope: "opponent",
    card: "yellow",
    mirrorOf: "yellow_card",
  },
  {
    code: "opp_red_card",
    name: t("Roja al rival", "Vermella al rival", "Opponent red card"),
    category: "neutral",
    scope: "opponent",
    card: "red",
    mirrorOf: "red_card",
  },
  {
    code: "opp_timeout",
    name: t("Tiempo muerto del rival", "Temps mort del rival", "Opponent timeout"),
    category: "neutral",
    scope: "opponent",
    mirrorOf: "timeout",
  },
];

const BASKETBALL_ACTIONS: MatchActionSeed[] = [
  {
    code: "two_points",
    name: t("Canasta de 2", "Cistella de 2", "2-point field goal"),
    category: "positive",
    scope: "player",
    ownScore: 2,
    requiresZone: true,
    weight: 2,
    quick: true,
  },
  {
    code: "three_points",
    name: t("Triple", "Triple", "3-pointer"),
    category: "positive",
    scope: "player",
    ownScore: 3,
    requiresZone: true,
    weight: 3,
    quick: true,
  },
  {
    code: "free_throw",
    name: t("Tiro libre", "Tir lliure", "Free throw"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    weight: 1,
    quick: true,
  },
  {
    code: "missed_shot",
    name: t("Tiro fallado", "Tir fallat", "Missed shot"),
    category: "negative",
    scope: "player",
    requiresZone: true,
    weight: -0.5,
    quick: true,
  },
  {
    code: "rebound",
    name: t("Rebote", "Rebot", "Rebound"),
    category: "positive",
    scope: "player",
    weight: 1.2,
    quick: true,
  },
  {
    code: "assist",
    name: t("Asistencia", "Assistència", "Assist"),
    category: "positive",
    scope: "player",
    weight: 1.5,
    quick: true,
  },
  {
    code: "steal",
    name: t("Robo", "Robatori", "Steal"),
    category: "positive",
    scope: "player",
    weight: 1.5,
    quick: true,
  },
  {
    code: "block",
    name: t("Tapón", "Tap", "Block"),
    category: "positive",
    scope: "player",
    weight: 1.5,
  },
  {
    code: "turnover",
    name: t("Pérdida", "Pèrdua", "Turnover"),
    category: "negative",
    scope: "player",
    weight: -1,
    quick: true,
  },
  {
    code: "foul",
    name: t("Falta personal", "Falta personal", "Personal foul"),
    category: "negative",
    scope: "player",
    countsFoul: true,
    weight: -1,
    quick: true,
  },
  {
    code: "timeout",
    name: t("Tiempo muerto", "Temps mort", "Timeout"),
    category: "neutral",
    scope: "team",
    quick: true,
  },
  {
    code: "opp_two_points",
    name: t("Canasta de 2 del rival", "Cistella de 2 del rival", "Opponent 2 points"),
    category: "negative",
    scope: "opponent",
    opponentScore: 2,
    quick: true,
    mirrorOf: "two_points",
  },
  {
    code: "opp_three_points",
    name: t("Triple del rival", "Triple del rival", "Opponent 3-pointer"),
    category: "negative",
    scope: "opponent",
    opponentScore: 3,
    quick: true,
    mirrorOf: "three_points",
  },
  {
    code: "opp_free_throw",
    name: t("Tiro libre del rival", "Tir lliure del rival", "Opponent free throw"),
    category: "negative",
    scope: "opponent",
    opponentScore: 1,
    quick: true,
    mirrorOf: "free_throw",
  },
  {
    code: "opp_foul",
    name: t("Falta del rival", "Falta del rival", "Opponent foul"),
    category: "neutral",
    scope: "opponent",
    countsFoul: true,
    quick: true,
    mirrorOf: "foul",
  },
  {
    code: "opp_timeout",
    name: t("Tiempo muerto del rival", "Temps mort del rival", "Opponent timeout"),
    category: "neutral",
    scope: "opponent",
    mirrorOf: "timeout",
  },
];

const VOLLEYBALL_ACTIONS: MatchActionSeed[] = [
  {
    code: "point",
    name: t("Punto", "Punt", "Point"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    weight: 2,
    quick: true,
  },
  {
    code: "ace",
    name: t("Ace", "Ace", "Ace"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    weight: 3,
    quick: true,
  },
  {
    code: "block",
    name: t("Bloqueo", "Bloqueig", "Block"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    weight: 2,
    quick: true,
  },
  {
    code: "dig",
    name: t("Defensa", "Defensa", "Dig"),
    category: "positive",
    scope: "player",
    weight: 1,
    quick: true,
  },
  {
    code: "error",
    name: t("Error", "Error", "Error"),
    category: "negative",
    scope: "player",
    opponentScore: 1,
    weight: -1,
    quick: true,
  },
  {
    code: "timeout",
    name: t("Tiempo muerto", "Temps mort", "Timeout"),
    category: "neutral",
    scope: "team",
    quick: true,
  },
  {
    code: "opp_point",
    name: t("Punto del rival", "Punt del rival", "Opponent point"),
    category: "negative",
    scope: "opponent",
    opponentScore: 1,
    quick: true,
    mirrorOf: "point",
  },
  {
    code: "opp_error",
    name: t("Error del rival", "Error del rival", "Opponent error"),
    category: "positive",
    scope: "opponent",
    ownScore: 1,
    quick: true,
    mirrorOf: "error",
  },
];

/** Catálogo mínimo para un deporte sin propuesta propia: marcador, faltas y tarjetas. */
const GENERIC_ACTIONS: MatchActionSeed[] = [
  {
    code: "point",
    name: t("Punto", "Punt", "Point"),
    category: "positive",
    scope: "player",
    ownScore: 1,
    weight: 2,
    quick: true,
  },
  {
    code: "foul",
    name: t("Falta cometida", "Falta comesa", "Foul committed"),
    category: "negative",
    scope: "player",
    countsFoul: true,
    weight: -1,
    quick: true,
  },
  {
    code: "timeout",
    name: t("Tiempo muerto", "Temps mort", "Timeout"),
    category: "neutral",
    scope: "team",
    quick: true,
  },
  {
    code: "opp_point",
    name: t("Punto del rival", "Punt del rival", "Opponent point"),
    category: "negative",
    scope: "opponent",
    opponentScore: 1,
    quick: true,
    mirrorOf: "point",
  },
  {
    code: "opp_foul",
    name: t("Falta del rival", "Falta del rival", "Opponent foul"),
    category: "neutral",
    scope: "opponent",
    countsFoul: true,
    quick: true,
    mirrorOf: "foul",
  },
];

export const DEFAULT_MATCH_ACTIONS: Record<string, readonly MatchActionSeed[]> = {
  futsal: GOAL_SPORT_ACTIONS,
  football: GOAL_SPORT_ACTIONS,
  handball: GOAL_SPORT_ACTIONS,
  basketball: BASKETBALL_ACTIONS,
  volleyball: VOLLEYBALL_ACTIONS,
};

export const DEFAULT_MATCH_SETTINGS: Record<string, MatchSettings> = {
  futsal: {
    periods: 2,
    periodMinutes: 20,
    playersOnCourt: 5,
    goalkeeper: true,
    foulLimit: 5,
    clock: "up",
    formations: ["1-2-1", "2-2", "3-1", "4-0"],
    zones: true,
  },
  football: {
    periods: 2,
    periodMinutes: 45,
    playersOnCourt: 11,
    goalkeeper: true,
    foulLimit: 0,
    clock: "up",
    formations: ["4-3-3", "4-4-2", "3-4-3", "4-2-3-1"],
    zones: true,
  },
  handball: {
    periods: 2,
    periodMinutes: 30,
    playersOnCourt: 7,
    goalkeeper: true,
    foulLimit: 0,
    clock: "up",
    formations: ["3-2-1", "6-0", "5-1"],
    zones: true,
  },
  basketball: {
    periods: 4,
    periodMinutes: 10,
    playersOnCourt: 5,
    goalkeeper: false,
    foulLimit: 5,
    clock: "up",
    formations: ["2-3", "1-2-2", "3-2"],
    zones: true,
  },
  volleyball: {
    periods: 5,
    periodMinutes: 25,
    playersOnCourt: 6,
    goalkeeper: false,
    foulLimit: 0,
    clock: "up",
    formations: ["3-3"],
    zones: false,
  },
};

const GENERIC_SETTINGS: MatchSettings = {
  periods: 2,
  periodMinutes: 20,
  playersOnCourt: 5,
  goalkeeper: false,
  foulLimit: 0,
  clock: "up",
  formations: [],
  zones: false,
};

export function defaultMatchSettings(sportCode: string): MatchSettings {
  return { ...(DEFAULT_MATCH_SETTINGS[sportCode] ?? GENERIC_SETTINGS) };
}

export function defaultMatchActions(sportCode: string, locale: Locale): MatchActionTypeCreate[] {
  const seeds = DEFAULT_MATCH_ACTIONS[sportCode] ?? GENERIC_ACTIONS;
  return seeds.map((seed) => ({
    code: seed.code,
    name: seed.name[locale],
    category: seed.category,
    scope: seed.scope,
    ownScore: seed.ownScore ?? 0,
    opponentScore: seed.opponentScore ?? 0,
    countsFoul: seed.countsFoul ?? false,
    card: seed.card ?? null,
    requiresZone: seed.requiresZone ?? false,
    keeperOnly: seed.keeperOnly ?? false,
    weight: seed.weight ?? 0,
    quick: seed.quick ?? false,
    mirrorOf: seed.mirrorOf ?? null,
  }));
}

/** Ajustes de un partido: los de la sección con los cambios de ese partido encima. */
export function resolveMatchSettings(
  sportCode: string,
  section: MatchSettingsPatch | null | undefined,
  match: MatchSettingsPatch | null | undefined = null,
): MatchSettings {
  const base = defaultMatchSettings(sportCode);
  const merged = { ...base, ...stripUndefined(section ?? {}), ...stripUndefined(match ?? {}) };
  return MatchSettingsSchema.parse(merged);
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// --- Sistemas de juego ---

export interface FormationSlot {
  /** Índice del hueco (0 el portero si lo hay). */
  slot: number;
  /** Posición en la mitad propia de la pista, en porcentaje (x: 0 portería propia, 100 ataque). */
  x: number;
  y: number;
  goalkeeper: boolean;
}

/**
 * Huecos de un sistema de juego ("1-2-1" son las líneas de pista, sin el portero). Si el sistema
 * no cuadra con los jugadores en pista, se reparten en filas iguales.
 */
export function formationSlots(
  formation: string | null,
  playersOnCourt: number,
  goalkeeper: boolean,
): FormationSlot[] {
  const field = goalkeeper ? playersOnCourt - 1 : playersOnCourt;
  let lines = (formation ?? "")
    .split("-")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (lines.reduce((a, b) => a + b, 0) !== field) {
    const perLine = Math.max(1, Math.ceil(Math.sqrt(field)));
    lines = [];
    let left = field;
    while (left > 0) {
      const n = Math.min(perLine, left);
      lines.push(n);
      left -= n;
    }
  }
  const slots: FormationSlot[] = [];
  let slot = 0;
  if (goalkeeper) slots.push({ slot: slot++, x: 12, y: 50, goalkeeper: true });
  const start = goalkeeper ? 30 : 16;
  const span = 88 - start;
  lines.forEach((count, lineIndex) => {
    const x = lines.length === 1 ? 58 : start + (span * lineIndex) / (lines.length - 1);
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? 50 : 18 + (64 * i) / (count - 1);
      slots.push({ slot: slot++, x, y, goalkeeper: false });
    }
  });
  return slots;
}

/** Minutos y segundos de un instante del cronómetro: `12:34`. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
