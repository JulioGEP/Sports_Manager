import { schema, type Database } from "@sportsmanager/db";
import {
  defaultDrills,
  defaultTrainingContents,
  resolveTrainingSettings,
  trainingCodeFromName,
  type DrillCreate,
  type DrillDiagram,
  type DrillScope,
  type DrillStatus,
  type DrillUpdate,
  type Locale,
  type MicrocycleDay,
  type MicrocycleTemplateSet,
  type RestrictionTag,
  type SessionBlock,
  type SessionItemInput,
  type SessionStatus,
  type SessionUpdate,
  type TrainingContentCreate,
  type TrainingContentKind,
  type TrainingContentStatus,
  type TrainingContentUpdate,
  type TrainingCycleCreate,
  type TrainingCycleUpdate,
  type TrainingPlanSet,
  type TrainingSettings,
  type TrainingSettingsPatch,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import { fromLocal, localParts } from "./events.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Planificación de entrenamientos (bloques 21, 22 y 26, ADR 0039): contenidos y semanas tipo de
 * cada sección, biblioteca de tareas, plan de temporada con sus ciclos y las sesiones de cada
 * entrenamiento de la agenda. Toda consulta lleva el ámbito del club (ADR 0015). Las fechas de
 * sesión son días de calendario en la zona horaria del club.
 */

export interface TrainingContentRecord {
  id: string;
  sectionId: string;
  code: string;
  name: string;
  kind: TrainingContentKind;
  relatedActionCodes: string[];
  sortOrder: number;
  status: TrainingContentStatus;
}

export interface MicrocycleTemplateRecord {
  id: string;
  sectionId: string;
  name: string;
  days: MicrocycleDay[];
}

export interface SectionTrainingRecord {
  id: string;
  name: string;
  sportCode: string;
  settings: TrainingSettings;
  customized: boolean;
}

export interface DrillRecord {
  id: string;
  scope: DrillScope;
  section: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  owner: { userId: string; name: string } | null;
  name: string;
  description: string | null;
  rules: string | null;
  coachingPoints: string | null;
  variants: string | null;
  format: string | null;
  space: string | null;
  playersMin: number | null;
  playersMax: number | null;
  durationMin: number | null;
  targetRpe: number | null;
  material: string | null;
  diagram: DrillDiagram | null;
  audioBlobKey: string | null;
  videoUrl: string | null;
  restrictionTags: RestrictionTag[];
  status: DrillStatus;
  contents: { id: string; name: string; kind: TrainingContentKind }[];
  uses: number;
  lastUsedOn: string | null;
  rating: number | null;
}

export interface DrillFilter {
  /** Nulo: todo el club. Si no, solo lo de estas secciones y equipos (más lo del club y lo propio). */
  visible: { sectionIds: string[]; teamIds: string[] } | null;
  userId: string;
  sectionId?: string | undefined;
  teamId?: string | undefined;
  contentId?: string | undefined;
  q?: string | undefined;
  includeArchived?: boolean | undefined;
}

export interface PlanRecord {
  id: string;
  teamId: string;
  seasonId: string;
  name: string;
  notes: string | null;
}

export interface CycleRecord {
  id: string;
  planId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  focusContentIds: string[];
  targetWeeklyLoad: number | null;
  notes: string | null;
}

export interface SessionRecord {
  id: string;
  eventId: string;
  team: { id: string; name: string };
  sectionId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  facility: { id: string; name: string } | null;
  mdLabel: string | null;
  objective: string | null;
  contentIds: string[];
  status: SessionStatus;
  targetRpe: number | null;
  actualMinutes: number | null;
  rating: number | null;
  notes: string | null;
  cycleId: string | null;
  closedAt: Date | null;
}

export interface SessionItemRecord {
  id: string;
  sessionId: string;
  block: SessionBlock;
  sortOrder: number;
  drillId: string | null;
  title: string;
  minutes: number;
  sets: number | null;
  reps: number | null;
  restSec: number | null;
  targetRpe: number | null;
  groupLabel: string | null;
  playerIds: string[] | null;
  contentIds: string[];
  restrictionTags: RestrictionTag[];
  notes: string | null;
  rating: number | null;
  ownerUserId: string | null;
  description: string | null;
  coachingPoints: string | null;
  diagram: DrillDiagram | null;
  audioBlobKey: string | null;
}

export interface TeamEventRecord {
  id: string;
  kind: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  facility: { id: string; name: string } | null;
  opponent: string | null;
  homeAway: string | null;
  sessionId: string | null;
}

/** Día de calendario de un instante en la zona del club. */
export function localDate(timezone: string, at: Date): string {
  const p = localParts(timezone, at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Instante de un día y una hora locales del club. */
export function instantOf(timezone: string, date: string, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return fromLocal(timezone, y!, m!, d!, hh ?? 0, mm ?? 0);
}

/** Minutos planificados y carga prevista de una sesión: tareas, o la duración del evento. */
export function plannedOf(
  session: Pick<SessionRecord, "startsAt" | "endsAt" | "targetRpe">,
  items: readonly Pick<SessionItemRecord, "minutes" | "targetRpe">[],
): { minutes: number; load: number } {
  const eventMinutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000);
  if (items.length === 0)
    return { minutes: eventMinutes, load: (session.targetRpe ?? 0) * eventMinutes };
  const minutes = items.reduce((a, i) => a + i.minutes, 0);
  const load = items.reduce((a, i) => a + i.minutes * (i.targetRpe ?? session.targetRpe ?? 0), 0);
  return { minutes, load };
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function trainingRepo(db: () => Database) {
  // --- Sección: ajustes, contenidos, semanas tipo ---

  async function sectionOf(scope: OrgScope, sectionId: string) {
    const rows = await db()
      .select({
        id: schema.sections.id,
        name: schema.sections.name,
        sportCode: schema.sports.code,
        trainingSettings: schema.sections.trainingSettings,
      })
      .from(schema.sections)
      .innerJoin(schema.sports, eq(schema.sports.id, schema.sections.sportId))
      .where(
        and(
          eq(schema.sections.organizationId, scope.organizationId),
          eq(schema.sections.id, sectionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  const contentSelection = {
    id: schema.trainingContents.id,
    sectionId: schema.trainingContents.sectionId,
    code: schema.trainingContents.code,
    name: schema.trainingContents.name,
    kind: schema.trainingContents.kind,
    relatedActionCodes: schema.trainingContents.relatedActionCodes,
    sortOrder: schema.trainingContents.sortOrder,
    status: schema.trainingContents.status,
  };
  type ContentRow = {
    id: string;
    sectionId: string;
    code: string;
    name: string;
    kind: string;
    relatedActionCodes: string[];
    sortOrder: number;
    status: string;
  };
  const toContent = (r: ContentRow): TrainingContentRecord => ({
    ...r,
    kind: r.kind as TrainingContentKind,
    relatedActionCodes: Array.isArray(r.relatedActionCodes) ? r.relatedActionCodes : [],
    status: r.status as TrainingContentStatus,
  });

  async function contentsOf(
    scope: OrgScope,
    sectionIds: string[],
  ): Promise<TrainingContentRecord[]> {
    if (sectionIds.length === 0) return [];
    const rows = await db()
      .select(contentSelection)
      .from(schema.trainingContents)
      .where(
        and(
          eq(schema.trainingContents.organizationId, scope.organizationId),
          inArray(schema.trainingContents.sectionId, sectionIds),
        ),
      )
      .orderBy(asc(schema.trainingContents.sortOrder), asc(schema.trainingContents.name));
    return rows.map(toContent);
  }

  /**
   * La sección nace con los contenidos y la biblioteca de arranque de su deporte: los contenidos
   * si no tiene ninguno, y las tareas semilla si la sección no tiene ninguna tarea.
   */
  async function ensureCatalog(
    scope: OrgScope,
    sectionId: string,
    sportCode: string,
    locale: Locale,
  ): Promise<TrainingContentRecord[]> {
    let contents = await contentsOf(scope, [sectionId]);
    if (contents.length === 0) {
      const seeds = defaultTrainingContents(sportCode, locale);
      await db()
        .insert(schema.trainingContents)
        .values(
          seeds.map((s, i) => ({
            organizationId: scope.organizationId,
            sectionId,
            code: s.code,
            name: s.name,
            kind: s.kind,
            relatedActionCodes: s.relatedActionCodes ?? [],
            sortOrder: (i + 1) * 10,
          })),
        )
        .onConflictDoNothing();
      contents = await contentsOf(scope, [sectionId]);
    }
    const drillSeeds = defaultDrills(sportCode);
    if (drillSeeds.length > 0) {
      const existing = await db()
        .select({ id: schema.drills.id })
        .from(schema.drills)
        .where(
          and(
            eq(schema.drills.organizationId, scope.organizationId),
            eq(schema.drills.sectionId, sectionId),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        const byCode = new Map(contents.map((c) => [c.code, c.id]));
        await db().transaction(async (tx) => {
          for (const [i, seed] of drillSeeds.entries()) {
            const rows = await tx
              .insert(schema.drills)
              .values({
                organizationId: scope.organizationId,
                scope: "section",
                sectionId,
                name: seed.name[locale],
                description: seed.description[locale],
                coachingPoints: seed.coachingPoints?.[locale] ?? null,
                format: seed.format ?? null,
                space: seed.space[locale],
                playersMin: seed.playersMin ?? null,
                playersMax: seed.playersMax ?? null,
                durationMin: seed.durationMin,
                targetRpe: seed.targetRpe,
                diagram: seed.diagram ?? null,
                restrictionTags: seed.restrictionTags,
                seedKey: `seed_${i + 1}`,
              })
              .onConflictDoNothing()
              .returning({ id: schema.drills.id });
            const drillId = rows[0]?.id;
            if (!drillId) continue;
            const ids = seed.contents.map((c) => byCode.get(c)).filter((x): x is string => !!x);
            if (ids.length > 0)
              await tx.insert(schema.drillContents).values(
                ids.map((contentId, j) => ({
                  organizationId: scope.organizationId,
                  drillId,
                  contentId,
                  isPrimary: j === 0,
                  sortOrder: j,
                })),
              );
          }
        });
      }
    }
    return contents;
  }

  async function sectionTraining(
    scope: OrgScope,
    sectionId: string,
  ): Promise<SectionTrainingRecord | null> {
    const section = await sectionOf(scope, sectionId);
    if (!section) return null;
    return {
      id: section.id,
      name: section.name,
      sportCode: section.sportCode,
      settings: resolveTrainingSettings(section.trainingSettings),
      customized:
        section.trainingSettings !== null && Object.keys(section.trainingSettings).length > 0,
    };
  }

  async function templatesOf(
    scope: OrgScope,
    sectionId: string,
  ): Promise<MicrocycleTemplateRecord[]> {
    const rows = await db()
      .select({
        id: schema.microcycleTemplates.id,
        sectionId: schema.microcycleTemplates.sectionId,
        name: schema.microcycleTemplates.name,
        days: schema.microcycleTemplates.days,
      })
      .from(schema.microcycleTemplates)
      .where(
        and(
          eq(schema.microcycleTemplates.organizationId, scope.organizationId),
          eq(schema.microcycleTemplates.sectionId, sectionId),
        ),
      )
      .orderBy(asc(schema.microcycleTemplates.name));
    return rows.map((r) => ({ ...r, days: Array.isArray(r.days) ? r.days : [] }));
  }

  // --- Biblioteca ---

  async function drillContentsOf(scope: OrgScope, drillIds: string[]) {
    const out = new Map<string, { id: string; name: string; kind: TrainingContentKind }[]>();
    if (drillIds.length === 0) return out;
    const rows = await db()
      .select({
        drillId: schema.drillContents.drillId,
        id: schema.trainingContents.id,
        name: schema.trainingContents.name,
        kind: schema.trainingContents.kind,
      })
      .from(schema.drillContents)
      .innerJoin(
        schema.trainingContents,
        eq(schema.trainingContents.id, schema.drillContents.contentId),
      )
      .where(
        and(
          eq(schema.drillContents.organizationId, scope.organizationId),
          inArray(schema.drillContents.drillId, drillIds),
        ),
      )
      .orderBy(desc(schema.drillContents.isPrimary), asc(schema.drillContents.sortOrder));
    for (const r of rows) {
      const list = out.get(r.drillId) ?? [];
      list.push({ id: r.id, name: r.name, kind: r.kind as TrainingContentKind });
      out.set(r.drillId, list);
    }
    return out;
  }

  async function drillUsage(scope: OrgScope, drillIds: string[]) {
    const out = new Map<
      string,
      { uses: number; lastUsedOn: string | null; rating: number | null }
    >();
    if (drillIds.length === 0) return out;
    const rows = await db()
      .select({
        drillId: schema.trainingSessionItems.drillId,
        uses: sql<number>`count(distinct ${schema.trainingSessionItems.sessionId})`,
        last: sql<Date | null>`max(${schema.events.startsAt})`,
        rating: sql<string | null>`avg(${schema.trainingSessionItems.rating})`,
      })
      .from(schema.trainingSessionItems)
      .innerJoin(
        schema.trainingSessions,
        eq(schema.trainingSessions.id, schema.trainingSessionItems.sessionId),
      )
      .innerJoin(schema.events, eq(schema.events.id, schema.trainingSessions.eventId))
      .where(
        and(
          eq(schema.trainingSessionItems.organizationId, scope.organizationId),
          inArray(schema.trainingSessionItems.drillId, drillIds),
        ),
      )
      .groupBy(schema.trainingSessionItems.drillId);
    for (const r of rows) {
      if (!r.drillId) continue;
      out.set(r.drillId, {
        uses: Number(r.uses),
        lastUsedOn: r.last ? new Date(r.last).toISOString().slice(0, 10) : null,
        rating: r.rating === null ? null : Math.round(Number(r.rating) * 10) / 10,
      });
    }
    return out;
  }

  const drillQuery = () =>
    db()
      .select({
        id: schema.drills.id,
        scope: schema.drills.scope,
        sectionId: schema.drills.sectionId,
        sectionName: schema.sections.name,
        teamId: schema.drills.teamId,
        teamName: schema.teams.name,
        ownerUserId: schema.drills.ownerUserId,
        ownerName: schema.users.name,
        name: schema.drills.name,
        description: schema.drills.description,
        rules: schema.drills.rules,
        coachingPoints: schema.drills.coachingPoints,
        variants: schema.drills.variants,
        format: schema.drills.format,
        space: schema.drills.space,
        playersMin: schema.drills.playersMin,
        playersMax: schema.drills.playersMax,
        durationMin: schema.drills.durationMin,
        targetRpe: schema.drills.targetRpe,
        material: schema.drills.material,
        diagram: schema.drills.diagram,
        audioBlobKey: schema.drills.audioBlobKey,
        videoUrl: schema.drills.videoUrl,
        restrictionTags: schema.drills.restrictionTags,
        status: schema.drills.status,
      })
      .from(schema.drills)
      .leftJoin(schema.sections, eq(schema.sections.id, schema.drills.sectionId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.drills.teamId))
      .leftJoin(schema.users, eq(schema.users.id, schema.drills.ownerUserId));
  type DrillRow = Awaited<ReturnType<ReturnType<typeof drillQuery>["execute"]>>[number];

  async function toDrills(scope: OrgScope, rows: DrillRow[]): Promise<DrillRecord[]> {
    const ids = rows.map((r) => r.id);
    const [contents, usage] = await Promise.all([
      drillContentsOf(scope, ids),
      drillUsage(scope, ids),
    ]);
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as DrillScope,
      section: r.sectionId && r.sectionName ? { id: r.sectionId, name: r.sectionName } : null,
      team: r.teamId && r.teamName ? { id: r.teamId, name: r.teamName } : null,
      owner: r.ownerUserId && r.ownerName ? { userId: r.ownerUserId, name: r.ownerName } : null,
      name: r.name,
      description: r.description,
      rules: r.rules,
      coachingPoints: r.coachingPoints,
      variants: r.variants,
      format: r.format,
      space: r.space,
      playersMin: r.playersMin,
      playersMax: r.playersMax,
      durationMin: r.durationMin,
      targetRpe: r.targetRpe,
      material: r.material,
      diagram: r.diagram ?? null,
      audioBlobKey: r.audioBlobKey,
      videoUrl: r.videoUrl,
      restrictionTags: Array.isArray(r.restrictionTags) ? r.restrictionTags : [],
      status: r.status as DrillStatus,
      contents: contents.get(r.id) ?? [],
      uses: usage.get(r.id)?.uses ?? 0,
      lastUsedOn: usage.get(r.id)?.lastUsedOn ?? null,
      rating: usage.get(r.id)?.rating ?? null,
    }));
  }

  async function drillById(scope: OrgScope, id: string): Promise<DrillRecord | null> {
    const rows = await drillQuery().where(
      and(eq(schema.drills.organizationId, scope.organizationId), eq(schema.drills.id, id)),
    );
    return rows[0] ? ((await toDrills(scope, rows))[0] ?? null) : null;
  }

  /** Contenidos que existen en el club (y, si se indica, en una sección). */
  async function validContentIds(scope: OrgScope, ids: string[], sectionId: string | null) {
    if (ids.length === 0) return true;
    const rows = await db()
      .select({ id: schema.trainingContents.id })
      .from(schema.trainingContents)
      .where(
        and(
          eq(schema.trainingContents.organizationId, scope.organizationId),
          inArray(schema.trainingContents.id, ids),
          sectionId ? eq(schema.trainingContents.sectionId, sectionId) : undefined,
        ),
      );
    return rows.length === new Set(ids).size;
  }

  async function setDrillContents(scope: OrgScope, drillId: string, ids: string[]) {
    await db().transaction(async (tx) => {
      await tx
        .delete(schema.drillContents)
        .where(
          and(
            eq(schema.drillContents.organizationId, scope.organizationId),
            eq(schema.drillContents.drillId, drillId),
          ),
        );
      const unique = [...new Set(ids)];
      if (unique.length > 0)
        await tx.insert(schema.drillContents).values(
          unique.map((contentId, i) => ({
            organizationId: scope.organizationId,
            drillId,
            contentId,
            isPrimary: i === 0,
            sortOrder: i,
          })),
        );
    });
  }

  // --- Plan y ciclos ---

  async function planOf(
    scope: OrgScope,
    teamId: string,
    seasonId: string,
  ): Promise<PlanRecord | null> {
    const rows = await db()
      .select({
        id: schema.trainingPlans.id,
        teamId: schema.trainingPlans.teamId,
        seasonId: schema.trainingPlans.seasonId,
        name: schema.trainingPlans.name,
        notes: schema.trainingPlans.notes,
      })
      .from(schema.trainingPlans)
      .where(
        and(
          eq(schema.trainingPlans.organizationId, scope.organizationId),
          eq(schema.trainingPlans.teamId, teamId),
          eq(schema.trainingPlans.seasonId, seasonId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  const cycleSelection = {
    id: schema.trainingCycles.id,
    planId: schema.trainingCycles.planId,
    name: schema.trainingCycles.name,
    startsOn: schema.trainingCycles.startsOn,
    endsOn: schema.trainingCycles.endsOn,
    focusContentIds: schema.trainingCycles.focusContentIds,
    targetWeeklyLoad: schema.trainingCycles.targetWeeklyLoad,
    notes: schema.trainingCycles.notes,
  };
  const toCycle = (r: CycleRecord): CycleRecord => ({
    ...r,
    focusContentIds: Array.isArray(r.focusContentIds) ? r.focusContentIds : [],
  });

  async function cyclesOfTeam(scope: OrgScope, teamId: string): Promise<CycleRecord[]> {
    const rows = await db()
      .select(cycleSelection)
      .from(schema.trainingCycles)
      .innerJoin(schema.trainingPlans, eq(schema.trainingPlans.id, schema.trainingCycles.planId))
      .where(
        and(
          eq(schema.trainingCycles.organizationId, scope.organizationId),
          eq(schema.trainingPlans.teamId, teamId),
        ),
      )
      .orderBy(asc(schema.trainingCycles.startsOn));
    return rows.map(toCycle);
  }

  // --- Sesiones ---

  const sessionQuery = () =>
    db()
      .select({
        id: schema.trainingSessions.id,
        eventId: schema.trainingSessions.eventId,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        sectionId: schema.teams.sectionId,
        title: schema.events.title,
        startsAt: schema.events.startsAt,
        endsAt: schema.events.endsAt,
        facilityId: schema.facilities.id,
        facilityName: schema.facilities.name,
        mdLabel: schema.trainingSessions.mdLabel,
        objective: schema.trainingSessions.objective,
        contentIds: schema.trainingSessions.contentIds,
        status: schema.trainingSessions.status,
        targetRpe: schema.trainingSessions.targetRpe,
        actualMinutes: schema.trainingSessions.actualMinutes,
        rating: schema.trainingSessions.rating,
        notes: schema.trainingSessions.notes,
        cycleId: schema.trainingSessions.cycleId,
        closedAt: schema.trainingSessions.closedAt,
      })
      .from(schema.trainingSessions)
      .innerJoin(schema.events, eq(schema.events.id, schema.trainingSessions.eventId))
      .innerJoin(schema.teams, eq(schema.teams.id, schema.trainingSessions.teamId))
      .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId));
  type SessionRow = Awaited<ReturnType<ReturnType<typeof sessionQuery>["execute"]>>[number];
  const toSession = (r: SessionRow): SessionRecord => ({
    id: r.id,
    eventId: r.eventId,
    team: { id: r.teamId, name: r.teamName },
    sectionId: r.sectionId,
    title: r.title,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    facility: r.facilityId && r.facilityName ? { id: r.facilityId, name: r.facilityName } : null,
    mdLabel: r.mdLabel,
    objective: r.objective,
    contentIds: Array.isArray(r.contentIds) ? r.contentIds : [],
    status: r.status as SessionStatus,
    targetRpe: r.targetRpe,
    actualMinutes: r.actualMinutes,
    rating: r.rating,
    notes: r.notes,
    cycleId: r.cycleId,
    closedAt: r.closedAt,
  });

  async function sessionById(scope: OrgScope, id: string): Promise<SessionRecord | null> {
    const rows = await sessionQuery().where(
      and(
        eq(schema.trainingSessions.organizationId, scope.organizationId),
        eq(schema.trainingSessions.id, id),
      ),
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async function sessionByEvent(scope: OrgScope, eventId: string): Promise<SessionRecord | null> {
    const rows = await sessionQuery().where(
      and(
        eq(schema.trainingSessions.organizationId, scope.organizationId),
        eq(schema.trainingSessions.eventId, eventId),
      ),
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async function itemsOf(scope: OrgScope, sessionIds: string[]): Promise<SessionItemRecord[]> {
    if (sessionIds.length === 0) return [];
    const rows = await db()
      .select({
        id: schema.trainingSessionItems.id,
        sessionId: schema.trainingSessionItems.sessionId,
        block: schema.trainingSessionItems.block,
        sortOrder: schema.trainingSessionItems.sortOrder,
        drillId: schema.trainingSessionItems.drillId,
        title: schema.trainingSessionItems.title,
        minutes: schema.trainingSessionItems.minutes,
        sets: schema.trainingSessionItems.sets,
        reps: schema.trainingSessionItems.reps,
        restSec: schema.trainingSessionItems.restSec,
        targetRpe: schema.trainingSessionItems.targetRpe,
        groupLabel: schema.trainingSessionItems.groupLabel,
        playerIds: schema.trainingSessionItems.playerIds,
        contentIds: schema.trainingSessionItems.contentIds,
        restrictionTags: schema.trainingSessionItems.restrictionTags,
        notes: schema.trainingSessionItems.notes,
        rating: schema.trainingSessionItems.rating,
        ownerUserId: schema.trainingSessionItems.ownerUserId,
        description: schema.drills.description,
        coachingPoints: schema.drills.coachingPoints,
        diagram: schema.drills.diagram,
        audioBlobKey: schema.drills.audioBlobKey,
      })
      .from(schema.trainingSessionItems)
      .leftJoin(schema.drills, eq(schema.drills.id, schema.trainingSessionItems.drillId))
      .where(
        and(
          eq(schema.trainingSessionItems.organizationId, scope.organizationId),
          inArray(schema.trainingSessionItems.sessionId, sessionIds),
        ),
      )
      .orderBy(asc(schema.trainingSessionItems.sortOrder));
    const order = new Map(
      ["warmup", "main", "goalkeepers", "rehab", "cooldown"].map((b, i) => [b, i]),
    );
    return rows
      .map((r) => ({
        ...r,
        block: r.block as SessionBlock,
        playerIds: Array.isArray(r.playerIds) ? r.playerIds : null,
        contentIds: Array.isArray(r.contentIds) ? r.contentIds : [],
        restrictionTags: Array.isArray(r.restrictionTags) ? r.restrictionTags : [],
        diagram: r.diagram ?? null,
      }))
      .sort((a, b) => order.get(a.block)! - order.get(b.block)! || a.sortOrder - b.sortOrder);
  }

  async function teamOf(scope: OrgScope, teamId: string) {
    const rows = await db()
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        sectionId: schema.teams.sectionId,
        seasonId: schema.teams.seasonId,
        categoryId: schema.teams.categoryId,
      })
      .from(schema.teams)
      .where(
        and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, teamId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Sustituye las tareas de un bloque: las que no vienen salen; las que vienen entran o cambian. */
  async function replaceBlock(
    scope: OrgScope,
    sessionId: string,
    block: SessionBlock,
    inputs: SessionItemInput[],
    userId: string | null,
  ): Promise<"saved" | "unknown_drill" | "unknown_item" | "unknown_content"> {
    const drillIds = [...new Set(inputs.map((i) => i.drillId).filter((x): x is string => !!x))];
    const drillRows =
      drillIds.length > 0
        ? await db()
            .select({
              id: schema.drills.id,
              name: schema.drills.name,
              targetRpe: schema.drills.targetRpe,
              restrictionTags: schema.drills.restrictionTags,
            })
            .from(schema.drills)
            .where(
              and(
                eq(schema.drills.organizationId, scope.organizationId),
                inArray(schema.drills.id, drillIds),
              ),
            )
        : [];
    if (drillRows.length !== drillIds.length) return "unknown_drill";
    const drillsById = new Map(drillRows.map((d) => [d.id, d]));
    const drillContents = await drillContentsOf(scope, drillIds);
    const contentIds = [...new Set(inputs.flatMap((i) => i.contentIds ?? []))];
    if (!(await validContentIds(scope, contentIds, null))) return "unknown_content";
    const existing = await db()
      .select({ id: schema.trainingSessionItems.id, block: schema.trainingSessionItems.block })
      .from(schema.trainingSessionItems)
      .where(
        and(
          eq(schema.trainingSessionItems.organizationId, scope.organizationId),
          eq(schema.trainingSessionItems.sessionId, sessionId),
        ),
      );
    const inBlock = new Set(existing.filter((e) => e.block === block).map((e) => e.id));
    for (const i of inputs) if (i.id && !inBlock.has(i.id)) return "unknown_item";
    const keep = new Set(inputs.map((i) => i.id).filter((x): x is string => !!x));
    await db().transaction(async (tx) => {
      const remove = [...inBlock].filter((id) => !keep.has(id));
      if (remove.length > 0)
        await tx
          .delete(schema.trainingSessionItems)
          .where(
            and(
              eq(schema.trainingSessionItems.organizationId, scope.organizationId),
              inArray(schema.trainingSessionItems.id, remove),
            ),
          );
      for (const [index, input] of inputs.entries()) {
        const drill = input.drillId ? drillsById.get(input.drillId) : undefined;
        const values = {
          drillId: input.drillId ?? null,
          title: input.title ?? drill?.name ?? "—",
          block,
          sortOrder: (index + 1) * 10,
          minutes: input.minutes,
          sets: input.sets ?? null,
          reps: input.reps ?? null,
          restSec: input.restSec ?? null,
          targetRpe: input.targetRpe ?? drill?.targetRpe ?? null,
          groupLabel: clean(input.groupLabel),
          playerIds: input.playerIds && input.playerIds.length > 0 ? input.playerIds : null,
          contentIds:
            input.contentIds ??
            (input.drillId ? (drillContents.get(input.drillId) ?? []).map((c) => c.id) : []),
          restrictionTags: drill
            ? Array.isArray(drill.restrictionTags)
              ? drill.restrictionTags
              : []
            : [],
          notes: clean(input.notes),
        };
        if (input.id) {
          await tx
            .update(schema.trainingSessionItems)
            .set(values)
            .where(
              and(
                eq(schema.trainingSessionItems.organizationId, scope.organizationId),
                eq(schema.trainingSessionItems.id, input.id),
              ),
            );
        } else {
          await tx.insert(schema.trainingSessionItems).values({
            organizationId: scope.organizationId,
            sessionId,
            ownerUserId: userId,
            ...values,
          });
        }
      }
    });
    return "saved";
  }

  /**
   * Crea la sesión de un entrenamiento de la agenda; si no viene el entrenamiento, lo crea en la
   * agenda con fecha, hora, duración e instalación.
   */
  async function createSession(
    scope: OrgScope,
    teamId: string,
    input: {
      eventId?: string | undefined;
      date?: string | undefined;
      startsAt?: string | undefined;
      minutes?: number | undefined;
      facilityId?: string | null | undefined;
      objective?: string | null | undefined;
      targetRpe?: number | null | undefined;
      cycleId?: string | null | undefined;
      status?: SessionStatus | undefined;
    },
    options: { timezone: string; createdBy: string | null; title: string },
  ): Promise<SessionRecord | "unknown_event" | "unknown_facility" | "exists"> {
    const team = await teamOf(scope, teamId);
    if (!team) return "unknown_event";
    let eventId = input.eventId ?? null;
    if (eventId) {
      const ev = await db()
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.id, eventId),
            eq(schema.events.teamId, teamId),
            eq(schema.events.kind, "training"),
          ),
        )
        .limit(1);
      if (ev.length === 0) return "unknown_event";
      if (await sessionByEvent(scope, eventId)) return "exists";
    } else {
      if (input.facilityId) {
        const f = await db()
          .select({ id: schema.facilities.id })
          .from(schema.facilities)
          .where(
            and(
              eq(schema.facilities.organizationId, scope.organizationId),
              eq(schema.facilities.id, input.facilityId),
            ),
          )
          .limit(1);
        if (f.length === 0) return "unknown_facility";
      }
      const startsAt = instantOf(options.timezone, input.date!, input.startsAt);
      const endsAt = new Date(startsAt.getTime() + (input.minutes ?? 90) * 60_000);
      const rows = await db()
        .insert(schema.events)
        .values({
          organizationId: scope.organizationId,
          kind: "training",
          title: options.title,
          sectionId: team.sectionId,
          teamId,
          facilityId: input.facilityId ?? null,
          startsAt,
          endsAt,
          createdBy: options.createdBy,
        })
        .returning({ id: schema.events.id });
      eventId = rows[0]!.id;
    }
    try {
      const rows = await db()
        .insert(schema.trainingSessions)
        .values({
          organizationId: scope.organizationId,
          eventId,
          teamId,
          objective: clean(input.objective),
          targetRpe: input.targetRpe ?? null,
          cycleId: input.cycleId ?? null,
          status: input.status ?? "draft",
          createdBy: options.createdBy,
        })
        .returning({ id: schema.trainingSessions.id });
      return (await sessionById(scope, rows[0]!.id))!;
    } catch (error) {
      if (isUniqueViolation(error)) return "exists";
      throw error;
    }
  }

  return {
    localDate,
    sectionOf,
    sectionTraining,
    contentsOf,
    ensureCatalog,
    templatesOf,
    teamOf,
    planOf,
    cyclesOfTeam,
    sessionById,
    sessionByEvent,
    itemsOf,
    drillById,
    validContentIds,

    async updateSettings(
      scope: OrgScope,
      sectionId: string,
      patch: TrainingSettingsPatch,
    ): Promise<boolean> {
      const current = await sectionOf(scope, sectionId);
      if (!current) return false;
      const base = current.trainingSettings ?? {};
      const next: TrainingSettingsPatch = {
        ...base,
        ...(patch.tracking !== undefined ? { tracking: patch.tracking } : {}),
        ...(patch.formative !== undefined ? { formative: patch.formative } : {}),
        ...(patch.thresholds
          ? { thresholds: { ...(base.thresholds ?? {}), ...patch.thresholds } }
          : {}),
        ...(patch.methodology
          ? { methodology: { ...(base.methodology ?? {}), ...patch.methodology } }
          : {}),
      };
      await db()
        .update(schema.sections)
        .set({ trainingSettings: next })
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.sections.id, sectionId),
          ),
        );
      return true;
    },

    async categoriesOf(scope: OrgScope, sectionId: string) {
      return db()
        .select({ id: schema.categories.id, name: schema.categories.name })
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.organizationId, scope.organizationId),
            eq(schema.categories.sectionId, sectionId),
          ),
        )
        .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
    },

    async createContent(
      scope: OrgScope,
      sectionId: string,
      input: TrainingContentCreate,
    ): Promise<TrainingContentRecord | "code_taken" | "not_found"> {
      if (!(await sectionOf(scope, sectionId))) return "not_found";
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.trainingContents.sortOrder}), 0)` })
        .from(schema.trainingContents)
        .where(eq(schema.trainingContents.sectionId, sectionId));
      try {
        const rows = await db()
          .insert(schema.trainingContents)
          .values({
            organizationId: scope.organizationId,
            sectionId,
            code: input.code ?? trainingCodeFromName(input.name),
            name: input.name,
            kind: input.kind,
            relatedActionCodes: input.relatedActionCodes ?? [],
            sortOrder: Number(last[0]?.max ?? 0) + 10,
          })
          .returning(contentSelection);
        return toContent(rows[0]!);
      } catch (error) {
        if (isUniqueViolation(error)) return "code_taken";
        throw error;
      }
    },

    async updateContent(
      scope: OrgScope,
      sectionId: string,
      id: string,
      patch: TrainingContentUpdate,
    ): Promise<TrainingContentRecord | null> {
      const set: Partial<typeof schema.trainingContents.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.kind !== undefined) set.kind = patch.kind;
      if (patch.relatedActionCodes !== undefined) set.relatedActionCodes = patch.relatedActionCodes;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
      const rows = await db()
        .update(schema.trainingContents)
        .set(set)
        .where(
          and(
            eq(schema.trainingContents.organizationId, scope.organizationId),
            eq(schema.trainingContents.sectionId, sectionId),
            eq(schema.trainingContents.id, id),
          ),
        )
        .returning(contentSelection);
      return rows[0] ? toContent(rows[0]) : null;
    },

    /** Quita un contenido; si alguna tarea o sesión lo usa, se archiva para no perder el histórico. */
    async removeContent(
      scope: OrgScope,
      sectionId: string,
      id: string,
    ): Promise<"removed" | "archived" | "not_found"> {
      const used = await db().execute<{ n: number }>(sql`
        select (
          (select count(*) from ${schema.drillContents} where content_id = ${id} and organization_id = ${scope.organizationId})
          + (select count(*) from ${schema.trainingSessionItems} where organization_id = ${scope.organizationId} and content_ids @> ${JSON.stringify([id])}::jsonb)
        )::int as n`);
      const where = and(
        eq(schema.trainingContents.organizationId, scope.organizationId),
        eq(schema.trainingContents.sectionId, sectionId),
        eq(schema.trainingContents.id, id),
      );
      if (Number(used.rows[0]?.n ?? 0) > 0) {
        const rows = await db()
          .update(schema.trainingContents)
          .set({ status: "archived" })
          .where(where)
          .returning({ id: schema.trainingContents.id });
        return rows.length > 0 ? "archived" : "not_found";
      }
      const rows = await db()
        .delete(schema.trainingContents)
        .where(where)
        .returning({ id: schema.trainingContents.id });
      return rows.length > 0 ? "removed" : "not_found";
    },

    async createTemplate(
      scope: OrgScope,
      sectionId: string,
      input: MicrocycleTemplateSet,
    ): Promise<MicrocycleTemplateRecord | "name_taken"> {
      try {
        const rows = await db()
          .insert(schema.microcycleTemplates)
          .values({
            organizationId: scope.organizationId,
            sectionId,
            name: input.name,
            days: input.days,
          })
          .returning({
            id: schema.microcycleTemplates.id,
            sectionId: schema.microcycleTemplates.sectionId,
            name: schema.microcycleTemplates.name,
            days: schema.microcycleTemplates.days,
          });
        return rows[0]!;
      } catch (error) {
        if (isUniqueViolation(error)) return "name_taken";
        throw error;
      }
    },

    async updateTemplate(
      scope: OrgScope,
      sectionId: string,
      id: string,
      input: MicrocycleTemplateSet,
    ): Promise<MicrocycleTemplateRecord | "name_taken" | null> {
      try {
        const rows = await db()
          .update(schema.microcycleTemplates)
          .set({ name: input.name, days: input.days })
          .where(
            and(
              eq(schema.microcycleTemplates.organizationId, scope.organizationId),
              eq(schema.microcycleTemplates.sectionId, sectionId),
              eq(schema.microcycleTemplates.id, id),
            ),
          )
          .returning({
            id: schema.microcycleTemplates.id,
            sectionId: schema.microcycleTemplates.sectionId,
            name: schema.microcycleTemplates.name,
            days: schema.microcycleTemplates.days,
          });
        return rows[0] ?? null;
      } catch (error) {
        if (isUniqueViolation(error)) return "name_taken";
        throw error;
      }
    },

    async removeTemplate(scope: OrgScope, sectionId: string, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.microcycleTemplates)
        .where(
          and(
            eq(schema.microcycleTemplates.organizationId, scope.organizationId),
            eq(schema.microcycleTemplates.sectionId, sectionId),
            eq(schema.microcycleTemplates.id, id),
          ),
        )
        .returning({ id: schema.microcycleTemplates.id });
      return rows.length > 0;
    },

    async templateById(scope: OrgScope, id: string): Promise<MicrocycleTemplateRecord | null> {
      const rows = await db()
        .select({
          id: schema.microcycleTemplates.id,
          sectionId: schema.microcycleTemplates.sectionId,
          name: schema.microcycleTemplates.name,
          days: schema.microcycleTemplates.days,
        })
        .from(schema.microcycleTemplates)
        .where(
          and(
            eq(schema.microcycleTemplates.organizationId, scope.organizationId),
            eq(schema.microcycleTemplates.id, id),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    // --- Biblioteca ---

    async listDrills(scope: OrgScope, filter: DrillFilter): Promise<DrillRecord[]> {
      const conditions = [eq(schema.drills.organizationId, scope.organizationId)];
      if (!filter.includeArchived) conditions.push(eq(schema.drills.status, "active"));
      // Lo personal solo lo ve quien lo creó.
      conditions.push(
        or(
          sql`${schema.drills.scope} <> 'personal'`,
          eq(schema.drills.ownerUserId, filter.userId),
        )!,
      );
      if (filter.visible) {
        const { sectionIds, teamIds } = filter.visible;
        conditions.push(
          or(
            eq(schema.drills.scope, "club"),
            eq(schema.drills.scope, "personal"),
            sectionIds.length > 0
              ? and(
                  eq(schema.drills.scope, "section"),
                  inArray(schema.drills.sectionId, sectionIds),
                )
              : sql`false`,
            teamIds.length > 0
              ? and(eq(schema.drills.scope, "team"), inArray(schema.drills.teamId, teamIds))
              : sql`false`,
          )!,
        );
      }
      if (filter.sectionId)
        conditions.push(
          or(isNull(schema.drills.sectionId), eq(schema.drills.sectionId, filter.sectionId))!,
        );
      if (filter.teamId)
        conditions.push(or(isNull(schema.drills.teamId), eq(schema.drills.teamId, filter.teamId))!);
      if (filter.contentId)
        conditions.push(
          sql`exists (select 1 from ${schema.drillContents} dc where dc.drill_id = ${schema.drills.id} and dc.content_id = ${filter.contentId})`,
        );
      if (filter.q?.trim())
        conditions.push(sql`${schema.drills.name} ilike ${`%${filter.q.trim()}%`}`);
      const rows = await drillQuery()
        .where(and(...conditions))
        .orderBy(asc(schema.drills.name));
      return toDrills(scope, rows);
    },

    async createDrill(
      scope: OrgScope,
      input: DrillCreate & { sectionId: string | null; teamId: string | null },
      userId: string,
    ): Promise<DrillRecord | "unknown_content"> {
      const contentIds = input.contentIds ?? [];
      if (
        !(await validContentIds(scope, contentIds, input.scope === "club" ? null : input.sectionId))
      )
        return "unknown_content";
      const rows = await db()
        .insert(schema.drills)
        .values({
          organizationId: scope.organizationId,
          scope: input.scope,
          sectionId: input.scope === "club" ? null : input.sectionId,
          teamId: input.scope === "team" ? input.teamId : null,
          ownerUserId: userId,
          name: input.name,
          description: clean(input.description),
          rules: clean(input.rules),
          coachingPoints: clean(input.coachingPoints),
          variants: clean(input.variants),
          format: clean(input.format),
          space: clean(input.space),
          playersMin: input.playersMin ?? null,
          playersMax: input.playersMax ?? null,
          durationMin: input.durationMin ?? null,
          targetRpe: input.targetRpe ?? null,
          material: clean(input.material),
          diagram: input.diagram ?? null,
          videoUrl: clean(input.videoUrl),
          restrictionTags: input.restrictionTags ?? [],
          createdBy: userId,
        })
        .returning({ id: schema.drills.id });
      const id = rows[0]!.id;
      if (contentIds.length > 0) await setDrillContents(scope, id, contentIds);
      return (await drillById(scope, id))!;
    },

    async updateDrill(
      scope: OrgScope,
      id: string,
      patch: DrillUpdate & { sectionId?: string | null; teamId?: string | null },
    ): Promise<DrillRecord | "unknown_content" | null> {
      const current = await drillById(scope, id);
      if (!current) return null;
      if (patch.contentIds) {
        const nextScope = patch.scope ?? current.scope;
        const sectionId =
          patch.sectionId !== undefined ? patch.sectionId : (current.section?.id ?? null);
        if (
          !(await validContentIds(scope, patch.contentIds, nextScope === "club" ? null : sectionId))
        )
          return "unknown_content";
      }
      const set: Partial<typeof schema.drills.$inferInsert> = {};
      if (patch.scope !== undefined) set.scope = patch.scope;
      if (patch.sectionId !== undefined) set.sectionId = patch.sectionId;
      if (patch.teamId !== undefined) set.teamId = patch.teamId;
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = clean(patch.description);
      if (patch.rules !== undefined) set.rules = clean(patch.rules);
      if (patch.coachingPoints !== undefined) set.coachingPoints = clean(patch.coachingPoints);
      if (patch.variants !== undefined) set.variants = clean(patch.variants);
      if (patch.format !== undefined) set.format = clean(patch.format);
      if (patch.space !== undefined) set.space = clean(patch.space);
      if (patch.playersMin !== undefined) set.playersMin = patch.playersMin;
      if (patch.playersMax !== undefined) set.playersMax = patch.playersMax;
      if (patch.durationMin !== undefined) set.durationMin = patch.durationMin;
      if (patch.targetRpe !== undefined) set.targetRpe = patch.targetRpe;
      if (patch.material !== undefined) set.material = clean(patch.material);
      if (patch.diagram !== undefined) set.diagram = patch.diagram;
      if (patch.videoUrl !== undefined) set.videoUrl = clean(patch.videoUrl);
      if (patch.restrictionTags !== undefined) set.restrictionTags = patch.restrictionTags;
      if (patch.status !== undefined) set.status = patch.status;
      if (Object.keys(set).length > 0)
        await db()
          .update(schema.drills)
          .set(set)
          .where(
            and(eq(schema.drills.organizationId, scope.organizationId), eq(schema.drills.id, id)),
          );
      if (patch.contentIds) await setDrillContents(scope, id, patch.contentIds);
      return drillById(scope, id);
    },

    /** Quita una tarea; si alguna sesión la usa, se archiva. */
    async removeDrill(scope: OrgScope, id: string): Promise<"removed" | "archived" | "not_found"> {
      const used = await db()
        .select({ id: schema.trainingSessionItems.id })
        .from(schema.trainingSessionItems)
        .where(
          and(
            eq(schema.trainingSessionItems.organizationId, scope.organizationId),
            eq(schema.trainingSessionItems.drillId, id),
          ),
        )
        .limit(1);
      const where = and(
        eq(schema.drills.organizationId, scope.organizationId),
        eq(schema.drills.id, id),
      );
      if (used.length > 0) {
        const rows = await db()
          .update(schema.drills)
          .set({ status: "archived" })
          .where(where)
          .returning({ id: schema.drills.id });
        return rows.length > 0 ? "archived" : "not_found";
      }
      const rows = await db()
        .delete(schema.drills)
        .where(where)
        .returning({ id: schema.drills.id });
      return rows.length > 0 ? "removed" : "not_found";
    },

    /** Las últimas sesiones en las que se usó una tarea. */
    async drillSessions(scope: OrgScope, drillId: string, timezone: string) {
      const rows = await db()
        .select({
          sessionId: schema.trainingSessions.id,
          startsAt: schema.events.startsAt,
          teamId: schema.teams.id,
          teamName: schema.teams.name,
          rating: schema.trainingSessionItems.rating,
        })
        .from(schema.trainingSessionItems)
        .innerJoin(
          schema.trainingSessions,
          eq(schema.trainingSessions.id, schema.trainingSessionItems.sessionId),
        )
        .innerJoin(schema.events, eq(schema.events.id, schema.trainingSessions.eventId))
        .innerJoin(schema.teams, eq(schema.teams.id, schema.trainingSessions.teamId))
        .where(
          and(
            eq(schema.trainingSessionItems.organizationId, scope.organizationId),
            eq(schema.trainingSessionItems.drillId, drillId),
          ),
        )
        .orderBy(desc(schema.events.startsAt))
        .limit(10);
      return rows.map((r) => ({
        sessionId: r.sessionId,
        date: localDate(timezone, r.startsAt),
        team: { id: r.teamId, name: r.teamName },
        rating: r.rating,
      }));
    },

    // --- Plan y ciclos ---

    async setPlan(
      scope: OrgScope,
      teamId: string,
      seasonId: string,
      input: TrainingPlanSet,
    ): Promise<PlanRecord> {
      await db()
        .insert(schema.trainingPlans)
        .values({
          organizationId: scope.organizationId,
          teamId,
          seasonId,
          name: input.name,
          notes: clean(input.notes),
        })
        .onConflictDoUpdate({
          target: [schema.trainingPlans.teamId, schema.trainingPlans.seasonId],
          set: { name: input.name, notes: clean(input.notes) },
        });
      return (await planOf(scope, teamId, seasonId))!;
    },

    async createCycle(
      scope: OrgScope,
      teamId: string,
      seasonId: string,
      input: TrainingCycleCreate,
      defaultPlanName: string,
    ): Promise<CycleRecord | "unknown_content"> {
      const team = await teamOf(scope, teamId);
      if (!(await validContentIds(scope, input.focusContentIds ?? [], team?.sectionId ?? null)))
        return "unknown_content";
      let plan = await planOf(scope, teamId, seasonId);
      if (!plan) {
        await db()
          .insert(schema.trainingPlans)
          .values({ organizationId: scope.organizationId, teamId, seasonId, name: defaultPlanName })
          .onConflictDoNothing();
        plan = (await planOf(scope, teamId, seasonId))!;
      }
      const rows = await db()
        .insert(schema.trainingCycles)
        .values({
          organizationId: scope.organizationId,
          planId: plan.id,
          name: input.name,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          focusContentIds: input.focusContentIds ?? [],
          targetWeeklyLoad: input.targetWeeklyLoad ?? null,
          notes: clean(input.notes),
        })
        .returning(cycleSelection);
      return toCycle(rows[0]!);
    },

    async updateCycle(
      scope: OrgScope,
      teamId: string,
      id: string,
      patch: TrainingCycleUpdate,
    ): Promise<CycleRecord | "unknown_content" | "invalid_dates" | null> {
      const current = (await cyclesOfTeam(scope, teamId)).find((c) => c.id === id);
      if (!current) return null;
      const team = await teamOf(scope, teamId);
      if (
        patch.focusContentIds &&
        !(await validContentIds(scope, patch.focusContentIds, team?.sectionId ?? null))
      )
        return "unknown_content";
      const startsOn = patch.startsOn ?? current.startsOn;
      const endsOn = patch.endsOn ?? current.endsOn;
      if (startsOn > endsOn) return "invalid_dates";
      const set: Partial<typeof schema.trainingCycles.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.startsOn !== undefined) set.startsOn = patch.startsOn;
      if (patch.endsOn !== undefined) set.endsOn = patch.endsOn;
      if (patch.focusContentIds !== undefined) set.focusContentIds = patch.focusContentIds;
      if (patch.targetWeeklyLoad !== undefined) set.targetWeeklyLoad = patch.targetWeeklyLoad;
      if (patch.notes !== undefined) set.notes = clean(patch.notes);
      const rows = await db()
        .update(schema.trainingCycles)
        .set(set)
        .where(
          and(
            eq(schema.trainingCycles.organizationId, scope.organizationId),
            eq(schema.trainingCycles.id, id),
          ),
        )
        .returning(cycleSelection);
      return rows[0] ? toCycle(rows[0]) : null;
    },

    async removeCycle(scope: OrgScope, teamId: string, id: string): Promise<boolean> {
      const current = (await cyclesOfTeam(scope, teamId)).find((c) => c.id === id);
      if (!current) return false;
      await db()
        .delete(schema.trainingCycles)
        .where(
          and(
            eq(schema.trainingCycles.organizationId, scope.organizationId),
            eq(schema.trainingCycles.id, id),
          ),
        );
      return true;
    },

    // --- Agenda del equipo ---

    /** Entrenamientos y partidos del equipo entre dos instantes, con su sesión si la tienen. */
    async teamEvents(
      scope: OrgScope,
      teamId: string,
      from: Date,
      to: Date,
    ): Promise<TeamEventRecord[]> {
      const rows = await db()
        .select({
          id: schema.events.id,
          kind: schema.events.kind,
          title: schema.events.title,
          startsAt: schema.events.startsAt,
          endsAt: schema.events.endsAt,
          facilityId: schema.facilities.id,
          facilityName: schema.facilities.name,
          opponent: schema.events.opponent,
          homeAway: schema.events.homeAway,
          sessionId: schema.trainingSessions.id,
        })
        .from(schema.events)
        .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId))
        .leftJoin(schema.trainingSessions, eq(schema.trainingSessions.eventId, schema.events.id))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            inArray(schema.events.kind, ["training", "match"]),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        )
        .orderBy(asc(schema.events.startsAt));
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        facility:
          r.facilityId && r.facilityName ? { id: r.facilityId, name: r.facilityName } : null,
        opponent: r.opponent,
        homeAway: r.homeAway,
        sessionId: r.sessionId,
      }));
    },

    /** Sesiones del equipo entre dos instantes. */
    async teamSessions(
      scope: OrgScope,
      teamId: string,
      from: Date,
      to: Date,
    ): Promise<SessionRecord[]> {
      const rows = await sessionQuery()
        .where(
          and(
            eq(schema.trainingSessions.organizationId, scope.organizationId),
            eq(schema.trainingSessions.teamId, teamId),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        )
        .orderBy(asc(schema.events.startsAt));
      return rows.map(toSession);
    },

    /** Sesiones de varios equipos entre dos instantes (panel de metodología). */
    async sessionsOfTeams(scope: OrgScope, teamIds: string[], from: Date, to: Date) {
      if (teamIds.length === 0) return [];
      const rows = await sessionQuery()
        .where(
          and(
            eq(schema.trainingSessions.organizationId, scope.organizationId),
            inArray(schema.trainingSessions.teamId, teamIds),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        )
        .orderBy(asc(schema.events.startsAt));
      return rows.map(toSession);
    },

    /** Entrenamientos de la agenda de varios equipos hasta un instante. */
    async trainingCounts(scope: OrgScope, teamIds: string[], from: Date, to: Date) {
      if (teamIds.length === 0) return new Map<string, number>();
      const rows = await db()
        .select({ teamId: schema.events.teamId, n: sql<number>`count(*)` })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            inArray(schema.events.teamId, teamIds),
            eq(schema.events.kind, "training"),
            gte(schema.events.startsAt, from),
            lte(schema.events.startsAt, to),
          ),
        )
        .groupBy(schema.events.teamId);
      return new Map(rows.map((r) => [r.teamId!, Number(r.n)]));
    },

    /** Escopo de las tareas usadas por varias sesiones: para la cuota de biblioteca oficial. */
    async drillScopes(scope: OrgScope, drillIds: string[]) {
      if (drillIds.length === 0) return new Map<string, DrillScope>();
      const rows = await db()
        .select({ id: schema.drills.id, scope: schema.drills.scope })
        .from(schema.drills)
        .where(
          and(
            eq(schema.drills.organizationId, scope.organizationId),
            inArray(schema.drills.id, drillIds),
          ),
        );
      return new Map(rows.map((r) => [r.id, r.scope as DrillScope]));
    },

    // --- Sesiones ---

    createSession,

    /** Pase de lista de los entrenamientos del equipo entre dos instantes. */
    async attendanceForTeam(scope: OrgScope, teamId: string, from: Date, to: Date) {
      return db()
        .select({
          playerId: schema.attendance.playerId,
          eventId: schema.attendance.eventId,
          startsAt: schema.events.startsAt,
          status: schema.attendance.status,
        })
        .from(schema.attendance)
        .innerJoin(schema.events, eq(schema.events.id, schema.attendance.eventId))
        .where(
          and(
            eq(schema.attendance.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            eq(schema.events.kind, "training"),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        );
    },

    async updateSession(
      scope: OrgScope,
      id: string,
      patch: SessionUpdate,
    ): Promise<SessionRecord | "unknown_content" | "unknown_cycle" | null> {
      const current = await sessionById(scope, id);
      if (!current) return null;
      if (patch.contentIds && !(await validContentIds(scope, patch.contentIds, current.sectionId)))
        return "unknown_content";
      if (patch.cycleId) {
        const cycles = await cyclesOfTeam(scope, current.team.id);
        if (!cycles.some((c) => c.id === patch.cycleId)) return "unknown_cycle";
      }
      const set: Partial<typeof schema.trainingSessions.$inferInsert> = {};
      if (patch.objective !== undefined) set.objective = clean(patch.objective);
      if (patch.mdLabel !== undefined) set.mdLabel = patch.mdLabel;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.targetRpe !== undefined) set.targetRpe = patch.targetRpe;
      if (patch.cycleId !== undefined) set.cycleId = patch.cycleId;
      if (patch.contentIds !== undefined) set.contentIds = patch.contentIds;
      if (patch.notes !== undefined) set.notes = clean(patch.notes);
      if (Object.keys(set).length > 0)
        await db()
          .update(schema.trainingSessions)
          .set(set)
          .where(
            and(
              eq(schema.trainingSessions.organizationId, scope.organizationId),
              eq(schema.trainingSessions.id, id),
            ),
          );
      return sessionById(scope, id);
    },

    replaceBlock,

    async removeSession(scope: OrgScope, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.trainingSessions)
        .where(
          and(
            eq(schema.trainingSessions.organizationId, scope.organizationId),
            eq(schema.trainingSessions.id, id),
          ),
        )
        .returning({ id: schema.trainingSessions.id });
      return rows.length > 0;
    },

    /** Cierra la sesión: duración real, valoración, notas y valoración de cada tarea. */
    async markClosed(
      scope: OrgScope,
      id: string,
      input: {
        actualMinutes: number;
        rating: number | null | undefined;
        notes: string | null | undefined;
        itemRatings: { itemId: string; rating: number }[];
      },
    ): Promise<void> {
      await db().transaction(async (tx) => {
        await tx
          .update(schema.trainingSessions)
          .set({
            status: "done",
            actualMinutes: input.actualMinutes,
            ...(input.rating !== undefined ? { rating: input.rating } : {}),
            ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
            closedAt: new Date(),
          })
          .where(
            and(
              eq(schema.trainingSessions.organizationId, scope.organizationId),
              eq(schema.trainingSessions.id, id),
            ),
          );
        for (const r of input.itemRatings) {
          await tx
            .update(schema.trainingSessionItems)
            .set({ rating: r.rating })
            .where(
              and(
                eq(schema.trainingSessionItems.organizationId, scope.organizationId),
                eq(schema.trainingSessionItems.sessionId, id),
                eq(schema.trainingSessionItems.id, r.itemId),
              ),
            );
        }
      });
    },

    /**
     * Copia la planificación de una sesión a otro entrenamiento del mismo equipo: objetivo,
     * contenidos, RPE objetivo y tareas. La de destino se sustituye si ya existía.
     */
    async copySession(
      scope: OrgScope,
      from: SessionRecord,
      targetEventId: string,
      options: { createdBy: string | null; timezone: string; title: string },
    ): Promise<SessionRecord | "unknown_event"> {
      const target = await db()
        .select({ id: schema.events.id, teamId: schema.events.teamId, kind: schema.events.kind })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.id, targetEventId),
          ),
        )
        .limit(1);
      const ev = target[0];
      if (!ev || ev.kind !== "training" || !ev.teamId) return "unknown_event";
      const items = await itemsOf(scope, [from.id]);
      let session = await sessionByEvent(scope, targetEventId);
      if (!session) {
        const created = await createSession(scope, ev.teamId, { eventId: targetEventId }, options);
        if (typeof created === "string") return "unknown_event";
        session = created;
      }
      const sessionId = session.id;
      await db().transaction(async (tx) => {
        await tx
          .update(schema.trainingSessions)
          .set({
            objective: from.objective,
            contentIds: from.contentIds,
            targetRpe: from.targetRpe,
            status: "planned",
          })
          .where(eq(schema.trainingSessions.id, sessionId));
        await tx
          .delete(schema.trainingSessionItems)
          .where(eq(schema.trainingSessionItems.sessionId, sessionId));
        if (items.length > 0)
          await tx.insert(schema.trainingSessionItems).values(
            items.map((i) => ({
              organizationId: scope.organizationId,
              sessionId,
              drillId: i.drillId,
              title: i.title,
              block: i.block,
              sortOrder: i.sortOrder,
              minutes: i.minutes,
              sets: i.sets,
              reps: i.reps,
              restSec: i.restSec,
              targetRpe: i.targetRpe,
              groupLabel: i.groupLabel,
              // Los grupos de jugadores no se copian: cada día hay otra plantilla disponible.
              playerIds: null,
              contentIds: i.contentIds,
              restrictionTags: i.restrictionTags,
              notes: i.notes,
              ownerUserId: options.createdBy,
            })),
          );
      });
      return (await sessionById(scope, sessionId))!;
    },
  };
}
