import type { MatchStats, StatsActionType, StatsEvent } from "./match-stats.ts";
import type { MatchSettings } from "./matches.ts";
import {
  addDays,
  daysBetween,
  loadBetween,
  loadMetrics,
  dailyTotals,
  weekStartOf,
  type DailyLoad,
} from "./training-load.ts";
import type {
  AvailabilityStatus,
  InsightThresholds,
  RestrictionTag,
  SessionBlock,
  SessionStatus,
  TrainingContentKind,
} from "./training.ts";

/**
 * Recomendaciones "A tener en cuenta" (Bloque 23, ADR 0038): un motor de reglas explicables. Cruza
 * partidos, calendario, sesiones, carga, bienestar, disponibilidad y la ficha de cada jugador, y
 * devuelve qué tener en cuenta con la cifra que lo justifica y una propuesta. Nada de caja negra:
 * cada regla es una función corta con su umbral (`InsightThresholds`), y una regla que no tiene
 * datos (un club que no registra córners) simplemente no salta.
 *
 * El texto no vive aquí: cada recomendación lleva su regla y sus valores, y la web la pinta en el
 * idioma de quien la lee. Se calculan al pedirlas; solo se guarda lo que responde el cuerpo técnico.
 */

export const INSIGHT_RULES = [
  "finishing_drop",
  "turnovers_up",
  "early_fouls",
  "late_goals",
  "corners_no_goal",
  "known_opponent",
  "md_plus_one",
  "double_match_week",
  "weekly_load",
  "content_gap",
  "drill_low_rating",
  "restriction_conflict",
  "wellness_drop",
  "acwr",
  "return_progression",
  "rpe_above_target",
  "focus_gap",
  "strength",
  "low_attendance",
  "minutes_balance",
] as const;
export type InsightRule = (typeof INSIGHT_RULES)[number];

export const INSIGHT_LEVELS = ["alert", "attention", "info"] as const;
export type InsightLevel = (typeof INSIGHT_LEVELS)[number];

/** Reglas que usan carga o bienestar individual: solo para quien lee la carga (`org.load.read`). */
export const LOAD_INSIGHT_RULES: readonly InsightRule[] = [
  "wellness_drop",
  "acwr",
  "return_progression",
  "rpe_above_target",
];

export const INSIGHT_OUTCOMES = ["applied", "dismissed"] as const;
export type InsightOutcome = (typeof INSIGHT_OUTCOMES)[number];

export interface InsightContent {
  id: string;
  code: string;
  name: string;
  kind: TrainingContentKind;
  relatedActionCodes: string[];
  status: "active" | "archived";
}

export interface InsightMatch {
  id: string;
  playedOn: string;
  opponent: string;
  ownScore: number;
  opponentScore: number;
  settings: MatchSettings;
  actionTypes: StatsActionType[];
  events: StatsEvent[];
  stats: MatchStats;
}

export interface InsightSessionItem {
  drillId: string | null;
  title: string;
  block: SessionBlock;
  minutes: number;
  targetRpe: number | null;
  contentIds: string[];
  restrictionTags: RestrictionTag[];
  /** Nulo: toda la plantilla. */
  playerIds: string[] | null;
  rating: number | null;
}

export interface InsightSession {
  id: string;
  date: string;
  status: SessionStatus;
  targetRpe: number | null;
  items: InsightSessionItem[];
  /** Carga prevista del equipo: suma de minutos × RPE objetivo de las tareas (o de la sesión). */
  plannedLoad: number;
  /** Carga real media por jugador (RPE × minutos), si se cerró con RPE. */
  actualLoad: number | null;
}

export interface InsightPlayer {
  id: string;
  name: string;
  isGoalkeeper: boolean;
  availability: {
    status: AvailabilityStatus;
    restrictions: RestrictionTag[];
    maxMinutes: number | null;
  };
  /** Periodos de baja o readaptación ya cerrados. */
  pastUnavailability: { fromOn: string; endedOn: string }[];
  /** Carga diaria de sesiones, partidos y extra. */
  loads: DailyLoad[];
  /** RPE declarado en cada sesión. */
  sessionRpe: { sessionId: string; date: string; rpe: number }[];
  wellness: { date: string; score: number; soreness: number }[];
  focus: { contentIds: string[]; objectiveTitle: string | null; reviewOn: string | null };
}

export interface InsightsInput {
  /** Fecha de referencia (hoy, o el día de la semana que se planifica). */
  today: string;
  thresholds: InsightThresholds;
  /** Equipo formativo: se vigila el reparto de minutos. */
  formative: boolean;
  contents: InsightContent[];
  /** Partidos acabados de la temporada, del más antiguo al más reciente. */
  matches: InsightMatch[];
  /** Partidos por jugar o de la semana (agenda y registro), con el rival si se sabe. */
  fixtures: { date: string; opponent: string | null }[];
  /** Sesiones de las últimas semanas y de la semana que viene. */
  sessions: InsightSession[];
  /** Pase de lista de los entrenamientos de las últimas cuatro semanas. */
  attendance: { playerId: string; date: string; status: "present" | "absent" | "excused" }[];
  cycle: { startsOn: string; endsOn: string; focusContentIds: string[] } | null;
  players: InsightPlayer[];
  /** Sesión que se está mirando (conflictos y grupos); si no, la siguiente sin cerrar. */
  sessionId?: string | null;
}

export interface Insight {
  rule: InsightRule;
  level: InsightLevel;
  /** Identifica el caso: una respuesta del cuerpo técnico lo silencia sin silenciar la regla. */
  fingerprint: string;
  playerId: string | null;
  /** Cifras y nombres que justifican la recomendación (el texto lo pone la web). */
  values: Record<string, string | number>;
  /** Contenidos propuestos, por id. */
  contentIds: string[];
  matchId?: string;
  sessionId?: string;
  /** Grupos propuestos (MD+1: recuperación y compensatorio). */
  groups?: { key: "recovery" | "compensatory"; playerIds: string[] }[];
}

const pct = (n: number) => Math.round(n * 100);
const round1 = (n: number) => Math.round(n * 10) / 10;
const LEVEL_ORDER: Record<InsightLevel, number> = { alert: 0, attention: 1, info: 2 };

/** Calcula todas las recomendaciones del equipo y de sus jugadores, de la más urgente a la menos. */
export function computeInsights(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  const rules = [
    finishingDrop,
    turnoversUp,
    earlyFouls,
    lateGoals,
    cornersNoGoal,
    knownOpponent,
    mdPlusOne,
    doubleMatchWeek,
    weeklyLoad,
    contentGap,
    drillLowRating,
    restrictionConflict,
    wellnessDrop,
    acwr,
    returnProgression,
    rpeAboveTarget,
    focusGap,
    strengths,
    lowAttendance,
    minutesBalance,
  ];
  for (const rule of rules) out.push(...rule(input));
  return out.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      Number(a.playerId !== null) - Number(b.playerId !== null) ||
      INSIGHT_RULES.indexOf(a.rule) - INSIGHT_RULES.indexOf(b.rule),
  );
}

// --- Utilidades ---

/** Contenidos útiles para unas acciones: primero los de código preferido, luego por acciones. */
export function pickContents(
  contents: readonly InsightContent[],
  actionCodes: readonly string[],
  preferredCodes: readonly string[] = [],
  limit = 2,
): string[] {
  const active = contents.filter((c) => c.status === "active");
  const picked: string[] = [];
  for (const code of preferredCodes) {
    const found = active.find((c) => c.code === code);
    if (found && !picked.includes(found.id)) picked.push(found.id);
  }
  const scored = active
    .map((c) => ({ c, score: c.relatedActionCodes.filter((a) => actionCodes.includes(a)).length }))
    .filter((x) => x.score > 0 && !picked.includes(x.c.id))
    .sort((a, b) => b.score - a.score);
  for (const { c } of scored) picked.push(c.id);
  return picked.slice(0, limit);
}

const lastN = <T>(list: readonly T[], n: number) => list.slice(Math.max(0, list.length - n));

function ownCount(matches: readonly InsightMatch[], codes: readonly string[]): number {
  return matches.reduce(
    (sum, m) => sum + codes.reduce((s, code) => s + (m.stats.totals.own[code] ?? 0), 0),
    0,
  );
}

const SHOT_CODES = ["goal", "shot_on_target", "shot_off_target"];

function shotAccuracy(matches: readonly InsightMatch[]): { goals: number; shots: number } {
  return { goals: ownCount(matches, ["goal"]), shots: ownCount(matches, SHOT_CODES) };
}

function playerById(input: InsightsInput) {
  return new Map(input.players.map((p) => [p.id, p]));
}

/** La sesión que se mira: la indicada, o la siguiente sin cerrar desde hoy. */
function focusSession(input: InsightsInput): InsightSession | null {
  if (input.sessionId) return input.sessions.find((s) => s.id === input.sessionId) ?? null;
  return (
    input.sessions
      .filter((s) => s.date >= input.today && (s.status === "draft" || s.status === "planned"))
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

const includesPlayer = (item: InsightSessionItem, playerId: string) =>
  item.playerIds === null || item.playerIds.includes(playerId);

// --- Equipo, desde los partidos ---

/** 1. El acierto en el tiro de los últimos tres partidos cae frente a la media de la temporada. */
function finishingDrop(input: InsightsInput): Insight[] {
  const { matches, thresholds } = input;
  if (matches.length < 4) return [];
  const recent = lastN(matches, 3);
  const r = shotAccuracy(recent);
  const s = shotAccuracy(matches);
  if (r.shots < 6 || s.shots === 0) return [];
  const recentAcc = r.goals / r.shots;
  const seasonAcc = s.goals / s.shots;
  if ((seasonAcc - recentAcc) * 100 < thresholds.finishingDropPoints) return [];
  // La zona con más tiros y menos acierto de esos tres partidos, si hay mapa.
  const zones = new Map<string, { goals: number; shots: number }>();
  for (const m of recent)
    for (const cell of m.stats.zones) {
      const z = zones.get(cell.zone) ?? { goals: 0, shots: 0 };
      z.goals += cell.total.goal ?? 0;
      z.shots += SHOT_CODES.reduce((a, code) => a + (cell.total[code] ?? 0), 0);
      zones.set(cell.zone, z);
    }
  const worst = [...zones.entries()]
    .filter(([, z]) => z.shots >= 3)
    .sort(
      (a, b) => a[1].goals / a[1].shots - b[1].goals / b[1].shots || b[1].shots - a[1].shots,
    )[0];
  return [
    {
      rule: "finishing_drop",
      level: "attention",
      fingerprint: `finishing_drop:team:${recent.at(-1)!.id}`,
      playerId: null,
      values: {
        recent: pct(recentAcc),
        season: pct(seasonAcc),
        matches: recent.length,
        zone: worst ? worst[0] : "",
      },
      contentIds: pickContents(input.contents, SHOT_CODES, ["finishing"]),
    },
  ];
}

/** 2. Las pérdidas de los últimos tres partidos suben frente a la media de la temporada. */
function turnoversUp(input: InsightsInput): Insight[] {
  const { matches, thresholds } = input;
  if (matches.length < 4) return [];
  const recent = lastN(matches, 3);
  const recentAvg = ownCount(recent, ["turnover"]) / recent.length;
  const seasonAvg = ownCount(matches, ["turnover"]) / matches.length;
  if (seasonAvg === 0 || recentAvg < 3 || recentAvg / seasonAvg < thresholds.turnoverRatio)
    return [];
  return [
    {
      rule: "turnovers_up",
      level: "attention",
      fingerprint: `turnovers_up:team:${recent.at(-1)!.id}`,
      playerId: null,
      values: { recent: round1(recentAvg), season: round1(seasonAvg), matches: recent.length },
      contentIds: pickContents(input.contents, ["turnover"], ["build_up"]),
    },
  ];
}

/** 3. El equipo llega al tope de faltas antes del minuto fijado en dos de los últimos tres. */
function earlyFouls(input: InsightsInput): Insight[] {
  const recent = lastN(input.matches, 3);
  if (recent.length < 2) return [];
  const minute = input.thresholds.earlyFoulMinute;
  let early = 0;
  let limit = 0;
  for (const m of recent) {
    limit = m.settings.foulLimit;
    if (limit <= 0) continue;
    const foulCodes = new Set(
      m.actionTypes.filter((t) => t.countsFoul && t.scope !== "opponent").map((t) => t.code),
    );
    const byPeriod = new Map<number, number[]>();
    for (const e of m.events) {
      if (e.kind !== "action" || e.side !== "own" || !e.actionCode || !foulCodes.has(e.actionCode))
        continue;
      byPeriod.set(e.period, [...(byPeriod.get(e.period) ?? []), e.clockMs]);
    }
    const reached = [...byPeriod.values()].some((times) => {
      const sorted = times.sort((a, b) => a - b);
      return sorted.length >= limit && sorted[limit - 1]! < minute * 60_000;
    });
    if (reached) early += 1;
  }
  if (early < 2 || limit <= 0) return [];
  return [
    {
      rule: "early_fouls",
      level: "attention",
      fingerprint: `early_fouls:team:${recent.at(-1)!.id}`,
      playerId: null,
      values: { matches: early, of: recent.length, limit, minute },
      contentIds: pickContents(input.contents, ["foul"], ["defending_without_fouls"]),
    },
  ];
}

/** 4. Buena parte de los goles en contra llega en los últimos minutos de cada parte. */
function lateGoals(input: InsightsInput): Insight[] {
  const recent = lastN(input.matches, 5);
  const { lateMinutes, lateGoalsShare } = input.thresholds;
  let total = 0;
  let late = 0;
  for (const m of recent) {
    const lateFrom = Math.max(0, m.settings.periodMinutes - lateMinutes) * 60_000;
    for (const e of m.events) {
      if (e.opponentScoreDelta <= 0) continue;
      total += e.opponentScoreDelta;
      if (e.clockMs >= lateFrom) late += e.opponentScoreDelta;
    }
  }
  if (total < 4 || late / total < lateGoalsShare) return [];
  return [
    {
      rule: "late_goals",
      level: "attention",
      fingerprint: `late_goals:team:${recent.at(-1)!.id}`,
      playerId: null,
      values: {
        late,
        total,
        share: pct(late / total),
        minutes: lateMinutes,
        matches: recent.length,
      },
      contentIds: pickContents(input.contents, [], ["intermittent_endurance", "concentration"]),
    },
  ];
}

/** 5. Muchos córners a favor y ningún gol en los diez segundos siguientes. */
function cornersNoGoal(input: InsightsInput): Insight[] {
  const recent = lastN(input.matches, 5);
  let corners = 0;
  let goalsAfter = 0;
  for (const m of recent) {
    const own = m.events.filter((e) => e.side === "own");
    for (const c of own.filter((e) => e.actionCode === "corner")) {
      corners += 1;
      const scored = own.some(
        (e) =>
          e.ownScoreDelta > 0 &&
          e.period === c.period &&
          e.clockMs >= c.clockMs &&
          e.clockMs - c.clockMs <= 10_000,
      );
      if (scored) goalsAfter += 1;
    }
  }
  if (corners < 8 || goalsAfter > 0) return [];
  return [
    {
      rule: "corners_no_goal",
      level: "info",
      fingerprint: `corners_no_goal:team:${recent.at(-1)!.id}`,
      playerId: null,
      values: { corners, matches: recent.length },
      contentIds: pickContents(input.contents, ["corner"], ["set_piece_attack"]),
    },
  ];
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** 6. El próximo rival ya se jugó: el resumen de aquel partido. */
function knownOpponent(input: InsightsInput): Insight[] {
  const next = input.fixtures
    .filter((f) => f.date >= input.today && f.opponent)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next?.opponent) return [];
  const previous = [...input.matches]
    .reverse()
    .find((m) => normalize(m.opponent) === normalize(next.opponent!));
  if (!previous) return [];
  return [
    {
      rule: "known_opponent",
      level: "info",
      fingerprint: `known_opponent:team:${previous.id}:${next.date}`,
      playerId: null,
      values: {
        opponent: next.opponent,
        date: next.date,
        playedOn: previous.playedOn,
        own: previous.ownScore,
        against: previous.opponentScore,
      },
      contentIds: [],
      matchId: previous.id,
    },
  ];
}

// --- Calendario y carga del equipo ---

/** 7. El día después del partido: recuperación para quien jugó mucho, compensatorio para el resto. */
function mdPlusOne(input: InsightsInput): Insight[] {
  const last = input.matches.at(-1);
  if (!last) return [];
  const since = daysBetween(last.playedOn, input.today);
  if (since < 0 || since > 2) return [];
  const { recoveryMinutes, compensatoryMinutes } = input.thresholds;
  const minutes = new Map(last.stats.players.map((p) => [p.playerId, p.timeMs / 60_000]));
  const recovery: string[] = [];
  const compensatory: string[] = [];
  for (const p of input.players) {
    if (p.availability.status === "out" || p.availability.status === "rehab") continue;
    const played = minutes.get(p.id) ?? 0;
    if (played >= recoveryMinutes) recovery.push(p.id);
    else if (played < compensatoryMinutes) compensatory.push(p.id);
  }
  if (recovery.length === 0 && compensatory.length === 0) return [];
  return [
    {
      rule: "md_plus_one",
      level: "info",
      fingerprint: `md_plus_one:team:${last.id}`,
      playerId: null,
      values: {
        opponent: last.opponent,
        recovery: recovery.length,
        compensatory: compensatory.length,
        recoveryMinutes,
        compensatoryMinutes,
      },
      contentIds: pickContents(input.contents, [], ["injury_prevention", "intermittent_endurance"]),
      matchId: last.id,
      groups: [
        { key: "recovery", playerIds: recovery },
        { key: "compensatory", playerIds: compensatory },
      ],
    },
  ];
}

/** 8. Dos partidos en la misma semana: menos volumen. */
function doubleMatchWeek(input: InsightsInput): Insight[] {
  const monday = weekStartOf(input.today);
  const sunday = addDays(monday, 6);
  const dates = new Set(
    [...input.fixtures.map((f) => f.date), ...input.matches.map((m) => m.playedOn)].filter(
      (d) => d >= monday && d <= sunday,
    ),
  );
  if (dates.size < 2) return [];
  return [
    {
      rule: "double_match_week",
      level: "info",
      fingerprint: `double_match_week:team:${monday}`,
      playerId: null,
      values: { matches: dates.size, week: monday },
      contentIds: [],
    },
  ];
}

/** 9. La carga planificada de la semana se sale de la media de las cuatro anteriores. */
function weeklyLoad(input: InsightsInput): Insight[] {
  const monday = weekStartOf(input.today);
  const inWeek = (s: InsightSession, start: string) =>
    s.date >= start && s.date <= addDays(start, 6) && s.status !== "cancelled";
  const planned = input.sessions
    .filter((s) => inWeek(s, monday))
    .reduce((a, s) => a + s.plannedLoad, 0);
  if (planned <= 0) return [];
  const previous: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const start = addDays(monday, -7 * w);
    const total = input.sessions
      .filter((s) => inWeek(s, start))
      .reduce((a, s) => a + (s.actualLoad ?? s.plannedLoad), 0);
    if (total > 0) previous.push(total);
  }
  if (previous.length < 2) return [];
  const baseline = previous.reduce((a, b) => a + b, 0) / previous.length;
  const ratio = planned / baseline;
  const { weeklyLoadHigh, weeklyLoadLow } = input.thresholds;
  if (ratio <= weeklyLoadHigh && ratio >= weeklyLoadLow) return [];
  return [
    {
      rule: "weekly_load",
      level: ratio > weeklyLoadHigh ? "attention" : "info",
      fingerprint: `weekly_load:team:${monday}:${ratio > weeklyLoadHigh ? "high" : "low"}`,
      playerId: null,
      values: {
        planned: Math.round(planned),
        baseline: Math.round(baseline),
        ratio: Math.round(ratio * 100) / 100,
        direction: ratio > weeklyLoadHigh ? "high" : "low",
      },
      contentIds: [],
    },
  ];
}

/** Minutos por contenido en un rango de fechas, en sesiones no canceladas. */
function minutesByContent(
  sessions: readonly InsightSession[],
  from: string,
  to: string,
  playerId?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (s.date < from || s.date > to || s.status === "cancelled") continue;
    for (const item of s.items) {
      if (playerId && !includesPlayer(item, playerId)) continue;
      for (const c of item.contentIds) out.set(c, (out.get(c) ?? 0) + item.minutes);
    }
  }
  return out;
}

/** 10. Un contenido del ciclo sin minutos en las dos últimas semanas. */
function contentGap(input: InsightsInput): Insight[] {
  const cycle = input.cycle;
  if (!cycle || input.today < cycle.startsOn || input.today > cycle.endsOn) return [];
  const from =
    cycle.startsOn > addDays(input.today, -13) ? cycle.startsOn : addDays(input.today, -13);
  if (daysBetween(from, input.today) < 6) return [];
  const minutes = minutesByContent(input.sessions, from, input.today);
  const monday = weekStartOf(input.today);
  return cycle.focusContentIds
    .filter((id) => (minutes.get(id) ?? 0) === 0)
    .filter((id) => input.contents.some((c) => c.id === id && c.status === "active"))
    .slice(0, 3)
    .map((id) => ({
      rule: "content_gap" as const,
      level: "info" as const,
      fingerprint: `content_gap:team:${id}:${monday}`,
      playerId: null,
      values: {
        content: input.contents.find((c) => c.id === id)!.name,
        days: daysBetween(from, input.today) + 1,
      },
      contentIds: [id],
    }));
}

/** 11. Una tarea repetida que no funciona: alternativas con el mismo contenido. */
function drillLowRating(input: InsightsInput): Insight[] {
  const from = addDays(input.today, -27);
  const byDrill = new Map<
    string,
    { title: string; low: number; uses: number; contents: string[] }
  >();
  for (const s of input.sessions) {
    if (s.date < from || s.date > input.today) continue;
    for (const item of s.items) {
      if (!item.drillId) continue;
      const d = byDrill.get(item.drillId) ?? {
        title: item.title,
        low: 0,
        uses: 0,
        contents: item.contentIds,
      };
      d.uses += 1;
      if (item.rating === 1) d.low += 1;
      byDrill.set(item.drillId, d);
    }
  }
  return [...byDrill.entries()]
    .filter(([, d]) => d.low >= 2)
    .slice(0, 2)
    .map(([drillId, d]) => ({
      rule: "drill_low_rating" as const,
      level: "info" as const,
      fingerprint: `drill_low_rating:team:${drillId}:${d.low}`,
      playerId: null,
      values: { task: d.title, low: d.low, uses: d.uses },
      contentIds: d.contents.slice(0, 2),
    }));
}

// --- Jugador ---

/** 12. Una restricción vigente choca con una tarea de la sesión, o se pasan sus minutos máximos. */
function restrictionConflict(input: InsightsInput): Insight[] {
  const session = focusSession(input);
  if (!session) return [];
  const out: Insight[] = [];
  for (const p of input.players) {
    const { status, restrictions, maxMinutes } = p.availability;
    if (status === "available") continue;
    const items = session.items.filter((i) => i.block !== "rehab" && includesPlayer(i, p.id));
    const explicit = items.filter((i) => i.playerIds !== null);
    if (status === "out" || status === "rehab") {
      if (explicit.length === 0) continue;
      out.push({
        rule: "restriction_conflict",
        level: "alert",
        fingerprint: `restriction_conflict:${p.id}:${session.id}:${status}`,
        playerId: p.id,
        values: { name: p.name, status, task: explicit[0]!.title, tags: "", minutes: 0, max: 0 },
        contentIds: [],
        sessionId: session.id,
      });
      continue;
    }
    const clashing = items.filter((i) => i.restrictionTags.some((t) => restrictions.includes(t)));
    const total = items.reduce((a, i) => a + i.minutes, 0);
    if (clashing.length > 0) {
      const tags = [
        ...new Set(
          clashing.flatMap((i) => i.restrictionTags.filter((t) => restrictions.includes(t))),
        ),
      ];
      out.push({
        rule: "restriction_conflict",
        level: "alert",
        fingerprint: `restriction_conflict:${p.id}:${session.id}:${tags.join(",")}`,
        playerId: p.id,
        values: {
          name: p.name,
          status,
          task: clashing.map((i) => i.title).join(", "),
          tags: tags.join(","),
          minutes: total,
          max: maxMinutes ?? 0,
        },
        contentIds: [],
        sessionId: session.id,
      });
    } else if (maxMinutes !== null && total > maxMinutes) {
      out.push({
        rule: "restriction_conflict",
        level: "attention",
        fingerprint: `restriction_conflict:${p.id}:${session.id}:minutes`,
        playerId: p.id,
        values: { name: p.name, status, task: "", tags: "", minutes: total, max: maxMinutes },
        contentIds: [],
        sessionId: session.id,
      });
    }
  }
  return out;
}

/** 13. Dolor muscular alto, o bienestar por debajo de su media dos días seguidos. */
function wellnessDrop(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  for (const p of input.players) {
    const entries = [...p.wellness].sort((a, b) => a.date.localeCompare(b.date));
    const last = entries.at(-1);
    if (!last || daysBetween(last.date, input.today) > 2 || last.date > input.today) continue;
    if (last.soreness <= 2) {
      out.push({
        rule: "wellness_drop",
        level: last.soreness === 1 ? "alert" : "attention",
        fingerprint: `wellness_drop:${p.id}:${last.date}:soreness`,
        playerId: p.id,
        values: {
          name: p.name,
          soreness: last.soreness,
          score: last.score,
          mean: 0,
          kind: "soreness",
        },
        contentIds: [],
      });
      continue;
    }
    const previous = entries.filter(
      (e) => e.date < addDays(last.date, -1) && e.date >= addDays(input.today, -28),
    );
    if (previous.length < 5) continue;
    const mean = previous.reduce((a, e) => a + e.score, 0) / previous.length;
    const before = entries.at(-2);
    if (
      before &&
      daysBetween(before.date, last.date) <= 2 &&
      last.score <= mean - 3 &&
      before.score <= mean - 3
    ) {
      out.push({
        rule: "wellness_drop",
        level: "attention",
        fingerprint: `wellness_drop:${p.id}:${last.date}:score`,
        playerId: p.id,
        values: {
          name: p.name,
          soreness: last.soreness,
          score: last.score,
          mean: round1(mean),
          kind: "score",
        },
        contentIds: [],
      });
    }
  }
  return out;
}

/** 14. Carga aguda:crónica fuera del rango del club. Aviso, nunca predicción. */
function acwr(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  const { acwrHigh, acwrLow } = input.thresholds;
  for (const p of input.players) {
    if (p.availability.status === "out") continue;
    const m = loadMetrics(p.loads, input.today);
    if (m.ratio === null) continue;
    const high = m.ratio > acwrHigh;
    const low = m.ratio < acwrLow && p.availability.status === "available";
    if (!high && !low) continue;
    out.push({
      rule: "acwr",
      level: high ? "attention" : "info",
      fingerprint: `acwr:${p.id}:${weekStartOf(input.today)}:${high ? "high" : "low"}`,
      playerId: p.id,
      values: {
        name: p.name,
        ratio: m.ratio,
        acute: Math.round(m.acute),
        chronic: Math.round(m.chronic),
        direction: high ? "high" : "low",
        limit: high ? acwrHigh : acwrLow,
      },
      contentIds: [],
    });
  }
  return out;
}

/** 15. Vuelta tras una baja: no pasar del 110 % de su carga semanal previa. */
function returnProgression(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  for (const p of input.players) {
    const period = [...p.pastUnavailability]
      .filter((u) => u.endedOn <= input.today && daysBetween(u.endedOn, input.today) <= 21)
      .sort((a, b) => b.endedOn.localeCompare(a.endedOn))[0];
    if (!period) continue;
    const byDay = dailyTotals(p.loads);
    const before = loadBetween(byDay, addDays(period.fromOn, -28), addDays(period.fromOn, -1)) / 4;
    if (before <= 0) continue;
    const cap = Math.round(before * 1.1);
    const acute = loadBetween(byDay, addDays(input.today, -6), input.today);
    out.push({
      rule: "return_progression",
      level: acute > cap ? "attention" : "info",
      fingerprint: `return_progression:${p.id}:${period.endedOn}:${acute > cap ? "over" : "ok"}`,
      playerId: p.id,
      values: {
        name: p.name,
        cap,
        acute: Math.round(acute),
        since: period.endedOn,
        over: acute > cap ? 1 : 0,
      },
      contentIds: [],
    });
  }
  return out;
}

/** RPE objetivo de una sesión: la media de sus tareas ponderada por minutos, o la de la sesión. */
function sessionTarget(session: InsightSession): number | null {
  const rated = session.items.filter((i) => i.targetRpe !== null);
  const minutes = rated.reduce((a, i) => a + i.minutes, 0);
  if (minutes > 0) return rated.reduce((a, i) => a + i.targetRpe! * i.minutes, 0) / minutes;
  return session.targetRpe;
}

/** 16. El RPE real supera en dos puntos al previsto en dos sesiones seguidas. */
function rpeAboveTarget(input: InsightsInput): Insight[] {
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const out: Insight[] = [];
  for (const p of input.players) {
    const rated = [...p.sessionRpe]
      .filter((r) => r.date <= input.today && r.date >= addDays(input.today, -14))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        ...r,
        target: sessions.get(r.sessionId) ? sessionTarget(sessions.get(r.sessionId)!) : null,
      }))
      .filter((r) => r.target !== null);
    const [a, b] = rated.slice(-2);
    if (!a || !b) continue;
    if (a.rpe >= a.target! + 2 && b.rpe >= b.target! + 2) {
      out.push({
        rule: "rpe_above_target",
        level: "attention",
        fingerprint: `rpe_above_target:${p.id}:${b.sessionId}`,
        playerId: p.id,
        values: { name: p.name, rpe: b.rpe, target: round1(b.target!), sessions: 2 },
        contentIds: [],
        sessionId: b.sessionId,
      });
    }
  }
  return out;
}

/** 17. El objetivo del jugador tiene contenidos y apenas se han trabajado en tres semanas. */
function focusGap(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  const absentOn = new Map<string, Set<string>>();
  for (const a of input.attendance)
    if (a.status !== "present") {
      const set = absentOn.get(a.playerId) ?? new Set<string>();
      set.add(a.date);
      absentOn.set(a.playerId, set);
    }
  const from = addDays(input.today, -20);
  for (const p of input.players) {
    if (p.focus.contentIds.length === 0 || p.availability.status === "out") continue;
    const absent = absentOn.get(p.id) ?? new Set<string>();
    const worked = input.sessions
      .filter((s) => s.date >= from && s.date <= input.today && s.status !== "cancelled")
      .filter((s) => !absent.has(s.date))
      .flatMap((s) => s.items)
      .filter(
        (i) => includesPlayer(i, p.id) && i.contentIds.some((c) => p.focus.contentIds.includes(c)),
      )
      .reduce((a, i) => a + i.minutes, 0);
    const reviewSoon =
      p.focus.reviewOn !== null &&
      p.focus.reviewOn >= input.today &&
      daysBetween(input.today, p.focus.reviewOn) <= 7;
    if (worked >= input.thresholds.focusMinutes) continue;
    out.push({
      rule: "focus_gap",
      level: reviewSoon ? "attention" : "info",
      fingerprint: `focus_gap:${p.id}:${weekStartOf(input.today)}`,
      playerId: p.id,
      values: {
        name: p.name,
        minutes: worked,
        target: input.thresholds.focusMinutes,
        objective: p.focus.objectiveTitle ?? "",
        reviewOn: p.focus.reviewOn ?? "",
      },
      contentIds: p.focus.contentIds.slice(0, 2),
    });
  }
  return out;
}

/** 18. Fortalezas: primer cuartil del equipo en una acción favorable. Solo para el personal. */
function strengths(input: InsightsInput): Insight[] {
  const recent = lastN(input.matches, 5);
  if (recent.length < 3) return [];
  const names = new Map<string, string>();
  const positive = new Set<string>();
  for (const m of recent)
    for (const t of m.actionTypes)
      if (t.category === "positive" && t.scope === "player") {
        positive.add(t.code);
        names.set(t.code, t.name);
      }
  const totals = new Map<
    string,
    { timeMs: number; apps: number; actions: Record<string, number> }
  >();
  for (const m of recent)
    for (const p of m.stats.players) {
      if (p.timeMs <= 0) continue;
      const t = totals.get(p.playerId) ?? { timeMs: 0, apps: 0, actions: {} };
      t.timeMs += p.timeMs;
      t.apps += 1;
      for (const [code, n] of Object.entries(p.actions))
        t.actions[code] = (t.actions[code] ?? 0) + n;
      totals.set(p.playerId, t);
    }
  const roster = playerById(input);
  const eligible = [...totals.entries()].filter(
    ([id, t]) => roster.has(id) && t.apps >= 3 && t.timeMs >= 40 * 60_000,
  );
  if (eligible.length < 5) return [];
  const candidates: {
    code: string;
    playerId: string;
    rate: number;
    median: number;
    count: number;
  }[] = [];
  for (const code of positive) {
    const rates = eligible
      .map(([id, t]) => ({
        id,
        count: t.actions[code] ?? 0,
        rate: ((t.actions[code] ?? 0) / t.timeMs) * 40 * 60_000,
      }))
      .sort((a, b) => b.rate - a.rate);
    const top = rates[0]!;
    const sorted = rates.map((r) => r.rate).sort((a, b) => a - b);
    const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (top.count >= 3 && top.rate > 0 && top.rate >= q3 && top.rate > median)
      candidates.push({ code, playerId: top.id, rate: top.rate, median, count: top.count });
  }
  return candidates
    .sort((a, b) => b.rate / Math.max(a.median, 0.1) - a.rate / Math.max(b.median, 0.1))
    .slice(0, 3)
    .map((c) => ({
      rule: "strength" as const,
      level: "info" as const,
      fingerprint: `strength:${c.playerId}:${c.code}:${recent.at(-1)!.id}`,
      playerId: c.playerId,
      values: {
        name: roster.get(c.playerId)!.name,
        action: names.get(c.code) ?? c.code,
        rate: round1(c.rate),
        median: round1(c.median),
        matches: recent.length,
      },
      contentIds: [],
    }));
}

/** 19. Asistencia por debajo del mínimo en cuatro semanas. */
function lowAttendance(input: InsightsInput): Insight[] {
  const from = addDays(input.today, -27);
  const out: Insight[] = [];
  for (const p of input.players) {
    const marks = input.attendance.filter(
      (a) =>
        a.playerId === p.id && a.date >= from && a.date <= input.today && a.status !== "excused",
    );
    if (marks.length < 4) continue;
    const present = marks.filter((a) => a.status === "present").length;
    const percent = Math.round((present / marks.length) * 100);
    if (percent >= input.thresholds.attendanceMin) continue;
    out.push({
      rule: "low_attendance",
      level: "attention",
      fingerprint: `low_attendance:${p.id}:${weekStartOf(input.today)}`,
      playerId: p.id,
      values: {
        name: p.name,
        percent,
        present,
        total: marks.length,
        min: input.thresholds.attendanceMin,
      },
      contentIds: [],
    });
  }
  return out;
}

/** 20. Formativas: un jugador con menos de la mitad de los minutos medios en cuatro partidos. */
function minutesBalance(input: InsightsInput): Insight[] {
  if (!input.formative) return [];
  const recent = lastN(input.matches, 4);
  if (recent.length < 4) return [];
  const players = input.players.filter(
    (p) => p.availability.status !== "out" && p.availability.status !== "rehab",
  );
  if (players.length < 3) return [];
  const minutes = new Map<string, number>(players.map((p) => [p.id, 0]));
  for (const m of recent)
    for (const s of m.stats.players)
      if (minutes.has(s.playerId))
        minutes.set(s.playerId, minutes.get(s.playerId)! + s.timeMs / 60_000);
  const mean = [...minutes.values()].reduce((a, b) => a + b, 0) / minutes.size;
  if (mean <= 0) return [];
  return players
    .filter((p) => minutes.get(p.id)! < mean * 0.5)
    .map((p) => ({
      rule: "minutes_balance" as const,
      level: "attention" as const,
      fingerprint: `minutes_balance:${p.id}:${recent.at(-1)!.id}`,
      playerId: p.id,
      values: {
        name: p.name,
        minutes: Math.round(minutes.get(p.id)!),
        mean: Math.round(mean),
        matches: recent.length,
      },
      contentIds: [],
    }));
}
