import { schema, type Database } from "@sportsmanager/db";
import type { STORED_AVAILABILITY_STATUSES } from "@sportsmanager/shared";

type StoredAvailabilityStatus = (typeof STORED_AVAILABILITY_STATUSES)[number];
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { localDate } from "./training.ts";
import { localParts } from "./events.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Lo que el box mira de un vistazo (ADR 0049): la lista de atletas con su tarifa y su última
 * visita, las cifras del negocio, la ocupación por franja, el ranking de constancia del mes y la
 * librería de movimientos con vídeo para el atleta. Solo lecturas agregadas del club.
 */

export interface AthleteRowRecord {
  playerId: string;
  personId: string;
  firstName: string;
  lastName: string;
  photoBlobKey: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  hasAccess: boolean;
  joinedOn: string | null;
  restriction: StoredAvailabilityStatus | null;
  lastVisit: string | null;
  visits30: number;
}

/** Reservas que cuentan como entrenamiento: con check-in o ya pasadas sin marcarse como ausencia. */
const trained = (now: Date) =>
  or(
    eq(schema.bookings.status, "attended"),
    and(eq(schema.bookings.status, "booked"), lt(schema.events.endsAt, now)),
  );

export function fitnessInsightsRepo(db: () => Database) {
  return {
    /** Atletas del club: las fichas activas (o las indicadas), con su última visita y su restricción. */
    async athletes(
      scope: OrgScope,
      timezone: string,
      now: Date,
      onlyPlayerIds: string[] | null = null,
    ): Promise<AthleteRowRecord[]> {
      if (onlyPlayerIds && onlyPlayerIds.length === 0) return [];
      const rows = await db()
        .select({
          playerId: schema.players.id,
          personId: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
          email: schema.people.email,
          phone: schema.people.phone,
          birthDate: schema.people.birthDate,
          userId: schema.people.userId,
          joinedOn: schema.players.joinedOn,
          restriction: schema.playerAvailability.status,
        })
        .from(schema.players)
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .leftJoin(
          schema.playerAvailability,
          and(
            eq(schema.playerAvailability.playerId, schema.players.id),
            isNull(schema.playerAvailability.endedOn),
          ),
        )
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            onlyPlayerIds
              ? inArray(schema.players.id, onlyPlayerIds)
              : eq(schema.players.status, "active"),
          ),
        )
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName));
      const ids = rows.map((r) => r.playerId);
      const visits =
        ids.length === 0
          ? []
          : await db()
              .select({
                playerId: schema.bookings.playerId,
                last: sql<Date>`max(${schema.events.startsAt})`,
                recent: sql<number>`count(*) filter (where ${schema.events.startsAt} >= ${new Date(now.getTime() - 30 * 86_400_000)})`,
              })
              .from(schema.bookings)
              .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
              .where(
                and(
                  eq(schema.bookings.organizationId, scope.organizationId),
                  inArray(schema.bookings.playerId, ids),
                  trained(now),
                ),
              )
              .groupBy(schema.bookings.playerId);
      const visitsBy = new Map(visits.map((v) => [v.playerId, v]));
      return rows.map((r) => {
        const v = visitsBy.get(r.playerId);
        return {
          playerId: r.playerId,
          personId: r.personId,
          firstName: r.firstName,
          lastName: r.lastName,
          photoBlobKey: r.photoBlobKey,
          email: r.email,
          phone: r.phone,
          birthDate: r.birthDate,
          hasAccess: r.userId !== null,
          joinedOn: r.joinedOn,
          restriction: (r.restriction as StoredAvailabilityStatus | null) ?? null,
          lastVisit: v?.last ? localDate(timezone, new Date(v.last)) : null,
          visits30: Number(v?.recent ?? 0),
        };
      });
    },

    /** Reservas que gastan sesión por suscripción (lo usado de cada bono). */
    async consumedBySubscription(
      scope: OrgScope,
      subscriptionIds: string[],
    ): Promise<Map<string, number>> {
      const map = new Map<string, number>();
      if (subscriptionIds.length === 0) return map;
      const rows = await db()
        .select({ id: schema.bookings.subscriptionId, n: sql<number>`count(*)` })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            inArray(schema.bookings.subscriptionId, subscriptionIds),
            eq(schema.bookings.consumes, true),
            inArray(schema.bookings.status, ["booked", "attended", "late_cancel", "no_show"]),
          ),
        )
        .groupBy(schema.bookings.subscriptionId);
      for (const r of rows) if (r.id) map.set(r.id, Number(r.n));
      return map;
    },

    /** Atletas con reserva futura (para no avisar de inactividad a quien ya vuelve). */
    async withUpcoming(scope: OrgScope, now: Date): Promise<Set<string>> {
      const rows = await db()
        .selectDistinct({ playerId: schema.bookings.playerId })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            inArray(schema.bookings.status, ["booked", "waitlist"]),
            gte(schema.events.startsAt, now),
          ),
        );
      return new Set(rows.map((r) => r.playerId));
    },

    /** Plazas ofrecidas y ocupadas en las clases abiertas de un rango, por hora local de inicio. */
    async occupancy(
      scope: OrgScope,
      from: Date,
      to: Date,
      timezone: string,
    ): Promise<{
      offered: number;
      taken: number;
      byHour: Map<string, { offered: number; taken: number }>;
    }> {
      const rows = await db()
        .select({
          id: schema.events.id,
          startsAt: schema.events.startsAt,
          capacity: sql<
            number | null
          >`coalesce(${schema.events.capacity}, ${schema.teams.capacity})`,
          taken: sql<number>`(select count(*) from ${schema.bookings} b where b.event_id = ${schema.events.id} and b.status in ('booked', 'attended', 'no_show'))`,
        })
        .from(schema.events)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.teams.bookingMode, "open"),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        );
      let offered = 0;
      let taken = 0;
      const byHour = new Map<string, { offered: number; taken: number }>();
      for (const r of rows) {
        if (r.capacity === null) continue;
        const cap = Number(r.capacity);
        const t = Math.min(Number(r.taken), cap);
        offered += cap;
        taken += t;
        const hour = `${String(localParts(timezone, r.startsAt).hour).padStart(2, "0")}:00`;
        const slot = byHour.get(hour) ?? { offered: 0, taken: 0 };
        slot.offered += cap;
        slot.taken += t;
        byHour.set(hour, slot);
      }
      return { offered, taken, byHour };
    },

    /** Entrenamientos hechos en un rango, por atleta. */
    async trainedCounts(
      scope: OrgScope,
      from: Date,
      to: Date,
      now: Date,
    ): Promise<Map<string, number>> {
      const rows = await db()
        .select({ playerId: schema.bookings.playerId, n: sql<number>`count(*)` })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
            trained(now),
          ),
        )
        .groupBy(schema.bookings.playerId);
      return new Map(rows.map((r) => [r.playerId, Number(r.n)]));
    },

    /**
     * Atletas que pasan por las clases de un coach con ámbito restringido: los que reservan en sus
     * tipos de clase o en las clases que da. Es su "plantilla" en un box.
     */
    async playersInClasses(
      scope: OrgScope,
      teamIds: string[],
      coachUserId: string,
    ): Promise<string[]> {
      const rows = await db()
        .selectDistinct({ playerId: schema.bookings.playerId })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            or(
              teamIds.length > 0 ? inArray(schema.events.teamId, teamIds) : sql`false`,
              eq(schema.events.coachUserId, coachUserId),
            ),
          ),
        );
      return rows.map((r) => r.playerId);
    },

    /** Quién prefiere no salir en clasificaciones. */
    async hiddenFromLeaderboards(scope: OrgScope): Promise<Set<string>> {
      const rows = await db()
        .select({ playerId: schema.fitnessPreferences.playerId })
        .from(schema.fitnessPreferences)
        .where(
          and(
            eq(schema.fitnessPreferences.organizationId, scope.organizationId),
            eq(schema.fitnessPreferences.hideFromLeaderboards, true),
          ),
        );
      return new Set(rows.map((r) => r.playerId));
    },

    /** Leads con clase de prueba en un rango y convertidos desde una fecha. */
    async trials(scope: OrgScope, weekFrom: Date, weekTo: Date, monthFrom: Date) {
      const week = await db()
        .select({ n: sql<number>`count(*)` })
        .from(schema.leads)
        .innerJoin(schema.events, eq(schema.events.id, schema.leads.trialEventId))
        .where(
          and(
            eq(schema.leads.organizationId, scope.organizationId),
            gte(schema.events.startsAt, weekFrom),
            lt(schema.events.startsAt, weekTo),
          ),
        );
      const converted = await db()
        .select({ n: sql<number>`count(*)` })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.organizationId, scope.organizationId),
            eq(schema.leads.status, "converted"),
            gte(schema.leads.updatedAt, monthFrom),
          ),
        );
      const pending = await db()
        .select({ firstName: schema.leads.firstName, lastName: schema.leads.lastName })
        .from(schema.leads)
        .leftJoin(schema.events, eq(schema.events.id, schema.leads.trialEventId))
        .where(
          and(
            eq(schema.leads.organizationId, scope.organizationId),
            or(
              eq(schema.leads.status, "trial_done"),
              and(eq(schema.leads.status, "trial_booked"), lt(schema.events.endsAt, new Date())),
            ),
          ),
        )
        .orderBy(desc(schema.leads.updatedAt));
      return {
        thisWeek: Number(week[0]?.n ?? 0),
        convertedThisMonth: Number(converted[0]?.n ?? 0),
        pending: pending.map((p) => `${p.firstName} ${p.lastName}`.trim()),
      };
    },

    /** Cargos vencidos de tarifas con derecho de uso (cobros que no han entrado). */
    async overdueFitnessCharges(scope: OrgScope): Promise<string[]> {
      const rows = await db()
        .select({ firstName: schema.people.firstName, lastName: schema.people.lastName })
        .from(schema.feeCharges)
        .innerJoin(schema.feePlans, eq(schema.feePlans.id, schema.feeCharges.feePlanId))
        .innerJoin(schema.people, eq(schema.people.id, schema.feeCharges.personId))
        .where(
          and(
            eq(schema.feeCharges.organizationId, scope.organizationId),
            eq(schema.feeCharges.status, "overdue"),
            sql`${schema.feePlans.entitlement} <> 'none'`,
          ),
        );
      return rows.map((r) => `${r.firstName} ${r.lastName}`.trim());
    },

    /** Días con clase abierta en un rango, por disciplina (para saber qué WOD falta). */
    async classDays(
      scope: OrgScope,
      from: Date,
      to: Date,
      timezone: string,
    ): Promise<{ date: string; sectionId: string }[]> {
      const rows = await db()
        .select({ startsAt: schema.events.startsAt, sectionId: schema.events.sectionId })
        .from(schema.events)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.teams.bookingMode, "open"),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
          ),
        );
      const seen = new Set<string>();
      const out: { date: string; sectionId: string }[] = [];
      for (const r of rows) {
        if (!r.sectionId) continue;
        const date = localDate(timezone, r.startsAt);
        const key = `${date}|${r.sectionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ date, sectionId: r.sectionId });
      }
      return out;
    },

    /** Disciplinas con clases abiertas: secciones con algún tipo de clase en modo abierto. */
    async fitnessSections(scope: OrgScope): Promise<{ id: string; name: string }[]> {
      return db()
        .selectDistinct({ id: schema.sections.id, name: schema.sections.name })
        .from(schema.sections)
        .innerJoin(schema.teams, eq(schema.teams.sectionId, schema.sections.id))
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.teams.bookingMode, "open"),
            eq(schema.teams.status, "active"),
          ),
        )
        .orderBy(asc(schema.sections.name));
    },

    /** Movimientos de la biblioteca del club con explicación o vídeo, para el atleta. */
    async library(scope: OrgScope) {
      return db()
        .select({
          id: schema.drills.id,
          name: schema.drills.name,
          description: schema.drills.description,
          coachingPoints: schema.drills.coachingPoints,
          videoUrl: schema.drills.videoUrl,
          section: schema.sections.name,
        })
        .from(schema.drills)
        .leftJoin(schema.sections, eq(schema.sections.id, schema.drills.sectionId))
        .where(
          and(
            eq(schema.drills.organizationId, scope.organizationId),
            eq(schema.drills.status, "active"),
            inArray(schema.drills.scope, ["club", "section"]),
          ),
        )
        .orderBy(asc(schema.drills.name));
    },
  };
}
