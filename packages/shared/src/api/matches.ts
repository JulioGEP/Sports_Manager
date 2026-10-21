import { z } from "zod";
import { HOME_AWAY } from "../events.ts";
import {
  ATTACK_DIRECTIONS,
  MATCH_ACTION_CATEGORIES,
  MATCH_ACTION_SCOPES,
  MATCH_ACTION_STATUSES,
  MATCH_CARDS,
  MATCH_EVENT_KINDS,
  MATCH_SIDES,
  MATCH_STATUSES,
  MATCH_ZONES,
  MatchActionTypeCreateSchema,
  MatchSettingsSchema,
} from "../matches.ts";

/** Contratos del partido en directo (Bloque 19, ADR 0032). Todo bajo el club de la petición. */

export const MatchActionTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.enum(MATCH_ACTION_CATEGORIES),
  scope: z.enum(MATCH_ACTION_SCOPES),
  ownScore: z.number().int(),
  opponentScore: z.number().int(),
  countsFoul: z.boolean(),
  card: z.enum(MATCH_CARDS).nullable(),
  requiresZone: z.boolean(),
  keeperOnly: z.boolean(),
  weight: z.number(),
  quick: z.boolean(),
  mirrorOf: z.string().nullable(),
  sortOrder: z.number().int(),
  status: z.enum(MATCH_ACTION_STATUSES),
});
export type MatchActionType = z.infer<typeof MatchActionTypeSchema>;

/** Configuración del motor en una sección: ajustes, catálogo y lo que propone el deporte. */
export const SectionMatchConfigResponseSchema = z.object({
  section: z.object({ id: z.string(), name: z.string(), sportCode: z.string() }),
  settings: MatchSettingsSchema,
  /** Si la sección ha cambiado algo sobre el deporte. */
  customized: z.boolean(),
  actionTypes: z.array(MatchActionTypeSchema),
  sportDefaults: z.object({
    settings: MatchSettingsSchema,
    actionTypes: z.array(MatchActionTypeCreateSchema),
  }),
  access: z.object({ write: z.boolean() }),
});
export type SectionMatchConfigResponse = z.infer<typeof SectionMatchConfigResponseSchema>;

export const MatchClockResponseSchema = z.object({
  period: z.number().int(),
  elapsedMs: z.number().int(),
  runningSince: z.string().nullable(),
});

export const MatchSummarySchema = z.object({
  id: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
  section: z.object({ id: z.string(), name: z.string(), sportCode: z.string() }),
  season: z.object({ id: z.string(), name: z.string() }),
  opponent: z.string(),
  homeAway: z.enum(HOME_AWAY),
  playedOn: z.string(),
  status: z.enum(MATCH_STATUSES),
  ownScore: z.number().int(),
  opponentScore: z.number().int(),
  eventsCount: z.number().int().nonnegative(),
  squadCount: z.number().int().nonnegative(),
  clock: MatchClockResponseSchema,
  event: z.object({ id: z.string(), title: z.string(), startsAt: z.string() }).nullable(),
  updatedAt: z.string(),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

export const MatchesResponseSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  matches: z.array(MatchSummarySchema),
  /** Partidos de la agenda del equipo sin registro todavía, para abrir uno desde ahí. */
  upcoming: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
      opponent: z.string().nullable(),
      homeAway: z.enum(HOME_AWAY).nullable(),
    }),
  ),
  access: z.object({ write: z.boolean() }),
});
export type MatchesResponse = z.infer<typeof MatchesResponseSchema>;

export const MatchSquadPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  shirtNumber: z.number().int().nullable(),
  position: z.string().nullable(),
  isGoalkeeper: z.boolean(),
  starter: z.boolean(),
  slot: z.number().int().nullable(),
});
export type MatchSquadPlayer = z.infer<typeof MatchSquadPlayerSchema>;

export const MatchEventSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  kind: z.enum(MATCH_EVENT_KINDS),
  actionTypeId: z.string().nullable(),
  actionCode: z.string().nullable(),
  playerId: z.string().nullable(),
  relatedPlayerId: z.string().nullable(),
  side: z.enum(MATCH_SIDES),
  period: z.number().int(),
  clockMs: z.number().int(),
  zone: z.enum(MATCH_ZONES).nullable(),
  onCourt: z.array(z.string()),
  ownScoreDelta: z.number().int(),
  opponentScoreDelta: z.number().int(),
  note: z.string().nullable(),
  clientId: z.string().nullable(),
  createdAt: z.string(),
});
export type MatchEvent = z.infer<typeof MatchEventSchema>;

export const MatchDetailSchema = MatchSummarySchema.extend({
  settings: MatchSettingsSchema,
  formation: z.string().nullable(),
  attackDirection: z.enum(ATTACK_DIRECTIONS),
  notes: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type MatchDetail = z.infer<typeof MatchDetailSchema>;

export const MatchDetailResponseSchema = z.object({
  match: MatchDetailSchema,
  squad: z.array(MatchSquadPlayerSchema),
  /** Plantilla del equipo que no está en la convocatoria, para añadirla. */
  roster: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      shirtNumber: z.number().int().nullable(),
      position: z.string().nullable(),
    }),
  ),
  actionTypes: z.array(MatchActionTypeSchema),
  events: z.array(MatchEventSchema),
  access: z.object({ write: z.boolean() }),
});
export type MatchDetailResponse = z.infer<typeof MatchDetailResponseSchema>;

export const MatchResponseSchema = z.object({ match: MatchDetailSchema });
export const MatchEventsResponseSchema = z.object({
  match: MatchDetailSchema,
  events: z.array(MatchEventSchema),
});
export type MatchEventsResponse = z.infer<typeof MatchEventsResponseSchema>;
export const MatchSquadResponseSchema = z.object({
  match: MatchDetailSchema,
  squad: z.array(MatchSquadPlayerSchema),
});

/** Histórico del equipo: cada partido con su convocatoria y sus eventos, para acumular en la web. */
export const TeamMatchHistoryResponseSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  season: z.object({ id: z.string(), name: z.string() }),
  actionTypes: z.array(MatchActionTypeSchema),
  matches: z.array(
    z.object({
      match: MatchDetailSchema,
      squad: z.array(MatchSquadPlayerSchema),
      events: z.array(MatchEventSchema),
    }),
  ),
});
export type TeamMatchHistoryResponse = z.infer<typeof TeamMatchHistoryResponseSchema>;

/** Línea de un jugador en un partido: lo suyo, ya calculado. */
export const PlayerMatchLineSchema = z.object({
  match: MatchSummarySchema,
  starter: z.boolean(),
  timeMs: z.number().int(),
  scoreFor: z.number().int(),
  scoreAgainst: z.number().int(),
  plusMinus: z.number().int(),
  actions: z.record(z.string(), z.number().int()),
  rating: z.number(),
});
export type PlayerMatchLine = z.infer<typeof PlayerMatchLineSchema>;

export const PlayerMatchesResponseSchema = z.object({
  actionTypes: z.array(MatchActionTypeSchema),
  lines: z.array(PlayerMatchLineSchema),
  totals: z.object({
    matches: z.number().int(),
    starts: z.number().int(),
    timeMs: z.number().int(),
    plusMinus: z.number().int(),
    rating: z.number(),
    actions: z.record(z.string(), z.number().int()),
  }),
});
export type PlayerMatchesResponse = z.infer<typeof PlayerMatchesResponseSchema>;
