import { useIntl } from "react-intl";

/**
 * Fechas de la agenda (Bloque 16). La API guarda instantes; la web los pinta en la zona horaria
 * del club. Nada de aquí depende de la zona del navegador.
 */

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO: 1 lunes … 7 domingo. */
  isoWeekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(timezone: string, at: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    isoWeekday: WEEKDAYS[get("weekday")] ?? 1,
  };
}

/** Instante de una fecha y hora locales de la zona (resuelve el desfase iterando dos veces). */
export function fromLocal(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (t: number) => {
    const p = localParts(timezone, new Date(t));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  let result = guess - offsetAt(guess);
  result = guess - offsetAt(result);
  return new Date(result);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Lunes a las 00:00 de la semana de un instante, en la zona. */
export function weekStart(timezone: string, at: Date): Date {
  const p = localParts(timezone, at);
  const dayStart = fromLocal(timezone, p.year, p.month, p.day, 0, 0);
  return new Date(dayStart.getTime() - (p.isoWeekday - 1) * DAY_MS);
}

/** Inicio de un día local sumando días enteros a un instante que ya es medianoche local. */
export function addDays(timezone: string, midnight: Date, days: number): Date {
  const p = localParts(
    timezone,
    new Date(midnight.getTime() + days * DAY_MS + 12 * 60 * 60 * 1000),
  );
  return fromLocal(timezone, p.year, p.month, p.day, 0, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `AAAA-MM-DD` de un instante en la zona: la clave de agrupación por día. */
export function dayKey(timezone: string, at: Date): string {
  const p = localParts(timezone, at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:MM` de un instante en la zona, para los campos de hora. */
export function timeKey(timezone: string, at: Date): string {
  const p = localParts(timezone, at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Instante ISO de una fecha `AAAA-MM-DD` y una hora `HH:MM` locales de la zona. */
export function localToIso(timezone: string, date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return fromLocal(timezone, y ?? 1970, m ?? 1, d ?? 1, h ?? 0, mi ?? 0).toISOString();
}

/** Minutos desde la medianoche local de un instante (para colocar bloques en una rejilla). */
export function minutesOfDay(timezone: string, at: Date): number {
  const p = localParts(timezone, at);
  return p.hour * 60 + p.minute;
}

/** Hoy a medianoche en la zona. */
export function todayStart(timezone: string): Date {
  const p = localParts(timezone, new Date());
  return fromLocal(timezone, p.year, p.month, p.day, 0, 0);
}

/** Formatos de la agenda en la zona del club. */
export function useAgendaFormat(timezone: string) {
  const intl = useIntl();
  const time = (iso: string | Date) =>
    intl.formatTime(typeof iso === "string" ? new Date(iso) : iso, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    });
  const dayShort = (at: Date) =>
    intl.formatDate(at, { timeZone: timezone, weekday: "short", day: "numeric" });
  const dayLong = (at: Date) =>
    intl.formatDate(at, { timeZone: timezone, weekday: "long", day: "numeric", month: "long" });
  const dateMedium = (at: Date | string) =>
    intl.formatDate(typeof at === "string" ? new Date(at) : at, {
      timeZone: timezone,
      dateStyle: "medium",
    });
  const weekLabel = (from: Date, to: Date) =>
    `${intl.formatDate(from, { timeZone: timezone, day: "numeric", month: "short" })} – ${intl.formatDate(
      new Date(to.getTime() - 1),
      { timeZone: timezone, day: "numeric", month: "short", year: "numeric" },
    )}`;
  return { time, dayShort, dayLong, dateMedium, weekLabel };
}

/** Agrupa eventos por día local manteniendo el orden por hora. */
export function groupByDay<T extends { startsAt: string }>(
  timezone: string,
  events: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(timezone, new Date(e.startsAt));
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}
