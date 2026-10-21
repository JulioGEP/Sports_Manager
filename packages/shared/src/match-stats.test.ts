import { describe, expect, it } from "vitest";
import {
  aggregateMatchStats,
  computeMatchStats,
  type StatsActionType,
  type StatsEvent,
} from "./match-stats.ts";
import {
  actionCodeFromName,
  defaultMatchActions,
  formationSlots,
  resolveMatchSettings,
} from "./matches.ts";

const settings = resolveMatchSettings("futsal", null);
const types: StatsActionType[] = defaultMatchActions("futsal", "es").map((a, i) => ({
  id: `t${i}`,
  code: a.code!,
  name: a.name,
  category: a.category,
  scope: a.scope,
  ownScore: a.ownScore ?? 0,
  opponentScore: a.opponentScore ?? 0,
  countsFoul: a.countsFoul ?? false,
  card: a.card ?? null,
  requiresZone: a.requiresZone ?? false,
  keeperOnly: a.keeperOnly ?? false,
  weight: a.weight ?? 0,
  mirrorOf: a.mirrorOf ?? null,
}));
const type = (code: string) => types.find((t) => t.code === code)!;

const players = ["gk", "a", "b", "c", "d", "e"].map((id, i) => ({
  playerId: id,
  name: id.toUpperCase(),
  shirtNumber: i + 1,
  position: null,
  isGoalkeeper: id === "gk",
  starter: id !== "e",
}));
const five = ["gk", "a", "b", "c", "d"];

let seq = 0;
function ev(partial: Partial<StatsEvent> & { kind: StatsEvent["kind"] }): StatsEvent {
  const t = partial.actionCode ? type(partial.actionCode) : null;
  return {
    id: `e${seq}`,
    seq: seq++,
    kind: partial.kind,
    actionTypeId: t?.id ?? null,
    actionCode: t?.code ?? null,
    playerId: partial.playerId ?? null,
    relatedPlayerId: partial.relatedPlayerId ?? null,
    side: partial.side ?? (t?.scope === "opponent" ? "opponent" : "own"),
    period: partial.period ?? 1,
    clockMs: partial.clockMs ?? 0,
    zone: partial.zone ?? null,
    onCourt: partial.onCourt ?? five,
    ownScoreDelta: t?.ownScore ?? 0,
    opponentScoreDelta: t?.opponentScore ?? 0,
  };
}

describe("motor de estadísticas de partido", () => {
  const minute = 60_000;
  const events: StatsEvent[] = [
    ev({ kind: "lineup", onCourt: five }),
    ev({ kind: "period_start", clockMs: 0 }),
    ev({ kind: "action", actionCode: "goal", playerId: "a", clockMs: 3 * minute, zone: "r1c2" }),
    ev({ kind: "action", actionCode: "foul", playerId: "b", clockMs: 5 * minute }),
    ev({ kind: "action", actionCode: "opp_goal", clockMs: 8 * minute }),
    // Cambio: entra E por D en el minuto 10.
    ev({
      kind: "sub",
      playerId: "e",
      relatedPlayerId: "d",
      clockMs: 10 * minute,
      onCourt: ["gk", "a", "b", "c", "e"],
    }),
    ev({
      kind: "action",
      actionCode: "goal",
      playerId: "e",
      clockMs: 15 * minute,
      zone: "r2c3",
      onCourt: ["gk", "a", "b", "c", "e"],
    }),
    ev({ kind: "period_end", clockMs: 20 * minute, onCourt: ["gk", "a", "b", "c", "e"] }),
    ev({ kind: "period_start", period: 2, clockMs: 0, onCourt: ["gk", "a", "b", "c", "e"] }),
    ev({
      kind: "action",
      actionCode: "foul",
      playerId: "c",
      period: 2,
      clockMs: 2 * minute,
      onCourt: ["gk", "a", "b", "c", "e"],
    }),
    ev({
      kind: "action",
      actionCode: "save",
      playerId: "gk",
      period: 2,
      clockMs: 4 * minute,
      onCourt: ["gk", "a", "b", "c", "e"],
    }),
    ev({
      kind: "action",
      actionCode: "red_card",
      playerId: "b",
      period: 2,
      clockMs: 6 * minute,
      onCourt: ["gk", "a", "b", "c", "e"],
    }),
    ev({ kind: "period_end", period: 2, clockMs: 20 * minute, onCourt: ["gk", "a", "c", "e"] }),
  ];
  const stats = computeMatchStats({ settings, players, actionTypes: types, events });
  const of = (id: string) => stats.players.find((p) => p.playerId === id)!;

  it("marcador y faltas salen de las acciones, por periodo", () => {
    expect(stats.score).toEqual({ own: 2, opponent: 1 });
    expect(stats.periods[0]!.ownFouls).toBe(1);
    expect(stats.periods[1]!.ownFouls).toBe(1);
    expect(stats.fouls.own).toBe(2);
    expect(stats.playedMs).toBe(40 * minute);
    expect(stats.eventsCount).toBe(events.length);
  });

  it("minutos solo mientras el jugador está en pista", () => {
    expect(of("a").timeMs).toBe(40 * minute);
    expect(of("d").timeMs).toBe(10 * minute);
    expect(of("e").timeMs).toBe(30 * minute);
    // Expulsado en el minuto 6 de la segunda parte: 20 + 6.
    expect(of("b").timeMs).toBe(26 * minute);
    expect(of("b").sentOff).toBe(true);
    expect(of("b").onCourt).toBe(false);
  });

  it("marcador en pista y +/- por jugador", () => {
    expect(of("d").scoreFor).toBe(1);
    expect(of("d").scoreAgainst).toBe(1);
    expect(of("d").plusMinus).toBe(0);
    expect(of("e").scoreFor).toBe(1);
    expect(of("e").scoreAgainst).toBe(0);
    expect(of("e").plusMinus).toBe(1);
    expect(of("a").plusMinus).toBe(1);
  });

  it("recuentos, valoración, tarjetas y comparativa con el rival", () => {
    expect(of("a").actions["goal"]).toBe(1);
    expect(of("a").rating).toBe(5);
    expect(of("b").cards.red).toBe(1);
    expect(of("b").rating).toBe(-1 - 5);
    expect(of("gk").actions["save"]).toBe(1);
    const goals = stats.comparison.find((row) => row.code === "goal")!;
    expect(goals).toMatchObject({ own: 2, opponent: 1 });
    expect(stats.totals.opponent["opp_goal"]).toBe(1);
  });

  it("mapa de zonas por periodo", () => {
    const near = stats.zones.find((z) => z.zone === "r1c2")!;
    expect(near.total["goal"]).toBe(1);
    expect(near.byPeriod[1]!["goal"]).toBe(1);
    const far = stats.zones.find((z) => z.zone === "r2c3")!;
    expect(far.total["goal"]).toBe(1);
  });

  it("en un partido en juego cierra los minutos en el instante actual", () => {
    const live = computeMatchStats({
      settings,
      players,
      actionTypes: types,
      events: events.slice(0, 3),
      now: { period: 1, clockMs: 7 * minute },
    });
    expect(live.playedMs).toBe(7 * minute);
    expect(live.players.find((p) => p.playerId === "a")!.timeMs).toBe(7 * minute);
    expect(live.players.find((p) => p.playerId === "e")!.timeMs).toBe(0);
  });

  it("acumula varios partidos por jugador", () => {
    const agg = aggregateMatchStats([stats, stats], types);
    expect(agg.matches).toBe(2);
    expect(agg.won).toBe(2);
    expect(agg.score).toEqual({ own: 4, opponent: 2 });
    const a = agg.players.find((p) => p.playerId === "a")!;
    expect(a.matches).toBe(2);
    expect(a.timeMs).toBe(80 * minute);
    expect(a.actions["goal"]).toBe(2);
    expect(agg.comparison.find((r) => r.code === "goal")).toMatchObject({ own: 4, opponent: 2 });
  });
});

describe("catálogo y ajustes por deporte", () => {
  it("propone un catálogo por deporte y uno genérico para el resto", () => {
    expect(defaultMatchActions("futsal", "ca").some((a) => a.name === "Gol")).toBe(true);
    expect(defaultMatchActions("basketball", "es").some((a) => a.code === "three_points")).toBe(
      true,
    );
    expect(defaultMatchActions("padel", "en").map((a) => a.code)).toContain("point");
  });

  it("los ajustes del partido se apilan: deporte, sección y partido", () => {
    const merged = resolveMatchSettings("futsal", { periodMinutes: 25 }, { periods: 3 });
    expect(merged).toMatchObject({ periods: 3, periodMinutes: 25, playersOnCourt: 5 });
    expect(resolveMatchSettings("yoga", null).goalkeeper).toBe(false);
  });

  it("los huecos del sistema de juego cuadran con los jugadores en pista", () => {
    const slots = formationSlots("1-2-1", 5, true);
    expect(slots).toHaveLength(5);
    expect(slots[0]!.goalkeeper).toBe(true);
    expect(formationSlots("4-4-2", 11, true)).toHaveLength(11);
    // Sistema que no cuadra: reparto en filas.
    expect(formationSlots("2-2", 7, true)).toHaveLength(7);
    expect(formationSlots(null, 5, false).every((s) => !s.goalkeeper)).toBe(true);
  });

  it("deriva una clave estable del nombre de una acción", () => {
    expect(actionCodeFromName("Saque de esquina")).toBe("saque_de_esquina");
    expect(actionCodeFromName("Córner!")).toBe("corner");
    expect(actionCodeFromName("1")).toBe("a_1");
  });
});
