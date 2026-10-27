import {
  addDays,
  type RepMax,
  type WorkoutBlockInput,
  type WorkoutBlockView,
  type WorkoutView,
} from "@sportsmanager/shared";

/** Un bloque tal como se ve, de vuelta a lo que se manda al guardar (para editar y copiar). */
export function blockInputOf(b: WorkoutBlockView): WorkoutBlockInput {
  return {
    kind: b.kind,
    title: b.title,
    description: b.description,
    scoreType: b.scoreType,
    timeCapSeconds: b.timeCapSeconds,
    movementCode: b.movement?.code ?? null,
    percent: b.percent,
    rmReps: (b.rmReps as RepMax | null) ?? null,
    foundations: b.foundations,
    scaled: b.scaled,
    rx: b.rx,
    rxPlus: b.rxPlus,
    capacity: b.capacity,
    plannedMinutes: b.plannedMinutes,
    track: b.track,
    exerciseIds: b.exercises.map((e) => e.id),
  };
}

/**
 * Lo que un WOD guarda de la planificación (ADR 0053): el plan, la semana, el papel del día, la
 * intención y el porqué. Va en cada guardado para no perderlo al editar, publicar o mover.
 */
export function planFieldsOf(w: WorkoutView) {
  return {
    planId: w.plan?.id ?? null,
    planWeek: w.plan?.week ?? null,
    dayRole: w.dayRole,
    intentDomain: w.intent?.domain ?? null,
    intentEffort: w.intent?.effort ?? null,
    intentFeel: w.intent?.feel ?? null,
    why: w.why.length > 0 ? w.why.join("\n") : null,
  };
}

/** Copia de un WOD a otro día, en borrador: el coach la revisa antes de publicarla. */
export function copyOf(w: WorkoutView, onDate: string) {
  return {
    sectionId: w.section.id,
    teamId: w.team?.id ?? null,
    onDate,
    title: w.title,
    notes: w.notes,
    status: "draft" as const,
    publishAt: null,
    blocks: w.blocks.map(blockInputOf),
  };
}

/** Lunes de la semana de un día de calendario. */
export function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}
