import {
  addDays,
  LEVEL_CAPACITIES,
  planWeekOf,
  suggestLevels,
  type AthleteLevel,
  type DayRole,
} from "@sportsmanager/shared";
import type { BoxPlanRecord, DataLayer, OrgScope } from "../data/index.ts";

/**
 * Lo que la planificación del box (ADR 0052) le cuenta a un atleta: su nivel en cada capacidad
 * (el que fija él o el que se le sugiere con sus resultados), su plan (el de la disciplina en la que
 * más entrena) y el papel de los próximos días si el box lo enseña por adelantado.
 */

const DAY = 86_400_000;

export async function athleteLevels(
  data: DataLayer,
  scope: OrgScope,
  playerId: string,
  today: string,
): Promise<AthleteLevel[]> {
  const [results, confirmed, joinedOn] = await Promise.all([
    data.planning.athleteResults(scope, playerId, addDays(today, -60)),
    data.planning.levels.of(scope, playerId),
    data.planning.joinedOn(scope, playerId),
  ]);
  const byCapacity = results.flatMap((r) =>
    (LEVEL_CAPACITIES as readonly string[]).includes(r.capacity)
      ? [{ ...r, capacity: r.capacity as (typeof LEVEL_CAPACITIES)[number] }]
      : [],
  );
  return suggestLevels(byCapacity, joinedOn, today).map((s) => {
    const mine = confirmed.get(s.capacity);
    return {
      capacity: s.capacity,
      level: mine ?? s.level,
      suggested: s.level,
      reason: mine ? "confirmed" : s.reason,
    };
  });
}

/** El plan del atleta: el activo de la disciplina donde más ha entrenado en las últimas 8 semanas. */
export async function mainPlanOf(
  data: DataLayer,
  scope: OrgScope,
  playerId: string,
  timezone: string,
  now = new Date(),
): Promise<BoxPlanRecord | null> {
  const plans = await data.planning.plans.active(scope);
  if (plans.length <= 1) return plans[0] ?? null;
  const sections = new Map<string, number>();
  const events = await data.planning.bookingsOf(
    scope,
    playerId,
    new Date(now.getTime() - 56 * DAY),
    now,
    timezone,
  );
  for (const e of events)
    if (e.sectionId) sections.set(e.sectionId, (sections.get(e.sectionId) ?? 0) + 1);
  return (
    [...plans].sort(
      (a, b) => (sections.get(b.section.id) ?? 0) - (sections.get(a.section.id) ?? 0),
    )[0] ?? null
  );
}

/** El papel de los días que vienen (desde mañana), si el box lo enseña por adelantado. */
export async function upcomingRoles(
  data: DataLayer,
  scope: OrgScope,
  plan: BoxPlanRecord | null,
  from: string,
  days = 6,
): Promise<{ date: string; role: DayRole | null }[]> {
  if (!plan) return [];
  const settings = await data.planning.settings.get(scope);
  if (settings.athletePreview === "none") return [];
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i + 1);
    const n = planWeekOf(plan.startsOn, plan.weeks, date);
    const week = n ? plan.structure.weeks[n - 1] : undefined;
    const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    return { date, role: week?.roles[weekday - 1] ?? null };
  });
}
