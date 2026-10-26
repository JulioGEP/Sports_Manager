import {
  addDays,
  CAPACITY_NAMES,
  COMPLEMENTS,
  comboLabel,
  DAY_ROLE_INFO,
  modalityOf,
  planText,
  reviewWeek,
  type Adjustment,
  type Locale,
  type ReviewDayInput,
  type ReviewNextDay,
  type WeekReview,
  type WorkoutUpsert,
} from "@sportsmanager/shared";
import {
  instantOf,
  type BoxPlanRecord,
  type DataLayer,
  type OrgScope,
  type WorkoutRecord,
} from "../data/index.ts";
import {
  blockFacts,
  loadWeek,
  upsertFrom,
  weekCoverage,
  type WeekContext,
} from "./planning-common.ts";

/**
 * La revisión del domingo de la planificación del box (ADR 0053): lo previsto frente a lo que pasó
 * en una semana del plan, lo que ha aprendido el box y los ajustes para la siguiente, que el coach
 * acepta o descarta uno a uno. Aceptar escribe el cambio en el WOD de la semana que viene.
 */

export interface ComputedReview {
  ctx: WeekContext;
  next: WeekContext | null;
  review: WeekReview;
  prs: number;
}

const counts = <T>(items: readonly T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};

const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

function roleOf(ctx: WeekContext, w: WorkoutRecord) {
  return w.dayRole ?? ctx.plan.structure.weeks[ctx.n - 1]?.roles[isoWeekday(w.onDate) - 1] ?? null;
}

function nextDays(ctx: WeekContext): ReviewNextDay[] {
  return ctx.dates.flatMap((date) => {
    const w = ctx.workouts.get(date);
    if (!w) return [];
    return [
      {
        workoutId: w.id,
        date,
        role: roleOf(ctx, w),
        feel: w.intentFeel,
        blocks: w.blocks
          .filter((b) => b.track === "class")
          .map((b) => {
            const facts = blockFacts(b, ctx.exercises);
            return {
              id: b.id,
              kind: b.kind,
              timeCapSeconds: b.timeCapSeconds,
              plannedMinutes: b.plannedMinutes,
              movementCode: b.movementCode,
              percent: b.percent,
              modality: modalityOf(facts.patterns, facts.equipment),
            };
          }),
      },
    ];
  });
}

/** Calcula la revisión de la semana n del plan con sus resultados y la semana siguiente. */
export async function computeReview(
  data: DataLayer,
  scope: OrgScope,
  timezone: string,
  plan: BoxPlanRecord,
  n: number,
  now = new Date(),
): Promise<ComputedReview> {
  const ctx = await loadWeek(data, scope, timezone, plan, n, now);
  const next = n < plan.weeks ? await loadWeek(data, scope, timezone, plan, n + 1, now) : null;
  const week = ctx.dates.flatMap((d) => (ctx.workouts.get(d) ? [ctx.workouts.get(d)!] : []));
  const blockIds = week.flatMap((w) =>
    w.blocks.filter((b) => b.track === "class").map((b) => b.id),
  );
  const [results, attendance, before, prs] = await Promise.all([
    data.planning.blockResults(scope, blockIds),
    data.planning.attendance(
      scope,
      plan.section.id,
      instantOf(timezone, ctx.monday),
      instantOf(timezone, addDays(ctx.monday, 7)),
      timezone,
    ),
    data.planning.attendance(
      scope,
      plan.section.id,
      instantOf(timezone, addDays(ctx.monday, -28)),
      instantOf(timezone, ctx.monday),
      timezone,
    ),
    data.planning.prCount(scope, ctx.monday, addDays(ctx.monday, 6)),
  ]);
  const byBlock = new Map<string, typeof results>();
  for (const r of results) byBlock.set(r.blockId, [...(byBlock.get(r.blockId) ?? []), r]);
  const perDay = counts(attendance, (a) => a.date);

  const days: ReviewDayInput[] = week.map((w) => {
    const role = roleOf(ctx, w);
    const info = role ? DAY_ROLE_INFO[role] : null;
    return {
      workoutId: w.id,
      date: w.onDate,
      role,
      domain: w.intentDomain ?? info?.domain ?? null,
      effort: w.intentEffort ?? info?.effort ?? null,
      attendees: perDay.get(w.onDate) ?? 0,
      blocks: w.blocks
        .filter((b) => b.track === "class")
        .map((b) => {
          const facts = blockFacts(b, ctx.exercises);
          return {
            id: b.id,
            kind: b.kind,
            scoreType: b.scoreType,
            timeCapSeconds: b.timeCapSeconds,
            plannedMinutes: b.plannedMinutes,
            movementCode: b.movementCode,
            percent: b.percent,
            modality: modalityOf(facts.patterns, facts.equipment),
            results: (byBlock.get(b.id) ?? []).map((r) => ({
              timeSeconds: r.timeSeconds,
              completed: r.completed,
              effort: r.effort,
            })),
          };
        }),
    };
  });

  // Resultados apuntados frente a asistencias a clases con WOD.
  const dateOfBlock = new Map(week.flatMap((w) => w.blocks.map((b) => [b.id, w.onDate] as const)));
  const loggedPairs = new Set(results.map((r) => `${r.playerId}|${dateOfBlock.get(r.blockId)}`));
  const withWod = attendance.filter((a) => ctx.workouts.has(a.date)).length;
  const byWeekday: Record<number, number> = {};
  for (const [date, count] of counts(before, (a) => a.date))
    byWeekday[isoWeekday(date)] = (byWeekday[isoWeekday(date)] ?? 0) + count / 4;

  const gaps = next
    ? weekCoverage(next).flatMap((cov) =>
        cov.missing.map((m) => ({ weekday: m.addTo, capacity: m.capacity, days: cov.days })),
      )
    : [];
  const review = reviewWeek({
    days,
    usualAttendees: before.length > 0 ? Math.round(before.length / 4) : null,
    logged: withWod > 0 ? Math.min(1, loggedPairs.size / withWod) : 0,
    next: next ? nextDays(next) : [],
    gaps: gaps.filter(
      (g, i) => gaps.findIndex((x) => x.weekday === g.weekday && x.capacity === g.capacity) === i,
    ),
    attendanceByWeekday: byWeekday,
  });
  return { ctx, next, review, prs: prs.total };
}

/** El WOD de la semana siguiente con el ajuste aceptado encima. Nulo si ya no se puede aplicar. */
export function applyAdjustment(
  adj: Adjustment,
  w: WorkoutRecord,
  locale: Locale,
): WorkoutUpsert | null {
  const base = upsertFrom(w);
  const reasons = w.why ? w.why.split("\n") : [];
  const withWhy = (line: string) =>
    [...reasons.filter((r) => r !== line), line].slice(-6).join("\n");
  const p = adj.params;
  switch (adj.kind) {
    case "cap": {
      const i = w.blocks.findIndex((b) => b.id === adj.blockId);
      if (i < 0) return null;
      const after = Number(p.after);
      const blocks = base.blocks.map((b, j) =>
        j !== i
          ? b
          : {
              ...b,
              timeCapSeconds: b.timeCapSeconds ? after * 60 : (b.timeCapSeconds ?? null),
              plannedMinutes: after,
            },
      );
      return {
        ...base,
        blocks,
        why: withWhy(
          planText("adjCap", locale, { before: p.before ?? "", after, pct: p.pct ?? "" }),
        ),
      };
    }
    case "pace": {
      const guided = planText("adjPace", locale);
      return {
        ...base,
        intentFeel: (w.intentFeel?.includes(guided)
          ? w.intentFeel
          : [w.intentFeel, guided].filter(Boolean).join(" ")
        ).slice(0, 300),
        why: withWhy(
          planText("adjPaceWhy", locale, { real: p.real ?? "", target: p.target ?? "" }),
        ),
      };
    }
    case "percent": {
      const i = w.blocks.findIndex((b) => b.id === adj.blockId);
      if (i < 0) return null;
      const after = Number(p.after);
      return {
        ...base,
        blocks: base.blocks.map((b, j) => (j === i ? { ...b, percent: after } : b)),
        why: withWhy(planText("adjPercent", locale, { after, completion: p.completion ?? "" })),
      };
    }
    case "coverage": {
      const capacity = String(p.capacity) as keyof typeof COMPLEMENTS;
      if (!COMPLEMENTS[capacity] || base.blocks.length >= 12) return null;
      if (w.blocks.some((b) => b.capacity === capacity && b.kind === "skill")) return null;
      const days = String(p.days ?? "")
        .split(",")
        .map(Number)
        .filter((d) => d >= 1 && d <= 7);
      const block = {
        kind: "skill" as const,
        title: COMPLEMENTS[capacity][locale],
        description: null,
        scoreType: "none" as const,
        capacity,
        plannedMinutes: 5,
        exerciseIds: [],
        track: "class" as const,
      };
      // Al final (antes de la vuelta a la calma): los bloques de antes no cambian de sitio y los
      // ajustes ya decididos siguen apuntando al mismo bloque.
      const last = w.blocks.at(-1);
      const at = last && last.kind === "cooldown" ? w.blocks.length - 1 : w.blocks.length;
      const blocks = [...base.blocks.slice(0, at), block, ...base.blocks.slice(at)];
      return {
        ...base,
        blocks,
        why: withWhy(
          planText("adjCoverage", locale, {
            capacity: CAPACITY_NAMES[capacity][locale],
            days: comboLabel(days, locale),
          }),
        ),
      };
    }
  }
}
