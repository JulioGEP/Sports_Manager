import { z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  bestOneRm,
  bookingWindows,
  entitlementUsage,
  formatScore,
  movementByCode,
  percentLoad,
  planExpiresOn,
  type BookingPolicy,
  type ClassSummary,
  type CountedBooking,
  type Locale,
  type ResultView,
  type Subscription,
  type WorkoutView,
} from "@sportsmanager/shared";
import type { Context } from "hono";
import type { ApiConfig } from "../config.ts";
import {
  entitlementOf,
  workoutVisible,
  type ClassRecord,
  type DataLayer,
  type MyBookingRecord,
  type PersonalRecordRow,
  type ResultRecord,
  type SubscriptionRecord,
  type WorkoutRecord,
} from "../data/index.ts";
import { accessScopeOf, requireActor } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { forbidden, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

/**
 * Piezas comunes de las rutas de los clubs de fitness (ADR 0049): la cadena, quién es el atleta
 * que pregunta, qué ve un coach con ámbito restringido y cómo sale cada cosa en la API.
 */

export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
export const errors = {
  401: errorResponse("Sin sesión"),
  403: errorResponse("Sin pertenencia o sin permiso"),
  404: errorResponse("Host sin club o recurso inexistente"),
};
export const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
export const body = <T extends z.ZodTypeAny>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
export const idParam = z.object({ id: z.string().uuid() });

export function fitnessChain(config: ApiConfig, data: DataLayer) {
  return [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
}

export type Ctx = Context<AppEnv>;

export function orgOf(c: Ctx) {
  const tenant = c.get("tenant");
  if (tenant.kind !== "organization") throw notFound();
  return tenant;
}

export function auditOf(data: DataLayer) {
  return (
    c: Ctx,
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: c.get("sessionUser").id,
      organizationId: orgOf(c).organization.id,
      action,
      target,
      details,
    });
}

/** La ficha del atleta que pregunta (su cuenta es la de su persona), o nula. */
export async function selfPlayer(data: DataLayer, c: Ctx) {
  const actor = c.get("actor");
  if (actor.kind !== "member") return null;
  return data.load.athleteOf(orgOf(c).scope, actor.userId);
}

/** Lo mismo, pero sin ficha propia no hay nada que hacer aquí. */
export async function requireSelfPlayer(data: DataLayer, c: Ctx) {
  const player = await selfPlayer(data, c);
  if (!player) throw forbidden("Esto es para atletas con su propia ficha en el club.");
  return player;
}

/** Hoy en la zona del club. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

/**
 * Tipos de clase que ve el personal: todos, o los de su ámbito (los que entrena o coordina). Un
 * coach de box ve además las clases que da aunque no sea del cuerpo técnico del tipo de clase.
 */
export async function staffClassScope(
  data: DataLayer,
  c: Ctx,
): Promise<{ all: true } | { all: false; teamIds: string[]; coachUserId: string }> {
  const access = await accessScopeOf(data, c);
  if (access.kind === "club") return { all: true };
  return { all: false, teamIds: access.teamIds, coachUserId: c.get("actor").userId };
}

export function classInStaffScope(
  scope: Awaited<ReturnType<typeof staffClassScope>>,
  cls: ClassRecord,
): boolean {
  if (scope.all) return true;
  return (
    (cls.team !== null && scope.teamIds.includes(cls.team.id)) ||
    cls.coach?.userId === scope.coachUserId
  );
}

/** Quién pasa lista y gestiona reservas de una clase: la agenda entera, o el coach de esa clase. */
export async function canManageClass(data: DataLayer, c: Ctx, cls: ClassRecord): Promise<boolean> {
  const actor = c.get("actor");
  if (actor.permissions.has("org.events.write")) return true;
  if (!actor.permissions.has("org.attendance.write_own")) return false;
  if (cls.coach?.userId === actor.userId) return true;
  if (!cls.team) return false;
  return (await data.memberships.ownTeamIds(orgOf(c).scope, actor.userId)).includes(cls.team.id);
}

/**
 * Atletas que ve el personal: todos (nulo) o, con ámbito restringido, los de sus clases y los que
 * tiene asignados.
 */
export async function visibleAthleteIds(data: DataLayer, c: Ctx): Promise<string[] | null> {
  const access = await accessScopeOf(data, c);
  if (access.kind === "club") return null;
  const inClasses = await data.fitness.playersInClasses(
    orgOf(c).scope,
    access.teamIds,
    c.get("actor").userId,
  );
  return [...new Set([...inClasses, ...access.playerIds])];
}

export function classDto(
  cls: ClassRecord,
  policy: BookingPolicy,
  extra: {
    my?: MyBookingRecord | null;
    action?: "book" | "waitlist" | null;
    block?: ClassSummary["block"];
    hasWorkout?: boolean;
  } = {},
): ClassSummary {
  const windows = bookingWindows(cls.startsAt, policy);
  return {
    id: cls.id,
    title: cls.title,
    startsAt: cls.startsAt.toISOString(),
    endsAt: cls.endsAt.toISOString(),
    date: cls.date,
    section: cls.section,
    team: cls.team,
    facility: cls.facility,
    coach: cls.coach,
    capacity: cls.capacity,
    booked: cls.booked,
    waitlist: cls.waitlist,
    my: extra.my ?? null,
    action: extra.action ?? null,
    block: extra.block ?? null,
    opensAt: windows.opensAt.toISOString(),
    closesAt: windows.closesAt.toISOString(),
    freeCancelUntil: windows.freeCancelUntil.toISOString(),
    hasWorkout: extra.hasWorkout ?? false,
    checkedIn: cls.checkedIn,
  };
}

/** Lo gastado de una tarifa en el periodo que contiene `date` (hoy, por defecto). */
export function subscriptionDto(
  sub: SubscriptionRecord,
  context: { counted: readonly CountedBooking[] } | null,
  date: string,
): Subscription {
  const plan = entitlementOf(sub);
  const usage =
    sub.plan.entitlement === "none" || !context
      ? { limit: null, used: 0, remaining: null, period: null }
      : entitlementUsage(plan, date, context.counted);
  const expires = planExpiresOn(plan);
  return {
    id: sub.id,
    player: { id: sub.playerId, name: sub.playerName },
    personId: sub.personId,
    plan: {
      id: sub.plan.id,
      name: sub.plan.name,
      entitlement: sub.plan.entitlement,
      sessions: sub.plan.sessions,
      validityDays: sub.plan.validityDays,
      amountCents: sub.plan.amountCents,
      period: sub.plan.period,
    },
    status: sub.status,
    startsOn: sub.startsOn,
    endsOn: sub.endsOn,
    expiresOn: expires,
    pausedUntil: sub.pausedUntil,
    billing: sub.billing,
    stripeStatus: sub.stripeStatus,
    usage: {
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
      periodFrom: usage.period?.from ?? null,
      periodTo: usage.period?.to ?? null,
    },
  };
}

export function resultView(
  result: ResultRecord,
  scoreType: Parameters<typeof formatScore>[0],
  locale: Locale,
): ResultView {
  return {
    level: result.level,
    score: result.score,
    completed: result.completed,
    effort: result.effort,
    note: result.note,
    display: formatScore(scoreType, result.score, result.completed, locale),
    recordedAt: result.updatedAt.toISOString(),
  };
}

/** La 1RM de cada movimiento de un atleta, real o estimada desde sus máximas. */
export function oneRmByMovement(records: readonly PersonalRecordRow[]) {
  const by = new Map<string, PersonalRecordRow[]>();
  for (const r of records) by.set(r.movementCode, [...(by.get(r.movementCode) ?? []), r]);
  const out = new Map<string, { kg: number; estimated: boolean }>();
  for (const [code, list] of by) {
    const best = bestOneRm(list);
    if (best) out.set(code, best);
  }
  return out;
}

/**
 * Un WOD tal como sale en la API. Con un atleta, cada bloque lleva su 1RM, los kilos del
 * porcentaje y su resultado; sin él (el personal), solo cuántos resultados hay.
 */
export function workoutDto(
  w: WorkoutRecord,
  now: Date,
  locale: Locale,
  extra: {
    counts?: Map<string, number>;
    athlete?: {
      oneRm: Map<string, { kg: number; estimated: boolean }>;
      results: Map<string, ResultRecord>;
    };
  } = {},
): WorkoutView {
  return {
    id: w.id,
    onDate: w.onDate,
    section: w.section,
    team: w.team,
    title: w.title,
    notes: w.notes,
    status: w.status,
    publishAt: w.publishAt?.toISOString() ?? null,
    visible: workoutVisible(w, now),
    createdBy: w.createdBy,
    updatedAt: w.updatedAt.toISOString(),
    blocks: w.blocks.map((b, i) => {
      const movement = movementByCode(b.movementCode);
      let mine: WorkoutView["blocks"][number]["mine"] = null;
      if (extra.athlete) {
        const rm = b.movementCode ? (extra.athlete.oneRm.get(b.movementCode) ?? null) : null;
        const result = extra.athlete.results.get(b.id) ?? null;
        mine = {
          oneRmKg: rm?.kg ?? null,
          estimated: rm?.estimated ?? false,
          loadKg: rm && b.percent ? percentLoad(rm.kg, b.percent) : null,
          result: result ? resultView(result, b.scoreType, locale) : null,
        };
      }
      return {
        id: b.id,
        label: String.fromCharCode(65 + i),
        kind: b.kind,
        title: b.title,
        description: b.description,
        scoreType: b.scoreType,
        timeCapSeconds: b.timeCapSeconds,
        movement: movement ? { code: movement.code, name: movement.name[locale] } : null,
        percent: b.percent,
        rmReps: b.rmReps,
        scaled: b.scaled,
        rx: b.rx,
        rxPlus: b.rxPlus,
        mine,
        results: extra.counts?.get(b.id) ?? 0,
      };
    }),
  };
}

/** El WOD de un atleta con lo suyo: su 1RM, sus kilos y sus resultados. */
export async function athleteWorkoutDto(
  data: DataLayer,
  c: Ctx,
  w: WorkoutRecord,
  playerId: string,
  now: Date,
): Promise<WorkoutView> {
  const scope = orgOf(c).scope;
  const [records, results, counts] = await Promise.all([
    data.workouts.records.list(scope, [playerId]),
    data.workouts.results.ofPlayer(
      scope,
      playerId,
      w.blocks.map((b) => b.id),
    ),
    data.workouts.results.counts(
      scope,
      w.blocks.map((b) => b.id),
    ),
  ]);
  return workoutDto(w, now, localeOf(c), {
    counts,
    athlete: { oneRm: oneRmByMovement(records.get(playerId) ?? []), results },
  });
}

/** Idioma de la persona o del club, para los nombres de los movimientos y los números. */
export function localeOf(c: Ctx): Locale {
  return c.get("sessionUser").locale ?? (orgOf(c).organization.defaultLocale as Locale);
}

export function personName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function initialsOf(p: { firstName: string; lastName: string }): string {
  return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
}
