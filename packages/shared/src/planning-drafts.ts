import type { Capacity, DayRole } from "./capacities.ts";
import { benchmarkByCode, type WorkoutBlockInput, type WorkoutUpsert } from "./fitness.ts";
import type { Locale, LocalizedText } from "./locales.ts";
import {
  blockLabel,
  DAY_ROLE_INFO,
  DAY_ROLE_NAMES,
  engineMinutesFor,
  movementName,
  planTestByCode,
  prescriptionFor,
  testsByDay,
  TIME_DOMAIN_RANGE,
  type PlanStructure,
  type Prescription,
} from "./planning.ts";
import { addDays } from "./training-load.ts";

/**
 * Borradores de una semana del plan sin IA (ADR 0052): lo que el plan sabe escribir solo. Cada día
 * con clase sale con su papel, su intención, el levantamiento del día con la progresión exacta del
 * bloque, el motor largo con sus minutos, el hueco del WOD con lo que tiene que ser y la vuelta a la
 * calma. El coach (o el copiloto) escribe el resto. Nunca pisa un día que ya tiene WOD.
 */

const L = (es: string, ca: string, en: string): LocalizedText => ({ es, ca, en });

const TEXT = {
  warmupTitle: L("Calentamiento", "Escalfament", "Warm-up"),
  warmup: L(
    "2 rondas:\n250 m en máquina\n10 air squats\n10 band pull-aparts\n5 inchworms",
    "2 rondes:\n250 m a la màquina\n10 air squats\n10 band pull-aparts\n5 inchworms",
    "2 rounds:\n250 m on a machine\n10 air squats\n10 band pull-aparts\n5 inchworms",
  ),
  cooldownTitle: L("Vuelta a la calma", "Tornada a la calma", "Cool-down"),
  cooldown: L(
    "Movilidad de cadera 90/90 y hombro con PVC",
    "Mobilitat de maluc 90/90 i espatlla amb PVC",
    "90/90 hip and PVC shoulder mobility",
  ),
  wodTitle: L("WOD por escribir", "WOD per escriure", "WOD to write"),
  wodDescription: L(
    "Intención: de {lo} a {hi} minutos, esfuerzo {effort} de 5.\nEscríbelo o pídelo al copiloto.",
    "Intenció: de {lo} a {hi} minuts, esforç {effort} de 5.\nEscriu-lo o demana'l al copilot.",
    "Intent: {lo} to {hi} minutes, effort {effort} of 5.\nWrite it or ask the copilot.",
  ),
  strength: L(
    "{sets} series de {reps} al {percent} %.\nDescanso 2:30 entre series.",
    "{sets} sèries de {reps} al {percent} %.\nDescans 2:30 entre sèries.",
    "{sets} sets of {reps} at {percent}%.\nRest 2:30 between sets.",
  ),
  rm: L(
    "Busca tu 1RM en 20 minutos.\nSubidas cortas a partir del 85 %.",
    "Busca el teu 1RM en 20 minuts.\nPujades curtes a partir del 85 %.",
    "Find your 1RM in 20 minutes.\nSmall jumps from 85%.",
  ),
  strengthFoundations: L(
    "Variante con kettlebell o barra técnica: técnica antes que kilos.",
    "Variant amb kettlebell o barra tècnica: tècnica abans que quilos.",
    "Kettlebell or technique-bar variant: technique before load.",
  ),
  strengthScaled: L("Al {percent} %.", "Al {percent} %.", "At {percent}%."),
  strengthRx: L("Al {percent} %.", "Al {percent} %.", "At {percent}%."),
  strengthRxPlus: L(
    "Al {percent} % y una serie más al {plus} % si la última va limpia.",
    "Al {percent} % i una sèrie més al {plus} % si l'última va neta.",
    "At {percent}% plus one more set at {plus}% if the last one is clean.",
  ),
  engine: L(
    "{rounds} × {minutes} min a ritmo de poder hablar.\nLa máquina que toque y 1 min para cambiar.",
    "{rounds} × {minutes} min a ritme de poder parlar.\nLa màquina que toqui i 1 min per canviar.",
    "{rounds} × {minutes} min at a conversational pace.\nWhatever machine you get and 1 min to switch.",
  ),
  engineTitle: L("Motor largo", "Motor llarg", "Long engine"),
  engineFoundations: L(
    "Un minuto menos por ronda.",
    "Un minut menys per ronda.",
    "One minute less per round.",
  ),
  engineScaled: L("Ritmo cómodo.", "Ritme còmode.", "Easy pace."),
  engineRx: L("Ritmo de poder hablar.", "Ritme de poder parlar.", "Conversational pace."),
  engineRxPlus: L(
    "La última ronda, a ritmo de umbral.",
    "L'última ronda, a ritme de llindar.",
    "Last round at threshold pace.",
  ),
  whyWeek: L(
    "Semana {n} de {total}: bloque {block}.",
    "Setmana {n} de {total}: bloc {block}.",
    "Week {n} of {total}: {block} block.",
  ),
  whyPrevious: L(
    "{movement}: la semana pasada {previous}, esta {current}.",
    "{movement}: la setmana passada {previous}, aquesta {current}.",
    "{movement}: last week {previous}, this week {current}.",
  ),
  whyEngine: L(
    "{minutes} minutos de motor: la progresión del bloque.",
    "{minutes} minuts de motor: la progressió del bloc.",
    "{minutes} minutes of engine: the block's progression.",
  ),
  whyComplement: L(
    "Complemento de {capacity} en el calentamiento: quien viene {days} no lo toca otro día.",
    "Complement de {capacity} a l'escalfament: qui ve {days} no ho toca cap altre dia.",
    "{capacity} complement in the warm-up: people who come {days} don't get it another day.",
  ),
  skillTitle: L("Técnica por escribir", "Tècnica per escriure", "Skill to write"),
  skill: L(
    "20 minutos de técnica por niveles.\nEscríbela o pídela al copiloto.",
    "20 minuts de tècnica per nivells.\nEscriu-la o demana-la al copilot.",
    "20 minutes of skill work by level.\nWrite it or ask the copilot.",
  ),
  maxReps: L(
    "Máximo de repeticiones seguidas sin soltar la barra.",
    "Màxim de repeticions seguides sense deixar la barra.",
    "Max unbroken reps without coming off the bar.",
  ),
  whyTest: L(
    "Test de {phase}: con estas marcas se mide el plan.",
    "Test de {phase}: amb aquestes marques es mesura el pla.",
    "{phase} test: these scores measure the plan.",
  ),
  phaseStart: L("partida", "sortida", "Starting"),
  phaseEnd: L("llegada", "arribada", "Final"),
  adjCap: L(
    "Revisión del domingo: de {before} a {after} min, porque los WODs de este tipo salen un {pct} % más largos de lo previsto.",
    "Revisió del diumenge: de {before} a {after} min, perquè els WODs d'aquest tipus surten un {pct} % més llargs del previst.",
    "Sunday review: {before} to {after} min, because these WODs run {pct}% longer than planned.",
  ),
  adjPace: L(
    "Ritmo guiado: tienes que poder hablar. Si no, baja el ritmo.",
    "Ritme guiat: has de poder parlar. Si no, baixa el ritme.",
    "Guided pace: you must be able to talk. If not, slow down.",
  ),
  adjPaceWhy: L(
    "Revisión del domingo: la semana pasada este día se fue a esfuerzo {real} con un objetivo de {target}.",
    "Revisió del diumenge: la setmana passada aquest dia va anar a esforç {real} amb un objectiu de {target}.",
    "Sunday review: last week this day went to effort {real} against a target of {target}.",
  ),
  adjPercent: L(
    "Revisión del domingo: se repite el {after} % porque la semana pasada solo el {completion} % completó las series.",
    "Revisió del diumenge: es repeteix el {after} % perquè la setmana passada només el {completion} % va completar les sèries.",
    "Sunday review: {after}% again because only {completion}% completed the sets last week.",
  ),
  adjCoverage: L(
    "Revisión del domingo: complemento de {capacity} para quien viene {days}.",
    "Revisió del diumenge: complement de {capacity} per a qui ve {days}.",
    "Sunday review: {capacity} complement for people who come {days}.",
  ),
  feel: L("Esfuerzo {effort} de 5.", "Esforç {effort} de 5.", "Effort {effort} of 5."),
} as const;

/** Lo que se añade al calentamiento para cubrir una capacidad que falta en una combinación de días. */
export const COMPLEMENTS: Record<Capacity, LocalizedText> = {
  strength: L(
    "Complemento: 3×6 goblet squat con tempo",
    "Complement: 3×6 goblet squat amb tempo",
    "Complement: 3×6 tempo goblet squats",
  ),
  weightlifting: L(
    "Complemento: 5 min de hang power clean con barra técnica",
    "Complement: 5 min de hang power clean amb barra tècnica",
    "Complement: 5 min of hang power cleans with a technique bar",
  ),
  gymnastics: L(
    "Complemento: EMOM 4 de dominadas estrictas",
    "Complement: EMOM 4 de dominades estrictes",
    "Complement: EMOM 4 strict pull-ups",
  ),
  engine: L(
    "Complemento: 6 min a ritmo suave en máquina",
    "Complement: 6 min a ritme suau a la màquina",
    "Complement: 6 min easy on a machine",
  ),
  intensity: L(
    "Complemento: 3 sprints de 20 s",
    "Complement: 3 esprints de 20 s",
    "Complement: 3 × 20 s sprints",
  ),
  mobility: L(
    "Complemento: 5 min de movilidad de cadera",
    "Complement: 5 min de mobilitat de maluc",
    "Complement: 5 min of hip mobility",
  ),
};

export const CAPACITY_NAMES: Record<Capacity, LocalizedText> = {
  strength: L("fuerza", "força", "strength"),
  weightlifting: L("halterofilia", "halterofília", "weightlifting"),
  gymnastics: L("gimnásticos", "gimnàstics", "gymnastics"),
  engine: L("motor", "motor", "engine"),
  intensity: L("intensidad", "intensitat", "intensity"),
  mobility: L("movilidad", "mobilitat", "mobility"),
};

const DAY_SHORT: Record<Locale, string[]> = {
  es: ["L", "M", "X", "J", "V", "S", "D"],
  ca: ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

/** "L · X · V": los días de una combinación en corto. */
export function comboLabel(days: readonly number[], locale: Locale): string {
  return days.map((d) => DAY_SHORT[locale][d - 1] ?? String(d)).join(" · ");
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    values[k] !== undefined ? String(values[k]) : m,
  );
}

/** Textos fijos del motor en un idioma: el calentamiento, la nota de ritmo… */
export function planText(
  key: keyof typeof TEXT,
  locale: Locale,
  values: Record<string, string | number> = {},
) {
  return fill(TEXT[key][locale], values);
}

export interface DraftWeekInput {
  plan: { id: string; startsOn: string; weeks: number };
  structure: PlanStructure;
  week: number;
  sectionId: string;
  locale: Locale;
  /** Días que ya tienen WOD: no se tocan. */
  taken: readonly string[];
  /** Complementos de cobertura: qué capacidad añadir en qué día y para qué combinación. */
  complements?: readonly { weekday: number; capacity: Capacity; days: readonly number[] }[];
  /** Ejercicios de la biblioteca por movimiento del catálogo, para enlazar el levantamiento. */
  exerciseByMovement?: ReadonlyMap<string, string>;
  /** Tests del plan, para las semanas de test y de retest. */
  tests?: readonly string[];
}

function testBlocks(
  codes: readonly string[],
  locale: Locale,
  exerciseByMovement?: ReadonlyMap<string, string>,
): WorkoutBlockInput[] {
  const out: WorkoutBlockInput[] = [];
  for (const code of codes) {
    const test = planTestByCode(code);
    if (!test) continue;
    if (test.kind === "movement" && test.ref) {
      const id = exerciseByMovement?.get(test.ref);
      out.push({
        kind: "strength",
        title: test.name[locale],
        description: planText("rm", locale),
        scoreType: "load",
        movementCode: test.ref,
        rmReps: 1,
        percent: null,
        capacity: test.weights.weightlifting ? "weightlifting" : "strength",
        plannedMinutes: 20,
        exerciseIds: id ? [id] : [],
        track: "class",
      });
    } else if (test.kind === "benchmark" && test.ref) {
      const bench = benchmarkByCode(test.ref);
      out.push({
        kind: "wod",
        title: test.name[locale],
        description: bench?.description[locale] ?? null,
        scoreType: bench?.scoreType ?? "time",
        capacity: test.weights.engine === 1 ? "engine" : "intensity",
        plannedMinutes: 20,
        exerciseIds: [],
        track: "class",
      });
    } else {
      out.push({
        kind: "accessory",
        title: test.name[locale],
        description: planText("maxReps", locale),
        scoreType: "reps",
        capacity: "gymnastics",
        plannedMinutes: 8,
        exerciseIds: [],
        track: "class",
      });
    }
  }
  return out;
}

function strengthBlock(
  p: Prescription,
  role: DayRole,
  locale: Locale,
  exerciseId: string | undefined,
): WorkoutBlockInput {
  const name = movementName(p.movementCode, locale);
  const capacity: Capacity =
    DAY_ROLE_INFO[role].capacity === "weightlifting" ? "weightlifting" : "strength";
  if (p.rmReps)
    return {
      kind: "strength",
      title: `${name} 1RM`,
      description: planText("rm", locale),
      scoreType: "load",
      movementCode: p.movementCode,
      rmReps: 1,
      percent: null,
      capacity,
      plannedMinutes: 20,
      exerciseIds: exerciseId ? [exerciseId] : [],
      track: "class",
    };
  return {
    kind: "strength",
    title: `${name} ${p.sets}×${p.reps}`,
    description: planText("strength", locale, { sets: p.sets, reps: p.reps, percent: p.percent }),
    scoreType: "load",
    movementCode: p.movementCode,
    percent: p.percent,
    rmReps: null,
    capacity,
    plannedMinutes: 20,
    exerciseIds: exerciseId ? [exerciseId] : [],
    foundations: planText("strengthFoundations", locale),
    scaled: planText("strengthScaled", locale, { percent: Math.max(40, p.percent - 7) }),
    rx: planText("strengthRx", locale, { percent: p.percent }),
    rxPlus: planText("strengthRxPlus", locale, {
      percent: p.percent,
      plus: Math.min(100, p.percent + 5),
    }),
    track: "class",
  };
}

/** Los borradores de los días con clase de una semana del plan que aún no tienen WOD. */
export function draftWeek(input: DraftWeekInput): WorkoutUpsert[] {
  const { structure, week, locale } = input;
  const w = structure.weeks[week - 1];
  if (!w) return [];
  const monday = addDays(input.plan.startsOn, (week - 1) * 7);
  const block = blockLabel(structure, w.block, locale);
  const tests = testsByDay(w, input.tests ?? []);
  const out: WorkoutUpsert[] = [];
  w.roles.forEach((role, i) => {
    if (!role) return;
    const date = addDays(monday, i);
    if (input.taken.includes(date)) return;
    const info = DAY_ROLE_INFO[role];
    const why: string[] = [
      planText("whyWeek", locale, { n: week, total: input.plan.weeks, block }),
    ];
    const blocks: WorkoutBlockInput[] = [];
    const complements = (input.complements ?? []).filter((c) => c.weekday === i + 1);
    blocks.push({
      kind: "warmup",
      title: TEXT.warmupTitle[locale],
      description: planText("warmup", locale),
      scoreType: "none",
      capacity: "mobility",
      plannedMinutes: 12,
      exerciseIds: [],
      track: "class",
    });
    // Cada complemento va como bloque propio, con su capacidad: así la cobertura se puede medir.
    for (const c of complements)
      blocks.push({
        kind: "skill",
        title: COMPLEMENTS[c.capacity][locale],
        description: null,
        scoreType: "none",
        capacity: c.capacity,
        plannedMinutes: 5,
        exerciseIds: [],
        track: "class",
      });
    for (const c of complements)
      why.push(
        planText("whyComplement", locale, {
          capacity: CAPACITY_NAMES[c.capacity][locale],
          days: comboLabel(c.days, locale),
        }),
      );
    const dayTests = tests.get(i + 1) ?? [];
    if (dayTests.length > 0) {
      blocks.push(...testBlocks(dayTests, locale, input.exerciseByMovement));
      why.push(
        planText("whyTest", locale, {
          phase: TEXT[week === 1 ? "phaseStart" : "phaseEnd"][locale],
        }),
      );
    }
    const tested = new Set(dayTests.map((c) => planTestByCode(c)?.ref).filter(Boolean));
    const p = prescriptionFor(structure, week, role);
    if (p && !tested.has(p.movementCode)) {
      blocks.push(strengthBlock(p, role, locale, input.exerciseByMovement?.get(p.movementCode)));
      const prev = week > 1 ? prescriptionFor(structure, week - 1, role) : null;
      if (prev && prev.movementCode === p.movementCode && !p.rmReps && !prev.rmReps)
        why.push(
          planText("whyPrevious", locale, {
            movement: movementName(p.movementCode, locale),
            previous: `${prev.sets}×${prev.reps} · ${prev.percent} %`,
            current: `${p.sets}×${p.reps} · ${p.percent} %`,
          }),
        );
    }
    if (role === "long_engine") {
      const minutes = engineMinutesFor(structure, week) ?? 30;
      const rounds = Math.max(3, Math.round(minutes / 6));
      const each = Math.max(3, Math.round(minutes / rounds) - 1);
      blocks.push({
        kind: "wod",
        title: TEXT.engineTitle[locale],
        description: planText("engine", locale, { rounds, minutes: each }),
        scoreType: "calories",
        capacity: "engine",
        plannedMinutes: minutes,
        exerciseIds: [],
        foundations: planText("engineFoundations", locale),
        scaled: planText("engineScaled", locale),
        rx: planText("engineRx", locale),
        rxPlus: planText("engineRxPlus", locale),
        track: "class",
      });
      why.push(planText("whyEngine", locale, { minutes }));
    } else if (role === "skill_mobility" || role === "oly_technique") {
      blocks.push({
        kind: "skill",
        title: TEXT.skillTitle[locale],
        description: planText("skill", locale),
        scoreType: "none",
        capacity: info.capacity === "mobility" ? "gymnastics" : info.capacity,
        plannedMinutes: 20,
        exerciseIds: [],
        track: "class",
      });
    } else if (info.domain || (role === "test" && dayTests.length === 0)) {
      const domain = info.domain ?? "medium";
      const [lo, hi] = TIME_DOMAIN_RANGE[domain];
      blocks.push({
        kind: "wod",
        title: TEXT.wodTitle[locale],
        description: planText("wodDescription", locale, { lo, hi, effort: info.effort }),
        scoreType: domain === "short" || domain === "medium" ? "time" : "rounds_reps",
        timeCapSeconds: domain === "short" || domain === "medium" ? hi * 60 : null,
        capacity: info.capacity,
        plannedMinutes: hi,
        exerciseIds: [],
        track: "class",
      });
    }
    blocks.push({
      kind: "cooldown",
      title: TEXT.cooldownTitle[locale],
      description: TEXT.cooldown[locale],
      scoreType: "none",
      capacity: "mobility",
      plannedMinutes: 5,
      exerciseIds: [],
      track: "class",
    });
    out.push({
      sectionId: input.sectionId,
      teamId: null,
      onDate: date,
      title: DAY_ROLE_NAMES[role][locale],
      notes: null,
      status: "draft",
      publishAt: null,
      blocks,
      planId: input.plan.id,
      planWeek: week,
      dayRole: role,
      intentDomain: info.domain,
      intentEffort: info.effort,
      intentFeel: planText("feel", locale, { effort: info.effort }),
      why: why.join("\n"),
    });
  });
  return out;
}
