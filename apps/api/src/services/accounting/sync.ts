import {
  netUnitPrice,
  storeOrderCode,
  type Locale,
  type PaymentMethod,
} from "@sportsmanager/shared";
import {
  localDate,
  type AccountingConnectionRow,
  type AccountingPartyRecord,
  type ChargeDocumentSource,
  type DataLayer,
  type OrgScope,
  type PaymentSource,
} from "../../data/index.ts";
import {
  AccountingProviderError,
  type AccountingConnector,
  type DocumentInput,
  type DocumentLine,
} from "./provider.ts";

/**
 * Motor de sincronización con la herramienta de contabilidad (ADR 0042). Una tanda manda, por
 * este orden, las anulaciones (cargos anulados con documento allí), los documentos (cargos sin
 * documento, cada uno con su contacto) y los pagos (de cargos ya enviados). Cada cosa se reserva
 * antes de mandarla, así dos tandas a la vez no la duplican. La tanda se corta por tiempo y por
 * número de cosas (Holded admite 100 peticiones por minuto) y dice cuánto queda. Un rechazo de la
 * herramienta deja el enlace fallido con su motivo y sigue; un fallo de la conexión (clave, límite,
 * caída) para la tanda.
 */
export interface SyncContext {
  data: DataLayer;
  scope: OrgScope;
  connection: AccountingConnectionRow;
  connector: AccountingConnector;
  locale: Locale;
  timezone: string;
}

export interface SyncOptions {
  /** Solo lo de este cargo: el envío inmediato tras cobrar, emitir o anular. */
  chargeId?: string;
  /** Cosas por tanda. Cada una son de una a cuatro peticiones. */
  maxItems?: number;
  /** Tiempo de la tanda en milisegundos: por debajo del límite de la función. */
  deadlineMs?: number;
  /**
   * Peticiones a la herramienta por tanda. Holded admite 100 por minuto y clave: con 45, dos
   * tandas seguidas caben en un minuto y la tercera, si llega antes, espera lo que pida Holded.
   */
  maxCalls?: number;
  now?: () => number;
}

export interface SyncResult {
  created: { contacts: number; documents: number; payments: number };
  cancelled: number;
  failed: number;
  remaining: number;
  done: boolean;
  /** Lo que paró la tanda, si algo la paró. */
  stoppedBy: AccountingProviderError | null;
  /** Si la herramienta pidió esperar (límite de peticiones), cuántos segundos antes de seguir. */
  retryAfterSeconds: number | null;
}

/** Peticiones que puede gastar una sola cosa: buscar el contacto dos veces, crearlo, el documento y aprobarlo. */
const CALLS_PER_ITEM = 6;

const METHOD_LABELS: Record<Locale, Record<PaymentMethod, string>> = {
  es: {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    stripe: "Stripe (pago en línea)",
    other: "Otro",
  },
  ca: {
    cash: "Efectiu",
    transfer: "Transferència",
    card: "Targeta",
    stripe: "Stripe (pagament en línia)",
    other: "Altres",
  },
  en: {
    cash: "Cash",
    transfer: "Bank transfer",
    card: "Card",
    stripe: "Stripe (online payment)",
    other: "Other",
  },
};

const ORDER_LABEL: Record<Locale, string> = { es: "Pedido", ca: "Comanda", en: "Order" };

export async function runSync(ctx: SyncContext, options: SyncOptions = {}): Promise<SyncResult> {
  const { data, scope, connection: conn } = ctx;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + (options.deadlineMs ?? 8_000);
  let budget = options.maxItems ?? 20;
  const maxCalls = options.maxCalls ?? 45;
  let calls = 0;
  const connector = countingCalls(ctx.connector, () => {
    calls += 1;
  });
  const result: SyncResult = {
    created: { contacts: 0, documents: 0, payments: 0 },
    cancelled: 0,
    failed: 0,
    remaining: 0,
    done: false,
    stoppedBy: null,
    retryAfterSeconds: null,
  };
  let processed = 0;
  const canContinue = () => budget > 0 && now() < deadline && calls + CALLS_PER_ITEM <= maxCalls;
  const take = () => {
    budget -= 1;
    processed += 1;
  };

  /** El contacto de quien paga: el que ya enlazamos, uno que ya exista allí o uno nuevo. */
  async function ensureContact(party: AccountingPartyRecord): Promise<string | null> {
    const link = await data.accounting.linkOf(conn, "contact", party.personId);
    if (link?.status === "synced" && link.externalId) return link.externalId;
    if (!(await data.accounting.claim(scope, conn, "contact", party.personId))) return null;
    try {
      const existing = await connector.findContact({
        nationalId: party.nationalId,
        email: party.email,
      });
      const id =
        existing ??
        (await connector.createContact({
          name: fullName(party),
          email: party.email,
          phone: party.phone,
          nationalId: party.nationalId,
        }));
      await data.accounting.succeed(conn, "contact", party.personId, id);
      if (!existing) result.created.contacts += 1;
      return id;
    } catch (error) {
      if (error instanceof AccountingProviderError && !error.stopsRun) {
        await data.accounting.fail(conn, "contact", party.personId, error.message);
        throw new AccountingProviderError(
          "rejected",
          `Contacto de ${fullName(party)}: ${error.message}`,
          error.status,
        );
      }
      await data.accounting.release(conn, "contact", party.personId);
      throw error;
    }
  }

  async function sendDocument(chargeId: string): Promise<void> {
    const source = await data.accounting.chargeForDocument(scope, chargeId);
    if (!source || source.status === "cancelled") return;
    if (!(await data.accounting.claim(scope, conn, "document", chargeId))) return;
    let created = false;
    try {
      const contactId = await ensureContact(source.billTo);
      if (!contactId) {
        // Otra tanda está dando de alta a esta persona: el documento sale en la siguiente.
        await data.accounting.release(conn, "document", chargeId);
        return;
      }
      const input = documentFor(ctx, source, contactId);
      const doc = await connector.createDocument(input);
      await data.accounting.succeed(conn, "document", chargeId, doc.id, {
        number: doc.number,
        documentType: input.type,
      });
      created = true;
      result.created.documents += 1;
      if (conn.approveDocuments) {
        try {
          const number = await connector.approveDocument(input.type, doc.id);
          if (number) await data.accounting.setNumber(conn, chargeId, number);
        } catch (error) {
          if (!(error instanceof AccountingProviderError)) throw error;
          await data.accounting.warn(
            conn,
            "document",
            chargeId,
            `Creado en borrador, sin aprobar: ${error.message}`,
            true,
          );
          if (error.stopsRun) throw error;
        }
      }
    } catch (error) {
      if (created) throw error;
      if (error instanceof AccountingProviderError && !error.stopsRun) {
        await data.accounting.fail(conn, "document", chargeId, error.message);
        result.failed += 1;
        return;
      }
      await data.accounting.release(conn, "document", chargeId);
      throw error;
    }
  }

  async function sendCancellation(item: {
    chargeId: string;
    externalId: string;
    type: DocumentInput["type"];
  }): Promise<void> {
    try {
      const outcome = await connector.cancelDocument(item.type, item.externalId);
      if (outcome === "cancelled") {
        await data.accounting.markCancelled(conn, item.chargeId);
        result.cancelled += 1;
        return;
      }
      await data.accounting.warn(
        conn,
        "document",
        item.chargeId,
        "El cargo está anulado, pero el documento ya está aprobado o cobrado en la herramienta: anúlalo allí con una rectificativa.",
        true,
      );
      result.failed += 1;
    } catch (error) {
      if (error instanceof AccountingProviderError && !error.stopsRun) {
        await data.accounting.warn(conn, "document", item.chargeId, error.message);
        result.failed += 1;
        return;
      }
      throw error;
    }
  }

  async function sendPayment(payment: PaymentSource): Promise<void> {
    if (!(await data.accounting.claim(scope, conn, "payment", payment.id))) return;
    try {
      const id = await connector.recordPayment({
        documentType: payment.document.type,
        documentId: payment.document.externalId,
        amountCents: payment.amountCents,
        date: payment.paidOn,
        treasuryId: conn.treasuryAccounts[payment.method] ?? null,
        description: METHOD_LABELS[ctx.locale][payment.method],
      });
      // Si la herramienta no da id del pago, el enlace apunta a su documento.
      await data.accounting.succeed(conn, "payment", payment.id, id ?? payment.document.externalId);
      result.created.payments += 1;
    } catch (error) {
      if (error instanceof AccountingProviderError && !error.stopsRun) {
        await data.accounting.fail(conn, "payment", payment.id, error.message);
        result.failed += 1;
        return;
      }
      await data.accounting.release(conn, "payment", payment.id);
      throw error;
    }
  }

  try {
    if (conn.status === "active") {
      const only = options.chargeId;
      for (const item of await data.accounting.cancellationsToSend(scope, conn, budget, only)) {
        if (!canContinue()) break;
        take();
        await sendCancellation(item);
      }
      if (canContinue()) {
        for (const id of await data.accounting.documentsToSend(scope, conn, budget, only)) {
          if (!canContinue()) break;
          take();
          await sendDocument(id);
        }
      }
      if (canContinue()) {
        for (const payment of await data.accounting.paymentsToSend(scope, conn, budget, only)) {
          if (!canContinue()) break;
          take();
          await sendPayment(payment);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof AccountingProviderError)) throw error;
    result.stoppedBy = error;
    if (error.reason === "rate_limited") result.retryAfterSeconds = error.retryAfterSeconds ?? 60;
  }

  result.remaining = await data.accounting.pendingTotal(scope, conn);
  // Pedir esperar no es acabar: tras la espera, la siguiente tanda sigue donde se quedó esta.
  const waiting = result.retryAfterSeconds !== null && result.remaining > 0;
  result.done =
    !waiting &&
    (conn.status !== "active" ||
      result.remaining === 0 ||
      processed === 0 ||
      result.stoppedBy !== null ||
      Boolean(options.chargeId));
  // El envío inmediato de un cargo no borra el aviso de una tanda anterior que falló.
  if (!options.chargeId || result.stoppedBy) {
    await data.accounting.connection.recordRun(scope, result.stoppedBy?.message ?? null);
  }
  return result;
}

/** El mismo conector, contando cada petición que sale hacia la herramienta. */
function countingCalls(connector: AccountingConnector, onCall: () => void): AccountingConnector {
  return new Proxy(connector, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        onCall();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

function fullName(party: { firstName: string; lastName: string }): string {
  return `${party.firstName} ${party.lastName}`.trim();
}

/** El documento de un cargo: una línea por cargo, o las líneas del pedido de la tienda. */
export function documentFor(
  ctx: Pick<SyncContext, "connection" | "locale" | "timezone">,
  source: ChargeDocumentSource,
  contactId: string,
  today: string = localDate(ctx.timezone, new Date()),
): DocumentInput {
  const conn = ctx.connection;
  const taxKeys = conn.taxKey ? [conn.taxKey] : [];
  const athlete = fullName(source.person);
  const paidByFamily = source.billTo.personId !== source.person.personId;
  const order = source.storeOrder;
  const orderTotal = order?.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  let lines: DocumentLine[];
  if (order && order.items.length > 0 && orderTotal === source.amountCents) {
    const reference = `${ORDER_LABEL[ctx.locale]} ${storeOrderCode(order.number)}`;
    lines = order.items.map((item) => ({
      name: item.variant ? `${item.name} · ${item.variant}` : item.name,
      description: paidByFamily ? `${reference} · ${athlete}` : reference,
      units: item.quantity,
      unitPrice: netUnitPrice(item.unitPriceCents, conn.taxRateBp),
      taxKeys,
    }));
  } else {
    lines = [
      {
        name: source.concept,
        description:
          [paidByFamily ? athlete : null, source.periodLabel].filter(Boolean).join(" · ") || null,
        units: 1,
        unitPrice: netUnitPrice(source.amountCents, conn.taxRateBp),
        taxKeys,
      },
    ];
  }
  return {
    type: conn.documentType === "sales_receipt" ? "sales_receipt" : "invoice",
    contactId,
    contactName: fullName(source.billTo),
    // Se emite hoy: un documento con fecha pasada rompería el orden de la serie.
    date: today,
    dueDate: source.dueOn > today ? source.dueOn : today,
    description: source.concept,
    lines,
    language: ctx.locale,
    numberingSeriesId: conn.numberingSeriesId,
    notes: `${athlete} · ref. ${source.id}`,
    tags: [order ? "tienda" : "cuotas"],
  };
}
