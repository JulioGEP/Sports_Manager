import { schema, type Database } from "@sportsmanager/db";
import type {
  FeeChargeCreate,
  FeeChargeGenerate,
  FeeChargeStatus,
  FeeChargeUpdate,
  FeePeriod,
  FeePlanCreate,
  FeePlanStatus,
  FeePlanUpdate,
  PaymentCreate,
  PaymentMethod,
} from "@sportsmanager/shared";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import { mintOrgScope, type OrgScope } from "./scope.ts";

/**
 * Cuotas y cobros (Bloque 18). Toda consulta lleva el ámbito del club (ADR 0015). Importes en
 * céntimos. Un plan dice cuánto y cada cuánto; un cargo es lo que una persona debe por un periodo;
 * un pago es lo que entró, a mano (efectivo, transferencia) o por Stripe (webhook).
 */

export interface FeesSummaryRecord {
  pendingCents: number;
  pendingCount: number;
  overdueCount: number;
}

export interface PersonFeesRecord {
  pendingCents: number;
  overdueCount: number;
}

export interface FeePlanRecord {
  id: string;
  name: string;
  amountCents: number;
  period: FeePeriod;
  memberType: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  description: string | null;
  status: FeePlanStatus;
  appliesTo: number;
}

export interface PaymentRecord {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  paidOn: string;
  note: string | null;
  recordedBy: { userId: string; name: string } | null;
  providerRef: string | null;
}

export interface FeeChargeRecord {
  id: string;
  person: { id: string; firstName: string; lastName: string; email: string | null };
  plan: { id: string; name: string } | null;
  concept: string;
  periodLabel: string | null;
  amountCents: number;
  paidCents: number;
  dueOn: string;
  status: FeeChargeStatus;
  payments: PaymentRecord[];
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: Date;
}

export interface FeeChargeTotals {
  pendingCents: number;
  overdueCents: number;
  paidCents: number;
  pendingCount: number;
  overdueCount: number;
}

export interface ChargeFilter {
  status?: FeeChargeStatus | undefined;
  personId?: string | undefined;
  planId?: string | undefined;
  /** Búsqueda por nombre, concepto, periodo o plan. No cambia los totales. */
  q?: string | undefined;
  /** Un tramo de la lista (ADR 0060). Sin `limit`, la lista entera, como antes. */
  limit?: number | undefined;
  offset?: number | undefined;
}

const OPEN: readonly FeeChargeStatus[] = ["pending", "overdue"];

/** Fecha de hoy `AAAA-MM-DD` en UTC: la que usan los pagos del webhook. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function feesRepo(db: () => Database) {
  /** Los cargos pendientes con fecha pasada pasan a vencidos. No hay cron: se hace al leer. */
  async function markOverdue(scope: OrgScope): Promise<void> {
    await db()
      .update(schema.feeCharges)
      .set({ status: "overdue" })
      .where(
        and(
          eq(schema.feeCharges.organizationId, scope.organizationId),
          eq(schema.feeCharges.status, "pending"),
          lt(schema.feeCharges.dueOn, sql`current_date`),
        ),
      );
  }

  // --- Planes ---

  type PlanRow = typeof schema.feePlans.$inferSelect;

  /** Personas a las que aplica un plan hoy: por tipo de socio, por sección, las dos a la vez, o todos los socios activos. */
  async function appliesTo(scope: OrgScope, plan: PlanRow): Promise<string[]> {
    let members: Set<string> | null = null;
    if (plan.memberTypeId || !plan.sectionId) {
      const rows = await db()
        .select({ personId: schema.clubMembers.personId })
        .from(schema.clubMembers)
        .where(
          and(
            eq(schema.clubMembers.organizationId, scope.organizationId),
            eq(schema.clubMembers.status, "active"),
            ...(plan.memberTypeId ? [eq(schema.clubMembers.memberTypeId, plan.memberTypeId)] : []),
          ),
        );
      members = new Set(rows.map((r) => r.personId));
    }
    let athletes: Set<string> | null = null;
    if (plan.sectionId) {
      const rows = await db()
        .selectDistinct({ personId: schema.players.personId })
        .from(schema.teamPlayers)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            eq(schema.teams.sectionId, plan.sectionId),
            eq(schema.teams.status, "active"),
            eq(schema.seasons.isCurrent, true),
            eq(schema.players.status, "active"),
          ),
        );
      athletes = new Set(rows.map((r) => r.personId));
    }
    if (members && athletes) return [...members].filter((id) => athletes.has(id));
    return [...(members ?? athletes ?? new Set<string>())];
  }

  /**
   * Cuántas personas abarca un plan, contado en la base (ADR 0060): el mismo criterio que
   * `appliesTo`, sin traer a la API la lista entera de cada plan solo para contarla.
   */
  async function appliesToCount(scope: OrgScope, plan: PlanRow): Promise<number> {
    const athletes = plan.sectionId
      ? db()
          .selectDistinct({ personId: schema.players.personId })
          .from(schema.teamPlayers)
          .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
          .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
          .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
          .where(
            and(
              eq(schema.teamPlayers.organizationId, scope.organizationId),
              eq(schema.teams.sectionId, plan.sectionId),
              eq(schema.teams.status, "active"),
              eq(schema.seasons.isCurrent, true),
              eq(schema.players.status, "active"),
            ),
          )
      : null;
    if (plan.memberTypeId || !plan.sectionId) {
      const rows = await db()
        .select({ total: countDistinct(schema.clubMembers.personId) })
        .from(schema.clubMembers)
        .where(
          and(
            eq(schema.clubMembers.organizationId, scope.organizationId),
            eq(schema.clubMembers.status, "active"),
            ...(plan.memberTypeId ? [eq(schema.clubMembers.memberTypeId, plan.memberTypeId)] : []),
            ...(athletes ? [inArray(schema.clubMembers.personId, athletes)] : []),
          ),
        );
      return rows[0]?.total ?? 0;
    }
    const rows = await db()
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(athletes!.as("athletes"));
    return rows[0]?.total ?? 0;
  }

  async function planRows(scope: OrgScope, id?: string) {
    return db()
      .select({
        plan: schema.feePlans,
        memberTypeName: schema.memberTypes.name,
        sectionName: schema.sections.name,
      })
      .from(schema.feePlans)
      .leftJoin(schema.memberTypes, eq(schema.memberTypes.id, schema.feePlans.memberTypeId))
      .leftJoin(schema.sections, eq(schema.sections.id, schema.feePlans.sectionId))
      .where(
        and(
          eq(schema.feePlans.organizationId, scope.organizationId),
          ...(id ? [eq(schema.feePlans.id, id)] : []),
        ),
      )
      .orderBy(asc(schema.feePlans.status), asc(schema.feePlans.name));
  }

  async function toPlanRecord(
    scope: OrgScope,
    row: { plan: PlanRow; memberTypeName: string | null; sectionName: string | null },
  ): Promise<FeePlanRecord> {
    const { plan } = row;
    return {
      id: plan.id,
      name: plan.name,
      amountCents: plan.amountCents,
      period: plan.period as FeePeriod,
      memberType:
        plan.memberTypeId && row.memberTypeName
          ? { id: plan.memberTypeId, name: row.memberTypeName }
          : null,
      section:
        plan.sectionId && row.sectionName ? { id: plan.sectionId, name: row.sectionName } : null,
      description: plan.description,
      status: plan.status as FeePlanStatus,
      appliesTo: await appliesToCount(scope, plan),
    };
  }

  async function planById(scope: OrgScope, id: string): Promise<FeePlanRecord | null> {
    const rows = await planRows(scope, id);
    return rows[0] ? toPlanRecord(scope, rows[0]) : null;
  }

  async function memberTypeOf(scope: OrgScope, id: string): Promise<boolean> {
    const rows = await db()
      .select({ id: schema.memberTypes.id })
      .from(schema.memberTypes)
      .where(
        and(
          eq(schema.memberTypes.organizationId, scope.organizationId),
          eq(schema.memberTypes.id, id),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async function sectionOf(scope: OrgScope, id: string): Promise<boolean> {
    const rows = await db()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(
        and(eq(schema.sections.organizationId, scope.organizationId), eq(schema.sections.id, id)),
      )
      .limit(1);
    return rows.length > 0;
  }
  async function personOf(scope: OrgScope, id: string): Promise<boolean> {
    const rows = await db()
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(and(eq(schema.people.organizationId, scope.organizationId), eq(schema.people.id, id)))
      .limit(1);
    return rows.length > 0;
  }

  // --- Cargos ---

  async function paymentsFor(chargeIds: string[]): Promise<Map<string, PaymentRecord[]>> {
    const map = new Map<string, PaymentRecord[]>();
    if (chargeIds.length === 0) return map;
    const rows = await db()
      .select({
        id: schema.payments.id,
        chargeId: schema.payments.chargeId,
        amountCents: schema.payments.amountCents,
        method: schema.payments.method,
        paidOn: schema.payments.paidOn,
        note: schema.payments.note,
        recordedBy: schema.payments.recordedBy,
        recordedByName: schema.users.name,
        providerRef: schema.payments.providerRef,
      })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.recordedBy))
      .where(inArray(schema.payments.chargeId, chargeIds))
      .orderBy(asc(schema.payments.paidOn), asc(schema.payments.createdAt));
    for (const row of rows) {
      const list = map.get(row.chargeId) ?? [];
      list.push({
        id: row.id,
        amountCents: row.amountCents,
        method: row.method as PaymentMethod,
        paidOn: row.paidOn,
        note: row.note,
        recordedBy:
          row.recordedBy && row.recordedByName
            ? { userId: row.recordedBy, name: row.recordedByName }
            : null,
        providerRef: row.providerRef,
      });
      map.set(row.chargeId, list);
    }
    return map;
  }

  const chargeSelection = {
    charge: schema.feeCharges,
    firstName: schema.people.firstName,
    lastName: schema.people.lastName,
    email: schema.people.email,
    planName: schema.feePlans.name,
  };
  type ChargeRow = {
    charge: typeof schema.feeCharges.$inferSelect;
    firstName: string;
    lastName: string;
    email: string | null;
    planName: string | null;
  };
  const chargeQuery = () =>
    db()
      .select(chargeSelection)
      .from(schema.feeCharges)
      .innerJoin(schema.people, eq(schema.people.id, schema.feeCharges.personId))
      .leftJoin(schema.feePlans, eq(schema.feePlans.id, schema.feeCharges.feePlanId));

  async function toChargeRecords(rows: ChargeRow[]): Promise<FeeChargeRecord[]> {
    const payments = await paymentsFor(rows.map((r) => r.charge.id));
    return rows.map(({ charge, firstName, lastName, email, planName }) => ({
      id: charge.id,
      person: { id: charge.personId, firstName, lastName, email },
      plan: charge.feePlanId && planName ? { id: charge.feePlanId, name: planName } : null,
      concept: charge.concept,
      periodLabel: charge.periodLabel,
      amountCents: charge.amountCents,
      paidCents: charge.paidCents,
      dueOn: charge.dueOn,
      status: charge.status as FeeChargeStatus,
      payments: payments.get(charge.id) ?? [],
      stripeCheckoutSessionId: charge.stripeCheckoutSessionId,
      stripePaymentIntentId: charge.stripePaymentIntentId,
      createdAt: charge.createdAt,
    }));
  }

  async function chargeById(scope: OrgScope, id: string): Promise<FeeChargeRecord | null> {
    const rows = await chargeQuery().where(
      and(eq(schema.feeCharges.organizationId, scope.organizationId), eq(schema.feeCharges.id, id)),
    );
    return (await toChargeRecords(rows))[0] ?? null;
  }

  /** Los totales de `totalsOf`, calculados en la base sobre todos los cargos del filtro. */
  async function totalsWhere(where: SQL | undefined): Promise<FeeChargeTotals> {
    const open = sql`${schema.feeCharges.status} in ('pending', 'overdue')`;
    const remaining = sql`greatest(${schema.feeCharges.amountCents} - ${schema.feeCharges.paidCents}, 0)`;
    const rows = await db()
      .select({
        paidCents: sql<number>`coalesce(sum(${schema.feeCharges.paidCents}), 0)`.mapWith(Number),
        pendingCents: sql<number>`coalesce(sum(${remaining}) filter (where ${open}), 0)`.mapWith(
          Number,
        ),
        pendingCount: sql<number>`count(*) filter (where ${open})`.mapWith(Number),
        overdueCents:
          sql<number>`coalesce(sum(${remaining}) filter (where ${schema.feeCharges.status} = 'overdue'), 0)`.mapWith(
            Number,
          ),
        overdueCount:
          sql<number>`count(*) filter (where ${schema.feeCharges.status} = 'overdue')`.mapWith(
            Number,
          ),
      })
      .from(schema.feeCharges)
      .where(where);
    return (
      rows[0] ?? {
        pendingCents: 0,
        overdueCents: 0,
        paidCents: 0,
        pendingCount: 0,
        overdueCount: 0,
      }
    );
  }

  /** Personas de una cuenta en el club: la suya y las de los jugadores de los que es familia. */
  async function personIdsForUser(scope: OrgScope, userId: string): Promise<string[]> {
    const own = await db()
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(
        and(
          eq(schema.people.organizationId, scope.organizationId),
          eq(schema.people.userId, userId),
        ),
      );
    const wards = await db()
      .select({ id: schema.players.personId })
      .from(schema.playerGuardians)
      .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          eq(schema.playerGuardians.userId, userId),
        ),
      );
    return [...new Set([...own.map((r) => r.id), ...wards.map((r) => r.id)])];
  }

  /** Aplica un pago a un cargo: suma lo pagado y lo cierra cuando cubre el importe. */
  async function applyPayment(
    scope: OrgScope,
    chargeId: string,
    input: {
      amountCents: number;
      method: PaymentMethod;
      paidOn: string;
      note: string | null;
      recordedBy: string | null;
      providerRef: string | null;
      paymentIntentId?: string | null;
    },
  ): Promise<"recorded" | "not_found" | "not_payable" | "exceeds" | "duplicate"> {
    return db().transaction(async (tx) => {
      const rows = await tx
        .select({
          id: schema.feeCharges.id,
          amountCents: schema.feeCharges.amountCents,
          paidCents: schema.feeCharges.paidCents,
          status: schema.feeCharges.status,
        })
        .from(schema.feeCharges)
        .where(
          and(
            eq(schema.feeCharges.organizationId, scope.organizationId),
            eq(schema.feeCharges.id, chargeId),
          ),
        )
        .for("update");
      const charge = rows[0];
      if (!charge) return "not_found";
      if (charge.status === "cancelled" || charge.status === "paid") return "not_payable";
      if (charge.paidCents + input.amountCents > charge.amountCents) return "exceeds";
      try {
        await tx.insert(schema.payments).values({
          organizationId: scope.organizationId,
          chargeId,
          amountCents: input.amountCents,
          method: input.method,
          paidOn: input.paidOn,
          note: input.note,
          recordedBy: input.recordedBy,
          providerRef: input.providerRef,
        });
      } catch (error) {
        if (isUniqueViolation(error)) return "duplicate";
        throw error;
      }
      const paid = charge.paidCents + input.amountCents;
      await tx
        .update(schema.feeCharges)
        .set({
          paidCents: paid,
          status: paid >= charge.amountCents ? "paid" : charge.status,
          ...(input.paymentIntentId ? { stripePaymentIntentId: input.paymentIntentId } : {}),
        })
        .where(eq(schema.feeCharges.id, chargeId));
      return "recorded";
    });
  }

  return {
    markOverdue,

    /** Lo pendiente del club: para el inicio. Antes marca como vencidos los cargos con fecha pasada. */
    async summary(scope: OrgScope): Promise<FeesSummaryRecord> {
      await markOverdue(scope);
      const rows = await db()
        .select({
          status: schema.feeCharges.status,
          count: sql<number>`count(*)::int`,
          remaining: sql<number>`coalesce(sum(${schema.feeCharges.amountCents} - ${schema.feeCharges.paidCents}), 0)::int`,
        })
        .from(schema.feeCharges)
        .where(
          and(
            eq(schema.feeCharges.organizationId, scope.organizationId),
            inArray(schema.feeCharges.status, [...OPEN]),
          ),
        )
        .groupBy(schema.feeCharges.status);
      const result: FeesSummaryRecord = { pendingCents: 0, pendingCount: 0, overdueCount: 0 };
      for (const row of rows) {
        result.pendingCents += Number(row.remaining);
        result.pendingCount += Number(row.count);
        if (row.status === "overdue") result.overdueCount += Number(row.count);
      }
      return result;
    },

    /** Lo pendiente de cada persona: para la lista de socios. */
    async pendingByPerson(
      scope: OrgScope,
      personIds: string[],
    ): Promise<Map<string, PersonFeesRecord>> {
      const map = new Map<string, PersonFeesRecord>();
      if (personIds.length === 0) return map;
      await markOverdue(scope);
      const rows = await db()
        .select({
          personId: schema.feeCharges.personId,
          status: schema.feeCharges.status,
          remaining: sql<number>`coalesce(sum(${schema.feeCharges.amountCents} - ${schema.feeCharges.paidCents}), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.feeCharges)
        .where(
          and(
            eq(schema.feeCharges.organizationId, scope.organizationId),
            inArray(schema.feeCharges.personId, personIds),
            inArray(schema.feeCharges.status, [...OPEN]),
          ),
        )
        .groupBy(schema.feeCharges.personId, schema.feeCharges.status);
      for (const row of rows) {
        const entry = map.get(row.personId) ?? { pendingCents: 0, overdueCount: 0 };
        entry.pendingCents += Number(row.remaining);
        if (row.status === "overdue") entry.overdueCount += Number(row.count);
        map.set(row.personId, entry);
      }
      return map;
    },

    plans: {
      async list(scope: OrgScope): Promise<FeePlanRecord[]> {
        const rows = await planRows(scope);
        return Promise.all(rows.map((row) => toPlanRecord(scope, row)));
      },
      byId: planById,
      async create(
        scope: OrgScope,
        input: FeePlanCreate,
      ): Promise<
        | { outcome: "created"; plan: FeePlanRecord }
        | { outcome: "unknown_member_type" }
        | { outcome: "unknown_section" }
      > {
        if (input.memberTypeId && !(await memberTypeOf(scope, input.memberTypeId)))
          return { outcome: "unknown_member_type" };
        if (input.sectionId && !(await sectionOf(scope, input.sectionId)))
          return { outcome: "unknown_section" };
        const rows = await db()
          .insert(schema.feePlans)
          .values({
            organizationId: scope.organizationId,
            name: input.name,
            amountCents: input.amountCents,
            period: input.period,
            memberTypeId: input.memberTypeId ?? null,
            sectionId: input.sectionId ?? null,
            description: input.description ?? null,
          })
          .returning({ id: schema.feePlans.id });
        const plan = await planById(scope, rows[0]!.id);
        if (!plan) throw new Error("El plan recién creado no aparece.");
        return { outcome: "created", plan };
      },
      async update(
        scope: OrgScope,
        id: string,
        patch: FeePlanUpdate,
      ): Promise<
        | { outcome: "updated"; plan: FeePlanRecord }
        | { outcome: "not_found" }
        | { outcome: "unknown_member_type" }
        | { outcome: "unknown_section" }
      > {
        if (patch.memberTypeId && !(await memberTypeOf(scope, patch.memberTypeId)))
          return { outcome: "unknown_member_type" };
        if (patch.sectionId && !(await sectionOf(scope, patch.sectionId)))
          return { outcome: "unknown_section" };
        const values: Partial<typeof schema.feePlans.$inferInsert> = {};
        if (patch.name !== undefined) values.name = patch.name;
        if (patch.amountCents !== undefined) values.amountCents = patch.amountCents;
        if (patch.period !== undefined) values.period = patch.period;
        if (patch.memberTypeId !== undefined) values.memberTypeId = patch.memberTypeId;
        if (patch.sectionId !== undefined) values.sectionId = patch.sectionId;
        if (patch.description !== undefined) values.description = patch.description;
        if (patch.status !== undefined) values.status = patch.status;
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.feePlans)
            .set(values)
            .where(
              and(
                eq(schema.feePlans.organizationId, scope.organizationId),
                eq(schema.feePlans.id, id),
              ),
            )
            .returning({ id: schema.feePlans.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
        const plan = await planById(scope, id);
        return plan ? { outcome: "updated", plan } : { outcome: "not_found" };
      },
    },

    charges: {
      async list(
        scope: OrgScope,
        filter: ChargeFilter = {},
      ): Promise<{ charges: FeeChargeRecord[]; totals: FeeChargeTotals; total: number }> {
        await markOverdue(scope);
        const base = and(
          eq(schema.feeCharges.organizationId, scope.organizationId),
          ...(filter.status ? [eq(schema.feeCharges.status, filter.status)] : []),
          ...(filter.personId ? [eq(schema.feeCharges.personId, filter.personId)] : []),
          ...(filter.planId ? [eq(schema.feeCharges.feePlanId, filter.planId)] : []),
        );
        const q = filter.q?.trim();
        const pattern = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
        const where = pattern
          ? and(
              base,
              or(
                ilike(sql`${schema.people.firstName} || ' ' || ${schema.people.lastName}`, pattern),
                ilike(schema.feeCharges.concept, pattern),
                ilike(schema.feeCharges.periodLabel, pattern),
                ilike(schema.feePlans.name, pattern),
              ),
            )
          : base;
        // Una temporada de un club de 450 personas son ~4.500 cargos (1,8 MB): la pantalla pide
        // un tramo, y los totales y el recuento salen de la base, no de la lista (ADR 0060).
        const [rows, totals, counted] = await Promise.all([
          (() => {
            const page = chargeQuery()
              .where(where)
              .orderBy(
                desc(schema.feeCharges.dueOn),
                asc(schema.people.lastName),
                asc(schema.people.firstName),
                asc(schema.feeCharges.id),
              )
              .$dynamic();
            return filter.limit === undefined
              ? page
              : page.limit(filter.limit).offset(filter.offset ?? 0);
          })(),
          totalsWhere(base),
          filter.limit === undefined
            ? Promise.resolve(null)
            : db()
                .select({ total: count() })
                .from(schema.feeCharges)
                .innerJoin(schema.people, eq(schema.people.id, schema.feeCharges.personId))
                .leftJoin(schema.feePlans, eq(schema.feePlans.id, schema.feeCharges.feePlanId))
                .where(where),
        ]);
        const charges = await toChargeRecords(rows);
        return { charges, totals, total: counted?.[0]?.total ?? charges.length };
      },

      byId: chargeById,

      /** Cargos de la persona de la sesión y de los jugadores de los que es familia. */
      async forUser(scope: OrgScope, userId: string): Promise<FeeChargeRecord[]> {
        const personIds = await personIdsForUser(scope, userId);
        if (personIds.length === 0) return [];
        await markOverdue(scope);
        const rows = await chargeQuery()
          .where(
            and(
              eq(schema.feeCharges.organizationId, scope.organizationId),
              inArray(schema.feeCharges.personId, personIds),
            ),
          )
          .orderBy(desc(schema.feeCharges.dueOn), asc(schema.people.lastName));
        return toChargeRecords(rows);
      },

      /** Si una cuenta puede pagar un cargo: es suyo o de un jugador del que es familia. */
      async belongsToUser(scope: OrgScope, chargeId: string, userId: string): Promise<boolean> {
        const personIds = await personIdsForUser(scope, userId);
        if (personIds.length === 0) return false;
        const rows = await db()
          .select({ id: schema.feeCharges.id })
          .from(schema.feeCharges)
          .where(
            and(
              eq(schema.feeCharges.organizationId, scope.organizationId),
              eq(schema.feeCharges.id, chargeId),
              inArray(schema.feeCharges.personId, personIds),
            ),
          )
          .limit(1);
        return rows.length > 0;
      },

      async create(
        scope: OrgScope,
        input: FeeChargeCreate,
        createdBy: string | null,
      ): Promise<
        | { outcome: "created"; charge: FeeChargeRecord }
        | { outcome: "unknown_person" }
        | { outcome: "unknown_plan" }
      > {
        if (!(await personOf(scope, input.personId))) return { outcome: "unknown_person" };
        if (input.feePlanId && !(await planById(scope, input.feePlanId)))
          return { outcome: "unknown_plan" };
        const rows = await db()
          .insert(schema.feeCharges)
          .values({
            organizationId: scope.organizationId,
            personId: input.personId,
            feePlanId: input.feePlanId ?? null,
            concept: input.concept,
            periodLabel: input.periodLabel ?? null,
            amountCents: input.amountCents,
            dueOn: input.dueOn,
            status: input.dueOn < todayIso() ? "overdue" : "pending",
            createdBy,
          })
          .returning({ id: schema.feeCharges.id });
        const charge = await chargeById(scope, rows[0]!.id);
        if (!charge) throw new Error("El cargo recién creado no aparece.");
        return { outcome: "created", charge };
      },

      /** Un cargo por persona a la que aplica el plan y periodo. Salta los que ya existen. */
      async generate(
        scope: OrgScope,
        input: FeeChargeGenerate,
        createdBy: string | null,
      ): Promise<
        { outcome: "generated"; created: number; skipped: number } | { outcome: "unknown_plan" }
      > {
        const rows = await planRows(scope, input.feePlanId);
        const plan = rows[0]?.plan;
        if (!plan) return { outcome: "unknown_plan" };
        const targets = await appliesTo(scope, plan);
        if (targets.length === 0) return { outcome: "generated", created: 0, skipped: 0 };
        const existing = await db()
          .select({ personId: schema.feeCharges.personId })
          .from(schema.feeCharges)
          .where(
            and(
              eq(schema.feeCharges.organizationId, scope.organizationId),
              eq(schema.feeCharges.feePlanId, plan.id),
              eq(schema.feeCharges.periodLabel, input.periodLabel),
              inArray(schema.feeCharges.personId, targets),
            ),
          );
        const done = new Set(existing.map((r) => r.personId));
        const fresh = targets.filter((id) => !done.has(id));
        if (fresh.length > 0) {
          const status = input.dueOn < todayIso() ? "overdue" : "pending";
          await db()
            .insert(schema.feeCharges)
            .values(
              fresh.map((personId) => ({
                organizationId: scope.organizationId,
                personId,
                feePlanId: plan.id,
                concept: `${plan.name} · ${input.periodLabel}`,
                periodLabel: input.periodLabel,
                amountCents: plan.amountCents,
                dueOn: input.dueOn,
                status,
                createdBy,
              })),
            );
        }
        return { outcome: "generated", created: fresh.length, skipped: done.size };
      },

      async update(
        scope: OrgScope,
        id: string,
        patch: FeeChargeUpdate,
      ): Promise<
        | { outcome: "updated"; charge: FeeChargeRecord }
        | { outcome: "not_found" }
        | { outcome: "not_editable" }
      > {
        const current = await chargeById(scope, id);
        if (!current) return { outcome: "not_found" };
        if (current.status === "paid") return { outcome: "not_editable" };
        const values: Partial<typeof schema.feeCharges.$inferInsert> = {};
        if (patch.concept !== undefined) values.concept = patch.concept;
        if (patch.dueOn !== undefined) values.dueOn = patch.dueOn;
        const dueOn = patch.dueOn ?? current.dueOn;
        if (patch.status !== undefined) {
          values.status =
            patch.status === "cancelled" ? "cancelled" : dueOn < todayIso() ? "overdue" : "pending";
        } else if (patch.dueOn !== undefined && current.status !== "cancelled") {
          values.status = dueOn < todayIso() ? "overdue" : "pending";
        }
        if (Object.keys(values).length > 0) {
          await db()
            .update(schema.feeCharges)
            .set(values)
            .where(
              and(
                eq(schema.feeCharges.organizationId, scope.organizationId),
                eq(schema.feeCharges.id, id),
              ),
            );
        }
        const charge = await chargeById(scope, id);
        return charge ? { outcome: "updated", charge } : { outcome: "not_found" };
      },

      async setCheckoutSession(scope: OrgScope, id: string, sessionId: string): Promise<void> {
        await db()
          .update(schema.feeCharges)
          .set({ stripeCheckoutSessionId: sessionId })
          .where(
            and(
              eq(schema.feeCharges.organizationId, scope.organizationId),
              eq(schema.feeCharges.id, id),
            ),
          );
      },

      /**
       * Localiza el cargo de un webhook, que llega sin club: por su id (`client_reference_id`) o por
       * la sesión de Checkout. Devuelve el ámbito de su club para seguir con la regla de siempre.
       */
      async findForWebhook(ref: {
        chargeId?: string | null | undefined;
        sessionId?: string | null | undefined;
      }): Promise<{ scope: OrgScope; charge: FeeChargeRecord } | null> {
        const conditions = [
          ...(ref.chargeId && /^[0-9a-f-]{36}$/i.test(ref.chargeId)
            ? [eq(schema.feeCharges.id, ref.chargeId)]
            : []),
          ...(ref.sessionId ? [eq(schema.feeCharges.stripeCheckoutSessionId, ref.sessionId)] : []),
        ];
        if (conditions.length === 0) return null;
        const rows = await db()
          .select({ id: schema.feeCharges.id, organizationId: schema.feeCharges.organizationId })
          .from(schema.feeCharges)
          .where(or(...conditions))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        const scope = mintOrgScope(row.organizationId);
        const charge = await chargeById(scope, row.id);
        return charge ? { scope, charge } : null;
      },
    },

    payments: {
      /** Pago apuntado a mano por el club. Nunca más de lo que queda por pagar. */
      async record(scope: OrgScope, chargeId: string, input: PaymentCreate, recordedBy: string) {
        return applyPayment(scope, chargeId, {
          amountCents: input.amountCents,
          method: input.method,
          paidOn: input.paidOn,
          note: input.note ?? null,
          recordedBy,
          providerRef: null,
        });
      },

      /** Pago que confirma el proveedor (webhook). Idempotente por `providerRef`. */
      async recordFromProvider(
        scope: OrgScope,
        chargeId: string,
        input: {
          amountCents: number;
          providerRef: string;
          paidOn: string;
          paymentIntentId?: string | null;
        },
      ) {
        const remaining = await db()
          .select({
            amountCents: schema.feeCharges.amountCents,
            paidCents: schema.feeCharges.paidCents,
          })
          .from(schema.feeCharges)
          .where(
            and(
              eq(schema.feeCharges.organizationId, scope.organizationId),
              eq(schema.feeCharges.id, chargeId),
            ),
          )
          .limit(1);
        const charge = remaining[0];
        if (!charge) return "not_found" as const;
        // Stripe cobra el importe de la sesión; si por lo que sea excede lo que queda, se apunta lo que queda.
        const amount = Math.min(
          input.amountCents,
          Math.max(0, charge.amountCents - charge.paidCents),
        );
        if (amount <= 0) {
          const dup = await db()
            .select({ id: schema.payments.id })
            .from(schema.payments)
            .where(eq(schema.payments.providerRef, input.providerRef))
            .limit(1);
          return dup.length > 0 ? ("duplicate" as const) : ("not_payable" as const);
        }
        return applyPayment(scope, chargeId, {
          amountCents: amount,
          method: "stripe",
          paidOn: input.paidOn,
          note: null,
          recordedBy: null,
          providerRef: input.providerRef,
          paymentIntentId: input.paymentIntentId ?? null,
        });
      },
    },
  };
}
