import type {
  MatchActionCategory,
  MatchActionScope,
  MatchCard,
  MatchEventKind,
  MatchSettings,
  MatchSide,
  MatchZone,
} from "./matches.ts";
import { MATCH_ZONES } from "./matches.ts";

/**
 * Motor de estadísticas de partido (Bloque 19, ADR 0032). Es una función pura sobre la lista de
 * eventos: la API y la web calculan lo mismo con el mismo código. No sabe de deportes: cuenta lo
 * que el catálogo de acciones dice que hay que contar.
 *
 * Reglas:
 * - Los minutos, el marcador en pista y el +/- de un jugador solo cuentan mientras está en pista.
 * - El marcador sale de los puntos que cada acción suma (gol: 1, triple: 3), nunca a mano.
 * - Las faltas de equipo se cuentan por periodo (en fútbol sala se reinician en cada parte).
 * - Las zonas se guardan ya normalizadas por la dirección de ataque: la fila 1 es la más cercana
 *   a la portería rival y la columna 1 queda a la izquierda del ataque.
 */

export interface StatsActionType {
  id: string;
  code: string;
  name: string;
  category: MatchActionCategory;
  scope: MatchActionScope;
  ownScore: number;
  opponentScore: number;
  countsFoul: boolean;
  card: MatchCard | null;
  requiresZone: boolean;
  keeperOnly: boolean;
  weight: number;
  mirrorOf: string | null;
}

export interface StatsPlayer {
  playerId: string;
  name: string;
  shirtNumber: number | null;
  position: string | null;
  isGoalkeeper: boolean;
  starter: boolean;
}

export interface StatsEvent {
  id: string;
  seq: number;
  kind: MatchEventKind;
  actionTypeId: string | null;
  /** Clave de la acción tal como era al registrarla (el catálogo puede cambiar después). */
  actionCode: string | null;
  playerId: string | null;
  relatedPlayerId: string | null;
  side: MatchSide;
  period: number;
  clockMs: number;
  zone: MatchZone | null;
  onCourt: string[];
  ownScoreDelta: number;
  opponentScoreDelta: number;
}

export interface StatsInput {
  settings: MatchSettings;
  players: StatsPlayer[];
  actionTypes: StatsActionType[];
  events: StatsEvent[];
  /**
   * Para un partido en juego: el periodo y el instante actuales del cronómetro, para cerrar los
   * minutos de quien sigue en pista. En uno acabado no hace falta.
   */
  now?: { period: number; clockMs: number } | undefined;
}

export interface PeriodStats {
  period: number;
  ownScore: number;
  opponentScore: number;
  ownFouls: number;
  opponentFouls: number;
  /** Recuento por acción y lado dentro del periodo. */
  own: Record<string, number>;
  opponent: Record<string, number>;
}

export interface ComparisonRow {
  /** Clave de la acción propia; el rival aporta su espejo. */
  code: string;
  name: string;
  own: number;
  opponent: number;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  shirtNumber: number | null;
  position: string | null;
  isGoalkeeper: boolean;
  starter: boolean;
  /** Tiempo en pista, en milisegundos de cronómetro. */
  timeMs: number;
  /** Puntos propios y del rival mientras estaba en pista. */
  scoreFor: number;
  scoreAgainst: number;
  plusMinus: number;
  /** Recuento por acción (clave del catálogo). */
  actions: Record<string, number>;
  /** Suma de pesos del catálogo: la valoración del partido. */
  rating: number;
  cards: { yellow: number; red: number };
  /** Si acabó el partido en pista o en el banquillo (o expulsado). */
  onCourt: boolean;
  sentOff: boolean;
}

export interface ZoneCell {
  zone: MatchZone;
  /** Por periodo: veces que se hizo cada acción con zona desde ahí. */
  byPeriod: Record<number, Record<string, number>>;
  total: Record<string, number>;
}

export interface MatchStats {
  score: { own: number; opponent: number };
  fouls: { own: number; opponent: number };
  periods: PeriodStats[];
  /** Recuento total por acción y lado. */
  totals: { own: Record<string, number>; opponent: Record<string, number> };
  comparison: ComparisonRow[];
  players: PlayerStats[];
  zones: ZoneCell[];
  /** Tiempo jugado del partido (suma de periodos), en milisegundos de cronómetro. */
  playedMs: number;
  eventsCount: number;
}

const emptyCounts = (): Record<string, number> => ({});
const add = (counts: Record<string, number>, code: string, n = 1) => {
  counts[code] = (counts[code] ?? 0) + n;
};

/** Calcula todas las estadísticas de un partido a partir de sus eventos. */
export function computeMatchStats(input: StatsInput): MatchStats {
  const types = new Map(input.actionTypes.map((t) => [t.id, t]));
  const byCode = new Map(input.actionTypes.map((t) => [t.code, t]));
  const events = [...input.events].sort((a, b) => a.seq - b.seq);

  const periods = new Map<number, PeriodStats>();
  const periodOf = (n: number): PeriodStats => {
    let p = periods.get(n);
    if (!p) {
      p = {
        period: n,
        ownScore: 0,
        opponentScore: 0,
        ownFouls: 0,
        opponentFouls: 0,
        own: emptyCounts(),
        opponent: emptyCounts(),
      };
      periods.set(n, p);
    }
    return p;
  };
  for (let n = 1; n <= input.settings.periods; n++) periodOf(n);

  const players = new Map<string, PlayerStats>();
  for (const p of input.players) {
    players.set(p.playerId, {
      playerId: p.playerId,
      name: p.name,
      shirtNumber: p.shirtNumber,
      position: p.position,
      isGoalkeeper: p.isGoalkeeper,
      starter: p.starter,
      timeMs: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      plusMinus: 0,
      actions: emptyCounts(),
      rating: 0,
      cards: { yellow: 0, red: 0 },
      onCourt: false,
      sentOff: false,
    });
  }
  const playerOf = (id: string | null): PlayerStats | null =>
    id ? (players.get(id) ?? null) : null;

  const totals = { own: emptyCounts(), opponent: emptyCounts() };
  const zones = new Map<MatchZone, ZoneCell>(
    MATCH_ZONES.map((zone) => [zone, { zone, byPeriod: {}, total: emptyCounts() }]),
  );

  /** Quién está en pista y desde qué instante (periodo, ms), para sumar minutos. */
  const onCourt = new Map<string, { period: number; sinceMs: number }>();
  let playedMs = 0;
  let lastPeriod = 0;
  let periodOpenAt: number | null = null;

  const credit = (playerId: string, period: number, untilMs: number) => {
    const stay = onCourt.get(playerId);
    const stats = players.get(playerId);
    if (!stay || !stats) return;
    if (stay.period === period) stats.timeMs += Math.max(0, untilMs - stay.sinceMs);
    onCourt.set(playerId, { period, sinceMs: untilMs });
  };
  const closeAll = (period: number, untilMs: number) => {
    for (const id of onCourt.keys()) credit(id, period, untilMs);
  };
  /** Sincroniza quién está en pista con la foto del evento (cubre cambios no registrados). */
  const syncCourt = (ids: string[], period: number, atMs: number) => {
    const next = new Set(ids);
    for (const id of [...onCourt.keys()]) {
      if (!next.has(id)) {
        credit(id, period, atMs);
        onCourt.delete(id);
        const stats = players.get(id);
        if (stats) stats.onCourt = false;
      }
    }
    for (const id of next) {
      if (!onCourt.has(id)) onCourt.set(id, { period, sinceMs: atMs });
      const stats = players.get(id);
      if (stats) stats.onCourt = true;
    }
  };

  for (const event of events) {
    const period = periodOf(event.period);
    lastPeriod = Math.max(lastPeriod, event.period);
    switch (event.kind) {
      case "lineup": {
        syncCourt(event.onCourt, event.period, event.clockMs);
        break;
      }
      case "period_start": {
        periodOpenAt = event.clockMs;
        // Los que siguen en pista empiezan a contar desde el inicio del nuevo periodo.
        for (const id of onCourt.keys())
          onCourt.set(id, { period: event.period, sinceMs: event.clockMs });
        syncCourt(event.onCourt, event.period, event.clockMs);
        break;
      }
      case "period_end": {
        closeAll(event.period, event.clockMs);
        playedMs += Math.max(0, event.clockMs - (periodOpenAt ?? 0));
        periodOpenAt = null;
        break;
      }
      case "sub": {
        syncCourt(event.onCourt, event.period, event.clockMs);
        const out = playerOf(event.relatedPlayerId);
        if (out && event.relatedPlayerId) {
          credit(event.relatedPlayerId, event.period, event.clockMs);
          onCourt.delete(event.relatedPlayerId);
          out.onCourt = false;
        }
        if (event.playerId && players.has(event.playerId)) {
          onCourt.set(event.playerId, { period: event.period, sinceMs: event.clockMs });
          players.get(event.playerId)!.onCourt = true;
        }
        break;
      }
      case "action": {
        syncCourt(event.onCourt, event.period, event.clockMs);
        const type =
          (event.actionTypeId ? types.get(event.actionTypeId) : undefined) ??
          (event.actionCode ? byCode.get(event.actionCode) : undefined);
        const code = type?.code ?? event.actionCode ?? "unknown";
        const sideCounts = event.side === "own" ? period.own : period.opponent;
        add(sideCounts, code);
        add(totals[event.side], code);
        if (type?.countsFoul) {
          if (event.side === "own") period.ownFouls += 1;
          else period.opponentFouls += 1;
        }
        const ownDelta = event.ownScoreDelta;
        const oppDelta = event.opponentScoreDelta;
        period.ownScore += ownDelta;
        period.opponentScore += oppDelta;
        if (ownDelta !== 0 || oppDelta !== 0) {
          for (const id of onCourt.keys()) {
            const stats = players.get(id);
            if (!stats) continue;
            stats.scoreFor += ownDelta;
            stats.scoreAgainst += oppDelta;
          }
        }
        const actor = playerOf(event.playerId);
        if (actor && event.side === "own") {
          add(actor.actions, code);
          actor.rating += type?.weight ?? 0;
          if (type?.card === "yellow") actor.cards.yellow += 1;
          if (type?.card === "red") {
            actor.cards.red += 1;
            actor.sentOff = true;
            credit(actor.playerId, event.period, event.clockMs);
            onCourt.delete(actor.playerId);
            actor.onCourt = false;
          }
        }
        if (event.zone && (type?.requiresZone || event.zone)) {
          const cell = zones.get(event.zone);
          if (cell) {
            const key = event.side === "own" ? code : `opp:${code}`;
            cell.byPeriod[event.period] ??= emptyCounts();
            add(cell.byPeriod[event.period]!, key);
            add(cell.total, key);
          }
        }
        break;
      }
    }
  }

  // Partido en juego: los que siguen en pista cuentan hasta ahora.
  if (input.now && periodOpenAt !== null) {
    const { period, clockMs } = input.now;
    if (period === lastPeriod || lastPeriod === 0) {
      closeAll(period, clockMs);
      playedMs += Math.max(0, clockMs - periodOpenAt);
    }
  } else if (periodOpenAt !== null) {
    // Periodo abierto sin "ahora": se cierra en el último instante conocido.
    const lastMs = events.length > 0 ? events[events.length - 1]!.clockMs : 0;
    closeAll(lastPeriod, lastMs);
    playedMs += Math.max(0, lastMs - periodOpenAt);
  }

  for (const stats of players.values()) stats.plusMinus = stats.scoreFor - stats.scoreAgainst;

  const score = { own: 0, opponent: 0 };
  const fouls = { own: 0, opponent: 0 };
  for (const p of periods.values()) {
    score.own += p.ownScore;
    score.opponent += p.opponentScore;
    fouls.own += p.ownFouls;
    fouls.opponent += p.opponentFouls;
  }

  const comparison: ComparisonRow[] = input.actionTypes
    .filter((type) => type.scope === "opponent" && type.mirrorOf)
    .map((type) => {
      const own = byCode.get(type.mirrorOf!);
      return {
        code: type.mirrorOf!,
        name: own?.name ?? type.mirrorOf!,
        own: totals.own[type.mirrorOf!] ?? 0,
        opponent: totals.opponent[type.code] ?? 0,
      };
    });

  return {
    score,
    fouls,
    periods: [...periods.values()].sort((a, b) => a.period - b.period),
    totals,
    comparison,
    players: [...players.values()],
    zones: [...zones.values()],
    playedMs,
    eventsCount: events.length,
  };
}

/** Puntos que una acción suma al marcador, según su tipo (para guardarlos con el evento). */
export function scoreDeltaOf(type: { ownScore: number; opponentScore: number }): {
  own: number;
  opponent: number;
} {
  return { own: type.ownScore, opponent: type.opponentScore };
}

// --- Acumulados de varios partidos ---

export interface PlayerAggregate {
  playerId: string;
  name: string;
  matches: number;
  starts: number;
  timeMs: number;
  scoreFor: number;
  scoreAgainst: number;
  plusMinus: number;
  actions: Record<string, number>;
  rating: number;
  cards: { yellow: number; red: number };
}

export interface MatchAggregate {
  matches: number;
  won: number;
  drawn: number;
  lost: number;
  score: { own: number; opponent: number };
  totals: { own: Record<string, number>; opponent: Record<string, number> };
  comparison: ComparisonRow[];
  players: PlayerAggregate[];
  zones: ZoneCell[];
  playedMs: number;
}

/** Suma las estadísticas de varios partidos (un jugador se identifica por su id). */
export function aggregateMatchStats(
  all: MatchStats[],
  actionTypes: StatsActionType[],
): MatchAggregate {
  const byCode = new Map(actionTypes.map((t) => [t.code, t]));
  const result: MatchAggregate = {
    matches: all.length,
    won: 0,
    drawn: 0,
    lost: 0,
    score: { own: 0, opponent: 0 },
    totals: { own: emptyCounts(), opponent: emptyCounts() },
    comparison: [],
    players: [],
    zones: MATCH_ZONES.map((zone) => ({ zone, byPeriod: {}, total: emptyCounts() })),
    playedMs: 0,
  };
  const players = new Map<string, PlayerAggregate>();
  for (const stats of all) {
    result.score.own += stats.score.own;
    result.score.opponent += stats.score.opponent;
    if (stats.score.own > stats.score.opponent) result.won += 1;
    else if (stats.score.own < stats.score.opponent) result.lost += 1;
    else result.drawn += 1;
    result.playedMs += stats.playedMs;
    for (const side of ["own", "opponent"] as const) {
      for (const [code, n] of Object.entries(stats.totals[side])) add(result.totals[side], code, n);
    }
    for (const cell of stats.zones) {
      const target = result.zones.find((z) => z.zone === cell.zone)!;
      for (const [key, n] of Object.entries(cell.total)) add(target.total, key, n);
      for (const [period, counts] of Object.entries(cell.byPeriod)) {
        const p = Number(period);
        const bucket = (target.byPeriod[p] ??= emptyCounts());
        for (const [key, n] of Object.entries(counts)) add(bucket, key, n);
      }
    }
    for (const p of stats.players) {
      const played = p.timeMs > 0 || Object.keys(p.actions).length > 0 || p.starter;
      if (!played) continue;
      let agg = players.get(p.playerId);
      if (!agg) {
        agg = {
          playerId: p.playerId,
          name: p.name,
          matches: 0,
          starts: 0,
          timeMs: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          plusMinus: 0,
          actions: emptyCounts(),
          rating: 0,
          cards: { yellow: 0, red: 0 },
        };
        players.set(p.playerId, agg);
      }
      agg.matches += 1;
      if (p.starter) agg.starts += 1;
      agg.timeMs += p.timeMs;
      agg.scoreFor += p.scoreFor;
      agg.scoreAgainst += p.scoreAgainst;
      agg.plusMinus += p.plusMinus;
      agg.rating += p.rating;
      agg.cards.yellow += p.cards.yellow;
      agg.cards.red += p.cards.red;
      for (const [code, n] of Object.entries(p.actions)) add(agg.actions, code, n);
    }
  }
  result.players = [...players.values()];
  result.comparison = actionTypes
    .filter((type) => type.scope === "opponent" && type.mirrorOf)
    .map((type) => ({
      code: type.mirrorOf!,
      name: byCode.get(type.mirrorOf!)?.name ?? type.mirrorOf!,
      own: result.totals.own[type.mirrorOf!] ?? 0,
      opponent: result.totals.opponent[type.code] ?? 0,
    }));
  return result;
}

/** Minutos redondeados de un tiempo de cronómetro. */
export function clockMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}
