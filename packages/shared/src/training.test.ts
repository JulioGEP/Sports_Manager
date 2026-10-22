import { describe, expect, it } from "vitest";
import { computeMatchStats, type StatsActionType, type StatsEvent } from "./match-stats.ts";
import { defaultMatchActions, resolveMatchSettings } from "./matches.ts";
import {
  BLOCKS_BY_TEAM_ROLE,
  DEFAULT_INSIGHT_THRESHOLDS,
  defaultDrills,
  defaultTrainingContents,
  injurySeverity,
  mdLabelOf,
  resolveTrainingSettings,
  SESSION_BLOCKS,
  trainingCodeFromName,
  wellnessScore,
} from "./training.ts";
import {
  computeInsights,
  pickContents,
  type InsightContent,
  type InsightMatch,
  type InsightPlayer,
  type InsightSession,
  type InsightsInput,
} from "./training-insights.ts";
import { addDays, loadMetrics, weekStartOf, weeklyTotals } from "./training-load.ts";

describe("utilidades de entrenamiento", () => {
  it("la etiqueta MD cuenta hacia el partido y, justo después, desde él", () => {
    expect(mdLabelOf("2026-10-24", "2026-10-17", "2026-10-24")).toBe("MD");
    expect(mdLabelOf("2026-10-21", "2026-10-17", "2026-10-24")).toBe("MD-3");
    expect(mdLabelOf("2026-10-18", "2026-10-17", "2026-10-24")).toBe("MD+1");
    expect(mdLabelOf("2026-10-19", "2026-10-17", "2026-10-24")).toBe("MD+2");
    // Dos partidos seguidos: el día entre medias manda la cuenta atrás.
    expect(mdLabelOf("2026-10-22", "2026-10-21", "2026-10-23")).toBe("MD-1");
    expect(mdLabelOf("2026-10-10", null, null)).toBeNull();
  });

  it("los ajustes de la sección se apilan sobre los de por defecto", () => {
    const s = resolveTrainingSettings({ tracking: "full", thresholds: { acwrHigh: 1.4 } });
    expect(s.tracking).toBe("full");
    expect(s.thresholds.acwrHigh).toBe(1.4);
    expect(s.thresholds.acwrLow).toBe(DEFAULT_INSIGHT_THRESHOLDS.acwrLow);
    expect(resolveTrainingSettings(null).tracking).toBe("basic");
  });

  it("claves, gravedad, bienestar y catálogos semilla", () => {
    expect(trainingCodeFromName("Salida de presión")).toBe("salida_de_presion");
    expect(injurySeverity(2)).toBe("minimal");
    expect(injurySeverity(10)).toBe("moderate");
    expect(injurySeverity(40)).toBe("severe");
    expect(wellnessScore({ sleep: 4, fatigue: 3, soreness: 5, stress: 4, mood: 4 })).toBe(20);
    const contents = defaultTrainingContents("futsal", "ca");
    expect(contents.find((c) => c.code === "finishing")?.name).toBe("Finalització");
    const codes = new Set(contents.map((c) => c.code));
    for (const drill of defaultDrills("futsal"))
      for (const code of drill.contents) expect(codes.has(code), code).toBe(true);
    expect(defaultTrainingContents("swimming", "es").length).toBeGreaterThan(0);
    expect(BLOCKS_BY_TEAM_ROLE.head_coach).toEqual(SESSION_BLOCKS);
    expect(BLOCKS_BY_TEAM_ROLE.physio).toEqual(["rehab"]);
  });
});

describe("carga (Foster)", () => {
  it("aguda, crónica, relación y monotonía", () => {
    const today = "2026-10-28";
    const entries = Array.from({ length: 28 }, (_, i) => ({
      date: addDays(today, -i),
      load: i % 7 === 6 ? 0 : 300,
    }));
    const m = loadMetrics(entries, today);
    expect(m.acute).toBe(1800);
    expect(m.chronic).toBe(1800);
    expect(m.ratio).toBe(1);
    expect(m.historyDays).toBe(28);
    expect(m.monotony).toBeGreaterThan(1);
    // Sin 21 días de historia, la relación no se calcula.
    expect(loadMetrics(entries.slice(0, 10), today).ratio).toBeNull();
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weeklyTotals(entries, "2026-10-19", "2026-10-26").map((w) => w.load)).toEqual([
      1800, 900,
    ]);
  });
});

// --- Recomendaciones ---

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
const roster = ["gk", "a", "b", "c", "d", "e", "f"];
const five = ["gk", "a", "b", "c", "d"];
const minute = 60_000;

let seq = 0;
function ev(code: string | null, opts: Partial<StatsEvent> = {}): StatsEvent {
  const t = code ? type(code) : null;
  return {
    id: `e${seq}`,
    seq: seq++,
    kind: opts.kind ?? "action",
    actionTypeId: t?.id ?? null,
    actionCode: t?.code ?? null,
    playerId: opts.playerId ?? (t?.scope === "player" ? "a" : null),
    relatedPlayerId: null,
    side: t?.scope === "opponent" ? "opponent" : "own",
    period: opts.period ?? 1,
    clockMs: opts.clockMs ?? 0,
    zone: opts.zone ?? null,
    onCourt: opts.onCourt ?? five,
    ownScoreDelta: t?.ownScore ?? 0,
    opponentScoreDelta: t?.opponentScore ?? 0,
  };
}

function match(
  id: string,
  playedOn: string,
  actions: StatsEvent[],
  opponent = "Rival",
): InsightMatch {
  const events = [
    ev(null, { kind: "lineup" }),
    ev(null, { kind: "period_start" }),
    ...actions,
    ev(null, { kind: "period_end", clockMs: 20 * minute }),
    ev(null, { kind: "period_start", period: 2 }),
    ev(null, { kind: "period_end", period: 2, clockMs: 20 * minute }),
  ];
  const players = roster.map((p, i) => ({
    playerId: p,
    name: p.toUpperCase(),
    shirtNumber: i + 1,
    position: null,
    isGoalkeeper: p === "gk",
    starter: five.includes(p),
  }));
  const stats = computeMatchStats({ settings, players, actionTypes: types, events });
  return {
    id,
    playedOn,
    opponent,
    ownScore: stats.score.own,
    opponentScore: stats.score.opponent,
    settings,
    actionTypes: types,
    events,
    stats,
  };
}

const content = (id: string, code: string, related: string[] = []): InsightContent => ({
  id,
  code,
  name: code,
  kind: "technical",
  relatedActionCodes: related,
  status: "active",
});
const contents = [
  content("c-fin", "finishing", ["goal", "shot_on_target", "shot_off_target"]),
  content("c-build", "build_up", ["turnover"]),
  content("c-def", "defending_without_fouls", ["foul"]),
  content("c-end", "intermittent_endurance"),
  content("c-sp", "set_piece_attack", ["corner"]),
];

function player(id: string, extra: Partial<InsightPlayer> = {}): InsightPlayer {
  return {
    id,
    name: id.toUpperCase(),
    isGoalkeeper: id === "gk",
    availability: { status: "available", restrictions: [], maxMinutes: null },
    pastUnavailability: [],
    loads: [],
    sessionRpe: [],
    wellness: [],
    focus: { contentIds: [], objectiveTitle: null, reviewOn: null },
    ...extra,
  };
}

function base(extra: Partial<InsightsInput> = {}): InsightsInput {
  return {
    today: "2026-10-28",
    thresholds: DEFAULT_INSIGHT_THRESHOLDS,
    formative: false,
    contents,
    matches: [],
    fixtures: [],
    sessions: [],
    attendance: [],
    cycle: null,
    players: roster.map((p) => player(p)),
    ...extra,
  };
}

const shots = (goals: number, misses: number, opts: Partial<StatsEvent> = {}) => [
  ...Array.from({ length: goals }, () => ev("goal", opts)),
  ...Array.from({ length: misses }, () => ev("shot_off_target", opts)),
];

describe("motor de recomendaciones", () => {
  it("elige contenidos por código preferido y, si no, por las acciones que miden", () => {
    expect(pickContents(contents, ["turnover"], [])).toEqual(["c-build"]);
    expect(pickContents(contents, ["goal"], ["intermittent_endurance"])).toEqual([
      "c-end",
      "c-fin",
    ]);
  });

  it("sin datos no salta nada", () => {
    expect(computeInsights(base())).toEqual([]);
  });

  it("1. el acierto en el tiro cae frente a la temporada y propone finalización", () => {
    const matches = [
      match("m1", "2026-09-20", shots(5, 5)),
      match("m2", "2026-09-27", shots(5, 5)),
      match("m3", "2026-10-04", shots(1, 9)),
      match("m4", "2026-10-11", shots(1, 9)),
      match("m5", "2026-10-18", shots(1, 9)),
    ];
    const insights = computeInsights(base({ matches }));
    const finishing = insights.find((i) => i.rule === "finishing_drop");
    expect(finishing).toBeDefined();
    expect(finishing!.values.recent).toBe(10);
    expect(finishing!.values.season).toBe(26);
    expect(finishing!.contentIds[0]).toBe("c-fin");
  });

  it("3. llegar a la quinta falta antes del minuto 15 en dos de tres partidos", () => {
    const fouls = (n: number, until: number) =>
      Array.from({ length: n }, (_, i) => ev("foul", { clockMs: ((i + 1) * until * minute) / n }));
    const matches = [
      match("m1", "2026-10-04", fouls(5, 12)),
      match("m2", "2026-10-11", fouls(3, 18)),
      match("m3", "2026-10-18", fouls(5, 14)),
    ];
    const early = computeInsights(base({ matches })).find((i) => i.rule === "early_fouls");
    expect(early?.values).toMatchObject({ matches: 2, of: 3, limit: 5, minute: 15 });
    expect(early?.contentIds).toEqual(["c-def"]);
  });

  it("4 y 6. goles encajados al final de las partes y rival conocido", () => {
    const late = (clock: number) => ev("opp_goal", { clockMs: clock * minute });
    const matches = [
      match("m1", "2026-10-11", [late(17), late(18), late(5)], "FS Castelldefels"),
      match("m2", "2026-10-18", [late(19), late(16)], "AE Poble Sec"),
    ];
    const insights = computeInsights(
      base({ matches, fixtures: [{ date: "2026-10-31", opponent: "fs castelldefels " }] }),
    );
    expect(insights.find((i) => i.rule === "late_goals")?.values).toMatchObject({
      late: 4,
      total: 5,
      share: 80,
    });
    const known = insights.find((i) => i.rule === "known_opponent");
    expect(known?.matchId).toBe("m1");
  });

  it("7. el día después del partido separa recuperación y compensatorio", () => {
    const m = match("m1", "2026-10-27", []);
    const insights = computeInsights(
      base({
        matches: [m],
        players: roster.map((p) =>
          p === "f"
            ? player(p, { availability: { status: "out", restrictions: [], maxMinutes: null } })
            : player(p),
        ),
      }),
    );
    const md = insights.find((i) => i.rule === "md_plus_one")!;
    const groups = Object.fromEntries(md.groups!.map((g) => [g.key, g.playerIds]));
    expect(groups.recovery).toEqual(["gk", "a", "b", "c", "d"]);
    // E no jugó y F está de baja: solo E va al compensatorio.
    expect(groups.compensatory).toEqual(["e"]);
  });

  it("12. una restricción choca con una tarea de la sesión", () => {
    const session: InsightSession = {
      id: "s1",
      date: "2026-10-29",
      status: "planned",
      targetRpe: 6,
      plannedLoad: 540,
      actualLoad: null,
      items: [
        {
          drillId: "d1",
          title: "Rondo 4x4+2",
          block: "main",
          minutes: 20,
          targetRpe: 6,
          contentIds: [],
          restrictionTags: ["contact"],
          playerIds: null,
          rating: null,
        },
        {
          drillId: null,
          title: "Readaptación",
          block: "rehab",
          minutes: 30,
          targetRpe: 3,
          contentIds: [],
          restrictionTags: ["contact"],
          playerIds: ["b"],
          rating: null,
        },
      ],
    };
    const insights = computeInsights(
      base({
        sessions: [session],
        players: [
          player("a", {
            availability: { status: "limited", restrictions: ["contact"], maxMinutes: null },
          }),
          player("b", { availability: { status: "rehab", restrictions: [], maxMinutes: null } }),
          player("c", {
            availability: { status: "limited", restrictions: ["jumps"], maxMinutes: 10 },
          }),
        ],
      }),
    );
    const conflicts = insights.filter((i) => i.rule === "restriction_conflict");
    expect(conflicts.map((c) => [c.playerId, c.level])).toEqual([
      ["a", "alert"],
      ["c", "attention"],
    ]);
    expect(conflicts[0]!.values.tags).toBe("contact");
  });

  it("13 y 14. dolor muscular alto y carga aguda:crónica por encima del umbral", () => {
    const today = "2026-10-28";
    const loads = [
      ...Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -27 + i), load: 200 })),
      ...Array.from({ length: 7 }, (_, i) => ({ date: addDays(today, -i), load: 700 })),
    ];
    const insights = computeInsights(
      base({
        players: [
          player("a", { wellness: [{ date: today, score: 14, soreness: 1 }] }),
          player("b", { loads }),
        ],
      }),
    );
    expect(insights.find((i) => i.rule === "wellness_drop")?.level).toBe("alert");
    const acwr = insights.find((i) => i.rule === "acwr")!;
    expect(acwr.playerId).toBe("b");
    expect(Number(acwr.values.ratio)).toBeGreaterThan(1.5);
  });

  it("15. vuelta tras una baja: tope del 110 % de su carga previa", () => {
    const today = "2026-10-28";
    const loads = [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: addDays("2026-10-01", -28 + i),
        load: 300,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({ date: addDays(today, -i), load: 600 })),
    ];
    const ret = computeInsights(
      base({
        players: [
          player("a", {
            loads,
            pastUnavailability: [{ fromOn: "2026-10-01", endedOn: "2026-10-20" }],
          }),
        ],
      }),
    ).find((i) => i.rule === "return_progression")!;
    expect(ret.values.cap).toBe(Math.round(((300 * 28) / 4) * 1.1));
    expect(ret.level).toBe("attention");
  });

  it("17 y 19. objetivo sin trabajo y asistencia baja", () => {
    const today = "2026-10-28";
    const attendance: InsightsInput["attendance"] = Array.from({ length: 5 }, (_, i) => ({
      playerId: "a",
      date: addDays(today, -3 * i),
      status: i < 2 ? "present" : "absent",
    }));
    const insights = computeInsights(
      base({
        attendance,
        players: [
          player("a", {
            focus: {
              contentIds: ["c-fin"],
              objectiveTitle: "Pierna izquierda",
              reviewOn: "2026-11-02",
            },
          }),
        ],
      }),
    );
    const focus = insights.find((i) => i.rule === "focus_gap")!;
    expect(focus.level).toBe("attention");
    expect(focus.values.minutes).toBe(0);
    expect(insights.find((i) => i.rule === "low_attendance")?.values.percent).toBe(40);
  });

  it("20. en formativas avisa de quien apenas juega", () => {
    const matches = ["m1", "m2", "m3", "m4"].map((id, i) =>
      match(id, addDays("2026-10-01", 7 * i), []),
    );
    const insights = computeInsights(base({ matches, formative: true }));
    const balance = insights.filter((i) => i.rule === "minutes_balance").map((i) => i.playerId);
    expect(balance).toEqual(["e", "f"]);
    expect(computeInsights(base({ matches })).some((i) => i.rule === "minutes_balance")).toBe(
      false,
    );
  });

  it("ordena por urgencia: alertas primero", () => {
    const insights = computeInsights(
      base({
        players: [player("a", { wellness: [{ date: "2026-10-28", score: 14, soreness: 1 }] })],
        cycle: { startsOn: "2026-10-01", endsOn: "2026-11-30", focusContentIds: ["c-sp"] },
      }),
    );
    expect(insights[0]!.level).toBe("alert");
    expect(insights.at(-1)!.rule).toBe("content_gap");
  });
});
