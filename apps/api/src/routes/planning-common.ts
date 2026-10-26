import {
  addDays,
  blockEmphasis,
  blockLabel,
  CAPACITIES,
  coverageOf,
  disciplineOf,
  essentialCapacities,
  frequentCombos,
  inventoryOn,
  logisticsOf,
  patternsOfExercise,
  planEndsOn,
  planWeekOf,
  planTestByCode,
  planWeekStart,
  prescriptionFor,
  validateSession,
  weekLimits,
  type BlockLogistics,
  type BoxEquipmentKind,
  type Capacity,
  type ComboCoverage,
  type DayRole,
  type DayCombo,
  type Emphasis,
  type MovementPattern,
  type PlanDiscipline,
  type PlanSummary,
  type PlanView,
  type Prescription,
  type ValidationBlock,
  type ValidationResult,
  type WeekLimit,
  type WorkoutUpsert,
} from "@sportsmanager/shared";
import {
  instantOf,
  type BoxPlanRecord,
  type DataLayer,
  type ExerciseRecord,
  type OrgScope,
  type WorkoutBlockRecord,
  type WorkoutRecord,
} from "../data/index.ts";
import { accessScopeOf } from "../http/actor.ts";
import { forbidden, notFound } from "../http/errors.ts";
import { orgOf, todayIn, type Ctx } from "./fitness-common.ts";

/**
 * Piezas comunes de la planificación del box (ADR 0053): qué disciplinas ve y planifica quien
 * pregunta, cómo sale un plan en la API y todo lo que se calcula de una semana del plan (validación
 * de cada sesión, logística en la sala, equilibrio, cobertura por frecuencia y límites).
 */

const DAY = 86_400_000;

/** Disciplinas de fitness que ve quien pregunta y en cuáles planifica (como en el WOD). */
export async function planSections(data: DataLayer, c: Ctx) {
  const tenant = orgOf(c);
  const actor = c.get("actor");
  const access = await accessScopeOf(data, c);
  const sections = await data.fitness.fitnessSections(tenant.scope);
  const visible =
    access.kind === "club" ? sections : sections.filter((s) => access.sectionIds.includes(s.id));
  let writable: string[] = [];
  if (actor.permissions.has("org.training.write")) writable = visible.map((s) => s.id);
  else if (actor.permissions.has("org.training.write_own")) {
    const own = await data.memberships.ownTeamIds(tenant.scope, actor.userId);
    const season = await data.seasons.current(tenant.scope);
    for (const s of visible) {
      const teams = season ? await data.teams.list(tenant.scope, season.id, s.id, own) : [];
      if (teams.length > 0) writable.push(s.id);
    }
  }
  return { visible, writable };
}

/** Un plan del club que quien pregunta puede ver. */
export async function requirePlan(data: DataLayer, c: Ctx, id: string) {
  const plan = await data.planning.plans.byId(orgOf(c).scope, id);
  const sections = await planSections(data, c);
  if (!plan || !sections.visible.some((s) => s.id === plan.section.id))
    throw notFound("Ese plan no existe.");
  return { plan, canWrite: sections.writable.includes(plan.section.id) };
}

export function requireWritablePlan(canWrite: boolean) {
  if (!canWrite) throw forbidden("Solo planificas en las disciplinas de tus clases.");
}

export function currentWeekOf(plan: BoxPlanRecord, today: string): number | null {
  return planWeekOf(plan.startsOn, plan.weeks, today);
}

export function planSummaryDto(plan: BoxPlanRecord, today: string): PlanSummary {
  return {
    id: plan.id,
    section: plan.section,
    name: plan.name,
    templateCode: plan.templateCode,
    status: plan.status,
    startsOn: plan.startsOn,
    endsOn: planEndsOn(plan.startsOn, plan.weeks),
    weeks: plan.weeks,
    currentWeek: currentWeekOf(plan, today),
  };
}

/** La mediana de un número por atleta. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** La marca de partida de cada test: la mediana de la mejor de cada atleta antes de empezar. */
export async function baselinesOf(
  data: DataLayer,
  scope: OrgScope,
  plan: Pick<BoxPlanRecord, "tests" | "startsOn">,
): Promise<Record<string, number>> {
  const marks = await data.planning.testMarks(scope, plan.tests);
  const out: Record<string, number> = {};
  for (const code of plan.tests) {
    const lower = planTestByCode(code)?.lowerIsBetter ?? false;
    const best = new Map<string, number>();
    for (const m of marks) {
      if (m.code !== code || m.date >= plan.startsOn) continue;
      const cur = best.get(m.playerId);
      if (cur === undefined || (lower ? m.value < cur : m.value > cur))
        best.set(m.playerId, m.value);
    }
    const med = medianOf([...best.values()]);
    if (med !== null) out[code] = Math.round(med * 10) / 10;
  }
  return out;
}

export async function planViewDto(
  data: DataLayer,
  scope: OrgScope,
  plan: BoxPlanRecord,
  today: string,
  canWrite: boolean,
): Promise<PlanView> {
  const [baselines, workouts] = await Promise.all([
    baselinesOf(data, scope, plan),
    data.planning.plans.workoutCount(scope, plan.id),
  ]);
  return {
    ...planSummaryDto(plan, today),
    goal: plan.goal,
    eventName: plan.eventName,
    eventDate: plan.eventDate,
    emphasis: plan.emphasis,
    frequency: plan.frequency,
    tests: plan.tests,
    closures: plan.closures,
    structure: plan.structure,
    projection: plan.projection,
    baselines,
    workouts,
    canWrite,
    createdAt: plan.createdAt.toISOString(),
  };
}

/** La disciplina del motor para una sección: por su deporte y su nombre. */
export async function disciplineFor(
  data: DataLayer,
  scope: OrgScope,
  section: { id: string; name: string },
): Promise<{ discipline: PlanDiscipline; sport: string | null }> {
  const training = await data.training.sectionTraining(scope, section.id);
  const sportCode = training?.sportCode ?? null;
  return { discipline: disciplineOf(sportCode, section.name), sport: sportCode };
}

// --- Una semana del plan ---

export interface WeekContext {
  plan: BoxPlanRecord;
  n: number;
  monday: string;
  dates: string[];
  workouts: Map<string, WorkoutRecord>;
  exercises: Map<string, ExerciseRecord>;
  inventory: Awaited<ReturnType<DataLayer["planning"]["equipment"]["lines"]>>;
  schedule: Awaited<ReturnType<DataLayer["planning"]["schedule"]>>;
  classes: Map<string, { count: number; capacity: number }>;
  combos: DayCombo[];
}

/** Lo que hace falta para mirar una semana: sus WODs, la biblioteca, el material y la gente. */
export async function loadWeek(
  data: DataLayer,
  scope: OrgScope,
  timezone: string,
  plan: BoxPlanRecord,
  n: number,
  now = new Date(),
): Promise<WeekContext> {
  const monday = planWeekStart(plan.startsOn, n);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [list, exercises, inventory, schedule, classes, attendance] = await Promise.all([
    data.workouts.list(scope, addDays(monday, -1), addDays(monday, 6), {
      sectionIds: [plan.section.id],
    }),
    data.exercises.list(scope, { includeArchived: true }),
    data.planning.equipment.lines(scope),
    data.planning.schedule(scope, plan.section.id),
    data.planning.classesByDay(
      scope,
      plan.section.id,
      instantOf(timezone, monday),
      instantOf(timezone, addDays(monday, 7)),
      timezone,
    ),
    data.planning.attendance(
      scope,
      plan.section.id,
      new Date(now.getTime() - 56 * DAY),
      now,
      timezone,
    ),
  ]);
  // Un WOD por día: el de la disciplina entera antes que el de un tipo de clase.
  const workouts = new Map<string, WorkoutRecord>();
  for (const w of list) {
    const cur = workouts.get(w.onDate);
    if (!cur || (cur.team && !w.team)) workouts.set(w.onDate, w);
  }
  return {
    plan,
    n,
    monday,
    dates,
    workouts,
    exercises: new Map(exercises.map((e) => [e.id, e])),
    inventory,
    schedule,
    classes,
    combos: frequentCombos(attendance),
  };
}

/** Patrones y material de un bloque: los de sus ejercicios y su movimiento del catálogo. */
export function blockFacts(
  b: Pick<WorkoutBlockRecord, "exerciseIds" | "movementCode" | "title">,
  exercises: ReadonlyMap<string, ExerciseRecord>,
): { equipment: string[]; patterns: MovementPattern[] } {
  const equipment = new Set<string>();
  const patterns = new Set<MovementPattern>();
  for (const id of b.exerciseIds) {
    const e = exercises.get(id);
    if (!e) continue;
    for (const k of e.equipment) equipment.add(k);
    for (const p of patternsOfExercise(e)) patterns.add(p);
  }
  if (b.movementCode) {
    equipment.add("barbell");
    for (const p of patternsOfExercise({ name: b.title, movementCode: b.movementCode }))
      patterns.add(p);
  }
  return { equipment: [...equipment], patterns: [...patterns] };
}

export function validationBlocks(
  w: WorkoutRecord,
  exercises: ReadonlyMap<string, ExerciseRecord>,
): ValidationBlock[] {
  return w.blocks.map((b, i) => {
    const facts = blockFacts(b, exercises);
    return {
      label: String.fromCharCode(65 + i),
      kind: b.kind,
      track: b.track,
      scoreType: b.scoreType,
      plannedMinutes: b.plannedMinutes,
      movementCode: b.movementCode,
      percent: b.percent,
      equipment: facts.equipment,
      patterns: facts.patterns,
      exercises: b.exerciseIds.filter((id) => exercises.has(id)).length,
      hasLevels: {
        foundations: !!b.foundations,
        scaled: !!b.scaled,
        rx: !!b.rx,
        rxPlus: !!b.rxPlus,
      },
    };
  });
}

/** Patrones de barra pesada de un día: para no repetirlos el siguiente. */
function heavyPatterns(
  w: WorkoutRecord | undefined,
  exercises: ReadonlyMap<string, ExerciseRecord>,
) {
  if (!w) return [];
  return w.blocks
    .filter((b) => b.kind === "strength" && (b.percent ?? 0) >= 75)
    .flatMap((b) => blockFacts(b, exercises).patterns);
}

export interface WeekDayAnalysis {
  date: string;
  weekday: number;
  role: DayRole | null;
  closed: boolean;
  classes: number;
  classSize: number;
  workout: WorkoutRecord | null;
  validation: ValidationResult[];
  logistics: BlockLogistics[];
  prescription: Prescription | null;
}

/** Cada día de la semana con su papel, su WOD, su validación y su logística. */
export function analyseDays(ctx: WeekContext): WeekDayAnalysis[] {
  const week = ctx.plan.structure.weeks[ctx.n - 1];
  return ctx.dates.map((date, i) => {
    const weekday = i + 1;
    const role = week?.roles[i] ?? null;
    const workout = ctx.workouts.get(date) ?? null;
    const cls = ctx.classes.get(date);
    const classSize = cls?.capacity || ctx.schedule.capacity;
    const prescription = role ? prescriptionFor(ctx.plan.structure, ctx.n, role) : null;
    let validation: ValidationResult[] = [];
    let logistics: BlockLogistics[] = [];
    if (workout) {
      const inventory = inventoryOn(ctx.inventory, date);
      const blocks = validationBlocks(workout, ctx.exercises);
      validation = validateSession({
        blocks,
        inventory,
        classSize,
        classMinutes: ctx.schedule.minutes,
        previousHeavy: heavyPatterns(ctx.workouts.get(addDays(date, -1)), ctx.exercises),
        prescriptions: prescription ? [prescription] : [],
      });
      logistics = blocks
        .filter((b) => b.track === "class")
        .map((b) => logisticsOf(b, inventory, classSize))
        .filter((l): l is BlockLogistics => l !== null);
    }
    return {
      date,
      weekday,
      role,
      closed: week?.closed.includes(weekday) ?? false,
      classes: cls?.count ?? 0,
      classSize,
      workout,
      validation,
      logistics,
      prescription,
    };
  });
}

/** Lo que tocan los WODs de cada día además de su papel: las capacidades de sus bloques. */
export function complementsOf(ctx: WeekContext): { weekday: number; capacity: Capacity }[] {
  return ctx.dates.flatMap((date, i) => {
    const w = ctx.workouts.get(date);
    if (!w) return [];
    return w.blocks
      .filter((b) => b.track === "class" && b.capacity)
      .map((b) => ({ weekday: i + 1, capacity: b.capacity! }));
  });
}

/** Si las combinaciones de días habituales tocan lo esencial del bloque de la semana. */
export function weekCoverage(ctx: WeekContext): ComboCoverage[] {
  const week = ctx.plan.structure.weeks[ctx.n - 1];
  if (!week) return [];
  const block = ctx.plan.structure.blocks[week.block]!;
  return coverageOf(
    week.roles,
    ctx.combos,
    essentialCapacities(block.emphasis),
    complementsOf(ctx),
  );
}

/** Reparto de los minutos programados de la semana por capacidad, en puntos sobre 100. */
export function weekBalance(ctx: WeekContext): Emphasis {
  const minutes = Object.fromEntries(CAPACITIES.map((c) => [c, 0])) as Record<Capacity, number>;
  for (const w of ctx.workouts.values()) {
    if (!ctx.dates.includes(w.onDate)) continue;
    for (const b of w.blocks)
      if (b.track === "class" && b.capacity && b.plannedMinutes)
        minutes[b.capacity] += b.plannedMinutes;
  }
  const total = CAPACITIES.reduce((s, c) => s + minutes[c], 0);
  return Object.fromEntries(
    CAPACITIES.map((c) => [c, total > 0 ? Math.round((minutes[c] / total) * 100) : 0]),
  ) as Emphasis;
}

export function blockEmphasisOf(plan: BoxPlanRecord, n: number): Emphasis {
  const week = plan.structure.weeks[n - 1];
  const block = week ? plan.structure.blocks[week.block] : undefined;
  return block?.emphasis ?? blockEmphasis(plan.emphasis, week?.kind ?? "base");
}

export function weekLimitsOf(ctx: WeekContext): WeekLimit[] {
  const days = ctx.dates.flatMap((date, i) => {
    const w = ctx.workouts.get(date);
    if (!w) return [];
    const blocks = w.blocks.filter((b) => b.track === "class");
    const patterns = [...new Set(blocks.flatMap((b) => blockFacts(b, ctx.exercises).patterns))];
    const heavy = blocks.some(
      (b) => (b.kind === "strength" && (b.percent ?? 0) >= 75) || !!b.rmReps,
    );
    return [{ weekday: i + 1, patterns, heavy }];
  });
  return weekLimits(days);
}

export function blockLabelOf(
  plan: BoxPlanRecord,
  n: number,
  locale: Parameters<typeof blockLabel>[2],
) {
  const week = plan.structure.weeks[n - 1];
  return week ? blockLabel(plan.structure, week.block, locale) : "";
}

/** Un WOD tal como se vuelve a guardar, con lo que se quiera cambiar encima. */
export function upsertFrom(w: WorkoutRecord, patch: Partial<WorkoutUpsert> = {}): WorkoutUpsert {
  return {
    sectionId: w.section.id,
    teamId: w.team?.id ?? null,
    onDate: w.onDate,
    title: w.title,
    notes: w.notes,
    status: w.status,
    publishAt: w.publishAt?.toISOString() ?? null,
    blocks: w.blocks.map((b) => ({
      kind: b.kind,
      title: b.title,
      description: b.description,
      scoreType: b.scoreType,
      timeCapSeconds: b.timeCapSeconds,
      movementCode: b.movementCode,
      percent: b.percent,
      rmReps: b.rmReps as 1 | 2 | 3 | 5 | 10 | null,
      foundations: b.foundations,
      scaled: b.scaled,
      rx: b.rx,
      rxPlus: b.rxPlus,
      capacity: b.capacity,
      plannedMinutes: b.plannedMinutes,
      exerciseIds: b.exerciseIds,
      track: b.track,
    })),
    planId: w.plan?.id ?? null,
    planWeek: w.planWeek,
    dayRole: w.dayRole,
    intentDomain: w.intentDomain,
    intentEffort: w.intentEffort,
    intentFeel: w.intentFeel,
    why: w.why,
    ...patch,
  };
}

/** Hoy del club. */
export function clubToday(c: Ctx): string {
  return todayIn(orgOf(c).organization.timezone);
}

export type { BoxEquipmentKind };
