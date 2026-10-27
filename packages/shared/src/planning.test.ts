import { describe, expect, it } from "vitest";
import {
  availableOn,
  buildPlanStructure,
  emphasisTotal,
  engineMinutesFor,
  inventoryOn,
  missingEquipment,
  normalizeEmphasis,
  planEndsOn,
  planTemplateByCode,
  planWeekOf,
  prescriptionFor,
  progressionTable,
  roleOn,
  rolesForWeek,
  suggestedClosures,
  testsByDay,
  type BoxEquipmentKind,
} from "./planning.ts";
import {
  calibrationOf,
  coverageOf,
  frequentCombos,
  logisticsOf,
  patternsOfExercise,
  projectedValue,
  projectPlan,
  reviewWeek,
  suggestLevels,
  validateSession,
  weekLimits,
  type ValidationBlock,
} from "./planning-analysis.ts";
import { draftWeek } from "./planning-drafts.ts";
import {
  resolveArchitect,
  resolveCopilot,
  resolveWeek,
  type AiPlanWeekContext,
} from "./planning-ai.ts";
import { WorkoutUpsertSchema } from "./fitness.ts";

const open = planTemplateByCode("open")!;
const SIX = [1, 2, 3, 4, 5, 6];

describe("plan: estructura", () => {
  const closures = suggestedClosures("2026-11-02", "2027-02-21");
  const plan = buildPlanStructure({
    template: open,
    startsOn: "2026-11-02",
    weeks: 16,
    classWeekdays: SIX,
    closures,
  });

  it("propone los festivos y las vísperas que un box suele cerrar", () => {
    expect(closures).toEqual([
      "2026-12-06",
      "2026-12-08",
      "2026-12-24",
      "2026-12-25",
      "2026-12-31",
      "2027-01-01",
      "2027-01-06",
    ]);
  });

  it("empieza y acaba con test, y deja las semanas de Navidad en mantenimiento", () => {
    expect(plan.weeks).toHaveLength(16);
    expect(plan.weeks[0]!.kind).toBe("test");
    expect(plan.weeks[15]!.kind).toBe("test");
    expect(plan.weeks[15]!.tags).toContain("retest");
    expect(plan.weeks[7]!.kind).toBe("maintenance");
    expect(plan.weeks[8]!.kind).toBe("maintenance");
    expect(plan.weeks[7]!.tags).toContain("holiday");
  });

  it("va de base a desarrollo y a realización, con descargas", () => {
    const kinds = plan.weeks.map((w) => w.kind);
    expect(kinds.indexOf("base")).toBeLessThan(kinds.indexOf("build"));
    expect(kinds.lastIndexOf("build")).toBeLessThan(kinds.indexOf("peak"));
    expect(kinds.filter((k) => k === "deload").length).toBeGreaterThanOrEqual(1);
    // Nunca más de cinco semanas de carga seguidas.
    let run = 0;
    for (const k of kinds) {
      run = k === "base" || k === "build" || k === "peak" ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(5);
    }
  });

  it("cada bloque suma 100 puntos y la realización sube la intensidad", () => {
    for (const b of plan.blocks) expect(emphasisTotal(b.emphasis)).toBe(100);
    const peak = plan.blocks.find((b) => b.kind === "peak")!;
    expect(peak.emphasis.intensity).toBeGreaterThan(open.emphasis.intensity);
  });

  it("un festivo deja el día sin papel sin mover los demás", () => {
    const week6 = plan.weeks[5]!; // 7 a 13 de diciembre: el martes 8 cierra
    expect(week6.closed).toEqual([2]);
    expect(week6.roles[1]).toBeNull();
    expect(week6.roles[0]).toBe("heavy_lower");
  });

  it("la semana y el papel de una fecha", () => {
    expect(planWeekOf("2026-11-02", 16, "2026-11-30")).toBe(5);
    expect(planWeekOf("2026-11-02", 16, "2026-11-01")).toBeNull();
    expect(planEndsOn("2026-11-02", 16)).toBe("2027-02-21");
    expect(roleOn(plan, "2026-11-02", "2026-11-12")).toBe("long_engine");
  });

  it("es determinista", () => {
    const again = buildPlanStructure({
      template: open,
      startsOn: "2026-11-04",
      weeks: 16,
      classWeekdays: SIX,
      closures,
    });
    expect(again).toEqual(plan);
  });

  it("con dos días de clase se queda con los papeles de más prioridad", () => {
    expect(rolesForWeek("crossfit", "base", [2, 4])).toEqual([
      null,
      "heavy_lower",
      null,
      "gymnastics_engine",
      null,
      null,
      null,
    ]);
  });

  it("acepta los bloques que decide el arquitecto", () => {
    const s = buildPlanStructure({
      template: planTemplateByCode("custom")!,
      startsOn: "2026-11-02",
      weeks: 6,
      classWeekdays: SIX,
      phases: [
        { kind: "base", weeks: 3, focus: "Sentadilla" },
        { kind: "deload", weeks: 1 },
        { kind: "build", weeks: 2 },
      ],
    });
    expect(s.blocks.map((b) => [b.kind, b.weeks, b.focus])).toEqual([
      ["base", 3, "Sentadilla"],
      ["deload", 1, null],
      ["build", 2, null],
    ]);
  });
});

describe("plan: progresiones", () => {
  const plan = buildPlanStructure({
    template: open,
    startsOn: "2026-11-02",
    weeks: 16,
    classWeekdays: SIX,
  });

  it("la sentadilla sube cada semana de la base y baja en la descarga", () => {
    const base = plan.blocks.find((b) => b.kind === "base")!;
    const first = prescriptionFor(plan, base.startWeek, "heavy_lower")!;
    const second = prescriptionFor(plan, base.startWeek + 1, "heavy_lower")!;
    expect(first.movementCode).toBe("back_squat");
    expect(second.percent).toBeGreaterThan(first.percent);
    const deload = plan.weeks.find((w) => w.kind === "deload")!;
    expect(prescriptionFor(plan, deload.n, "heavy_lower")!.percent).toBeLessThan(first.percent);
  });

  it("en semana de test se busca la máxima", () => {
    expect(prescriptionFor(plan, 1, "heavy_lower")).toEqual({
      movementCode: "back_squat",
      sets: 1,
      reps: 1,
      percent: 100,
      rmReps: 1,
    });
  });

  it("los días sin levantamiento no tienen prescripción, y el motor largo crece", () => {
    expect(prescriptionFor(plan, 2, "gymnastics_engine")).toBeNull();
    expect(engineMinutesFor(plan, 3)!).toBeGreaterThan(engineMinutesFor(plan, 2)!);
  });

  it("la tabla de progresiones tiene una fila por levantamiento", () => {
    const rows = progressionTable(plan, 2, 5);
    expect(rows.find((r) => r.movementCode === "back_squat")?.weeks.filter(Boolean).length).toBe(4);
  });

  it("reparte los tests: máximas el primer día de test, benchmarks después", () => {
    const byDay = testsByDay(plan.weeks[0]!, open.tests);
    expect(byDay.get(1)).toEqual(["back_squat"]);
    expect([...byDay.values()].flat().sort()).toEqual([...open.tests].sort());
  });
});

describe("plan: énfasis y material", () => {
  it("normaliza a 100 de cinco en cinco", () => {
    const e = normalizeEmphasis({
      strength: 3,
      weightlifting: 1,
      gymnastics: 1,
      engine: 1,
      intensity: 0,
      mobility: 0,
    });
    expect(emphasisTotal(e)).toBe(100);
    expect(Object.values(e).every((v) => v % 5 === 0)).toBe(true);
    expect(e.strength).toBe(50);
  });

  it("cuenta lo que está en reparación hasta su fecha", () => {
    const line = {
      kind: "rower" as const,
      quantity: 6,
      outOfService: 1,
      repairUntil: "2026-12-03",
    };
    expect(availableOn(line, "2026-12-01")).toBe(5);
    expect(availableOn(line, "2026-12-03")).toBe(6);
    const inv = inventoryOn(
      [line, { kind: "rower", quantity: 2, outOfService: 0, repairUntil: null }],
      "2026-12-01",
    );
    expect(inv.get("rower")).toBe(7);
  });

  it("avisa del material que pide una plantilla y no hay", () => {
    const inv = new Map<BoxEquipmentKind, number>([
      ["rings", 8],
      ["pullup_bar", 12],
    ]);
    expect(missingEquipment(planTemplateByCode("muscle_up")!, inv)).toEqual(["parallettes"]);
    expect(missingEquipment(planTemplateByCode("muscle_up")!, new Map())).toEqual([]);
  });
});

describe("proyección", () => {
  it("da rangos que crecen con la frecuencia y la calibración", () => {
    const base = projectPlan({
      emphasis: open.emphasis,
      weeks: 16,
      frequency: 3,
      tests: open.tests,
    });
    const two = projectPlan({
      emphasis: open.emphasis,
      weeks: 16,
      frequency: 2,
      tests: open.tests,
    });
    const squat = base.tests.find((x) => x.code === "back_squat")!;
    expect(squat.low).toBeCloseTo(3);
    expect(squat.high).toBeCloseTo(6);
    expect(two.tests.find((x) => x.code === "back_squat")!.high).toBeLessThan(squat.high);
    const calibrated = projectPlan({
      emphasis: open.emphasis,
      weeks: 16,
      frequency: 3,
      tests: open.tests,
      calibration: 1.4,
    });
    expect(calibrated.tests.find((x) => x.code === "back_squat")!.high).toBeGreaterThan(squat.high);
    expect(base.capacities.find((c) => c.capacity === "mobility")!.band).toBe("maintain");
  });

  it("en un tiempo, mejorar es bajar", () => {
    const v = projectedValue("fran", 372, { code: "fran", unit: "percent", low: 10, high: 20 });
    expect(v.low).toBeCloseTo(297.6);
    expect(v.high).toBeCloseTo(334.8);
    const reps = projectedValue("max_pullups", 7, {
      code: "max_pullups",
      unit: "reps",
      low: 1.5,
      high: 3,
    });
    expect(reps).toEqual({ low: 8, high: 10 });
  });

  it("calibra con lo que pasó de verdad, con límites", () => {
    expect(calibrationOf([{ predictedPct: 5, realPct: 6 }])).toBeCloseTo(1.2);
    expect(calibrationOf([{ predictedPct: 5, realPct: 50 }])).toBe(1.5);
    expect(calibrationOf([])).toBeNull();
  });
});

describe("cobertura por frecuencia", () => {
  const attendance = [
    ...["2026-11-02", "2026-11-04", "2026-11-06"].map((date) => ({ playerId: "a", date })),
    ...["2026-11-09", "2026-11-11", "2026-11-13"].map((date) => ({ playerId: "a", date })),
    ...["2026-11-03", "2026-11-05"].map((date) => ({ playerId: "b", date })),
    ...["2026-11-10", "2026-11-12"].map((date) => ({ playerId: "b", date })),
    ...["2026-11-02", "2026-11-05"].map((date) => ({ playerId: "c", date })),
    ...["2026-11-09", "2026-11-12"].map((date) => ({ playerId: "c", date })),
  ];

  it("encuentra las combinaciones habituales", () => {
    const combos = frequentCombos(attendance);
    expect(combos[0]).toMatchObject({ days: [1, 3, 5], share: 1 });
    expect(combos.map((c) => c.days.join(","))).toEqual(["1,3,5", "2,4", "1,4"]);
  });

  it("dice qué falta y en qué día se añade", () => {
    const roles = rolesForWeek("crossfit", "base", SIX);
    const coverage = coverageOf(roles, frequentCombos(attendance), [
      "strength",
      "gymnastics",
      "engine",
    ]);
    const tueThu = coverage.find((c) => c.days.join(",") === "2,4")!;
    expect(tueThu.missing).toEqual([{ capacity: "strength", addTo: 4 }]);
    const monThu = coverage.find((c) => c.days.join(",") === "1,4")!;
    expect(monThu.missing).toEqual([{ capacity: "gymnastics", addTo: 4 }]);
    const fixed = coverageOf(
      roles,
      frequentCombos(attendance),
      ["strength"],
      [{ weekday: 4, capacity: "strength" }],
    );
    expect(fixed.every((c) => c.missing.length === 0)).toBe(true);
  });
});

describe("validador", () => {
  const block = (over: Partial<ValidationBlock> = {}): ValidationBlock => ({
    label: "C",
    kind: "wod",
    track: "class",
    scoreType: "time",
    plannedMinutes: 10,
    movementCode: null,
    percent: null,
    equipment: ["rower", "bike", "ski"],
    patterns: ["machine"],
    exercises: 3,
    hasLevels: { foundations: true, scaled: true, rx: true, rxPlus: true },
    ...over,
  });
  const inventory = new Map<BoxEquipmentKind, number>([
    ["rower", 6],
    ["bike", 4],
    ["ski", 3],
    ["barbell", 14],
    ["kettlebell", 5],
  ]);

  it("las máquinas van en bolsa: 13 puestos para 14 es una oleada", () => {
    expect(logisticsOf(block(), inventory, 14)).toMatchObject({
      kind: "machines",
      available: 13,
      mode: "pool",
    });
    expect(logisticsOf(block({ equipment: ["kettlebell"] }), inventory, 14)).toMatchObject({
      mode: "waves",
      waves: 3,
    });
    expect(logisticsOf(block({ equipment: ["kettlebell"] }), inventory, 10)).toMatchObject({
      mode: "partners",
    });
  });

  it("aprueba una sesión que cabe y avisa de lo que no", () => {
    const ok = validateSession({
      blocks: [
        block(),
        block({
          label: "B",
          kind: "strength",
          equipment: ["barbell"],
          patterns: ["squat"],
          movementCode: "back_squat",
          percent: 82,
          plannedMinutes: 20,
        }),
      ],
      inventory,
      classSize: 14,
      classMinutes: 60,
      previousHeavy: [],
      prescriptions: [{ movementCode: "back_squat", sets: 4, reps: 3, percent: 82, rmReps: null }],
    });
    expect(ok.every((r) => r.status === "ok")).toBe(true);

    const bad = validateSession({
      blocks: [
        block({ equipment: ["ghd"], plannedMinutes: 70 }),
        block({
          label: "B",
          kind: "strength",
          equipment: ["barbell"],
          patterns: ["squat"],
          movementCode: "back_squat",
          percent: 75,
          plannedMinutes: 10,
          hasLevels: { foundations: false, scaled: true, rx: true, rxPlus: false },
        }),
      ],
      inventory,
      classSize: 14,
      classMinutes: 60,
      previousHeavy: ["squat"],
      prescriptions: [{ movementCode: "back_squat", sets: 4, reps: 3, percent: 82, rmReps: null }],
    });
    const status = Object.fromEntries(bad.map((r) => [r.check, r.status]));
    expect(status).toMatchObject({
      equipment: "fail",
      time: "fail",
      pattern: "warn",
      progression: "warn",
    });
  });

  it("vigila los límites de la semana", () => {
    const limits = weekLimits([
      { weekday: 1, patterns: ["squat"], heavy: true },
      { weekday: 2, patterns: ["press_vertical"], heavy: true },
      { weekday: 3, patterns: ["olympic"], heavy: true },
      { weekday: 5, patterns: ["press_vertical", "run"], heavy: false },
    ]);
    expect(limits.find((l) => l.code === "heavy_streak")).toMatchObject({ value: 3, max: 2 });
    expect(limits.find((l) => l.code === "overhead_days")).toMatchObject({ value: 2 });
  });

  it("saca los patrones de un ejercicio", () => {
    expect(patternsOfExercise({ name: "Back squat", movementCode: "back_squat" })).toContain(
      "squat",
    );
    expect(patternsOfExercise({ name: "Remo", equipment: ["rower"] })).toContain("machine");
    expect(patternsOfExercise({ name: "Carrera", equipment: [] })).toContain("run");
    expect(patternsOfExercise({ name: "Toes to bar", equipment: ["pullup_bar"] })).toContain(
      "gymnastics_bar",
    );
  });
});

describe("revisión del domingo", () => {
  it("compara lo previsto con lo real y propone ajustes", () => {
    const review = reviewWeek({
      days: [
        {
          workoutId: "w-tue",
          date: "2026-11-24",
          role: "gymnastics_engine",
          domain: "medium",
          effort: 3,
          attendees: 30,
          blocks: [
            {
              id: "b1",
              kind: "wod",
              scoreType: "time",
              timeCapSeconds: 1200,
              plannedMinutes: 16,
              movementCode: null,
              percent: null,
              modality: "run",
              results: [1100, 1130, 1150].map((t) => ({
                timeSeconds: t,
                completed: true,
                effort: 4,
              })),
            },
          ],
        },
        {
          workoutId: "w-thu",
          date: "2026-11-26",
          role: "long_engine",
          domain: "very_long",
          effort: 2,
          attendees: 28,
          blocks: [
            {
              id: "b2",
              kind: "wod",
              scoreType: "calories",
              timeCapSeconds: null,
              plannedMinutes: 32,
              movementCode: null,
              percent: null,
              modality: "other",
              results: [3, 4, 3].map((effort) => ({ timeSeconds: null, completed: true, effort })),
            },
          ],
        },
        {
          workoutId: "w-mon",
          date: "2026-11-23",
          role: "heavy_lower",
          domain: "short",
          effort: 4,
          attendees: 32,
          blocks: [
            {
              id: "b3",
              kind: "strength",
              scoreType: "load",
              timeCapSeconds: null,
              plannedMinutes: 20,
              movementCode: "back_squat",
              percent: 78,
              modality: "other",
              results: [true, false, false, true].map((completed) => ({
                timeSeconds: null,
                completed,
                effort: 4,
              })),
            },
          ],
        },
      ],
      usualAttendees: 95,
      logged: 0.78,
      next: [
        {
          workoutId: "n-tue",
          date: "2026-12-01",
          role: "gymnastics_engine",
          feel: null,
          blocks: [
            {
              id: "nb1",
              kind: "wod",
              timeCapSeconds: 1200,
              plannedMinutes: 20,
              movementCode: null,
              percent: null,
              modality: "run",
            },
          ],
        },
        { workoutId: "n-thu", date: "2026-12-03", role: "long_engine", feel: null, blocks: [] },
        {
          workoutId: "n-mon",
          date: "2026-11-30",
          role: "heavy_lower",
          feel: null,
          blocks: [
            {
              id: "nb3",
              kind: "strength",
              timeCapSeconds: null,
              plannedMinutes: 20,
              movementCode: "back_squat",
              percent: 82,
              modality: "other",
            },
            {
              id: "nw",
              kind: "warmup",
              timeCapSeconds: null,
              plannedMinutes: 12,
              movementCode: null,
              percent: null,
              modality: "other",
            },
          ],
        },
      ],
      gaps: [{ weekday: 1, capacity: "gymnastics", days: [1, 4] }],
    });
    const byId = Object.fromEntries(review.rows.map((r) => [r.workoutId, r.verdict]));
    expect(byId).toEqual({ "w-tue": "longer", "w-thu": "harder", "w-mon": "harder" });
    const kinds = review.adjustments.map((a) => a.kind).sort();
    expect(kinds).toEqual(["cap", "coverage", "pace", "percent"]);
    const cap = review.adjustments.find((a) => a.kind === "cap")!;
    expect(cap.params.before).toBe(20);
    expect(Number(cap.params.after)).toBeLessThan(20);
    expect(review.adjustments.find((a) => a.kind === "percent")!.params).toMatchObject({
      before: 82,
      after: 78,
    });
    expect(review.learned.find((l) => l.code === "time_run")!.value).toBeGreaterThan(0);
    expect(review.kpis.logged).toBe(78);
  });
});

describe("nivel sugerido", () => {
  it("Iniciación al principio, luego lo que completa", () => {
    const today = "2026-11-30";
    expect(suggestLevels([], "2026-10-01", today)[0]).toMatchObject({
      level: "foundations",
      reason: "new",
    });
    const results = [
      { capacity: "strength" as const, level: "rx" as const, completed: true, date: "2026-11-20" },
      { capacity: "strength" as const, level: "rx" as const, completed: true, date: "2026-11-27" },
      {
        capacity: "gymnastics" as const,
        level: "scaled" as const,
        completed: false,
        date: "2026-11-27",
      },
    ];
    const levels = Object.fromEntries(
      suggestLevels(results, "2025-01-01", today).map((l) => [l.capacity, [l.level, l.reason]]),
    );
    expect(levels).toEqual({
      strength: ["rx", "completed"],
      weightlifting: ["scaled", "default"],
      gymnastics: ["scaled", "frequent"],
      engine: ["scaled", "default"],
    });
  });
});

describe("borradores de la semana", () => {
  const plan = buildPlanStructure({
    template: open,
    startsOn: "2026-11-02",
    weeks: 16,
    classWeekdays: SIX,
  });

  it("escribe un borrador válido por día con clase, sin pisar los que ya hay", () => {
    const drafts = draftWeek({
      plan: { id: "11111111-1111-4111-8111-111111111111", startsOn: "2026-11-02", weeks: 16 },
      structure: plan,
      week: 2,
      sectionId: "22222222-2222-4222-8222-222222222222",
      locale: "es",
      taken: ["2026-11-10"],
      complements: [{ weekday: 4, capacity: "strength", days: [2, 4] }],
      tests: open.tests,
    });
    expect(drafts.map((d) => d.onDate)).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    for (const d of drafts) expect(WorkoutUpsertSchema.safeParse(d).success).toBe(true);
    const monday = drafts[0]!;
    expect(monday.dayRole).toBe("heavy_lower");
    expect(monday.blocks.find((b) => b.kind === "strength")).toMatchObject({
      movementCode: "back_squat",
      percent: 70,
    });
    const thursday = drafts.find((d) => d.onDate === "2026-11-12")!;
    expect(thursday.blocks[1]).toMatchObject({ kind: "skill", capacity: "strength" });
    expect(thursday.blocks[1]!.title).toContain("goblet");
    expect(thursday.why).toContain("L · J".replace("L", "M"));
  });

  it("la semana de test lleva sus pruebas", () => {
    const drafts = draftWeek({
      plan: { id: "11111111-1111-4111-8111-111111111111", startsOn: "2026-11-02", weeks: 16 },
      structure: plan,
      week: 1,
      sectionId: "22222222-2222-4222-8222-222222222222",
      locale: "en",
      taken: [],
      tests: open.tests,
    });
    const blocks = drafts.flatMap((d) => d.blocks.map((b) => b.title));
    expect(blocks).toContain("Back squat 1RM");
    expect(blocks).toContain("Fran");
    expect(blocks).toContain("2K row");
  });
});

describe("IA del plan", () => {
  const library = new Map([["remo", "33333333-3333-4333-8333-333333333333"]]);

  it("el arquitecto devuelve un plan que cuadra", () => {
    const p = resolveArchitect({
      templateCode: "nope",
      name: "Fuerza hasta Semana Santa",
      weeks: 99,
      emphasis: {
        strength: 50,
        weightlifting: 10,
        gymnastics: 10,
        engine: 20,
        intensity: 7,
        mobility: 3,
      },
      phases: [
        { kind: "test", weeks: 1, focus: null },
        { kind: "base", weeks: 4, focus: "Básicos" },
        { kind: "deload", weeks: 1, focus: null },
        { kind: "weird", weeks: 3, focus: null },
        { kind: "test", weeks: 1, focus: null },
      ],
      tests: ["back_squat", "unknown"],
      rationale: "Porque sí.",
    })!;
    expect(p.templateCode).toBe("custom");
    expect(p.weeks).toBe(7);
    expect(emphasisTotal(p.emphasis)).toBe(100);
    expect(p.tests).toEqual(["back_squat"]);
  });

  it("el programador respeta la prescripción y enlaza la biblioteca", () => {
    const context: Pick<AiPlanWeekContext, "days"> = {
      days: [
        {
          date: "2026-11-30",
          weekday: 1,
          role: "heavy_lower",
          roleName: "Pesado y corto",
          domain: "short",
          effort: 4,
          prescription: {
            movementCode: "back_squat",
            sets: 4,
            reps: 3,
            percent: 82,
            rmReps: null,
            movementName: "Back squat",
          },
          engineMinutes: null,
          complements: [],
          taken: false,
        },
      ],
    };
    const raw = (date: string) => ({
      date,
      title: "Sentadilla y sprint",
      intentFeel: "Sin parar",
      why: ["Progresión"],
      blocks: [
        {
          kind: "strength",
          track: "class",
          capacity: "strength",
          title: "Back squat",
          description: "4x3",
          scoreType: "load",
          timeCapSeconds: null,
          plannedMinutes: 20,
          movementCode: "front_squat",
          percent: 90,
          rmReps: null,
          exercises: [],
          foundations: null,
          scaled: null,
          rx: null,
          rxPlus: null,
        },
        {
          kind: "wod",
          track: "class",
          capacity: "intensity",
          title: "21-15-9",
          description: "cal",
          scoreType: "time",
          timeCapSeconds: 420,
          plannedMinutes: 9,
          movementCode: null,
          percent: null,
          rmReps: null,
          exercises: ["Remo", "Desconocido"],
          foundations: "15-12-9",
          scaled: "s",
          rx: "r",
          rxPlus: "rp",
        },
      ],
    });
    const sessions = resolveWeek(
      { days: [raw("2026-11-30"), raw("2026-12-25")] },
      context,
      library,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.blocks[0]).toMatchObject({ movementCode: "back_squat", percent: 82 });
    expect(sessions[0]!.blocks[1]!.exerciseIds).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("el copiloto solo cambia fechas del plan desde hoy", () => {
    const proposal = resolveCopilot(
      {
        reply: "Cae en descarga.",
        changes: [
          {
            op: "clear",
            date: "2026-12-10",
            toDate: null,
            before: "WOD",
            after: "Cerrado",
            why: "Cierra",
            session: null,
          },
          {
            op: "clear",
            date: "2026-11-01",
            toDate: null,
            before: "",
            after: "",
            why: "",
            session: null,
          },
          {
            op: "move",
            date: "2026-12-14",
            toDate: "2027-05-01",
            before: "",
            after: "",
            why: "",
            session: null,
          },
          {
            op: "note",
            date: "",
            toDate: null,
            before: "",
            after: "Aviso",
            why: "Ojo",
            session: null,
          },
        ],
      },
      {
        days: [],
        today: "2026-11-30",
        plan: { startsOn: "2026-11-02", endsOn: "2027-02-21" } as never,
      },
      library,
    )!;
    expect(proposal.changes.map((c) => c.op)).toEqual(["clear", "note"]);
  });
});
