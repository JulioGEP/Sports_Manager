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
    scaled: b.scaled,
    rx: b.rx,
    rxPlus: b.rxPlus,
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
