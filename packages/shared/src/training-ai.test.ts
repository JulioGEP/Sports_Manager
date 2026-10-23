import { describe, expect, it } from "vitest";
import {
  AI_PROFILES,
  AiDraftRequestSchema,
  AiProposalSchema,
  aiCostMicros,
  aiProfileCodeFor,
  aiProfileFor,
  aiSystemPrompt,
  aiUserPrompt,
  defaultEmphasisFor,
  emphasisFor,
  medianAge,
  redactNames,
  resolveProposal,
  sessionBlockLabels,
  unusedSessionBlocks,
  type AiContext,
  type AiProposalOutput,
} from "./training-ai.ts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function context(overrides: Partial<AiContext> = {}): AiContext {
  const profile = aiProfileFor("futsal", false);
  return {
    locale: "es",
    profile,
    sport: "Fútbol sala",
    section: "Fútbol sala",
    team: "Sénior A",
    category: "Sénior",
    formative: false,
    ages: { median: 24, min: 19, max: 33 },
    methodologyNotes: "Juego de posición y presión tras pérdida.",
    sessions: [
      {
        ref: "S1",
        eventId: uuid(1),
        date: "2026-10-27",
        weekday: "martes",
        start: "20:00",
        minutes: 90,
        facility: { name: "Pabellón", kind: "court", description: null },
        mdLabel: "MD-4",
        objective: null,
      },
    ],
    roster: [
      {
        ref: "J1",
        playerId: uuid(11),
        position: "Ala",
        goalkeeper: false,
        status: "available",
        restrictions: [],
        maxMinutes: null,
      },
      {
        ref: "J2",
        playerId: uuid(12),
        position: "Cierre",
        goalkeeper: false,
        status: "limited",
        restrictions: ["contact"],
        maxMinutes: 30,
      },
      {
        ref: "J3",
        playerId: uuid(13),
        position: "Pívot",
        goalkeeper: false,
        status: "out",
        restrictions: [],
        maxMinutes: null,
      },
    ],
    cycle: null,
    previousMatch: { date: "2026-10-25", opponent: "CD Rival", result: "2-3" },
    nextMatch: { date: "2026-10-31", opponent: "UE Otro" },
    recentSessions: [],
    insights: [
      {
        rule: "turnovers_up",
        level: "attention",
        player: null,
        values: { recent: 14, season: 10, matches: 3 },
        contents: ["C1"],
      },
    ],
    contents: [
      { ref: "C1", id: uuid(21), name: "Salida de presión", kind: "tactical" },
      { ref: "C2", id: uuid(22), name: "Finalización", kind: "technical" },
    ],
    library: [
      {
        ref: "T1",
        id: uuid(31),
        name: "Rondo 4x2",
        description: "Conservar con superioridad.",
        contents: ["C1"],
        format: "4x2",
        space: "Media pista",
        playersMin: 6,
        playersMax: 12,
        durationMin: 15,
        targetRpe: 6,
        material: "Petos",
        restrictionTags: ["contact"],
        rating: 3,
        uses: 4,
      },
    ],
    equipment: [{ name: "Balones", quantity: 12 }],
    request: {
      objective: "Salir de la presión alta",
      emphasis: {
        technical: 20,
        tactical: 50,
        physical: 20,
        set_piece: 10,
        goalkeeper: 0,
        psychological: 0,
      },
      intensity: "high",
      extraEquipment: null,
      context: "Venimos de perder con J1 tocado",
      libraryOnly: false,
      includeVariants: true,
    },
    ...overrides,
  };
}

const item = (
  over: Partial<AiProposalOutput["sessions"][number]["blocks"][number]["items"][number]> = {},
) => ({
  drill: null,
  title: "Tarea",
  minutes: 10,
  sets: null,
  reps: null,
  restSec: null,
  targetRpe: 5,
  group: null,
  players: null,
  contents: [],
  notes: "Cómo se hace.",
  newDrill: null,
  ...over,
});

function output(
  blocks: AiProposalOutput["sessions"][number]["blocks"],
  session = "S1",
): AiProposalOutput {
  return {
    summary: "Semana para salir de la presión.",
    sessions: [
      {
        session,
        objective: "Salida de presión",
        targetRpe: 6,
        contents: ["C1", "C9"],
        rationale: "Porque perdemos muchos balones.",
        blocks,
        equipment: ["Petos"],
        warnings: [],
      },
    ],
  };
}

describe("perfiles de coach", () => {
  it("cada deporte tiene su forma de pensar", () => {
    expect(aiProfileCodeFor("futsal", true)).toBe("team_formative");
    expect(aiProfileCodeFor("futsal", false)).toBe("team_performance");
    expect(aiProfileCodeFor("basketball", false)).toBe("team_performance");
    expect(aiProfileCodeFor("crossfit", false)).toBe("crossfit");
    expect(aiProfileCodeFor("yoga", true)).toBe("yoga");
    expect(aiProfileCodeFor("padel", false)).toBe("racket");
    expect(aiProfileCodeFor("swimming", true)).toBe("swimming");
    expect(aiProfileCodeFor("athletics", false)).toBe("generic");
  });

  it("los 100 puntos por defecto reparten exactamente los ejes de cada perfil", () => {
    for (const profile of Object.values(AI_PROFILES)) {
      const codes = profile.axes.map((a) => a.code).sort();
      expect(Object.keys(profile.defaultEmphasis).sort()).toEqual(codes);
      expect(Object.values(profile.defaultEmphasis).reduce((a, n) => a + n, 0)).toBe(100);
      expect(profile.blocks.main).toBeDefined();
    }
  });

  it("sin portería no hay porteros, y sus puntos pasan a lo táctico", () => {
    const basket = aiProfileFor("basketball", false);
    expect(basket.blocks.goalkeepers).toBeUndefined();
    expect(basket.axes.map((a) => a.code)).not.toContain("goalkeeper");
    expect(Object.values(basket.defaultEmphasis).reduce((a, n) => a + n, 0)).toBe(100);
    expect(aiProfileFor("futsal", false).blocks.goalkeepers).toBeDefined();
  });

  it("las secciones de actividad llaman a sus bloques a su manera y esconden los que no usan", () => {
    expect(sessionBlockLabels("futsal")).toEqual({});
    expect(sessionBlockLabels("yoga").main?.es).toBe("Secuencia principal");
    expect(sessionBlockLabels("crossfit").main?.es).toContain("WOD");
    expect(unusedSessionBlocks("futsal")).toEqual([]);
    expect(unusedSessionBlocks("yoga")).toEqual(["goalkeepers"]);
    expect(unusedSessionBlocks("basketball")).toEqual(["goalkeepers"]);
  });

  it("mediana de edad sin contar los que no tienen fecha", () => {
    expect(medianAge([9, null, 10, 11])).toBe(10);
    expect(medianAge([null])).toBeNull();
  });
});

describe("petición del entrenador", () => {
  const base = { eventIds: [uuid(1)], intensity: "medium" as const };

  it("el balance tiene que sumar 100", () => {
    expect(
      AiDraftRequestSchema.safeParse({ ...base, emphasis: { technical: 60, tactical: 40 } })
        .success,
    ).toBe(true);
    expect(
      AiDraftRequestSchema.safeParse({ ...base, emphasis: { technical: 60, tactical: 30 } })
        .success,
    ).toBe(false);
  });

  it("solo vale con los ejes del perfil; los que faltan cuentan cero", () => {
    const yoga = aiProfileFor("yoga", false);
    expect(emphasisFor(yoga, { flexibility: 100 })).toEqual({
      strength: 0,
      flexibility: 100,
      balance: 0,
      breathing: 0,
      relaxation: 0,
    });
    expect(emphasisFor(yoga, { metcon: 100 })).toBeNull();
  });
});

describe("balance de partida", () => {
  it("usa la metodología de la sección para la categoría y la lleva a 100 puntos", () => {
    const profile = aiProfileFor("futsal", true);
    expect(defaultEmphasisFor(profile, { technical: 40, tactical: 40, physical: 10 })).toEqual({
      technical: 45,
      tactical: 44,
      physical: 11,
      psychological: 0,
    });
    const sum = Object.values(
      defaultEmphasisFor(profile, { technical: 1, tactical: 1, physical: 1 }),
    );
    expect(sum.reduce((a, n) => a + n, 0)).toBe(100);
  });

  it("sin metodología, o con ejes que el perfil no tiene, el del perfil", () => {
    const yoga = aiProfileFor("yoga", false);
    expect(defaultEmphasisFor(yoga, { technical: 50 })).toEqual(yoga.defaultEmphasis);
    expect(defaultEmphasisFor(yoga, null)).toEqual(yoga.defaultEmphasis);
  });
});

describe("privacidad", () => {
  const people = [
    { ref: "J1", names: ["Marc Martí", "Marc", "Martí"] },
    { ref: "J2", names: ["María López", "María"] },
  ];

  it("cambia los nombres de la plantilla por su referencia, sin mirar acentos ni mayúsculas", () => {
    expect(redactNames("Marc está cansado y MARIA no viene; Martí, tampoco.", people)).toBe(
      "J1 está cansado y J2 no viene; J1, tampoco.",
    );
    expect(redactNames("Marc Martí vuelve", people)).toBe("J1 vuelve");
  });

  it("no toca palabras que solo contienen un nombre", () => {
    expect(redactNames("Marcos y Marcelo juegan", people)).toBe("Marcos y Marcelo juegan");
  });

  it("el prompt lleva referencias y nunca nombres ni ids", () => {
    const ctx = context();
    const prompt = `${aiSystemPrompt(ctx)}\n${aiUserPrompt(ctx)}`;
    expect(prompt).toContain('"ref":"J2"');
    expect(prompt).toContain('"ref":"T1"');
    expect(prompt).toContain("Juego de posición");
    expect(prompt).toContain("Fútbol sala");
    expect(prompt).not.toContain(uuid(11));
    expect(prompt).not.toContain(uuid(31));
  });

  it("escribe en el idioma de quien pide", () => {
    expect(aiSystemPrompt({ ...context(), locale: "ca" })).toContain("en catalán");
  });
});

describe("propuesta del modelo", () => {
  it("lee con tolerancia: corta textos, encaja números y recorta listas", () => {
    const parsed = AiProposalSchema.parse({
      summary: "x".repeat(5000),
      sessions: [
        {
          session: "S1",
          objective: "o".repeat(500),
          targetRpe: 14,
          contents: [],
          rationale: "r",
          equipment: [],
          warnings: [],
          blocks: [{ block: "main", items: [item({ minutes: 999, targetRpe: -3 })] }],
        },
      ],
    });
    expect(parsed.summary).toHaveLength(1200);
    expect(parsed.sessions[0]!.objective).toHaveLength(160);
    expect(parsed.sessions[0]!.targetRpe).toBe(10);
    expect(parsed.sessions[0]!.blocks[0]!.items[0]!.minutes).toBe(240);
    expect(parsed.sessions[0]!.blocks[0]!.items[0]!.targetRpe).toBe(0);
  });

  it("traduce referencias a ids del club y descarta las que no existen", () => {
    const ctx = context();
    const resolved = resolveProposal(
      output([
        {
          block: "main",
          items: [
            item({ drill: "T1", contents: ["C1"], players: ["J1"] }),
            item({ drill: "T7", title: "Inventada" }),
          ],
        },
      ]),
      ctx,
    );
    const session = resolved.sessions[0]!;
    expect(session.eventId).toBe(uuid(1));
    expect(session.contentIds).toEqual([uuid(21)]);
    const [first, second] = session.blocks[0]!.items;
    expect(first!.drillId).toBe(uuid(31));
    expect(first!.playerIds).toEqual([uuid(11)]);
    expect(first!.restrictionTags).toEqual(["contact"]);
    expect(second!.drillId).toBeNull();
    expect(session.checks.map((c) => c.code)).toContain("unknown_drill");
  });

  it("avisa si un limitado entra en una tarea que choca con sus restricciones o pasa sus minutos", () => {
    const resolved = resolveProposal(
      output([
        {
          block: "main",
          items: [item({ drill: "T1", minutes: 20 }), item({ minutes: 20 })],
        },
      ]),
      context(),
    );
    const checks = resolved.sessions[0]!.checks;
    expect(checks).toContainEqual({
      code: "restriction",
      playerId: uuid(12),
      values: { title: "Tarea", tags: "contact" },
    });
    expect(checks).toContainEqual({
      code: "max_minutes",
      playerId: uuid(12),
      values: { minutes: 40, max: 30 },
    });
  });

  it("saca a los de baja de las tareas y quita las tareas que se quedan sin nadie", () => {
    const resolved = resolveProposal(
      output([
        {
          block: "main",
          items: [item({ players: ["J1", "J3"] }), item({ title: "Solo J3", players: ["J3"] })],
        },
      ]),
      context(),
    );
    const session = resolved.sessions[0]!;
    expect(session.blocks[0]!.items).toHaveLength(1);
    expect(session.blocks[0]!.items[0]!.playerIds).toEqual([uuid(11)]);
    expect(session.checks.filter((c) => c.code === "player_out")).toHaveLength(2);
  });

  it("lleva a la parte principal los bloques que el perfil no usa y avisa si se pasa de tiempo", () => {
    const yoga = aiProfileFor("yoga", false);
    const resolved = resolveProposal(
      output([
        { block: "goalkeepers", items: [item({ minutes: 50 })] },
        { block: "main", items: [item({ minutes: 50 })] },
      ]),
      context({ profile: yoga }),
    );
    const session = resolved.sessions[0]!;
    expect(session.blocks.map((b) => b.block)).toEqual(["main"]);
    expect(session.plannedMinutes).toBe(100);
    expect(session.checks.map((c) => c.code)).toEqual(
      expect.arrayContaining(["block_moved", "over_time"]),
    );
  });

  it("ignora sesiones que no se pidieron", () => {
    const resolved = resolveProposal(output([], "S9"), context());
    expect(resolved.sessions).toEqual([]);
    expect(resolved.checks).toEqual([
      { code: "unknown_session", playerId: null, values: { ref: "S9" } },
    ]);
  });
});

describe("coste", () => {
  it("cuenta en millonésimas de dólar con el precio del modelo", () => {
    const usage = {
      inputTokens: 25_000,
      outputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(aiCostMicros("claude-opus-5-5", usage)).toBe(300_000);
    expect(aiCostMicros("claude-sonnet-5-5", usage)).toBe(150_000);
    expect(aiCostMicros("desconocido", usage)).toBe(300_000);
  });
});
