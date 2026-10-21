import { schema, type Database } from "@sportsmanager/db";
import type {
  AttendanceStatus,
  EventCreate,
  EventKind,
  EventUpdate,
  FacilityCreate,
  FacilityHoursSet,
  FacilityKind,
  FacilityStatus,
  FacilityUpdate,
  HomeAway,
  TeamScheduleSlot,
} from "@sportsmanager/shared";
import { and, asc, count, eq, gt, gte, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Instalaciones, agenda, horarios y pase de lista (Bloques 16 y 17). Toda consulta lleva el
 * ámbito del club (ADR 0015). Los instantes se guardan con zona; "hoy" y "esta semana" se
 * calculan en la zona horaria del club.
 */

export interface EventRecord {
  id: string;
  kind: EventKind;
  title: string;
  startsAt: Date;
  endsAt: Date;
  section: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  facility: { id: string; name: string } | null;
  location: string | null;
  opponent: string | null;
  homeAway: HomeAway | null;
  notes: string | null;
  seriesId: string | null;
  attendance: { present: number; total: number } | null;
}

export interface EventFilter {
  sectionId?: string | undefined;
  teamId?: string | undefined;
  facilityId?: string | undefined;
  /** Solo estos equipos (agenda propia del cuerpo técnico o de una familia). */
  teamIds?: string[] | undefined;
}

export interface FacilityRecord {
  id: string;
  name: string;
  kind: FacilityKind;
  capacity: number | null;
  description: string | null;
  status: FacilityStatus;
  sortOrder: number;
  hours: { weekday: number; opensAt: string; closesAt: string }[];
  eventsThisWeek: number;
}

export interface ScheduleSlotRecord {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  facility: { id: string; name: string } | null;
}

export interface AttendanceEntryRecord {
  playerId: string;
  firstName: string;
  lastName: string;
  photoBlobKey: string | null;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface AttendanceSummaryRecord {
  events: number;
  present: number;
  absent: number;
  excused: number;
  percent: number | null;
}

export interface EventConflict {
  eventId: string;
  title: string;
}

/** Inicio y fin (instantes UTC) del día de hoy y de la semana en curso en una zona horaria. */
export function dayRange(timezone: string, now = new Date()): { from: Date; to: Date } {
  const local = localParts(timezone, now);
  const from = fromLocal(timezone, local.year, local.month, local.day, 0, 0);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function weekRange(timezone: string, now = new Date()): { from: Date; to: Date } {
  const local = localParts(timezone, now);
  const start = fromLocal(timezone, local.year, local.month, local.day, 0, 0);
  const monday = new Date(start.getTime() - (local.isoWeekday - 1) * 24 * 60 * 60 * 1000);
  return { from: monday, to: new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

/** Año, mes, día y día de la semana ISO de un instante en una zona. */
export function localParts(timezone: string, at: Date) {
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
  const weekdays: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    isoWeekday: weekdays[get("weekday")] ?? 1,
  };
}

/** Instante UTC de una fecha y hora locales de una zona (resuelve el desfase iterando dos veces). */
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

/** Día de la semana ISO (1 lunes … 7 domingo) de una fecha de calendario. */
function isoWeekdayOf(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Fecha de calendario `n` días después de otra, en UTC puro (solo aritmética de calendario). */
function shiftDate(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function minutesOf(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Semanas como mucho que genera una repetición: una temporada larga. */
const MAX_WEEKS = 60;

export function eventsRepo(db: () => Database) {
  const selection = {
    id: schema.events.id,
    kind: schema.events.kind,
    title: schema.events.title,
    startsAt: schema.events.startsAt,
    endsAt: schema.events.endsAt,
    sectionId: schema.sections.id,
    sectionName: schema.sections.name,
    teamId: schema.teams.id,
    teamName: schema.teams.name,
    facilityId: schema.facilities.id,
    facilityName: schema.facilities.name,
    location: schema.events.location,
    opponent: schema.events.opponent,
    homeAway: schema.events.homeAway,
    notes: schema.events.notes,
    seriesId: schema.events.seriesId,
  };
  const query = () =>
    db()
      .select(selection)
      .from(schema.events)
      .leftJoin(schema.sections, eq(schema.sections.id, schema.events.sectionId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
      .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId));
  type Row = Awaited<ReturnType<ReturnType<typeof query>["execute"]>>[number];

  /** Presentes y convocados con lista pasada, por evento. Sin filas: no se ha pasado lista. */
  async function attendanceFor(
    scope: OrgScope,
    eventIds: string[],
  ): Promise<Map<string, { present: number; total: number }>> {
    const map = new Map<string, { present: number; total: number }>();
    if (eventIds.length === 0) return map;
    const rows = await db()
      .select({
        eventId: schema.attendance.eventId,
        total: count(),
        present: sql<number>`count(*) filter (where ${schema.attendance.status} = 'present')`,
      })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.organizationId, scope.organizationId),
          inArray(schema.attendance.eventId, eventIds),
        ),
      )
      .groupBy(schema.attendance.eventId);
    for (const row of rows) {
      map.set(row.eventId, { present: Number(row.present), total: Number(row.total) });
    }
    return map;
  }

  const toRecord = (
    row: Row,
    attendance: { present: number; total: number } | null,
  ): EventRecord => ({
    id: row.id,
    kind: row.kind as EventKind,
    title: row.title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    section: row.sectionId && row.sectionName ? { id: row.sectionId, name: row.sectionName } : null,
    team: row.teamId && row.teamName ? { id: row.teamId, name: row.teamName } : null,
    facility:
      row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null,
    location: row.location,
    opponent: row.opponent,
    homeAway: row.homeAway as HomeAway | null,
    notes: row.notes,
    seriesId: row.seriesId,
    attendance,
  });

  async function toRecords(scope: OrgScope, rows: Row[]): Promise<EventRecord[]> {
    const attendance = await attendanceFor(
      scope,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toRecord(row, attendance.get(row.id) ?? null));
  }

  function conditions(scope: OrgScope, from: Date, to: Date, filter: EventFilter) {
    const conds = [
      eq(schema.events.organizationId, scope.organizationId),
      lt(schema.events.startsAt, to),
      gt(schema.events.endsAt, from),
    ];
    if (filter.sectionId) conds.push(eq(schema.events.sectionId, filter.sectionId));
    if (filter.teamId) conds.push(eq(schema.events.teamId, filter.teamId));
    if (filter.facilityId) conds.push(eq(schema.events.facilityId, filter.facilityId));
    if (filter.teamIds) {
      conds.push(
        filter.teamIds.length > 0 ? inArray(schema.events.teamId, filter.teamIds) : sql`false`,
      );
    }
    return and(...conds);
  }

  async function byId(scope: OrgScope, id: string): Promise<EventRecord | null> {
    const rows = await query().where(
      and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, id)),
    );
    const row = rows[0];
    if (!row) return null;
    const attendance = await attendanceFor(scope, [row.id]);
    return toRecord(row, attendance.get(row.id) ?? null);
  }

  async function sectionOf(scope: OrgScope, id: string) {
    const rows = await db()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(
        and(eq(schema.sections.organizationId, scope.organizationId), eq(schema.sections.id, id)),
      )
      .limit(1);
    return rows[0] ?? null;
  }
  async function teamOf(scope: OrgScope, id: string) {
    const rows = await db()
      .select({ id: schema.teams.id, sectionId: schema.teams.sectionId })
      .from(schema.teams)
      .where(and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }
  async function facilityOf(scope: OrgScope, id: string) {
    const rows = await db()
      .select({ id: schema.facilities.id })
      .from(schema.facilities)
      .where(
        and(
          eq(schema.facilities.organizationId, scope.organizationId),
          eq(schema.facilities.id, id),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Eventos ya guardados que ocupan la misma instalación a la vez que alguno de los tramos. */
  async function conflictsFor(
    scope: OrgScope,
    facilityId: string | null,
    slots: { startsAt: Date; endsAt: Date }[],
    excludeId: string | null = null,
  ): Promise<EventConflict[]> {
    if (!facilityId || slots.length === 0) return [];
    const overlaps = slots.map((s) =>
      and(lt(schema.events.startsAt, s.endsAt), gt(schema.events.endsAt, s.startsAt)),
    );
    const rows = await db()
      .select({ id: schema.events.id, title: schema.events.title })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.organizationId, scope.organizationId),
          eq(schema.events.facilityId, facilityId),
          excludeId ? ne(schema.events.id, excludeId) : undefined,
          or(...overlaps),
        ),
      )
      .orderBy(asc(schema.events.startsAt));
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .map((r) => ({ eventId: r.id, title: r.title }));
  }

  return {
    byId,

    /** Eventos que tocan el rango [from, to), por orden de inicio. */
    async listBetween(
      scope: OrgScope,
      from: Date,
      to: Date,
      filter: EventFilter = {},
    ): Promise<EventRecord[]> {
      const rows = await query()
        .where(conditions(scope, from, to, filter))
        .orderBy(asc(schema.events.startsAt), asc(schema.events.title));
      return toRecords(scope, rows);
    },

    async today(scope: OrgScope, timezone: string, now = new Date()): Promise<EventRecord[]> {
      const { from, to } = dayRange(timezone, now);
      const rows = await query()
        .where(conditions(scope, from, to, {}))
        .orderBy(asc(schema.events.startsAt), asc(schema.events.title));
      return toRecords(scope, rows);
    },

    /** El evento en curso o el siguiente del club. */
    async next(scope: OrgScope, now = new Date()): Promise<EventRecord | null> {
      const rows = await query()
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            gt(schema.events.endsAt, now),
          ),
        )
        .orderBy(asc(schema.events.startsAt))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const attendance = await attendanceFor(scope, [row.id]);
      return toRecord(row, attendance.get(row.id) ?? null);
    },

    /** Para cada equipo, su evento en curso o el siguiente. */
    async nextByTeam(
      scope: OrgScope,
      teamIds: string[],
      now = new Date(),
    ): Promise<Map<string, EventRecord>> {
      const map = new Map<string, EventRecord>();
      if (teamIds.length === 0) return map;
      const rows = await db()
        .selectDistinctOn([schema.events.teamId], selection)
        .from(schema.events)
        .leftJoin(schema.sections, eq(schema.sections.id, schema.events.sectionId))
        .leftJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
        .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            inArray(schema.events.teamId, teamIds),
            gt(schema.events.endsAt, now),
          ),
        )
        .orderBy(schema.events.teamId, asc(schema.events.startsAt));
      const records = await toRecords(scope, rows);
      for (const record of records) if (record.team) map.set(record.team.id, record);
      return map;
    },

    async countBetween(
      scope: OrgScope,
      from: Date,
      to: Date,
      filter: EventFilter = {},
    ): Promise<number> {
      const rows = await db()
        .select({ total: count() })
        .from(schema.events)
        .where(conditions(scope, from, to, filter));
      return rows[0]?.total ?? 0;
    },

    /** Pares de eventos que coinciden en la misma instalación dentro del rango. */
    async conflictsBetween(
      scope: OrgScope,
      from: Date,
      to: Date,
    ): Promise<{ eventId: string; withEventId: string }[]> {
      const a = schema.events;
      const rows = await db().execute<{ event_id: string; with_event_id: string }>(sql`
        select e1.id as event_id, e2.id as with_event_id
        from ${a} e1
        join ${a} e2
          on e2.organization_id = e1.organization_id
         and e2.facility_id = e1.facility_id
         and e2.id > e1.id
         and e2.starts_at < e1.ends_at
         and e1.starts_at < e2.ends_at
        where e1.organization_id = ${scope.organizationId}
          and e1.facility_id is not null
          and e1.starts_at < ${to.toISOString()}::timestamptz
          and e1.ends_at > ${from.toISOString()}::timestamptz
        order by e1.starts_at, e1.id
      `);
      return rows.rows.map((r) => ({ eventId: r.event_id, withEventId: r.with_event_id }));
    },

    /** Equipos de la temporada actual donde juegan los deportistas de una familia. */
    async teamIdsForGuardian(scope: OrgScope, userId: string): Promise<string[]> {
      const rows = await db()
        .selectDistinct({ teamId: schema.teamPlayers.teamId })
        .from(schema.playerGuardians)
        .innerJoin(
          schema.teamPlayers,
          eq(schema.teamPlayers.playerId, schema.playerGuardians.playerId),
        )
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
            eq(schema.seasons.isCurrent, true),
          ),
        );
      return rows.map((r) => r.teamId);
    },

    /**
     * Crea un evento. Con `repeatWeeklyUntil`, una fila por semana (misma hora local en la zona
     * del club) hasta esa fecha incluida, todas con el mismo `seriesId`. Avisa de los solapes en
     * la instalación, pero guarda igual: el club decide.
     */
    async create(
      scope: OrgScope,
      input: EventCreate,
      options: { timezone: string; createdBy: string | null },
    ): Promise<
      | { outcome: "created"; event: EventRecord; created: number; conflictsWith: EventConflict[] }
      | { outcome: "unknown_section" }
      | { outcome: "unknown_team" }
      | { outcome: "unknown_facility" }
    > {
      let sectionId = input.sectionId ?? null;
      if (input.teamId) {
        const team = await teamOf(scope, input.teamId);
        if (!team) return { outcome: "unknown_team" };
        sectionId ??= team.sectionId;
      }
      if (sectionId && !(await sectionOf(scope, sectionId))) return { outcome: "unknown_section" };
      if (input.facilityId && !(await facilityOf(scope, input.facilityId)))
        return { outcome: "unknown_facility" };

      const starts = new Date(input.startsAt);
      const duration = new Date(input.endsAt).getTime() - starts.getTime();
      const occurrences: { startsAt: Date; endsAt: Date }[] = [
        { startsAt: starts, endsAt: new Date(starts.getTime() + duration) },
      ];
      if (input.repeatWeeklyUntil) {
        const p = localParts(options.timezone, starts);
        for (let week = 1; week < MAX_WEEKS; week++) {
          const d = shiftDate(p.year, p.month, p.day, 7 * week);
          if (dateKey(d.year, d.month, d.day) > input.repeatWeeklyUntil) break;
          const start = fromLocal(options.timezone, d.year, d.month, d.day, p.hour, p.minute);
          occurrences.push({ startsAt: start, endsAt: new Date(start.getTime() + duration) });
        }
      }
      const conflictsWith = await conflictsFor(scope, input.facilityId ?? null, occurrences);
      const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;
      const rows = await db()
        .insert(schema.events)
        .values(
          occurrences.map((o) => ({
            organizationId: scope.organizationId,
            kind: input.kind,
            title: input.title,
            sectionId,
            teamId: input.teamId ?? null,
            facilityId: input.facilityId ?? null,
            startsAt: o.startsAt,
            endsAt: o.endsAt,
            location: input.location?.trim() ? input.location.trim() : null,
            opponent: input.opponent?.trim() ? input.opponent.trim() : null,
            homeAway: input.homeAway ?? null,
            notes: input.notes?.trim() ? input.notes.trim() : null,
            seriesId,
            createdBy: options.createdBy,
          })),
        )
        .returning({ id: schema.events.id });
      const event = await byId(scope, rows[0]!.id);
      if (!event) throw new Error("El evento recién creado no aparece.");
      return { outcome: "created", event, created: rows.length, conflictsWith };
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: EventUpdate,
    ): Promise<
      | { outcome: "updated"; event: EventRecord; conflictsWith: EventConflict[] }
      | { outcome: "not_found" }
      | { outcome: "unknown_section" }
      | { outcome: "unknown_team" }
      | { outcome: "unknown_facility" }
      | { outcome: "invalid_range" }
    > {
      const current = (
        await db()
          .select({
            sectionId: schema.events.sectionId,
            teamId: schema.events.teamId,
            facilityId: schema.events.facilityId,
            startsAt: schema.events.startsAt,
            endsAt: schema.events.endsAt,
          })
          .from(schema.events)
          .where(
            and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, id)),
          )
          .limit(1)
      )[0];
      if (!current) return { outcome: "not_found" };

      const values: Partial<typeof schema.events.$inferInsert> = {};
      if (patch.kind !== undefined) values.kind = patch.kind;
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.location !== undefined)
        values.location = patch.location?.trim() ? patch.location.trim() : null;
      if (patch.opponent !== undefined)
        values.opponent = patch.opponent?.trim() ? patch.opponent.trim() : null;
      if (patch.homeAway !== undefined) values.homeAway = patch.homeAway;
      if (patch.notes !== undefined) values.notes = patch.notes?.trim() ? patch.notes.trim() : null;
      if (patch.teamId !== undefined) {
        if (patch.teamId) {
          const team = await teamOf(scope, patch.teamId);
          if (!team) return { outcome: "unknown_team" };
          if (patch.sectionId === undefined) values.sectionId = team.sectionId;
        }
        values.teamId = patch.teamId;
      }
      if (patch.sectionId !== undefined) {
        if (patch.sectionId && !(await sectionOf(scope, patch.sectionId)))
          return { outcome: "unknown_section" };
        values.sectionId = patch.sectionId;
      }
      if (patch.facilityId !== undefined) {
        if (patch.facilityId && !(await facilityOf(scope, patch.facilityId)))
          return { outcome: "unknown_facility" };
        values.facilityId = patch.facilityId;
      }
      const startsAt = patch.startsAt ? new Date(patch.startsAt) : current.startsAt;
      const endsAt = patch.endsAt ? new Date(patch.endsAt) : current.endsAt;
      if (endsAt.getTime() <= startsAt.getTime()) return { outcome: "invalid_range" };
      if (patch.startsAt !== undefined) values.startsAt = startsAt;
      if (patch.endsAt !== undefined) values.endsAt = endsAt;

      if (Object.keys(values).length > 0) {
        await db()
          .update(schema.events)
          .set(values)
          .where(
            and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, id)),
          );
      }
      const facilityId =
        values.facilityId !== undefined ? (values.facilityId ?? null) : current.facilityId;
      const conflictsWith = await conflictsFor(scope, facilityId, [{ startsAt, endsAt }], id);
      const event = await byId(scope, id);
      return event ? { outcome: "updated", event, conflictsWith } : { outcome: "not_found" };
    },

    /** Borra un evento; con `series`, también los siguientes de su serie. Devuelve cuántos. */
    async remove(scope: OrgScope, id: string, options: { series?: boolean } = {}): Promise<number> {
      const current = (
        await db()
          .select({ seriesId: schema.events.seriesId, startsAt: schema.events.startsAt })
          .from(schema.events)
          .where(
            and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, id)),
          )
          .limit(1)
      )[0];
      if (!current) return 0;
      const rows = await db()
        .delete(schema.events)
        .where(
          options.series && current.seriesId
            ? and(
                eq(schema.events.organizationId, scope.organizationId),
                eq(schema.events.seriesId, current.seriesId),
                gte(schema.events.startsAt, current.startsAt),
              )
            : and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, id)),
        )
        .returning({ id: schema.events.id });
      return rows.length;
    },
  };
}

export function facilitiesRepo(db: () => Database) {
  async function hoursFor(
    scope: OrgScope,
    facilityIds: string[],
  ): Promise<Map<string, FacilityRecord["hours"]>> {
    const map = new Map<string, FacilityRecord["hours"]>();
    if (facilityIds.length === 0) return map;
    const rows = await db()
      .select({
        facilityId: schema.facilityHours.facilityId,
        weekday: schema.facilityHours.weekday,
        opensAt: schema.facilityHours.opensAt,
        closesAt: schema.facilityHours.closesAt,
      })
      .from(schema.facilityHours)
      .where(
        and(
          eq(schema.facilityHours.organizationId, scope.organizationId),
          inArray(schema.facilityHours.facilityId, facilityIds),
        ),
      )
      .orderBy(asc(schema.facilityHours.weekday), asc(schema.facilityHours.opensAt));
    for (const row of rows) {
      const list = map.get(row.facilityId) ?? [];
      list.push({ weekday: row.weekday, opensAt: row.opensAt, closesAt: row.closesAt });
      map.set(row.facilityId, list);
    }
    return map;
  }

  async function eventsThisWeekFor(
    scope: OrgScope,
    facilityIds: string[],
    timezone: string,
    now: Date,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (facilityIds.length === 0) return map;
    const { from, to } = weekRange(timezone, now);
    const rows = await db()
      .select({ facilityId: schema.events.facilityId, total: count() })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.organizationId, scope.organizationId),
          inArray(schema.events.facilityId, facilityIds),
          lt(schema.events.startsAt, to),
          gt(schema.events.endsAt, from),
        ),
      )
      .groupBy(schema.events.facilityId);
    for (const row of rows) if (row.facilityId) map.set(row.facilityId, row.total);
    return map;
  }

  async function list(
    scope: OrgScope,
    timezone: string,
    now = new Date(),
    onlyId: string | null = null,
  ): Promise<FacilityRecord[]> {
    const rows = await db()
      .select({
        id: schema.facilities.id,
        name: schema.facilities.name,
        kind: schema.facilities.kind,
        capacity: schema.facilities.capacity,
        description: schema.facilities.description,
        status: schema.facilities.status,
        sortOrder: schema.facilities.sortOrder,
      })
      .from(schema.facilities)
      .where(
        and(
          eq(schema.facilities.organizationId, scope.organizationId),
          onlyId ? eq(schema.facilities.id, onlyId) : undefined,
        ),
      )
      .orderBy(asc(schema.facilities.sortOrder), asc(schema.facilities.name));
    const ids = rows.map((r) => r.id);
    const [hours, weekly] = await Promise.all([
      hoursFor(scope, ids),
      eventsThisWeekFor(scope, ids, timezone, now),
    ]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as FacilityKind,
      capacity: row.capacity,
      description: row.description,
      status: row.status as FacilityStatus,
      sortOrder: row.sortOrder,
      hours: hours.get(row.id) ?? [],
      eventsThisWeek: weekly.get(row.id) ?? 0,
    }));
  }

  async function byId(
    scope: OrgScope,
    id: string,
    timezone: string,
    now = new Date(),
  ): Promise<FacilityRecord | null> {
    return (await list(scope, timezone, now, id))[0] ?? null;
  }

  return {
    list,
    byId,

    async create(
      scope: OrgScope,
      input: FacilityCreate,
      timezone: string,
    ): Promise<{ outcome: "created"; facility: FacilityRecord } | { outcome: "name_taken" }> {
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.facilities.sortOrder}), 0)` })
        .from(schema.facilities)
        .where(eq(schema.facilities.organizationId, scope.organizationId));
      try {
        const rows = await db()
          .insert(schema.facilities)
          .values({
            organizationId: scope.organizationId,
            name: input.name,
            kind: input.kind,
            capacity: input.capacity ?? null,
            description: input.description?.trim() ? input.description.trim() : null,
            sortOrder: Number(last[0]?.max ?? 0) + 10,
          })
          .returning({ id: schema.facilities.id });
        const facility = await byId(scope, rows[0]!.id, timezone);
        if (!facility) throw new Error("La instalación recién creada no aparece.");
        return { outcome: "created", facility };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: FacilityUpdate,
      timezone: string,
    ): Promise<
      | { outcome: "updated"; facility: FacilityRecord }
      | { outcome: "not_found" }
      | { outcome: "name_taken" }
    > {
      const values: Partial<typeof schema.facilities.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.kind !== undefined) values.kind = patch.kind;
      if (patch.capacity !== undefined) values.capacity = patch.capacity;
      if (patch.description !== undefined)
        values.description = patch.description?.trim() ? patch.description.trim() : null;
      if (patch.status !== undefined) values.status = patch.status;
      try {
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.facilities)
            .set(values)
            .where(
              and(
                eq(schema.facilities.organizationId, scope.organizationId),
                eq(schema.facilities.id, id),
              ),
            )
            .returning({ id: schema.facilities.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
      const facility = await byId(scope, id, timezone);
      return facility ? { outcome: "updated", facility } : { outcome: "not_found" };
    },

    /** Sustituye las franjas de apertura de una instalación. Falso si no existe. */
    async setHours(scope: OrgScope, facilityId: string, input: FacilityHoursSet): Promise<boolean> {
      const facility = await db()
        .select({ id: schema.facilities.id })
        .from(schema.facilities)
        .where(
          and(
            eq(schema.facilities.organizationId, scope.organizationId),
            eq(schema.facilities.id, facilityId),
          ),
        )
        .limit(1);
      if (!facility[0]) return false;
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.facilityHours)
          .where(
            and(
              eq(schema.facilityHours.organizationId, scope.organizationId),
              eq(schema.facilityHours.facilityId, facilityId),
            ),
          );
        if (input.hours.length > 0) {
          await tx.insert(schema.facilityHours).values(
            input.hours.map((h) => ({
              organizationId: scope.organizationId,
              facilityId,
              weekday: h.weekday,
              opensAt: h.opensAt,
              closesAt: h.closesAt,
            })),
          );
        }
      });
      return true;
    },

    /** Instalaciones activas y cuántas no tienen franjas de apertura (alerta del inicio). */
    async counts(scope: OrgScope): Promise<{ total: number; withoutHours: number }> {
      const active = await db()
        .select({ id: schema.facilities.id })
        .from(schema.facilities)
        .where(
          and(
            eq(schema.facilities.organizationId, scope.organizationId),
            eq(schema.facilities.status, "active"),
          ),
        );
      if (active.length === 0) return { total: 0, withoutHours: 0 };
      const withHours = await db()
        .selectDistinct({ facilityId: schema.facilityHours.facilityId })
        .from(schema.facilityHours)
        .where(
          and(
            eq(schema.facilityHours.organizationId, scope.organizationId),
            inArray(
              schema.facilityHours.facilityId,
              active.map((f) => f.id),
            ),
          ),
        );
      return { total: active.length, withoutHours: active.length - withHours.length };
    },
  };
}

export function schedulesRepo(db: () => Database) {
  async function listForTeam(scope: OrgScope, teamId: string): Promise<ScheduleSlotRecord[]> {
    const rows = await db()
      .select({
        id: schema.teamSchedules.id,
        weekday: schema.teamSchedules.weekday,
        startsAt: schema.teamSchedules.startsAt,
        endsAt: schema.teamSchedules.endsAt,
        facilityId: schema.facilities.id,
        facilityName: schema.facilities.name,
      })
      .from(schema.teamSchedules)
      .leftJoin(schema.facilities, eq(schema.facilities.id, schema.teamSchedules.facilityId))
      .where(
        and(
          eq(schema.teamSchedules.organizationId, scope.organizationId),
          eq(schema.teamSchedules.teamId, teamId),
        ),
      )
      .orderBy(asc(schema.teamSchedules.weekday), asc(schema.teamSchedules.startsAt));
    return rows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      facility:
        row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null,
    }));
  }

  async function teamOf(scope: OrgScope, teamId: string) {
    const rows = await db()
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        sectionId: schema.teams.sectionId,
        sectionKind: schema.sections.kind,
        seasonEndsOn: schema.seasons.endsOn,
        seasonStartsOn: schema.seasons.startsOn,
      })
      .from(schema.teams)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(eq(schema.teams.organizationId, scope.organizationId), eq(schema.teams.id, teamId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    listForTeam,

    /** Sustituye el horario semanal del equipo. Las instalaciones tienen que ser del club. */
    async set(
      scope: OrgScope,
      teamId: string,
      slots: TeamScheduleSlot[],
    ): Promise<
      | { outcome: "saved"; schedule: ScheduleSlotRecord[] }
      | { outcome: "unknown_team" }
      | { outcome: "unknown_facility" }
    > {
      if (!(await teamOf(scope, teamId))) return { outcome: "unknown_team" };
      const facilityIds = [...new Set(slots.map((s) => s.facilityId).filter(Boolean))] as string[];
      if (facilityIds.length > 0) {
        const known = await db()
          .select({ id: schema.facilities.id })
          .from(schema.facilities)
          .where(
            and(
              eq(schema.facilities.organizationId, scope.organizationId),
              inArray(schema.facilities.id, facilityIds),
            ),
          );
        if (known.length !== facilityIds.length) return { outcome: "unknown_facility" };
      }
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.teamSchedules)
          .where(
            and(
              eq(schema.teamSchedules.organizationId, scope.organizationId),
              eq(schema.teamSchedules.teamId, teamId),
            ),
          );
        if (slots.length > 0) {
          await tx.insert(schema.teamSchedules).values(
            slots.map((s) => ({
              organizationId: scope.organizationId,
              teamId,
              weekday: s.weekday,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              facilityId: s.facilityId ?? null,
            })),
          );
        }
      });
      return { outcome: "saved", schedule: await listForTeam(scope, teamId) };
    },

    /**
     * Regenera los entrenamientos del equipo desde ahora hasta el fin de su temporada, una fila
     * por franja y semana en la zona del club. Los futuros de cada franja sin lista pasada se
     * borran antes; los que ya tienen asistencia se conservan. Devuelve cuántos ha creado.
     */
    async generate(
      scope: OrgScope,
      teamId: string,
      timezone: string,
      now = new Date(),
      createdBy: string | null = null,
    ): Promise<number> {
      const team = await teamOf(scope, teamId);
      if (!team) return 0;
      const slots = await listForTeam(scope, teamId);
      if (slots.length === 0) return 0;
      const withAttendance = db()
        .selectDistinct({ eventId: schema.attendance.eventId })
        .from(schema.attendance)
        .where(eq(schema.attendance.organizationId, scope.organizationId));
      await db()
        .delete(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            inArray(
              schema.events.seriesId,
              slots.map((s) => s.id),
            ),
            gte(schema.events.startsAt, now),
            notInArray(schema.events.id, withAttendance),
          ),
        );
      const kind: EventKind = team.sectionKind === "activity" ? "activity" : "training";
      const title = team.sectionKind === "activity" ? team.name : `Entrenamiento ${team.name}`;
      const today = localParts(timezone, now);
      const end = team.seasonEndsOn;
      const values: (typeof schema.events.$inferInsert)[] = [];
      for (const slot of slots) {
        const start = minutesOf(slot.startsAt);
        const finish = minutesOf(slot.endsAt);
        for (let offset = 0; offset < 400; offset++) {
          const d = shiftDate(today.year, today.month, today.day, offset);
          const key = dateKey(d.year, d.month, d.day);
          if (key > end) break;
          if (isoWeekdayOf(d.year, d.month, d.day) !== slot.weekday) continue;
          const startsAt = fromLocal(timezone, d.year, d.month, d.day, start.hour, start.minute);
          if (startsAt.getTime() < now.getTime()) continue;
          const endsAt = fromLocal(timezone, d.year, d.month, d.day, finish.hour, finish.minute);
          values.push({
            organizationId: scope.organizationId,
            kind,
            title,
            sectionId: team.sectionId,
            teamId,
            facilityId: slot.facility?.id ?? null,
            startsAt,
            endsAt,
            seriesId: slot.id,
            createdBy,
          });
        }
      }
      // Los que ya existen (con asistencia) se respetan: misma serie y misma hora de inicio.
      const existing = await db()
        .select({ seriesId: schema.events.seriesId, startsAt: schema.events.startsAt })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            inArray(
              schema.events.seriesId,
              slots.map((s) => s.id),
            ),
            gte(schema.events.startsAt, now),
          ),
        );
      const taken = new Set(existing.map((e) => `${e.seriesId}|${e.startsAt.toISOString()}`));
      const fresh = values.filter((v) => !taken.has(`${v.seriesId}|${v.startsAt.toISOString()}`));
      if (fresh.length > 0) await db().insert(schema.events).values(fresh);
      return fresh.length;
    },
  };
}

export function attendanceRepo(db: () => Database) {
  async function eventOf(scope: OrgScope, eventId: string) {
    const rows = await db()
      .select({ id: schema.events.id, teamId: schema.events.teamId })
      .from(schema.events)
      .where(
        and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, eventId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  function summarize(rows: { status: string; total: number }[], events: number) {
    const of = (status: string) => rows.find((r) => r.status === status)?.total ?? 0;
    const present = Number(of("present"));
    const absent = Number(of("absent"));
    const excused = Number(of("excused"));
    const marked = present + absent + excused;
    return {
      events,
      present,
      absent,
      excused,
      percent: marked > 0 ? Math.round((present / marked) * 100) : null,
    };
  }

  return {
    async playerExists(scope: OrgScope, playerId: string): Promise<boolean> {
      const rows = await db()
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, playerId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** La plantilla del equipo del evento con el estado de cada deportista. Nulo si el evento no existe. */
    async forEvent(scope: OrgScope, eventId: string): Promise<AttendanceEntryRecord[] | null> {
      const event = await eventOf(scope, eventId);
      if (!event) return null;
      if (!event.teamId) return [];
      const rows = await db()
        .select({
          playerId: schema.players.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
          status: schema.attendance.status,
          note: schema.attendance.note,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .leftJoin(
          schema.attendance,
          and(
            eq(schema.attendance.eventId, eventId),
            eq(schema.attendance.playerId, schema.players.id),
          ),
        )
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, event.teamId),
          ),
        )
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName));
      return rows.map((row) => ({
        playerId: row.playerId,
        firstName: row.firstName,
        lastName: row.lastName,
        photoBlobKey: row.photoBlobKey,
        status: (row.status as AttendanceStatus | null) ?? null,
        note: row.note ?? null,
      }));
    },

    /** Guarda el pase de lista: solo deportistas de la plantilla del equipo del evento. */
    async set(
      scope: OrgScope,
      eventId: string,
      entries: { playerId: string; status: AttendanceStatus; note?: string | null | undefined }[],
      recordedBy: string | null,
    ): Promise<
      { outcome: "saved"; saved: number } | { outcome: "unknown_event" } | { outcome: "no_team" }
    > {
      const event = await eventOf(scope, eventId);
      if (!event) return { outcome: "unknown_event" };
      if (!event.teamId) return { outcome: "no_team" };
      const roster = await db()
        .select({ playerId: schema.teamPlayers.playerId })
        .from(schema.teamPlayers)
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teamPlayers.teamId, event.teamId),
          ),
        );
      const allowed = new Set(roster.map((r) => r.playerId));
      const valid = entries.filter((e) => allowed.has(e.playerId));
      if (valid.length === 0) return { outcome: "saved", saved: 0 };
      await db().transaction(async (tx) => {
        for (const entry of valid) {
          await tx
            .insert(schema.attendance)
            .values({
              organizationId: scope.organizationId,
              eventId,
              playerId: entry.playerId,
              status: entry.status,
              note: entry.note?.trim() ? entry.note.trim() : null,
              recordedBy,
            })
            .onConflictDoUpdate({
              target: [schema.attendance.eventId, schema.attendance.playerId],
              set: {
                status: entry.status,
                note: entry.note?.trim() ? entry.note.trim() : null,
                recordedBy,
              },
            });
        }
      });
      return { outcome: "saved", saved: valid.length };
    },

    /** Asistencia de un deportista en una temporada (o en todas, sin temporada). */
    async summaryForPlayer(
      scope: OrgScope,
      playerId: string,
      seasonId: string | null,
    ): Promise<AttendanceSummaryRecord> {
      const rows = await db()
        .select({ status: schema.attendance.status, total: count() })
        .from(schema.attendance)
        .innerJoin(schema.events, eq(schema.events.id, schema.attendance.eventId))
        .leftJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
        .where(
          and(
            eq(schema.attendance.organizationId, scope.organizationId),
            eq(schema.attendance.playerId, playerId),
            seasonId ? eq(schema.teams.seasonId, seasonId) : undefined,
          ),
        )
        .groupBy(schema.attendance.status);
      const events = rows.reduce((sum, r) => sum + Number(r.total), 0);
      return summarize(rows, events);
    },

    /** Asistencia de un equipo: eventos con lista pasada y totales por estado. */
    async summaryForTeam(scope: OrgScope, teamId: string): Promise<AttendanceSummaryRecord> {
      const rows = await db()
        .select({ status: schema.attendance.status, total: count() })
        .from(schema.attendance)
        .innerJoin(schema.events, eq(schema.events.id, schema.attendance.eventId))
        .where(
          and(
            eq(schema.attendance.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
          ),
        )
        .groupBy(schema.attendance.status);
      const events = await db()
        .select({ total: sql<number>`count(distinct ${schema.attendance.eventId})` })
        .from(schema.attendance)
        .innerJoin(schema.events, eq(schema.events.id, schema.attendance.eventId))
        .where(
          and(
            eq(schema.attendance.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
          ),
        );
      return summarize(rows, Number(events[0]?.total ?? 0));
    },
  };
}
