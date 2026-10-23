import { z } from "zod";
import {
  ACCOUNTING_CONNECTION_STATUSES,
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_ENTITIES,
  ACCOUNTING_PROVIDERS,
} from "../accounting.ts";
import { PAYMENT_METHODS } from "../fees.ts";

/** Contratos de los conectores de contabilidad (ADR 0042). Lectura con `org.fees.read`. */

export const AccountingCountsSchema = z.object({
  contacts: z.number().int().nonnegative(),
  documents: z.number().int().nonnegative(),
  payments: z.number().int().nonnegative(),
  /** Cargos y pagos que tocaría mandar y aún no están allí. */
  pending: z.number().int().nonnegative(),
  /** Enlaces que la herramienta rechazó y esperan reintento o revisión. */
  failed: z.number().int().nonnegative(),
});
export type AccountingCounts = z.infer<typeof AccountingCountsSchema>;

export const AccountingTaxSchema = z.object({
  key: z.string(),
  name: z.string(),
  ratePercent: z.number(),
});
export type AccountingTax = z.infer<typeof AccountingTaxSchema>;

export const AccountingConnectionSchema = z.object({
  provider: z.enum(ACCOUNTING_PROVIDERS),
  status: z.enum(ACCOUNTING_CONNECTION_STATUSES),
  /** Nombre de la cuenta en la herramienta, si lo da al comprobar la clave. */
  accountName: z.string().nullable(),
  /** Final de la clave, para reconocerla. La clave nunca sale de la API. */
  apiKeyHint: z.string(),
  documentType: z.enum(ACCOUNTING_DOCUMENT_TYPES),
  tax: AccountingTaxSchema.nullable(),
  numberingSeriesId: z.string().nullable(),
  approveDocuments: z.boolean(),
  treasuryAccounts: z.partialRecord(z.enum(PAYMENT_METHODS), z.string()),
  syncFrom: z.string(),
  autoSync: z.boolean(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  connectedAt: z.string(),
  counts: AccountingCountsSchema,
});
export type AccountingConnection = z.infer<typeof AccountingConnectionSchema>;

export const AccountingStatusResponseSchema = z.object({
  /** La plataforma puede guardar claves cifradas (hay secreto de integraciones). */
  platformReady: z.boolean(),
  connection: AccountingConnectionSchema.nullable(),
});
export type AccountingStatusResponse = z.infer<typeof AccountingStatusResponseSchema>;

/** Lo que el club puede elegir, leído en directo de su cuenta de la herramienta. */
export const AccountingOptionsResponseSchema = z.object({
  taxes: z.array(AccountingTaxSchema),
  numberingSeries: z.array(z.object({ id: z.string(), name: z.string(), format: z.string() })),
  treasuryAccounts: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
});
export type AccountingOptionsResponse = z.infer<typeof AccountingOptionsResponseSchema>;

/** Una tanda de sincronización: lo que se ha mandado y lo que queda para la siguiente. */
export const AccountingSyncResponseSchema = z.object({
  created: z.object({
    contacts: z.number().int().nonnegative(),
    documents: z.number().int().nonnegative(),
    payments: z.number().int().nonnegative(),
  }),
  cancelled: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** No queda nada que mandar en esta tanda (o lo que queda ha fallado demasiadas veces). */
  done: z.boolean(),
  /** La herramienta pide esperar (límite de peticiones): segundos antes de la siguiente tanda. */
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
});
export type AccountingSyncResponse = z.infer<typeof AccountingSyncResponseSchema>;

export const AccountingIssueSchema = z.object({
  entity: z.enum(ACCOUNTING_ENTITIES),
  localId: z.string(),
  /** Qué es, en palabras del club: "Cuota de socio · Octubre 2026 · Pere Soci". */
  label: z.string(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type AccountingIssue = z.infer<typeof AccountingIssueSchema>;
export const AccountingIssuesResponseSchema = z.object({ issues: z.array(AccountingIssueSchema) });
export type AccountingIssuesResponse = z.infer<typeof AccountingIssuesResponseSchema>;

export const AccountingRetryResponseSchema = z.object({
  retried: z.number().int().nonnegative(),
});
