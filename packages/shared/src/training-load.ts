/**
 * Carga de entrenamiento (bloques 22 y 25, ADR 0038). Método de Foster: la carga de una sesión
 * es el esfuerzo percibido (RPE de 0 a 10) por los minutos, en unidades arbitrarias. De ahí salen
 * la carga semanal, la aguda (7 días) frente a la crónica (media semanal de 28 días), la
 * monotonía y la tensión. Funciones puras: la API y la web calculan lo mismo con los mismos datos.
 *
 * La relación aguda:crónica se enseña como aviso con el umbral del club, nunca como predicción de
 * lesión: la literatura no la sostiene como predictor.
 */

const DAY = 86_400_000;

/** Fecha AAAA-MM-DD `n` días después (o antes, con `n` negativo). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** Lunes de la semana ISO de una fecha. */
export function weekStartOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** Los siete días de la semana que empieza en `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Carga de una sesión: RPE × minutos. Sin RPE no hay carga conocida. */
export function sessionLoad(rpe: number | null | undefined, minutes: number): number | null {
  return rpe === null || rpe === undefined ? null : rpe * minutes;
}

export interface DailyLoad {
  date: string;
  load: number;
}

/** Suma por día (una persona puede tener sesión y gimnasio el mismo día). */
export function dailyTotals(entries: readonly DailyLoad[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.load);
  return byDay;
}

/** Carga total entre dos fechas, incluidas las dos. */
export function loadBetween(byDay: ReadonlyMap<string, number>, from: string, to: string): number {
  let total = 0;
  for (const [date, load] of byDay) if (date >= from && date <= to) total += load;
  return total;
}

export interface LoadMetrics {
  /** Carga de los últimos 7 días (hoy incluido). */
  acute: number;
  /** Media semanal de los últimos 28 días. */
  chronic: number;
  /** Aguda entre crónica; nula sin crónica o sin historia suficiente (21 días). */
  ratio: number | null;
  /** Media diaria entre desviación típica de los 7 días; nula si no hay variación. */
  monotony: number | null;
  /** Carga semanal × monotonía. */
  strain: number | null;
  /** Días desde el primer registro: por debajo de 21 la crónica todavía no es fiable. */
  historyDays: number;
}

export function loadMetrics(entries: readonly DailyLoad[], today: string): LoadMetrics {
  const byDay = dailyTotals(entries.filter((e) => e.date <= today));
  const acute = loadBetween(byDay, addDays(today, -6), today);
  const chronic = loadBetween(byDay, addDays(today, -27), today) / 4;
  const first = [...byDay.keys()].sort()[0];
  const historyDays = first ? daysBetween(first, today) + 1 : 0;
  const week = Array.from({ length: 7 }, (_, i) => byDay.get(addDays(today, -i)) ?? 0);
  const mean = week.reduce((a, b) => a + b, 0) / 7;
  const sd = Math.sqrt(week.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
  const monotony = sd > 0 ? round2(mean / sd) : null;
  return {
    acute,
    chronic: round2(chronic),
    ratio: chronic > 0 && historyDays >= 21 ? round2(acute / chronic) : null,
    monotony,
    strain: monotony === null ? null : Math.round(acute * monotony),
    historyDays,
  };
}

/** Carga por semana (lunes → total) entre dos lunes, incluidos. */
export function weeklyTotals(
  entries: readonly DailyLoad[],
  firstMonday: string,
  lastMonday: string,
): { weekStart: string; load: number }[] {
  const byDay = dailyTotals(entries);
  const out: { weekStart: string; load: number }[] = [];
  for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
    out.push({ weekStart: monday, load: loadBetween(byDay, monday, addDays(monday, 6)) });
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
