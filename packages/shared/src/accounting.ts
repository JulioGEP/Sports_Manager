import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod } from "./fees.ts";
import { DateOnlySchema } from "./structure.ts";

/**
 * Conectores de contabilidad (ADR 0042). El club lleva sus cuotas en la app y su contabilidad en
 * una herramienta de facturación (Holded, de momento). El conector manda allí, sin teclear dos
 * veces, a quién se cobra (contacto), qué se le cobra (factura o ticket por cada cargo) y lo que
 * entra (cada pago, a mano o por Stripe). La app es la fuente: nada vuelve de la herramienta.
 */

export const ACCOUNTING_PROVIDERS = ["holded"] as const;
export type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];
export const AccountingProviderSchema = z.enum(ACCOUNTING_PROVIDERS);

/** Activa: sincroniza. En pausa: no manda nada, pero guarda lo ya enviado y la clave. */
export const ACCOUNTING_CONNECTION_STATUSES = ["active", "paused"] as const;
export type AccountingConnectionStatus = (typeof ACCOUNTING_CONNECTION_STATUSES)[number];

/**
 * Qué documento sale por cada cargo. `invoice`: factura completa, con los datos fiscales del
 * contacto. `sales_receipt`: ticket (factura simplificada), para importes pequeños sin NIF.
 */
export const ACCOUNTING_DOCUMENT_TYPES = ["invoice", "sales_receipt"] as const;
export type AccountingDocumentType = (typeof ACCOUNTING_DOCUMENT_TYPES)[number];

/** Lo que se enlaza con la herramienta: una persona (contacto), un cargo (documento) y un pago. */
export const ACCOUNTING_ENTITIES = ["contact", "document", "payment"] as const;
export type AccountingEntity = (typeof ACCOUNTING_ENTITIES)[number];

/**
 * Estado de cada enlace. `pending`: alguien lo está mandando ahora. `synced`: está allí.
 * `failed`: la herramienta lo rechazó; se reintenta hasta `ACCOUNTING_MAX_ATTEMPTS`.
 * `cancelled`: el documento se anuló allí porque el cargo se anuló aquí.
 */
export const ACCOUNTING_LINK_STATUSES = ["pending", "synced", "failed", "cancelled"] as const;
export type AccountingLinkStatus = (typeof ACCOUNTING_LINK_STATUSES)[number];

/** A partir de aquí un enlace fallido deja de reintentarse solo: hace falta "Reintentar". */
export const ACCOUNTING_MAX_ATTEMPTS = 5;

/** Clave de API: la herramienta la da una vez; aquí se guarda cifrada y nunca vuelve a salir. */
export const AccountingConnectSchema = z.object({
  provider: AccountingProviderSchema,
  apiKey: z.string().trim().min(16).max(200),
});
export type AccountingConnect = z.infer<typeof AccountingConnectSchema>;

const ExternalId = z.string().trim().min(1).max(64);

/** Cuenta de tesorería de la herramienta en la que entra cada forma de pago. */
export const AccountingTreasuryMapSchema = z
  .object(
    Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ExternalId.nullable().optional()])) as Record<
      PaymentMethod,
      z.ZodOptional<z.ZodNullable<typeof ExternalId>>
    >,
  )
  .strict();
export type AccountingTreasuryMap = Partial<Record<PaymentMethod, string | null>>;

export const AccountingSettingsUpdateSchema = z
  .object({
    documentType: z.enum(ACCOUNTING_DOCUMENT_TYPES).optional(),
    /** Impuesto de la herramienta para las líneas. Nulo: sin impuesto (exento, art. 20.1.13 LIVA). */
    taxKey: ExternalId.nullable().optional(),
    /** Serie de numeración de la herramienta. Nula: la que tenga por defecto. */
    numberingSeriesId: ExternalId.nullable().optional(),
    /** Aprobar los documentos al crearlos (quedan numerados y cerrados) o dejarlos en borrador. */
    approveDocuments: z.boolean().optional(),
    treasuryAccounts: AccountingTreasuryMapSchema.optional(),
    /** Solo se mandan los cargos creados desde esta fecha. */
    syncFrom: DateOnlySchema.optional(),
    /** Mandar cada cargo y cada pago en cuanto ocurre, además de con "Sincronizar ahora". */
    autoSync: z.boolean().optional(),
    status: z.enum(ACCOUNTING_CONNECTION_STATUSES).optional(),
  })
  .strict();
export type AccountingSettingsUpdate = z.infer<typeof AccountingSettingsUpdateSchema>;

/** Tipo en puntos básicos (21 % = 2100): enteros en base, como los céntimos. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Precio unitario sin impuesto a partir de lo que paga la persona, que es el importe del cargo con
 * el impuesto dentro. Con cuatro decimales para que la herramienta, al sumar el impuesto, vuelva
 * al mismo total que en la app.
 */
export function netUnitPrice(grossCents: number, taxBasisPoints: number): number {
  const gross = grossCents / 100;
  if (taxBasisPoints <= 0) return gross;
  return Math.round((gross / (1 + taxBasisPoints / 10_000)) * 10_000) / 10_000;
}

/** Últimos caracteres de la clave, para reconocerla sin enseñarla. */
export function apiKeyHint(apiKey: string): string {
  const clean = apiKey.trim();
  return `…${clean.slice(-4)}`;
}
