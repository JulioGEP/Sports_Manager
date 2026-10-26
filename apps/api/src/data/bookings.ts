import { schema, type Database } from "@sportsmanager/db";
import {
  cancellationKindAt,
  checkBooking,
  DEFAULT_BOOKING_POLICY,
  planExpiresOn,
  type BookingBlock,
  type BookingCheck,
  type BookingPolicy,
  type BookingPolicyUpdate,
  type BookingStatus,
  type CountedBooking,
  type EntitlementPlan,
  type FeePeriod,
  type PlanBilling,
  type PlanEntitlement,
  type SubscriptionCreate,
  type SubscriptionStatus,
  type SubscriptionUpdate,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { localDate } from "./training.ts";
import { mintOrgScope, type OrgScope } from "./scope.ts";

/**
 * Reservas de clases abiertas y tarifas contratadas (ADR 0049). Una clase es un evento de un
 * equipo en modo abierto: cualquier atleta con una tarifa que la incluya la reserva. Las plazas se
 * deciden dentro de una transacción con la fila del evento bloqueada, así dos personas no se
 * quedan la misma última plaza. Las reglas viven en `@sportsmanager/shared` (`checkBooking`).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

export interface ClassRecord {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  date: string;
  section: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  facility: { id: string; name: string } | null;
  coach: { userId: string; name: string } | null;
  capacity: number | null;
  booked: number;
  waitlist: number;
  checkedIn: number;
}

export interface ClassFilter {
  sectionId?: string | undefined;
  teamId?: string | undefined;
  coachUserId?: string | undefined;
  /** Ámbito restringido: solo las clases de estos tipos de clase. */
  teamIds?: string[] | undefined;
}

export interface MyBookingRecord {
  bookingId: string;
  status: BookingStatus;
  position: number | null;
}

export interface SubscriptionRecord {
  id: string;
  playerId: string;
  playerName: string;
  personId: string;
  plan: {
    id: string;
    name: string;
    entitlement: PlanEntitlement;
    sessions: number | null;
    validityDays: number | null;
    amountCents: number;
    period: FeePeriod;
    classTeamIds: string[] | null;
  };
  status: SubscriptionStatus;
  startsOn: string;
  endsOn: string | null;
  pausedUntil: string | null;
  billing: PlanBilling;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
}

/** Una tarifa como la cuentan las reglas compartidas. */
export function entitlementOf(s: SubscriptionRecord): EntitlementPlan & { id: string } {
  return {
    id: s.id,
    entitlement: s.plan.entitlement,
    sessions: s.plan.sessions,
    validityDays: s.plan.validityDays,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    status: s.status,
    pausedUntil: s.pausedUntil,
    classTeamIds: s.plan.classTeamIds,
  };
}

export interface AttendeeRecord {
  bookingId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  photoBlobKey: string | null;
  userId: string | null;
  status: BookingStatus;
  queuedAt: Date;
  hidden: boolean;
}

/** Lo que el atleta lleva reservado y gastado: las cuentas de sus tarifas. */
export interface PlayerBookingContext {
  subscriptions: SubscriptionRecord[];
  counted: (CountedBooking & { eventId: string })[];
  /** Clases reservadas (o en espera, o hechas) por día. */
  activeByDay: Map<string, { eventId: string }[]>;
}

const ACTIVE = ["booked", "waitlist", "attended"] as const;

export function bookingsRepo(db: () => Database) {
  // --- Política ---

  async function policyWith(conn: Db, scope: OrgScope): Promise<BookingPolicy> {
    const rows = await conn
      .select()
      .from(schema.bookingPolicies)
      .where(eq(schema.bookingPolicies.organizationId, scope.organizationId))
      .limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_BOOKING_POLICY;
    return {
      opensDaysBefore: row.opensDaysBefore,
      closesMinutesBefore: row.closesMinutesBefore,
      cancelHoursBefore: row.cancelHoursBefore,
      lateCancelConsumes: row.lateCancelConsumes,
      noShowConsumes: row.noShowConsumes,
      maxPerDay: row.maxPerDay,
      waitlist: row.waitlist,
      showAttendees: row.showAttendees,
      showLeaderboards: row.showLeaderboards,
    };
  }

  // --- Clases ---

  const classSelection = {
    id: schema.events.id,
    title: schema.events.title,
    startsAt: schema.events.startsAt,
    endsAt: schema.events.endsAt,
    sectionId: schema.sections.id,
    sectionName: schema.sections.name,
    teamId: schema.teams.id,
    teamName: schema.teams.name,
    facilityId: schema.facilities.id,
    facilityName: schema.facilities.name,
    coachUserId: schema.events.coachUserId,
    coachName: schema.users.name,
    capacity: schema.events.capacity,
    teamCapacity: schema.teams.capacity,
  };
  const classQuery = (conn: Db = db()) =>
    conn
      .select(classSelection)
      .from(schema.events)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.events.teamId))
      .leftJoin(schema.sections, eq(schema.sections.id, schema.events.sectionId))
      .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId))
      .leftJoin(schema.users, eq(schema.users.id, schema.events.coachUserId));
  type ClassRow = Awaited<ReturnType<ReturnType<typeof classQuery>["execute"]>>[number];

  async function countsFor(conn: Db, scope: OrgScope, eventIds: string[]) {
    const map = new Map<string, { booked: number; waitlist: number; checkedIn: number }>();
    if (eventIds.length === 0) return map;
    const rows = await conn
      .select({
        eventId: schema.bookings.eventId,
        booked: sql<number>`count(*) filter (where ${schema.bookings.status} in ('booked', 'attended'))`,
        waitlist: sql<number>`count(*) filter (where ${schema.bookings.status} = 'waitlist')`,
        checkedIn: sql<number>`count(*) filter (where ${schema.bookings.status} = 'attended')`,
      })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.organizationId, scope.organizationId),
          inArray(schema.bookings.eventId, eventIds),
        ),
      )
      .groupBy(schema.bookings.eventId);
    for (const r of rows) {
      map.set(r.eventId, {
        booked: Number(r.booked),
        waitlist: Number(r.waitlist),
        checkedIn: Number(r.checkedIn),
      });
    }
    return map;
  }

  async function toClasses(
    conn: Db,
    scope: OrgScope,
    rows: ClassRow[],
    timezone: string,
  ): Promise<ClassRecord[]> {
    const counts = await countsFor(
      conn,
      scope,
      rows.map((r) => r.id),
    );
    return rows.map((r) => {
      const c = counts.get(r.id) ?? { booked: 0, waitlist: 0, checkedIn: 0 };
      return {
        id: r.id,
        title: r.title,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        date: localDate(timezone, r.startsAt),
        section: r.sectionId && r.sectionName ? { id: r.sectionId, name: r.sectionName } : null,
        team: r.teamId && r.teamName ? { id: r.teamId, name: r.teamName } : null,
        facility:
          r.facilityId && r.facilityName ? { id: r.facilityId, name: r.facilityName } : null,
        coach: r.coachUserId && r.coachName ? { userId: r.coachUserId, name: r.coachName } : null,
        capacity: r.capacity ?? r.teamCapacity ?? null,
        ...c,
      };
    });
  }

  const openClass = (scope: OrgScope) =>
    and(
      eq(schema.events.organizationId, scope.organizationId),
      eq(schema.teams.bookingMode, "open"),
    );

  async function classById(
    scope: OrgScope,
    id: string,
    timezone: string,
    conn: Db = db(),
  ): Promise<ClassRecord | null> {
    const rows = await classQuery(conn).where(and(openClass(scope), eq(schema.events.id, id)));
    if (!rows[0]) return null;
    return (await toClasses(conn, scope, rows, timezone))[0] ?? null;
  }

  // --- Suscripciones ---

  const subSelection = {
    id: schema.subscriptions.id,
    playerId: schema.subscriptions.playerId,
    firstName: schema.people.firstName,
    lastName: schema.people.lastName,
    personId: schema.people.id,
    planId: schema.feePlans.id,
    planName: schema.feePlans.name,
    entitlement: schema.feePlans.entitlement,
    sessions: schema.feePlans.sessions,
    validityDays: schema.feePlans.validityDays,
    amountCents: schema.feePlans.amountCents,
    period: schema.feePlans.period,
    classTeamIds: schema.feePlans.classTeamIds,
    status: schema.subscriptions.status,
    startsOn: schema.subscriptions.startsOn,
    endsOn: schema.subscriptions.endsOn,
    pausedUntil: schema.subscriptions.pausedUntil,
    billing: schema.subscriptions.billing,
    stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
    stripeStatus: schema.subscriptions.stripeStatus,
  };
  const subQuery = (conn: Db = db()) =>
    conn
      .select(subSelection)
      .from(schema.subscriptions)
      .innerJoin(schema.players, eq(schema.players.id, schema.subscriptions.playerId))
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .innerJoin(schema.feePlans, eq(schema.feePlans.id, schema.subscriptions.feePlanId));
  type SubRow = Awaited<ReturnType<ReturnType<typeof subQuery>["execute"]>>[number];
  const toSubscription = (r: SubRow): SubscriptionRecord => ({
    id: r.id,
    playerId: r.playerId,
    playerName: `${r.firstName} ${r.lastName}`.trim(),
    personId: r.personId,
    plan: {
      id: r.planId,
      name: r.planName,
      entitlement: r.entitlement as PlanEntitlement,
      sessions: r.sessions,
      validityDays: r.validityDays,
      amountCents: r.amountCents,
      period: r.period as FeePeriod,
      classTeamIds: r.classTeamIds ?? null,
    },
    status: r.status as SubscriptionStatus,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    pausedUntil: r.pausedUntil,
    billing: r.billing as PlanBilling,
    stripeSubscriptionId: r.stripeSubscriptionId,
    stripeStatus: r.stripeStatus,
  });

  /**
   * Las tarifas caducadas pasan a `expired` al leerlas (no hay cron), y una pausa terminada vuelve
   * a activa. Así la lista dice lo que de verdad vale hoy.
   */
  async function refreshStatuses(conn: Db, scope: OrgScope, today: string): Promise<void> {
    const rows = await subQuery(conn).where(
      and(
        eq(schema.subscriptions.organizationId, scope.organizationId),
        inArray(schema.subscriptions.status, ["active", "paused"]),
      ),
    );
    for (const r of rows) {
      const s = toSubscription(r);
      const expires = planExpiresOn(entitlementOf(s));
      if (expires && expires < today) {
        await conn
          .update(schema.subscriptions)
          .set({ status: "expired" })
          .where(eq(schema.subscriptions.id, s.id));
      } else if (s.status === "paused" && s.pausedUntil && s.pausedUntil < today) {
        await conn
          .update(schema.subscriptions)
          .set({ status: "active", pausedUntil: null })
          .where(eq(schema.subscriptions.id, s.id));
      }
    }
  }

  async function subscriptionsOf(
    conn: Db,
    scope: OrgScope,
    playerId: string,
  ): Promise<SubscriptionRecord[]> {
    const rows = await subQuery(conn)
      .where(
        and(
          eq(schema.subscriptions.organizationId, scope.organizationId),
          eq(schema.subscriptions.playerId, playerId),
        ),
      )
      .orderBy(desc(schema.subscriptions.startsOn), desc(schema.subscriptions.createdAt));
    return rows.map(toSubscription);
  }

  // --- Contexto del atleta ---

  async function contextOf(
    conn: Db,
    scope: OrgScope,
    playerId: string,
    timezone: string,
    policy: BookingPolicy,
    excludeEventId: string | null = null,
  ): Promise<PlayerBookingContext> {
    const subscriptions = await subscriptionsOf(conn, scope, playerId);
    const rows = await conn
      .select({
        eventId: schema.bookings.eventId,
        status: schema.bookings.status,
        consumes: schema.bookings.consumes,
        startsAt: schema.events.startsAt,
      })
      .from(schema.bookings)
      .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
      .where(
        and(
          eq(schema.bookings.organizationId, scope.organizationId),
          eq(schema.bookings.playerId, playerId),
          ne(schema.bookings.status, "cancelled"),
          gte(schema.events.startsAt, new Date(Date.now() - 800 * 86_400_000)),
          excludeEventId ? ne(schema.bookings.eventId, excludeEventId) : undefined,
        ),
      );
    const counted: PlayerBookingContext["counted"] = [];
    const activeByDay = new Map<string, { eventId: string }[]>();
    for (const r of rows) {
      const date = localDate(timezone, r.startsAt);
      const status = r.status as BookingStatus;
      // Lo que gasta lo fijó la política en cada cambio de estado; la espera nunca gasta.
      const consumes = status === "waitlist" ? false : r.consumes;
      counted.push({ eventId: r.eventId, date, consumes });
      if ((ACTIVE as readonly string[]).includes(status)) {
        const list = activeByDay.get(date) ?? [];
        list.push({ eventId: r.eventId });
        activeByDay.set(date, list);
      }
    }
    return { subscriptions, counted, activeByDay };
  }

  /** La regla de reserva para un atleta y una clase, con todo lo que pide. */
  function evaluate(
    cls: ClassRecord,
    policy: BookingPolicy,
    context: PlayerBookingContext,
    myStatus: BookingStatus | null,
    now: Date,
    seatsTaken = cls.booked,
  ): BookingCheck {
    return checkBooking({
      now,
      startsAt: cls.startsAt,
      date: cls.date,
      teamId: cls.team?.id ?? null,
      policy,
      capacity: cls.capacity,
      seatsTaken,
      myStatus,
      plans: context.subscriptions.map(entitlementOf),
      bookings: context.counted.filter((b) => b.eventId !== cls.id),
      bookedThatDay: (context.activeByDay.get(cls.date) ?? []).filter((b) => b.eventId !== cls.id)
        .length,
    });
  }

  /** Bloquea la fila del evento: las plazas se cuentan y se dan de una en una. */
  async function lockEvent(tx: Tx, scope: OrgScope, eventId: string) {
    const rows = await tx
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(
        and(eq(schema.events.organizationId, scope.organizationId), eq(schema.events.id, eventId)),
      )
      .for("update");
    return rows[0] ?? null;
  }

  async function bookingOf(conn: Db, scope: OrgScope, eventId: string, playerId: string) {
    const rows = await conn
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.organizationId, scope.organizationId),
          eq(schema.bookings.eventId, eventId),
          eq(schema.bookings.playerId, playerId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function positionOf(conn: Db, eventId: string, queuedAt: Date): Promise<number> {
    const rows = await conn
      .select({ n: sql<number>`count(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.eventId, eventId),
          eq(schema.bookings.status, "waitlist"),
          lt(schema.bookings.queuedAt, queuedAt),
        ),
      );
    return Number(rows[0]?.n ?? 0) + 1;
  }

  async function upsertBooking(
    tx: Tx,
    scope: OrgScope,
    input: {
      eventId: string;
      playerId: string;
      status: BookingStatus;
      consumes: boolean;
      subscriptionId: string | null;
      source: "self" | "staff" | "waitlist";
      createdBy: string | null;
      now: Date;
      checkedIn?: boolean;
    },
  ) {
    const values = {
      status: input.status,
      consumes: input.consumes,
      subscriptionId: input.subscriptionId,
      source: input.source,
      queuedAt: input.now,
      cancelledAt: null,
      checkedInAt: input.checkedIn ? input.now : null,
      createdBy: input.createdBy,
    };
    const rows = await tx
      .insert(schema.bookings)
      .values({
        organizationId: scope.organizationId,
        eventId: input.eventId,
        playerId: input.playerId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [schema.bookings.eventId, schema.bookings.playerId],
        set: values,
      })
      .returning();
    return rows[0]!;
  }

  /**
   * Sube a la primera persona de la espera que pueda entrar (con tarifa que la cubra). Devuelve
   * su ficha o nulo. Se llama con la fila del evento bloqueada.
   */
  async function promoteFromWaitlist(
    tx: Tx,
    scope: OrgScope,
    cls: ClassRecord,
    policy: BookingPolicy,
    timezone: string,
    now: Date,
  ): Promise<string | null> {
    if (now.getTime() >= cls.startsAt.getTime()) return null;
    const seats = (await countsFor(tx, scope, [cls.id])).get(cls.id)?.booked ?? 0;
    if (cls.capacity !== null && seats >= cls.capacity) return null;
    const queue = await tx
      .select({ playerId: schema.bookings.playerId })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.eventId, cls.id), eq(schema.bookings.status, "waitlist")))
      .orderBy(asc(schema.bookings.queuedAt));
    for (const candidate of queue) {
      const context = await contextOf(tx, scope, candidate.playerId, timezone, policy, cls.id);
      // Para la regla, la persona aún no está en la clase y la ventana no cuenta: ya hizo cola.
      const check = evaluate(
        cls,
        { ...policy, opensDaysBefore: 60, closesMinutesBefore: 0 },
        context,
        null,
        now,
        seats,
      );
      if (check.action !== "book") continue;
      await tx
        .update(schema.bookings)
        .set({
          status: "booked",
          consumes: true,
          subscriptionId: check.planId,
          source: "waitlist",
          queuedAt: now,
        })
        .where(
          and(
            eq(schema.bookings.eventId, cls.id),
            eq(schema.bookings.playerId, candidate.playerId),
          ),
        );
      return candidate.playerId;
    }
    return null;
  }

  return {
    localDate,
    policy: (scope: OrgScope) => policyWith(db(), scope),

    async setPolicy(scope: OrgScope, patch: BookingPolicyUpdate): Promise<BookingPolicy> {
      const next: BookingPolicy = { ...(await policyWith(db(), scope)) };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (next as Record<string, unknown>)[key] = value;
      }
      await db()
        .insert(schema.bookingPolicies)
        .values({ organizationId: scope.organizationId, ...next })
        .onConflictDoUpdate({ target: schema.bookingPolicies.organizationId, set: next });
      return next;
    },

    classById: (scope: OrgScope, id: string, timezone: string) => classById(scope, id, timezone),

    /** Clases abiertas que empiezan en [from, to), por orden de inicio. */
    async classesBetween(
      scope: OrgScope,
      from: Date,
      to: Date,
      timezone: string,
      filter: ClassFilter = {},
    ): Promise<ClassRecord[]> {
      if (filter.teamIds && filter.teamIds.length === 0) return [];
      const rows = await classQuery()
        .where(
          and(
            openClass(scope),
            gte(schema.events.startsAt, from),
            lt(schema.events.startsAt, to),
            filter.sectionId ? eq(schema.events.sectionId, filter.sectionId) : undefined,
            filter.teamId ? eq(schema.events.teamId, filter.teamId) : undefined,
            filter.coachUserId ? eq(schema.events.coachUserId, filter.coachUserId) : undefined,
            filter.teamIds ? inArray(schema.events.teamId, filter.teamIds) : undefined,
          ),
        )
        .orderBy(asc(schema.events.startsAt), asc(schema.teams.name));
      return toClasses(db(), scope, rows, timezone);
    },

    /** Las reservas propias de una lista de clases, con el puesto en la espera. */
    async mine(
      scope: OrgScope,
      playerId: string,
      eventIds: string[],
    ): Promise<Map<string, MyBookingRecord>> {
      const map = new Map<string, MyBookingRecord>();
      if (eventIds.length === 0) return map;
      const rows = await db()
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.playerId, playerId),
            inArray(schema.bookings.eventId, eventIds),
          ),
        );
      for (const r of rows) {
        const status = r.status as BookingStatus;
        map.set(r.eventId, {
          bookingId: r.id,
          status,
          position: status === "waitlist" ? await positionOf(db(), r.eventId, r.queuedAt) : null,
        });
      }
      return map;
    },

    context: (scope: OrgScope, playerId: string, timezone: string, policy: BookingPolicy) =>
      contextOf(db(), scope, playerId, timezone, policy),

    /** Las reservas que cuentan de muchos atletas a la vez (para listas de tarifas). */
    async countedByPlayer(
      scope: OrgScope,
      playerIds: string[],
      timezone: string,
    ): Promise<Map<string, CountedBooking[]>> {
      const map = new Map<string, CountedBooking[]>();
      if (playerIds.length === 0) return map;
      const rows = await db()
        .select({
          playerId: schema.bookings.playerId,
          status: schema.bookings.status,
          consumes: schema.bookings.consumes,
          startsAt: schema.events.startsAt,
        })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            inArray(schema.bookings.playerId, playerIds),
            ne(schema.bookings.status, "cancelled"),
            gte(schema.events.startsAt, new Date(Date.now() - 800 * 86_400_000)),
          ),
        );
      for (const r of rows) {
        const list = map.get(r.playerId) ?? [];
        list.push({
          date: localDate(timezone, r.startsAt),
          consumes: r.status === "waitlist" ? false : r.consumes,
        });
        map.set(r.playerId, list);
      }
      return map;
    },
    evaluate,

    /**
     * Reserva una plaza o un puesto en la espera. `override` (el personal) se salta la ventana y la
     * tarifa, pero no el aforo: con la clase llena, entra en la espera.
     */
    async book(
      scope: OrgScope,
      input: {
        eventId: string;
        playerId: string;
        timezone: string;
        now: Date;
        source: "self" | "staff";
        createdBy: string | null;
        override?: boolean;
      },
    ): Promise<
      | { outcome: "not_found" }
      | { outcome: "blocked"; block: BookingBlock }
      | { outcome: "booked" | "waitlisted"; booking: MyBookingRecord }
    > {
      return db().transaction(async (tx) => {
        if (!(await lockEvent(tx, scope, input.eventId))) return { outcome: "not_found" as const };
        const cls = await classById(scope, input.eventId, input.timezone, tx);
        if (!cls) return { outcome: "not_found" as const };
        const policy = await policyWith(tx, scope);
        const existing = await bookingOf(tx, scope, input.eventId, input.playerId);
        const context = await contextOf(tx, scope, input.playerId, input.timezone, policy);
        let check = evaluate(
          cls,
          policy,
          context,
          (existing?.status as BookingStatus | undefined) ?? null,
          input.now,
        );
        if (input.override && !check.action && check.block !== "already_booked") {
          if (input.now.getTime() >= cls.startsAt.getTime())
            return { outcome: "blocked" as const, block: "closed" as const };
          const full = cls.capacity !== null && cls.booked >= cls.capacity;
          check = {
            action: full ? "waitlist" : "book",
            block: null,
            planId: context.subscriptions.find((s) => s.status === "active")?.id ?? null,
            usage: null,
          };
        }
        if (!check.action) return { outcome: "blocked" as const, block: check.block! };
        const row = await upsertBooking(tx, scope, {
          eventId: input.eventId,
          playerId: input.playerId,
          status: check.action === "book" ? "booked" : "waitlist",
          consumes: check.action === "book",
          subscriptionId: check.planId,
          source: input.source,
          createdBy: input.createdBy,
          now: input.now,
        });
        const status = row.status as BookingStatus;
        return {
          outcome: status === "booked" ? ("booked" as const) : ("waitlisted" as const),
          booking: {
            bookingId: row.id,
            status,
            position:
              status === "waitlist" ? await positionOf(tx, row.eventId, row.queuedAt) : null,
          },
        };
      });
    },

    /**
     * Cancela la reserva (o el puesto en la espera). A tiempo no gasta; tarde, según la política.
     * El personal cancela siempre a tiempo (excusa). La plaza que queda la ocupa la espera.
     */
    async cancel(
      scope: OrgScope,
      input: {
        eventId: string;
        playerId: string;
        timezone: string;
        now: Date;
        byStaff: boolean;
      },
    ): Promise<
      | { outcome: "not_found" }
      | { outcome: "not_booked" }
      | { outcome: "too_late" }
      | { outcome: "cancelled"; status: "cancelled" | "late_cancel"; promoted: string | null }
    > {
      return db().transaction(async (tx) => {
        if (!(await lockEvent(tx, scope, input.eventId))) return { outcome: "not_found" as const };
        const cls = await classById(scope, input.eventId, input.timezone, tx);
        if (!cls) return { outcome: "not_found" as const };
        const policy = await policyWith(tx, scope);
        const booking = await bookingOf(tx, scope, input.eventId, input.playerId);
        if (!booking || (booking.status !== "booked" && booking.status !== "waitlist"))
          return { outcome: "not_booked" as const };
        let status: "cancelled" | "late_cancel" = "cancelled";
        let consumes = false;
        if (booking.status === "booked" && !input.byStaff) {
          const kind = cancellationKindAt(input.now, cls.startsAt, policy);
          if (kind === "too_late") return { outcome: "too_late" as const };
          if (kind === "late") {
            status = "late_cancel";
            consumes = policy.lateCancelConsumes;
          }
        }
        await tx
          .update(schema.bookings)
          .set({ status, consumes, cancelledAt: input.now, checkedInAt: null })
          .where(eq(schema.bookings.id, booking.id));
        const promoted =
          booking.status === "booked" && policy.waitlist
            ? await promoteFromWaitlist(tx, scope, cls, policy, input.timezone, input.now)
            : null;
        return { outcome: "cancelled" as const, status, promoted };
      });
    },

    /**
     * Check-in del coach: llegó (con reserva o sin ella, entra igual) o se deshace. Escribe también
     * en el pase de lista, como cualquier entrenamiento.
     */
    async checkIn(
      scope: OrgScope,
      input: {
        eventId: string;
        playerId: string;
        present: boolean;
        timezone: string;
        now: Date;
        recordedBy: string;
      },
    ): Promise<
      | { outcome: "not_found" }
      | { outcome: "not_booked" }
      | { outcome: "saved"; status: BookingStatus }
    > {
      return db().transaction(async (tx) => {
        if (!(await lockEvent(tx, scope, input.eventId))) return { outcome: "not_found" as const };
        const cls = await classById(scope, input.eventId, input.timezone, tx);
        if (!cls) return { outcome: "not_found" as const };
        const booking = await bookingOf(tx, scope, input.eventId, input.playerId);
        if (input.present) {
          const policy = await policyWith(tx, scope);
          let subscriptionId = booking?.subscriptionId ?? null;
          if (!booking || booking.status === "cancelled" || booking.status === "waitlist") {
            const context = await contextOf(
              tx,
              scope,
              input.playerId,
              input.timezone,
              policy,
              cls.id,
            );
            subscriptionId =
              context.subscriptions.find((s) => s.status === "active")?.id ?? subscriptionId;
          }
          await upsertBooking(tx, scope, {
            eventId: input.eventId,
            playerId: input.playerId,
            status: "attended",
            consumes: true,
            subscriptionId,
            source: booking ? (booking.source as "self" | "staff" | "waitlist") : "staff",
            createdBy: booking?.createdBy ?? input.recordedBy,
            now: input.now,
            checkedIn: true,
          });
          await tx
            .insert(schema.attendance)
            .values({
              organizationId: scope.organizationId,
              eventId: input.eventId,
              playerId: input.playerId,
              status: "present",
              recordedBy: input.recordedBy,
            })
            .onConflictDoUpdate({
              target: [schema.attendance.eventId, schema.attendance.playerId],
              set: { status: "present", recordedBy: input.recordedBy },
            });
          return { outcome: "saved" as const, status: "attended" as const };
        }
        if (!booking || (booking.status !== "attended" && booking.status !== "no_show"))
          return { outcome: "not_booked" as const };
        await tx
          .update(schema.bookings)
          .set({ status: "booked", consumes: true, checkedInAt: null })
          .where(eq(schema.bookings.id, booking.id));
        await tx
          .delete(schema.attendance)
          .where(
            and(
              eq(schema.attendance.eventId, input.eventId),
              eq(schema.attendance.playerId, input.playerId),
            ),
          );
        return { outcome: "saved" as const, status: "booked" as const };
      });
    },

    /**
     * Cierra la clase: quien reservó y no hizo check-in queda como no presentado (y gasta la sesión
     * si la política lo dice) y la espera se anula. Devuelve cuántos no vinieron.
     */
    async close(
      scope: OrgScope,
      eventId: string,
      recordedBy: string,
    ): Promise<{ outcome: "not_found" } | { outcome: "closed"; noShows: number }> {
      return db().transaction(async (tx) => {
        if (!(await lockEvent(tx, scope, eventId))) return { outcome: "not_found" as const };
        const policy = await policyWith(tx, scope);
        const missing = await tx
          .update(schema.bookings)
          .set({ status: "no_show", consumes: policy.noShowConsumes })
          .where(
            and(
              eq(schema.bookings.organizationId, scope.organizationId),
              eq(schema.bookings.eventId, eventId),
              eq(schema.bookings.status, "booked"),
            ),
          )
          .returning({ playerId: schema.bookings.playerId });
        await tx
          .update(schema.bookings)
          .set({ status: "cancelled", consumes: false })
          .where(
            and(
              eq(schema.bookings.organizationId, scope.organizationId),
              eq(schema.bookings.eventId, eventId),
              eq(schema.bookings.status, "waitlist"),
            ),
          );
        if (missing.length > 0) {
          await tx
            .insert(schema.attendance)
            .values(
              missing.map((m) => ({
                organizationId: scope.organizationId,
                eventId,
                playerId: m.playerId,
                status: "absent",
                recordedBy,
              })),
            )
            .onConflictDoNothing();
        }
        return { outcome: "closed" as const, noShows: missing.length };
      });
    },

    /** Quién viene a una clase (y quién espera), con su preferencia de salir o no en la lista. */
    async attendees(scope: OrgScope, eventId: string): Promise<AttendeeRecord[]> {
      const rows = await db()
        .select({
          bookingId: schema.bookings.id,
          playerId: schema.bookings.playerId,
          status: schema.bookings.status,
          queuedAt: schema.bookings.queuedAt,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
          userId: schema.people.userId,
          hidden: schema.fitnessPreferences.hideFromAttendees,
        })
        .from(schema.bookings)
        .innerJoin(schema.players, eq(schema.players.id, schema.bookings.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .leftJoin(
          schema.fitnessPreferences,
          eq(schema.fitnessPreferences.playerId, schema.bookings.playerId),
        )
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.eventId, eventId),
            inArray(schema.bookings.status, [
              "booked",
              "waitlist",
              "attended",
              "no_show",
              "late_cancel",
            ]),
          ),
        )
        .orderBy(asc(schema.bookings.queuedAt));
      return rows.map((r) => ({
        bookingId: r.bookingId,
        playerId: r.playerId,
        firstName: r.firstName,
        lastName: r.lastName,
        photoBlobKey: r.photoBlobKey,
        userId: r.userId,
        status: r.status as BookingStatus,
        queuedAt: r.queuedAt,
        hidden: r.hidden ?? false,
      }));
    },

    /** Las clases reservadas por un atleta en un rango (todas, si no se dice). */
    async ofPlayer(
      scope: OrgScope,
      playerId: string,
      timezone: string,
      range: { from?: Date; to?: Date } = {},
    ): Promise<{ cls: ClassRecord; booking: MyBookingRecord }[]> {
      const rows = await db()
        .select({ eventId: schema.bookings.eventId })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.playerId, playerId),
            range.from ? gte(schema.events.startsAt, range.from) : undefined,
            range.to ? lt(schema.events.startsAt, range.to) : undefined,
          ),
        );
      const ids = rows.map((r) => r.eventId);
      if (ids.length === 0) return [];
      const classes = await toClasses(
        db(),
        scope,
        await classQuery()
          .where(and(openClass(scope), inArray(schema.events.id, ids)))
          .orderBy(asc(schema.events.startsAt)),
        timezone,
      );
      const mine = await this.mine(scope, playerId, ids);
      return classes.flatMap((cls) => {
        const booking = mine.get(cls.id);
        return booking ? [{ cls, booking }] : [];
      });
    },

    /**
     * Días entrenados de un atleta: con check-in, o con reserva en una clase ya terminada que nadie
     * marcó como no presentada (sin check-in del coach, la reserva cuenta).
     */
    async trainedDates(
      scope: OrgScope,
      playerId: string,
      timezone: string,
      now: Date,
    ): Promise<string[]> {
      const rows = await db()
        .select({
          startsAt: schema.events.startsAt,
          status: schema.bookings.status,
          endsAt: schema.events.endsAt,
        })
        .from(schema.bookings)
        .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
        .where(
          and(
            eq(schema.bookings.organizationId, scope.organizationId),
            eq(schema.bookings.playerId, playerId),
            or(
              eq(schema.bookings.status, "attended"),
              and(eq(schema.bookings.status, "booked"), lt(schema.events.endsAt, now)),
            ),
          ),
        );
      return rows.map((r) => localDate(timezone, r.startsAt));
    },

    subscriptions: {
      async list(
        scope: OrgScope,
        today: string,
        filter: { playerId?: string; status?: SubscriptionStatus[] } = {},
      ): Promise<SubscriptionRecord[]> {
        await refreshStatuses(db(), scope, today);
        const rows = await subQuery()
          .where(
            and(
              eq(schema.subscriptions.organizationId, scope.organizationId),
              filter.playerId ? eq(schema.subscriptions.playerId, filter.playerId) : undefined,
              filter.status ? inArray(schema.subscriptions.status, filter.status) : undefined,
            ),
          )
          .orderBy(asc(schema.people.lastName), desc(schema.subscriptions.startsOn));
        return rows.map(toSubscription);
      },

      async byId(scope: OrgScope, id: string): Promise<SubscriptionRecord | null> {
        const rows = await subQuery().where(
          and(
            eq(schema.subscriptions.organizationId, scope.organizationId),
            eq(schema.subscriptions.id, id),
          ),
        );
        return rows[0] ? toSubscription(rows[0]) : null;
      },

      async create(
        scope: OrgScope,
        input: SubscriptionCreate,
        createdBy: string | null,
      ): Promise<
        | { outcome: "created"; subscription: SubscriptionRecord }
        | { outcome: "unknown_player" }
        | { outcome: "unknown_plan" }
      > {
        const player = await db()
          .select({ id: schema.players.id })
          .from(schema.players)
          .where(
            and(
              eq(schema.players.organizationId, scope.organizationId),
              eq(schema.players.id, input.playerId),
            ),
          )
          .limit(1);
        if (!player[0]) return { outcome: "unknown_player" };
        const plan = await db()
          .select({ id: schema.feePlans.id })
          .from(schema.feePlans)
          .where(
            and(
              eq(schema.feePlans.organizationId, scope.organizationId),
              eq(schema.feePlans.id, input.feePlanId),
              eq(schema.feePlans.status, "active"),
            ),
          )
          .limit(1);
        if (!plan[0]) return { outcome: "unknown_plan" };
        const rows = await db()
          .insert(schema.subscriptions)
          .values({
            organizationId: scope.organizationId,
            playerId: input.playerId,
            feePlanId: input.feePlanId,
            startsOn: input.startsOn,
            createdBy,
          })
          .returning({ id: schema.subscriptions.id });
        const subscription = await this.byId(scope, rows[0]!.id);
        if (!subscription) throw new Error("La tarifa recién creada no aparece.");
        return { outcome: "created", subscription };
      },

      async update(
        scope: OrgScope,
        id: string,
        patch: SubscriptionUpdate,
      ): Promise<
        | { outcome: "updated"; subscription: SubscriptionRecord }
        | { outcome: "not_found" }
        | { outcome: "invalid_dates" }
      > {
        const current = await this.byId(scope, id);
        if (!current) return { outcome: "not_found" };
        const values: Partial<typeof schema.subscriptions.$inferInsert> = {};
        if (patch.status !== undefined) {
          values.status = patch.status;
          if (patch.status !== "paused") values.pausedUntil = null;
        }
        if (patch.pausedUntil !== undefined) values.pausedUntil = patch.pausedUntil;
        if (patch.endsOn !== undefined) {
          if (patch.endsOn && patch.endsOn < current.startsOn) return { outcome: "invalid_dates" };
          values.endsOn = patch.endsOn;
        }
        if (Object.keys(values).length > 0) {
          await db()
            .update(schema.subscriptions)
            .set(values)
            .where(
              and(
                eq(schema.subscriptions.organizationId, scope.organizationId),
                eq(schema.subscriptions.id, id),
              ),
            );
        }
        const subscription = await this.byId(scope, id);
        return subscription ? { outcome: "updated", subscription } : { outcome: "not_found" };
      },

      /** Domiciliación (Stripe): guarda la suscripción y su estado. */
      async setStripe(
        scope: OrgScope,
        id: string,
        values: {
          stripeSubscriptionId?: string | null;
          stripeStatus?: string | null;
          billing?: PlanBilling;
        },
      ): Promise<void> {
        await db()
          .update(schema.subscriptions)
          .set(values)
          .where(
            and(
              eq(schema.subscriptions.organizationId, scope.organizationId),
              eq(schema.subscriptions.id, id),
            ),
          );
      },

      /** El webhook llega sin club: la suscripción de Stripe dice de qué club es. */
      async byStripeSubscription(
        stripeSubscriptionId: string,
      ): Promise<{ scope: OrgScope; subscription: SubscriptionRecord } | null> {
        const rows = await db()
          .select({
            id: schema.subscriptions.id,
            organizationId: schema.subscriptions.organizationId,
          })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        const scope = mintOrgScope(row.organizationId);
        const subscription = await this.byId(scope, row.id);
        return subscription ? { scope, subscription } : null;
      },

      /** Por id y club de la metadata de Stripe (el checkout aún no tiene la suscripción guardada). */
      async byIdInOrganization(
        organizationId: string,
        id: string,
      ): Promise<{ scope: OrgScope; subscription: SubscriptionRecord } | null> {
        const scope = mintOrgScope(organizationId);
        const subscription = await this.byId(scope, id);
        return subscription ? { scope, subscription } : null;
      },
    },
  };
}
