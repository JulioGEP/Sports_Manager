/**
 * Geometría del calendario de clases (ADR 0051): dónde cae cada clase en la rejilla de horas, cómo
 * se reparten las que coinciden y qué huecos sin clases se pliegan. Funciones puras, sin React ni
 * zona horaria: todo en minutos desde la medianoche local del club.
 */

/** Un tramo de la rejilla: horas seguidas a escala o un hueco plegado en una franja fina. */
export interface TimelineSegment {
  /** Minuto local en que empieza y en que acaba el tramo. */
  from: number;
  to: number;
  /** Píxeles desde arriba y alto en la rejilla. */
  top: number;
  height: number;
  collapsed: boolean;
}

export interface Timeline {
  segments: TimelineSegment[];
  height: number;
  /** Las horas en punto de los tramos a escala, con su altura, para las etiquetas y las líneas. */
  hours: { hour: number; top: number }[];
  /** Píxeles desde arriba de un minuto local (fuera del rango, pegado al borde). */
  y: (minute: number) => number;
}

export interface TimelineOptions {
  /** Alto de una hora a escala. */
  hourHeight: number;
  /** Alto de la franja de un hueco plegado. */
  gapHeight: number;
  /** Horas vacías seguidas a partir de las cuales el hueco se pliega. */
  minGapHours: number;
  /** Horas que se enseñan si no hay ninguna clase: [primera, última). */
  fallback: [number, number];
}

const HOUR = 60;

/**
 * La rejilla de horas para unas clases: desde la hora en punto antes de la primera hasta la hora en
 * punto después de la última. Las horas sin ninguna clase que van seguidas (al menos
 * `minGapHours`) se pliegan en una franja de `gapHeight`; las demás van a escala.
 */
export function buildTimeline(
  items: readonly { start: number; end: number }[],
  options: TimelineOptions,
): Timeline {
  const { hourHeight, gapHeight, minGapHours, fallback } = options;
  const first = items.length ? Math.floor(Math.min(...items.map((i) => i.start)) / HOUR) : null;
  const last = items.length ? Math.ceil(Math.max(...items.map((i) => i.end)) / HOUR) : null;
  const startHour = first ?? fallback[0];
  const endHour = Math.max(last ?? fallback[1], startHour + 1);

  const busy = (hour: number) =>
    items.some((i) => i.start < (hour + 1) * HOUR && i.end > hour * HOUR);

  // Tramos de horas con clase o vacías, en orden.
  const runs: { from: number; to: number; empty: boolean }[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    const empty = items.length > 0 && !busy(hour);
    const previous = runs.at(-1);
    if (previous && previous.empty === empty) previous.to = hour + 1;
    else runs.push({ from: hour, to: hour + 1, empty });
  }

  const segments: TimelineSegment[] = [];
  let top = 0;
  for (const run of runs) {
    const collapsed = run.empty && run.to - run.from >= minGapHours;
    const height = collapsed ? gapHeight : (run.to - run.from) * hourHeight;
    const previous = segments.at(-1);
    if (previous && !previous.collapsed && !collapsed) {
      previous.to = run.to * HOUR;
      previous.height += height;
    } else {
      segments.push({ from: run.from * HOUR, to: run.to * HOUR, top, height, collapsed });
    }
    top += height;
  }

  const hours = segments.flatMap((s) =>
    s.collapsed
      ? []
      : Array.from({ length: (s.to - s.from) / HOUR }, (_, i) => ({
          hour: s.from / HOUR + i,
          top: s.top + i * hourHeight,
        })),
  );

  const y = (minute: number) => {
    const firstSegment = segments[0];
    const lastSegment = segments.at(-1);
    if (!firstSegment || !lastSegment) return 0;
    if (minute <= firstSegment.from) return 0;
    if (minute >= lastSegment.to) return top;
    const s = segments.find((x) => minute >= x.from && minute < x.to) ?? lastSegment;
    return s.top + ((minute - s.from) / (s.to - s.from)) * s.height;
  };

  return { segments, height: top, hours, y };
}

/**
 * Las clases que coinciden en el tiempo, una al lado de otra: cada una con su columna y el número
 * de columnas de su grupo (las que se solapan entre sí, aunque sea en cadena).
 */
export function layoutColumns<T extends { start: number; end: number }>(
  items: readonly T[],
): { item: T; column: number; columns: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { item: T; column: number; columns: number }[] = [];
  let group: { item: T; column: number; columns: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    for (const entry of group) entry.columns = columnEnds.length;
    placed.push(...group);
    group = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    group.push({ item, column, columns: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return placed;
}
