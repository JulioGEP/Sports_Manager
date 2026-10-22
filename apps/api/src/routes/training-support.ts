import { z } from "@hono/zod-openapi";
import {
  addDays,
  ApiErrorSchema,
  ageOn,
  BLOCKS_BY_TEAM_ROLE,
  computeInsights,
  computeMatchStats,
  LOAD_INSIGHT_RULES,
  mdLabelOf,
  playerDisplayName,
  resolveTrainingSettings,
  SESSION_BLOCKS,
  type DailyLoad,
  type Insight,
  type InsightMatch,
  type InsightPlayer,
  type InsightSession,
  type Locale,
  type MatchStats,
  type SessionBlock,
  type TrainingSettings,
} from "@sportsmanager/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { ApiConfig } from "../config.ts";
import {
  instantOf,
  localDate,
  plannedOf,
  type CurrentAvailability,
  type DataLayer,
  type LoadRecord,
  type MatchActionTypeRecord,
  type MatchEventRecord,
  type MatchRecord,
  type MatchSquadRecord,
  type SessionItemRecord,
  type SessionRecord,
  type TeamRecord,
  type TrainingContentRecord,
} from "../data/index.ts";
import { accessScopeOf, requireActor } from "../http/actor.ts";
import type { Actor, AppEnv } from "../http/context.ts";
import { notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

/**
 * Piezas comunes de las rutas de entrenamiento, carga y salud (ADR 0038): cadena de acceso,
 * ámbito, permisos por bloque y el ensamblado de las recomendaciones a partir de partidos,
 * sesiones, carga, bienestar y disponibilidad.
 */

export type RouteCtx = Context<AppEnv>;

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
export const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club, o recurso inexistente o fuera del ámbito"),
};
export { error };
export const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
export const body = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true as const,
});
export const idParam = z.object({ id: z.string().uuid() });

/**
 * La cadena del club (host, sesión, pertenencia) sin repetirla si otra familia de rutas ya la
 * resolvió para el mismo prefijo.
 */
export function guardFor(config: ApiConfig, data: DataLayer): MiddlewareHandler<AppEnv> {
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  return async (c, next) => {
    if (c.get("actor")) return next();
    const run = async (i: number): Promise<void> => {
      if (i < chain.length) await chain[i]!(c, () => run(i + 1));
      else await next();
    };
    return run(0);
  };
}

export function tenantOf(c: RouteCtx) {
  const tenant = c.get("tenant");
  if (tenant.kind !== "organization") throw notFound();
  return tenant;
}
export type Tenant = ReturnType<typeof tenantOf>;

export const localeOf = (c: RouteCtx, tenant: Tenant): Locale =>
  (c.get("sessionUser").locale ?? tenant.organization.defaultLocale) as Locale;

export const todayOf = (tenant: Tenant) => localDate(tenant.organization.timezone, new Date());

export function actorOf(c: RouteCtx): Actor & { kind: "member" } {
  const actor = c.get("actor");
  if (actor.kind !== "member") throw notFound();
  return actor;
}

export const has = (c: RouteCtx, permission: Parameters<Actor["permissions"]["has"]>[0]) =>
  c.get("actor").permissions.has(permission);

export function audit(
  data: DataLayer,
  c: RouteCtx,
  tenant: Tenant,
  action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
  target: string,
  details?: unknown,
) {
  return data.audit.record({
    actorUserId: c.get("sessionUser").id,
    organizationId: tenant.organization.id,
    action,
    target,
    details,
  });
}

// --- Ámbito (ADR 0033): fuera de él, las cosas no existen ---

export async function restrictedOf(data: DataLayer, c: RouteCtx) {
  const access = await accessScopeOf(data, c);
  return access.kind === "restricted" ? access : null;
}

export async function requireSectionVisible(data: DataLayer, c: RouteCtx, sectionId: string) {
  const restricted = await restrictedOf(data, c);
  if (restricted && !restricted.sectionIds.includes(sectionId))
    throw notFound("Esa sección no existe.");
}

export async function teamOr404(data: DataLayer, c: RouteCtx, tenant: Tenant, teamId: string) {
  const team = await data.teams.byId(tenant.scope, teamId);
  if (!team) throw notFound("Ese equipo no existe.");
  const restricted = await restrictedOf(data, c);
  if (restricted && !restricted.teamIds.includes(teamId)) throw notFound("Ese equipo no existe.");
  return team;
}

export async function requirePlayerVisible(
  data: DataLayer,
  c: RouteCtx,
  tenant: Tenant,
  playerId: string,
) {
  const access = await accessScopeOf(data, c);
  if (!(await data.access.isPlayerVisible(tenant.scope, access, playerId)))
    throw notFound("Ese jugador no existe.");
}

/** Secciones y equipos visibles, o nulo con ámbito de club. */
export async function visibleOf(data: DataLayer, c: RouteCtx) {
  const restricted = await restrictedOf(data, c);
  return restricted ? { sectionIds: restricted.sectionIds, teamIds: restricted.teamIds } : null;
}

// --- Quién escribe qué ---

/**
 * Bloques de la sesión que puede editar quien pregunta en un equipo: todos con
 * `org.training.write`; con `org.training.write_own`, los de su papel en el cuerpo técnico.
 */
export function blocksFor(actor: Actor, team: TeamRecord): SessionBlock[] {
  if (actor.kind !== "member") return [];
  if (actor.permissions.has("org.training.write")) return [...SESSION_BLOCKS];
  if (!actor.permissions.has("org.training.write_own")) return [];
  const blocks = new Set<SessionBlock>();
  for (const s of team.staff)
    if (s.userId === actor.userId)
      for (const b of BLOCKS_BY_TEAM_ROLE[s.roleInTeam] ?? []) blocks.add(b);
  return SESSION_BLOCKS.filter((b) => blocks.has(b));
}

/** La cabecera de la sesión (objetivo, estado, crearla y borrarla) es de quien lleva la parte principal. */
export const canPlan = (actor: Actor, team: TeamRecord) => blocksFor(actor, team).includes("main");

/** Registrar carga, bienestar y tests en un equipo. */
export function canWriteLoad(actor: Actor, team: TeamRecord): boolean {
  if (actor.kind !== "member") return false;
  if (actor.permissions.has("org.load.write")) return true;
  return (
    actor.permissions.has("org.load.write_own") && team.staff.some((s) => s.userId === actor.userId)
  );
}

/** Registrar carga de un jugador: en cualquiera de sus equipos de esta temporada. */
export async function canWriteLoadOfPlayer(
  data: DataLayer,
  c: RouteCtx,
  tenant: Tenant,
  playerId: string,
): Promise<boolean> {
  const actor = c.get("actor");
  if (actor.permissions.has("org.load.write")) return true;
  if (!actor.permissions.has("org.load.write_own") || actor.kind !== "member") return false;
  const [teams, own] = await Promise.all([
    data.players.teamsOf(tenant.scope, playerId),
    data.memberships.ownTeamIds(tenant.scope, actor.userId),
  ]);
  return teams.some((t) => t.seasonIsCurrent && own.includes(t.teamId));
}

// --- DTO ---

export const availabilityDto = (a: CurrentAvailability) => ({
  status: a.status,
  restrictions: a.restrictions,
  maxMinutes: a.maxMinutes,
  fromOn: a.fromOn,
  expectedReturnOn: a.expectedReturnOn,
  note: a.note,
});

export const contentDto = (c: TrainingContentRecord) => c;

export const insightDto = (i: Insight) => ({
  rule: i.rule,
  level: i.level,
  fingerprint: i.fingerprint,
  playerId: i.playerId,
  values: i.values,
  contentIds: i.contentIds,
  ...(i.matchId ? { matchId: i.matchId } : {}),
  ...(i.sessionId ? { sessionId: i.sessionId } : {}),
  ...(i.groups ? { groups: i.groups } : {}),
});

/** Carga real media por jugador de una sesión cerrada (RPE × minutos), si alguien puso RPE. */
export function actualLoadOf(loads: readonly LoadRecord[]): number | null {
  const rated = loads.filter((l) => l.rpe !== null);
  if (rated.length === 0) return null;
  return Math.round(rated.reduce((a, l) => a + l.rpe! * l.minutes, 0) / rated.length);
}

export function sessionSummaryDto(
  session: SessionRecord,
  items: readonly SessionItemRecord[],
  loads: readonly LoadRecord[],
  timezone: string,
  mdLabel: string | null,
) {
  const planned = plannedOf(session, items);
  const byContent = new Map<string, number>();
  for (const i of items)
    for (const c of i.contentIds) byContent.set(c, (byContent.get(c) ?? 0) + i.minutes);
  return {
    id: session.id,
    eventId: session.eventId,
    team: session.team,
    date: localDate(timezone, session.startsAt),
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    title: session.title,
    facility: session.facility,
    mdLabel: session.mdLabel ?? mdLabel,
    status: session.status,
    objective: session.objective,
    targetRpe: session.targetRpe,
    plannedMinutes: planned.minutes,
    plannedLoad: planned.load,
    actualMinutes: session.actualMinutes,
    actualLoad: actualLoadOf(loads),
    itemsCount: items.length,
    contentMinutes: [...byContent.entries()].map(([contentId, minutes]) => ({
      contentId,
      minutes,
    })),
  };
}

export const itemDto = (i: SessionItemRecord) => ({
  id: i.id,
  block: i.block,
  sortOrder: i.sortOrder,
  drillId: i.drillId,
  title: i.title,
  minutes: i.minutes,
  sets: i.sets,
  reps: i.reps,
  restSec: i.restSec,
  targetRpe: i.targetRpe,
  groupLabel: i.groupLabel,
  playerIds: i.playerIds,
  contentIds: i.contentIds,
  restrictionTags: i.restrictionTags,
  notes: i.notes,
  rating: i.rating,
  description: i.description,
  coachingPoints: i.coachingPoints,
  diagram: i.diagram,
});

// --- Partidos, MD y carga de partido ---

export interface StatsEntry {
  match: MatchRecord;
  squad: MatchSquadRecord[];
  events: MatchEventRecord[];
  actionTypes: MatchActionTypeRecord[];
  stats: MatchStats;
}

/** Estadísticas de partidos acabados, con el mismo motor que la web. */
export function withStats(
  entries: readonly {
    match: MatchRecord;
    squad: MatchSquadRecord[];
    events: MatchEventRecord[];
    actionTypes: MatchActionTypeRecord[];
  }[],
): StatsEntry[] {
  return entries
    .filter((e) => e.match.status === "finished")
    .map((e) => ({
      ...e,
      stats: computeMatchStats({
        settings: e.match.settings,
        players: e.squad.map((s) => ({
          playerId: s.playerId,
          name: playerDisplayName(s),
          shirtNumber: s.shirtNumber,
          position: s.position,
          isGoalkeeper: s.isGoalkeeper,
          starter: s.starter,
        })),
        actionTypes: e.actionTypes,
        events: e.events,
      }),
    }));
}

/** Partidos acabados de un equipo con sus estadísticas. */
export async function teamMatchStats(data: DataLayer, tenant: Tenant, team: TeamRecord) {
  const [history, actionTypes] = await Promise.all([
    data.matches.historyOf(tenant.scope, team.id),
    data.matches.listTypes(tenant.scope, team.section.id),
  ]);
  return withStats(history.map((h) => ({ ...h, actionTypes })));
}

/** Carga de partido por jugador: minutos en pista × RPE (del jugador o del equipo). */
export async function matchLoads(
  data: DataLayer,
  tenant: Tenant,
  entries: readonly StatsEntry[],
): Promise<Map<string, (DailyLoad & { source: "match" })[]>> {
  const out = new Map<string, (DailyLoad & { source: "match" })[]>();
  const rpes = await data.load.matchRpes(
    tenant.scope,
    entries.map((e) => e.match.id),
  );
  for (const e of entries)
    for (const p of e.stats.players) {
      if (p.timeMs <= 0) continue;
      const rpe =
        rpes.players.get(`${e.match.id}:${p.playerId}`) ?? rpes.team.get(e.match.id) ?? null;
      if (rpe === null) continue;
      const list = out.get(p.playerId) ?? [];
      list.push({
        date: e.match.playedOn,
        load: Math.round((p.timeMs / 60_000) * rpe),
        source: "match",
      });
      out.set(p.playerId, list);
    }
  return out;
}

/** Cargas diarias de sesión y extra (con RPE), separadas por origen. */
export function sessionAndExtraLoads(loads: readonly LoadRecord[]) {
  const out = new Map<string, (DailyLoad & { source: "session" | "extra" })[]>();
  for (const l of loads) {
    if (l.source === "match" || l.rpe === null) continue;
    const list = out.get(l.playerId) ?? [];
    list.push({ date: l.date, load: l.rpe * l.minutes, source: l.source });
    out.set(l.playerId, list);
  }
  return out;
}

/** Fechas de partido del equipo (agenda y registro) para calcular la etiqueta MD. */
export function mdLabeler(matchDates: readonly string[]) {
  const sorted = [...new Set(matchDates)].sort();
  return (date: string) => {
    const previous = [...sorted].reverse().find((d) => d <= date) ?? null;
    const next = sorted.find((d) => d >= date) ?? null;
    return mdLabelOf(date, previous, next);
  };
}

const KEEPER = /port|keeper|goalie/i;

/** Formativa: lo dice la sección, o si no, la mediana de edad de la plantilla (menos de 16). */
function isFormative(settings: TrainingSettings, birthDates: (string | null)[], date: string) {
  if (settings.formative !== null) return settings.formative;
  const ages = birthDates
    .map((b) => ageOn(b, new Date(`${date}T12:00:00Z`)))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  if (ages.length === 0) return false;
  return ages[Math.floor(ages.length / 2)]! < 16;
}

/**
 * Las recomendaciones de un equipo en una fecha: reúne todo lo que el motor necesita, calcula y
 * quita lo que quien pregunta no puede ver (las reglas de carga sin `org.load.read`) y lo que el
 * cuerpo técnico ya ha respondido.
 */
export async function buildTeamInsights(
  data: DataLayer,
  c: RouteCtx,
  tenant: Tenant,
  team: TeamRecord,
  date: string,
  options: { sessionId?: string | null; playerId?: string | null; loadOnly?: boolean } = {},
): Promise<{ insights: Insight[]; contents: TrainingContentRecord[]; settings: TrainingSettings }> {
  const scope = tenant.scope;
  const tz = tenant.organization.timezone;
  const section = await data.training.sectionTraining(scope, team.section.id);
  const settings = section?.settings ?? resolveTrainingSettings(null);
  const contents = section
    ? await data.training.ensureCatalog(scope, section.id, section.sportCode, localeOf(c, tenant))
    : [];
  const roster = (await data.teams.roster(scope, team.id)).filter((r) => r.status === "active");
  const ids = roster.map((r) => r.playerId);
  const from = addDays(date, -56);
  const [
    stats,
    sessions,
    availability,
    periods,
    wellness,
    focus,
    objectives,
    attendanceRows,
    cycles,
    silenced,
    events,
    loads,
  ] = await Promise.all([
    teamMatchStats(data, tenant, team),
    data.training.teamSessions(
      scope,
      team.id,
      instantOf(tz, addDays(date, -42)),
      instantOf(tz, addDays(date, 15)),
    ),
    data.load.currentFor(scope, ids),
    data.load.periodsFor(scope, ids),
    data.load.wellnessFor(scope, ids, addDays(date, -35), date),
    data.load.focusOf(scope, ids),
    data.load.objectivesOf(scope, ids),
    data.training.attendanceForTeam(
      scope,
      team.id,
      instantOf(tz, addDays(date, -27)),
      instantOf(tz, addDays(date, 1)),
    ),
    data.training.cyclesOfTeam(scope, team.id),
    data.load.silencedFingerprints(scope, team.id, date),
    data.training.teamEvents(
      scope,
      team.id,
      instantOf(tz, addDays(date, -7)),
      instantOf(tz, addDays(date, 22)),
    ),
    data.load.loadsFor(scope, ids, from, date),
  ]);
  const items = await data.training.itemsOf(
    scope,
    sessions.map((s) => s.id),
  );
  const sessionLoads = await data.load.loadsForEvents(
    scope,
    sessions.map((s) => s.eventId),
  );
  const itemsBySession = new Map<string, SessionItemRecord[]>();
  for (const i of items)
    itemsBySession.set(i.sessionId, [...(itemsBySession.get(i.sessionId) ?? []), i]);
  const loadsByEvent = new Map<string, LoadRecord[]>();
  for (const l of sessionLoads)
    if (l.eventId) loadsByEvent.set(l.eventId, [...(loadsByEvent.get(l.eventId) ?? []), l]);
  const sessionOfEvent = new Map(sessions.map((s) => [s.eventId, s]));

  const insightSessions: InsightSession[] = sessions.map((s) => {
    const its = itemsBySession.get(s.id) ?? [];
    return {
      id: s.id,
      date: localDate(tz, s.startsAt),
      status: s.status,
      targetRpe: s.targetRpe,
      items: its.map((i) => ({
        drillId: i.drillId,
        title: i.title,
        block: i.block,
        minutes: i.minutes,
        targetRpe: i.targetRpe,
        contentIds: i.contentIds,
        restrictionTags: i.restrictionTags,
        playerIds: i.playerIds,
        rating: i.rating,
      })),
      plannedLoad: plannedOf(s, its).load,
      actualLoad: actualLoadOf(loadsByEvent.get(s.eventId) ?? []),
    };
  });

  const matchByEvent = new Set(stats.map((s) => s.match.event?.id).filter(Boolean));
  const fixtures = [
    ...events
      .filter((e) => e.kind === "match" && !matchByEvent.has(e.id))
      .map((e) => ({ date: localDate(tz, e.startsAt), opponent: e.opponent })),
  ];
  const insightMatches: InsightMatch[] = stats.map((s) => ({
    id: s.match.id,
    playedOn: s.match.playedOn,
    opponent: s.match.opponent,
    ownScore: s.match.ownScore,
    opponentScore: s.match.opponentScore,
    settings: s.match.settings,
    actionTypes: s.actionTypes,
    events: s.events,
    stats: s.stats,
  }));

  const daily = sessionAndExtraLoads(loads);
  const fromMatches = await matchLoads(
    data,
    tenant,
    stats.filter((s) => s.match.playedOn >= from),
  );
  const players: InsightPlayer[] = roster.map((r) => {
    const current = availability.get(r.playerId)!;
    return {
      id: r.playerId,
      name: playerDisplayName(r),
      isGoalkeeper: r.position ? KEEPER.test(r.position) : false,
      availability: {
        status: current.status,
        restrictions: current.restrictions,
        maxMinutes: current.maxMinutes,
      },
      pastUnavailability: periods
        .filter((p) => p.playerId === r.playerId && p.endedOn && p.status !== "limited")
        .map((p) => ({ fromOn: p.fromOn, endedOn: p.endedOn! })),
      loads: [...(daily.get(r.playerId) ?? []), ...(fromMatches.get(r.playerId) ?? [])],
      sessionRpe: loads
        .filter(
          (l) => l.playerId === r.playerId && l.source === "session" && l.rpe !== null && l.eventId,
        )
        .flatMap((l) => {
          const s = sessionOfEvent.get(l.eventId!);
          return s ? [{ sessionId: s.id, date: l.date, rpe: l.rpe! }] : [];
        }),
      wellness: wellness
        .filter((w) => w.playerId === r.playerId)
        .map((w) => ({ date: w.date, score: w.score, soreness: w.soreness })),
      focus: {
        contentIds: focus.get(r.playerId) ?? [],
        objectiveTitle: objectives.get(r.playerId)?.title ?? null,
        reviewOn: objectives.get(r.playerId)?.reviewOn ?? null,
      },
    };
  });

  let insights = computeInsights({
    today: date,
    thresholds: settings.thresholds,
    formative: isFormative(
      settings,
      roster.map((r) => r.birthDate),
      date,
    ),
    contents: contents.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      relatedActionCodes: c.relatedActionCodes,
      status: c.status,
    })),
    matches: insightMatches,
    fixtures,
    sessions: insightSessions,
    attendance: attendanceRows.map((a) => ({
      playerId: a.playerId,
      date: localDate(tz, a.startsAt),
      status: a.status as "present" | "absent" | "excused",
    })),
    cycle: cycles.find((cy) => cy.startsOn <= date && cy.endsOn >= date) ?? null,
    players,
    sessionId: options.sessionId ?? null,
  });
  const canLoad = c.get("actor").permissions.has("org.load.read");
  insights = insights.filter(
    (i) =>
      !silenced.has(i.fingerprint) &&
      (canLoad || !LOAD_INSIGHT_RULES.includes(i.rule)) &&
      (!options.loadOnly || LOAD_INSIGHT_RULES.includes(i.rule)) &&
      (!options.playerId || i.playerId === options.playerId),
  );
  return { insights, contents, settings };
}
