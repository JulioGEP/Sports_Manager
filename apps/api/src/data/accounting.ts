import { schema, type Database } from "@sportsmanager/db";
import {
  ACCOUNTING_MAX_ATTEMPTS,
  type AccountingCounts,
  type AccountingDocumentType,
  type AccountingEntity,
  type AccountingLinkStatus,
  type PaymentMethod,
} from "@sportsmanager/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isUniqueViolation } from "./db.ts";
import { mintOrgScope, type OrgScope } from "./scope.ts";

/**
 * Conectores de contabilidad (ADR 0042). La conexión de cada club con su herramienta y los enlaces
 * de lo ya enviado. La cola no es una tabla: lo que falta por mandar se deduce de los cargos y los
 * pagos que no tienen enlace (o lo tienen fallido), así ningún cambio de cuotas se olvida de
 * avisar. Un enlace `pending` es una reserva: quien la tiene manda; si se queda colgada más de
 * `STALE_MINUTES`, otro puede retomarla. Toda consulta lleva el ámbito del club (ADR 0015).
 */

export type AccountingConnectionRow = typeof schema.accountingConnections.$inferSelect;
export type AccountingConnectionPatch = Partial<
  Pick<
    typeof schema.accountingConnections.$inferInsert,
    | "status"
    | "documentType"
    | "taxKey"
    | "taxName"
    | "taxRateBp"
    | "numberingSeriesId"
    | "approveDocuments"
    | "treasuryAccounts"
    | "syncFrom"
    | "autoSync"
    | "accountName"
    | "apiKeyCiphertext"
    | "apiKeyHint"
    | "lastError"
  >
>;

export interface AccountingPartyRecord {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
}

/** Lo que hace falta para emitir el documento de un cargo. */
export interface ChargeDocumentSource {
  id: string;
  concept: string;
  periodLabel: string | null;
  amountCents: number;
  dueOn: string;
  createdAt: Date;
  status: string;
  planName: string | null;
  /** Para quién es el cargo (el deportista, el socio). */
  person: AccountingPartyRecord;
  /** A quién se factura: la familia del deportista, o la propia persona si no tiene. */
  billTo: AccountingPartyRecord;
  /** Si el cargo cobra un pedido de la tienda (ADR 0041): número y líneas. */
  storeOrder: {
    number: number;
    items: { name: string; variant: string | null; quantity: number; unitPriceCents: number }[];
  } | null;
}

export interface PaymentSource {
  id: string;
  chargeId: string;
  amountCents: number;
  method: PaymentMethod;
  paidOn: string;
  /** El documento del cargo, ya enviado: el pago se apunta contra él. */
  document: { externalId: string; type: AccountingDocumentType };
}

export interface AccountingIssueRecord {
  entity: AccountingEntity;
  localId: string;
  label: string;
  error: string | null;
  attempts: number;
  updatedAt: Date;
}

/** Minutos tras los que una reserva sin terminar se da por perdida (una función cortada). */
const STALE_MINUTES = 2;

export function accountingRepo(db: () => Database) {
  const L = schema.accountingLinks;
  const C = schema.feeCharges;
  const P = schema.payments;

  const stale = sql`${L.updatedAt} < now() - make_interval(mins => ${STALE_MINUTES})`;

  const docLink = alias(L, "doc_link");
  const linkOn = (
    link: typeof L | typeof docLink,
    conn: AccountingConnectionRow,
    entity: AccountingEntity,
    local: string | SQLWrapper,
  ) => and(eq(link.connectionId, conn.id), eq(link.entity, entity), eq(link.localId, local));

  /** Cargos que necesitan documento: sin enlace, con alta fallida, anulado allí y vuelto a abrir, o con la reserva perdida. */
  const needsDocument = or(
    isNull(L.id),
    and(eq(L.status, "failed"), isNull(L.externalId), lt(L.attempts, ACCOUNTING_MAX_ATTEMPTS)),
    eq(L.status, "cancelled"),
    and(eq(L.status, "pending"), stale),
  );

  function documentsQuery(scope: OrgScope, conn: AccountingConnectionRow, onlyCharge?: string) {
    return and(
      eq(C.organizationId, scope.organizationId),
      ne(C.status, "cancelled"),
      // "Desde" es un día del club: la fecha de creación se mira en su zona horaria.
      sql`(${C.createdAt} at time zone (select ${schema.organizations.timezone} from ${schema.organizations} where ${schema.organizations.id} = ${C.organizationId}))::date >= ${conn.syncFrom}::date`,
      needsDocument,
      ...(onlyCharge ? [eq(C.id, onlyCharge)] : []),
    );
  }

  function cancellationsQuery(scope: OrgScope, onlyCharge?: string) {
    return and(
      eq(C.organizationId, scope.organizationId),
      eq(C.status, "cancelled"),
      eq(L.status, "synced"),
      lt(L.attempts, ACCOUNTING_MAX_ATTEMPTS),
      ...(onlyCharge ? [eq(C.id, onlyCharge)] : []),
    );
  }

  function paymentsQuery(scope: OrgScope, onlyCharge?: string) {
    return and(
      eq(P.organizationId, scope.organizationId),
      or(
        isNull(L.id),
        and(eq(L.status, "failed"), lt(L.attempts, ACCOUNTING_MAX_ATTEMPTS)),
        and(eq(L.status, "pending"), stale),
      ),
      ...(onlyCharge ? [eq(P.chargeId, onlyCharge)] : []),
    );
  }

  const party = {
    personId: schema.people.id,
    firstName: schema.people.firstName,
    lastName: schema.people.lastName,
    email: schema.people.email,
    phone: schema.people.phone,
    nationalId: schema.people.nationalId,
  };

  async function getConnection(scope: OrgScope): Promise<AccountingConnectionRow | null> {
    const rows = await db()
      .select()
      .from(schema.accountingConnections)
      .where(eq(schema.accountingConnections.organizationId, scope.organizationId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Cuánto queda por mandar, para la tanda y para la pantalla. */
  async function pendingTotal(scope: OrgScope, conn: AccountingConnectionRow): Promise<number> {
    const [docs, cancels, pays] = await Promise.all([
      db()
        .select({ n: count() })
        .from(C)
        .leftJoin(L, linkOn(L, conn, "document", C.id))
        .where(documentsQuery(scope, conn)),
      db()
        .select({ n: count() })
        .from(C)
        .innerJoin(L, linkOn(L, conn, "document", C.id))
        .where(cancellationsQuery(scope)),
      db()
        .select({ n: count() })
        .from(P)
        .innerJoin(
          docLink,
          and(linkOn(docLink, conn, "document", P.chargeId), eq(docLink.status, "synced")),
        )
        .leftJoin(L, linkOn(L, conn, "payment", P.id))
        .where(paymentsQuery(scope)),
    ]);
    return Number(docs[0]?.n ?? 0) + Number(cancels[0]?.n ?? 0) + Number(pays[0]?.n ?? 0);
  }

  return {
    connection: {
      get: getConnection,

      async create(
        scope: OrgScope,
        values: {
          provider: string;
          apiKeyCiphertext: string;
          apiKeyHint: string;
          accountName: string | null;
          syncFrom: string;
          connectedBy: string | null;
        },
      ): Promise<AccountingConnectionRow | "exists"> {
        try {
          const rows = await db()
            .insert(schema.accountingConnections)
            .values({ organizationId: scope.organizationId, ...values })
            .returning();
          return rows[0]!;
        } catch (error) {
          if (isUniqueViolation(error)) return "exists";
          throw error;
        }
      },

      async update(
        scope: OrgScope,
        patch: AccountingConnectionPatch,
      ): Promise<AccountingConnectionRow | null> {
        if (Object.keys(patch).length === 0) return getConnection(scope);
        const rows = await db()
          .update(schema.accountingConnections)
          .set(patch)
          .where(eq(schema.accountingConnections.organizationId, scope.organizationId))
          .returning();
        return rows[0] ?? null;
      },

      /** Desconectar: la clave y todos los enlaces se van con la fila. */
      async remove(scope: OrgScope): Promise<boolean> {
        const rows = await db()
          .delete(schema.accountingConnections)
          .where(eq(schema.accountingConnections.organizationId, scope.organizationId))
          .returning({ id: schema.accountingConnections.id });
        return rows.length > 0;
      },

      async recordRun(scope: OrgScope, error: string | null): Promise<void> {
        await db()
          .update(schema.accountingConnections)
          .set({ lastSyncAt: new Date(), lastError: error })
          .where(eq(schema.accountingConnections.organizationId, scope.organizationId));
      },

      /** Conexiones activas de un club, para el webhook de Stripe, que llega sin club resuelto. */
      async activeFor(
        organizationId: string,
      ): Promise<{ scope: OrgScope; connection: AccountingConnectionRow } | null> {
        const scope = mintOrgScope(organizationId);
        const rows = await db()
          .select()
          .from(schema.accountingConnections)
          .where(
            and(
              eq(schema.accountingConnections.organizationId, organizationId),
              eq(schema.accountingConnections.status, "active"),
            ),
          )
          .limit(1);
        return rows[0] ? { scope, connection: rows[0] } : null;
      },
    },

    // --- Lo que falta por mandar ---

    async documentsToSend(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      limit: number,
      onlyCharge?: string,
    ): Promise<string[]> {
      const rows = await db()
        .select({ id: C.id })
        .from(C)
        .leftJoin(L, linkOn(L, conn, "document", C.id))
        .where(documentsQuery(scope, conn, onlyCharge))
        .orderBy(asc(C.createdAt), asc(C.id))
        .limit(limit);
      return rows.map((r) => r.id);
    },

    async cancellationsToSend(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      limit: number,
      onlyCharge?: string,
    ): Promise<{ chargeId: string; externalId: string; type: AccountingDocumentType }[]> {
      const rows = await db()
        .select({ chargeId: C.id, externalId: L.externalId, type: L.documentType })
        .from(C)
        .innerJoin(L, linkOn(L, conn, "document", C.id))
        .where(cancellationsQuery(scope, onlyCharge))
        .orderBy(asc(C.updatedAt))
        .limit(limit);
      return rows.map((r) => ({
        chargeId: r.chargeId,
        externalId: r.externalId!,
        type: (r.type ?? "invoice") as AccountingDocumentType,
      }));
    },

    async paymentsToSend(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      limit: number,
      onlyCharge?: string,
    ): Promise<PaymentSource[]> {
      const rows = await db()
        .select({
          id: P.id,
          chargeId: P.chargeId,
          amountCents: P.amountCents,
          method: P.method,
          paidOn: P.paidOn,
          docExternalId: docLink.externalId,
          docType: docLink.documentType,
        })
        .from(P)
        .innerJoin(
          docLink,
          and(linkOn(docLink, conn, "document", P.chargeId), eq(docLink.status, "synced")),
        )
        .leftJoin(L, linkOn(L, conn, "payment", P.id))
        .where(paymentsQuery(scope, onlyCharge))
        .orderBy(asc(P.paidOn), asc(P.createdAt))
        .limit(limit);
      return rows.map(({ docExternalId, docType, ...r }) => ({
        ...r,
        method: r.method as PaymentMethod,
        document: {
          externalId: docExternalId!,
          type: (docType ?? "invoice") as AccountingDocumentType,
        },
      }));
    },

    pendingTotal,

    async counts(scope: OrgScope, conn: AccountingConnectionRow): Promise<AccountingCounts> {
      const rows = await db()
        .select({
          entity: L.entity,
          status: L.status,
          failing: sql<boolean>`${L.lastError} is not null`,
          n: count(),
        })
        .from(L)
        .where(and(eq(L.organizationId, scope.organizationId), eq(L.connectionId, conn.id)))
        .groupBy(L.entity, L.status, sql`${L.lastError} is not null`);
      const out: AccountingCounts = {
        contacts: 0,
        documents: 0,
        payments: 0,
        pending: 0,
        failed: 0,
      };
      for (const row of rows) {
        const n = Number(row.n);
        if (row.status === "synced") {
          if (row.entity === "contact") out.contacts += n;
          if (row.entity === "document") out.documents += n;
          if (row.entity === "payment") out.payments += n;
        }
        if (row.status === "failed" || (row.status === "synced" && row.failing)) out.failed += n;
      }
      out.pending = await pendingTotal(scope, conn);
      return out;
    },

    // --- Datos para mandar ---

    async chargeForDocument(
      scope: OrgScope,
      chargeId: string,
    ): Promise<ChargeDocumentSource | null> {
      const rows = await db()
        .select({ charge: C, planName: schema.feePlans.name, person: party })
        .from(C)
        .innerJoin(schema.people, eq(schema.people.id, C.personId))
        .leftJoin(schema.feePlans, eq(schema.feePlans.id, C.feePlanId))
        .where(and(eq(C.organizationId, scope.organizationId), eq(C.id, chargeId)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;

      // La familia paga lo del deportista: la factura va a nombre del primer familiar con ficha.
      const guardianPerson = alias(schema.people, "guardian_person");
      const accountPerson = alias(schema.people, "account_person");
      const guardians = await db()
        .select({
          direct: {
            personId: guardianPerson.id,
            firstName: guardianPerson.firstName,
            lastName: guardianPerson.lastName,
            email: guardianPerson.email,
            phone: guardianPerson.phone,
            nationalId: guardianPerson.nationalId,
          },
          byAccount: {
            personId: accountPerson.id,
            firstName: accountPerson.firstName,
            lastName: accountPerson.lastName,
            email: accountPerson.email,
            phone: accountPerson.phone,
            nationalId: accountPerson.nationalId,
          },
        })
        .from(schema.players)
        .innerJoin(schema.playerGuardians, eq(schema.playerGuardians.playerId, schema.players.id))
        .leftJoin(guardianPerson, eq(guardianPerson.id, schema.playerGuardians.guardianPersonId))
        .leftJoin(
          accountPerson,
          and(
            eq(accountPerson.userId, schema.playerGuardians.userId),
            eq(accountPerson.organizationId, scope.organizationId),
          ),
        )
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.personId, row.charge.personId),
          ),
        )
        .orderBy(asc(schema.playerGuardians.createdAt));
      const guardian = guardians
        .map((g) => (g.direct?.personId ? g.direct : g.byAccount?.personId ? g.byAccount : null))
        .find((g): g is AccountingPartyRecord => g !== null);

      const orders = await db()
        .select({ id: schema.storeOrders.id, number: schema.storeOrders.number })
        .from(schema.storeOrders)
        .where(
          and(
            eq(schema.storeOrders.organizationId, scope.organizationId),
            eq(schema.storeOrders.chargeId, chargeId),
          ),
        )
        .limit(1);
      let storeOrder: ChargeDocumentSource["storeOrder"] = null;
      if (orders[0]) {
        const items = await db()
          .select({
            name: schema.storeOrderItems.productName,
            variant: schema.storeOrderItems.variantLabel,
            quantity: schema.storeOrderItems.quantity,
            unitPriceCents: schema.storeOrderItems.unitPriceCents,
          })
          .from(schema.storeOrderItems)
          .where(eq(schema.storeOrderItems.orderId, orders[0].id))
          .orderBy(asc(schema.storeOrderItems.createdAt));
        storeOrder = { number: orders[0].number, items };
      }

      return {
        id: row.charge.id,
        concept: row.charge.concept,
        periodLabel: row.charge.periodLabel,
        amountCents: row.charge.amountCents,
        dueOn: row.charge.dueOn,
        createdAt: row.charge.createdAt,
        status: row.charge.status,
        planName: row.planName,
        person: row.person,
        billTo: guardian ?? row.person,
        storeOrder,
      };
    },

    // --- Enlaces ---

    async linkOf(
      conn: AccountingConnectionRow,
      entity: AccountingEntity,
      localId: string,
    ): Promise<{ status: AccountingLinkStatus; externalId: string | null } | null> {
      const rows = await db()
        .select({ status: L.status, externalId: L.externalId })
        .from(L)
        .where(linkOn(L, conn, entity, localId))
        .limit(1);
      return rows[0]
        ? { status: rows[0].status as AccountingLinkStatus, externalId: rows[0].externalId }
        : null;
    },

    /**
     * Reserva el envío de algo. Gana quien crea el enlace o quien retoma uno fallido, perdido o
     * (para documentos) anulado. Si otro lo está mandando ahora, no se reserva.
     */
    async claim(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      entity: AccountingEntity,
      localId: string,
    ): Promise<boolean> {
      const inserted = await db()
        .insert(L)
        .values({
          organizationId: scope.organizationId,
          connectionId: conn.id,
          entity,
          localId,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: L.id });
      if (inserted.length > 0) return true;
      const taken = await db()
        .update(L)
        .set({ status: "pending", externalId: null, externalNumber: null })
        .where(
          and(
            linkOn(L, conn, entity, localId),
            or(
              and(eq(L.status, "failed"), isNull(L.externalId)),
              and(eq(L.status, "pending"), stale),
              ...(entity === "document" ? [eq(L.status, "cancelled")] : []),
            ),
          ),
        )
        .returning({ id: L.id });
      return taken.length > 0;
    },

    async succeed(
      conn: AccountingConnectionRow,
      entity: AccountingEntity,
      localId: string,
      externalId: string,
      extra: { number?: string | null; documentType?: AccountingDocumentType } = {},
    ): Promise<void> {
      await db()
        .update(L)
        .set({
          status: "synced",
          externalId,
          externalNumber: extra.number ?? null,
          documentType: extra.documentType ?? null,
          attempts: 0,
          lastError: null,
          syncedAt: new Date(),
        })
        .where(linkOn(L, conn, entity, localId));
    },

    async fail(
      conn: AccountingConnectionRow,
      entity: AccountingEntity,
      localId: string,
      error: string,
    ): Promise<void> {
      await db()
        .update(L)
        .set({
          status: sql`case when ${L.externalId} is null then 'failed' else ${L.status} end`,
          attempts: sql`${L.attempts} + 1`,
          lastError: error.slice(0, 500),
        })
        .where(linkOn(L, conn, entity, localId));
    },

    /**
     * Deja un aviso en un enlace ya enviado sin cambiar su estado (aprobar o anular que falló).
     * `final`: no tiene arreglo desde aquí y no se reintenta solo.
     */
    async warn(
      conn: AccountingConnectionRow,
      entity: AccountingEntity,
      localId: string,
      error: string,
      final = false,
    ): Promise<void> {
      await db()
        .update(L)
        .set({
          attempts: final ? ACCOUNTING_MAX_ATTEMPTS : sql`${L.attempts} + 1`,
          lastError: error.slice(0, 500),
        })
        .where(linkOn(L, conn, entity, localId));
    },

    async setNumber(conn: AccountingConnectionRow, chargeId: string, number: string) {
      await db()
        .update(L)
        .set({ externalNumber: number })
        .where(linkOn(L, conn, "document", chargeId));
    },

    /** Suelta una reserva sin contar intento: la tanda se paró antes de llegar a mandarlo. */
    async release(conn: AccountingConnectionRow, entity: AccountingEntity, localId: string) {
      await db()
        .delete(L)
        .where(
          and(linkOn(L, conn, entity, localId), eq(L.status, "pending"), isNull(L.externalId)),
        );
    },

    async markCancelled(conn: AccountingConnectionRow, chargeId: string): Promise<void> {
      await db()
        .update(L)
        .set({ status: "cancelled", attempts: 0, lastError: null, syncedAt: new Date() })
        .where(linkOn(L, conn, "document", chargeId));
    },

    /** Vuelve a poner en cola lo que agotó sus intentos o dejó aviso. */
    async retryFailed(scope: OrgScope, conn: AccountingConnectionRow): Promise<number> {
      const rows = await db()
        .update(L)
        .set({ attempts: 0, lastError: null })
        .where(
          and(
            eq(L.organizationId, scope.organizationId),
            eq(L.connectionId, conn.id),
            or(eq(L.status, "failed"), isNotNull(L.lastError)),
          ),
        )
        .returning({ id: L.id });
      return rows.length;
    },

    /** Estado del documento de cada cargo, para la lista de cuotas. */
    async documentLinks(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      chargeIds: string[],
    ): Promise<
      Map<string, { status: AccountingLinkStatus; number: string | null; failing: boolean }>
    > {
      const map = new Map<
        string,
        { status: AccountingLinkStatus; number: string | null; failing: boolean }
      >();
      if (chargeIds.length === 0) return map;
      const rows = await db()
        .select({
          localId: L.localId,
          status: L.status,
          number: L.externalNumber,
          error: L.lastError,
        })
        .from(L)
        .where(
          and(
            eq(L.organizationId, scope.organizationId),
            eq(L.connectionId, conn.id),
            eq(L.entity, "document"),
            inArray(L.localId, chargeIds),
          ),
        );
      for (const r of rows)
        map.set(r.localId, {
          status: r.status as AccountingLinkStatus,
          number: r.number,
          failing: r.error !== null,
        });
      return map;
    },

    /** Lo que la herramienta ha rechazado, con su motivo y en palabras del club. */
    async issues(
      scope: OrgScope,
      conn: AccountingConnectionRow,
      limit = 50,
    ): Promise<AccountingIssueRecord[]> {
      const failing = and(
        eq(L.organizationId, scope.organizationId),
        eq(L.connectionId, conn.id),
        or(eq(L.status, "failed"), isNotNull(L.lastError)),
      );
      const name = sql<string>`${schema.people.firstName} || ' ' || ${schema.people.lastName}`;
      const [contacts, documents, pays] = await Promise.all([
        db()
          .select({ link: L, label: name })
          .from(L)
          .innerJoin(schema.people, eq(schema.people.id, L.localId))
          .where(and(failing, eq(L.entity, "contact")))
          .orderBy(desc(L.updatedAt))
          .limit(limit),
        db()
          .select({ link: L, label: sql<string>`${C.concept} || ' · ' || ${name}` })
          .from(L)
          .innerJoin(C, eq(C.id, L.localId))
          .innerJoin(schema.people, eq(schema.people.id, C.personId))
          .where(and(failing, eq(L.entity, "document")))
          .orderBy(desc(L.updatedAt))
          .limit(limit),
        db()
          .select({
            link: L,
            label: sql<string>`${C.concept} || ' · ' || ${name}`,
            amount: P.amountCents,
          })
          .from(L)
          .innerJoin(P, eq(P.id, L.localId))
          .innerJoin(C, eq(C.id, P.chargeId))
          .innerJoin(schema.people, eq(schema.people.id, C.personId))
          .where(and(failing, eq(L.entity, "payment")))
          .orderBy(desc(L.updatedAt))
          .limit(limit),
      ]);
      return [...contacts, ...documents, ...pays]
        .map(({ link, label }) => ({
          entity: link.entity as AccountingEntity,
          localId: link.localId,
          label,
          error: link.lastError,
          attempts: link.attempts,
          updatedAt: link.updatedAt,
        }))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit);
    },
  };
}

export type AccountingRepo = ReturnType<typeof accountingRepo>;
