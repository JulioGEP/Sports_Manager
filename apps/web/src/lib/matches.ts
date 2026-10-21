import {
  computeMatchStats,
  type MatchActionType,
  type MatchDetail,
  type MatchEvent,
  type MatchSquadPlayer,
  type MatchStats,
  type StatsActionType,
  type StatsEvent,
  type StatsPlayer,
} from "@sportsmanager/shared";

/**
 * Puente entre lo que devuelve la API y el motor de estadísticas compartido (Bloque 19).
 * La web calcula las estadísticas en el navegador con el mismo motor que la API.
 */

export function statsPlayersOf(squad: MatchSquadPlayer[]): StatsPlayer[] {
  return squad.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    shirtNumber: p.shirtNumber,
    position: p.position,
    isGoalkeeper: p.isGoalkeeper,
    starter: p.starter,
  }));
}

export function statsTypesOf(types: MatchActionType[]): StatsActionType[] {
  return types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category,
    scope: t.scope,
    ownScore: t.ownScore,
    opponentScore: t.opponentScore,
    countsFoul: t.countsFoul,
    card: t.card,
    requiresZone: t.requiresZone,
    keeperOnly: t.keeperOnly,
    weight: t.weight,
    mirrorOf: t.mirrorOf,
  }));
}

export function statsEventsOf(events: MatchEvent[]): StatsEvent[] {
  return events.map((e) => ({
    id: e.id,
    seq: e.seq,
    kind: e.kind,
    actionTypeId: e.actionTypeId,
    actionCode: e.actionCode,
    playerId: e.playerId,
    relatedPlayerId: e.relatedPlayerId,
    side: e.side,
    period: e.period,
    clockMs: e.clockMs,
    zone: e.zone,
    onCourt: e.onCourt,
    ownScoreDelta: e.ownScoreDelta,
    opponentScoreDelta: e.opponentScoreDelta,
  }));
}

/** Estadísticas de un partido tal como lo devuelve la API, en juego o acabado. */
export function statsOf(
  match: MatchDetail,
  squad: MatchSquadPlayer[],
  actionTypes: MatchActionType[],
  events: MatchEvent[],
  options: { period?: number | undefined; nowMs?: number | undefined } = {},
): MatchStats {
  const filtered = options.period ? events.filter((e) => e.period === options.period) : events;
  return computeMatchStats({
    settings: match.settings,
    players: statsPlayersOf(squad),
    actionTypes: statsTypesOf(actionTypes),
    events: statsEventsOf(filtered),
    now:
      match.status === "live"
        ? { period: match.clock.period, clockMs: options.nowMs ?? elapsedOf(match.clock) }
        : undefined,
  });
}

/** Instante actual del cronómetro: lo guardado más lo que ha corrido desde que se puso en marcha. */
export function elapsedOf(clock: MatchDetail["clock"], now = Date.now()): number {
  if (!clock.runningSince) return clock.elapsedMs;
  return clock.elapsedMs + Math.max(0, now - new Date(clock.runningSince).getTime());
}

/** Valor del marcador de un tipo de acción para mostrar junto al nombre ("+3"). */
export function scoreBadge(type: MatchActionType): string | null {
  if (type.ownScore > 0) return `+${type.ownScore}`;
  if (type.opponentScore > 0) return `+${type.opponentScore}`;
  return null;
}

/** Id de cliente para la idempotencia de los eventos. */
export function clientEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Formato corto de una valoración: una cifra con un decimal como mucho. */
export function formatRating(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** `+2`, `0`, `-1`. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
