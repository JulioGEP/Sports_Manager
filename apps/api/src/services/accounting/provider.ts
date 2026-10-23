import type { AccountingDocumentType, AccountingProvider, Locale } from "@sportsmanager/shared";

/**
 * Conector de contabilidad (ADR 0042). La API habla con esta interfaz y el conector concreto
 * (Holded hoy) traduce a su API. Como los proveedores de cobro y de email: un fichero por
 * proveedor, `fetch` directo y sin SDK, y todo sustituible en tests.
 */

export interface ContactInput {
  name: string;
  email: string | null;
  phone: string | null;
  /** NIF o documento de la persona: con él la herramienta puede emitir factura completa. */
  nationalId: string | null;
}

export interface DocumentLine {
  name: string;
  description: string | null;
  units: number;
  /** Precio unitario sin impuesto. */
  unitPrice: number;
  taxKeys: string[];
}

export interface DocumentInput {
  type: AccountingDocumentType;
  contactId: string;
  contactName: string;
  /** Fecha de emisión y vencimiento, `AAAA-MM-DD`. */
  date: string;
  dueDate: string;
  description: string;
  lines: DocumentLine[];
  language: Locale;
  numberingSeriesId: string | null;
  notes: string | null;
  tags: string[];
}

export interface CreatedDocument {
  id: string;
  /** Número del documento, si la herramienta lo da al crearlo o al aprobarlo. */
  number: string | null;
}

export interface PaymentInput {
  documentType: AccountingDocumentType;
  documentId: string;
  amountCents: number;
  date: string;
  treasuryId: string | null;
  description: string;
}

export interface AccountingTaxOption {
  key: string;
  name: string;
  ratePercent: number;
}

export interface AccountingConnector {
  readonly provider: AccountingProvider;
  /** Comprueba la clave contra la herramienta y devuelve el nombre de la cuenta si lo da. */
  verify(): Promise<{ accountName: string | null }>;
  /** Busca un contacto que ya exista (por documento o por email) para no duplicarlo. */
  findContact(by: { nationalId: string | null; email: string | null }): Promise<string | null>;
  createContact(input: ContactInput): Promise<string>;
  createDocument(input: DocumentInput): Promise<CreatedDocument>;
  /** Aprueba el documento (queda numerado y cerrado) y devuelve su número si lo da. */
  approveDocument(type: AccountingDocumentType, id: string): Promise<string | null>;
  recordPayment(input: PaymentInput): Promise<string | null>;
  /** Anula el documento. `locked` si la herramienta no deja (ya aprobado o cobrado). */
  cancelDocument(type: AccountingDocumentType, id: string): Promise<"cancelled" | "locked">;
  listTaxes(): Promise<AccountingTaxOption[]>;
  listNumberingSeries(
    type: AccountingDocumentType,
  ): Promise<{ id: string; name: string; format: string }[]>;
  listTreasuryAccounts(): Promise<{ id: string; name: string; type: string }[]>;
}

export type AccountingErrorReason =
  /** La clave no vale o le faltan permisos: hay que volver a conectar. */
  | "unauthorized"
  /** Demasiadas peticiones: se para la tanda y se sigue más tarde. */
  | "rate_limited"
  /** La herramienta rechaza el dato (validación): el enlace queda fallido con su motivo. */
  | "rejected"
  | "not_found"
  /** No responde o responde con error propio: se reintenta. */
  | "unavailable";

export class AccountingProviderError extends Error {
  constructor(
    readonly reason: AccountingErrorReason,
    message: string,
    readonly status: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "AccountingProviderError";
  }

  /** Errores que afectan a toda la conexión, no a un dato: la tanda se para. */
  get stopsRun(): boolean {
    return (
      this.reason === "unauthorized" ||
      this.reason === "rate_limited" ||
      this.reason === "unavailable"
    );
  }
}
