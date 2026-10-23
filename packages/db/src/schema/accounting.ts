import {
  ACCOUNTING_CONNECTION_STATUSES,
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_ENTITIES,
  ACCOUNTING_LINK_STATUSES,
  ACCOUNTING_PROVIDERS,
  type AccountingTreasuryMap,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

/**
 * Conectores de contabilidad (ADR 0042). Una conexión por club con su herramienta (Holded): la
 * clave de API cifrada (AES-GCM con el secreto de integraciones de la plataforma, nunca en claro)
 * y cómo se mandan los cargos. Los enlaces dicen qué persona, cargo o pago está ya allí y con qué
 * identificador: así nada se manda dos veces. Borrar la conexión borra sus enlaces.
 */
export const accountingConnections = pgTable(
  "accounting_connections",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("active"),
    /** `v1.<iv>.<cifrado>` en base64url, con el id del club como dato asociado. */
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyHint: text("api_key_hint").notNull(),
    accountName: text("account_name"),
    documentType: text("document_type").notNull().default("invoice"),
    /** Impuesto de las líneas en la herramienta y su tipo en puntos básicos (21 % = 2100). */
    taxKey: text("tax_key"),
    taxName: text("tax_name"),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    numberingSeriesId: text("numbering_series_id"),
    approveDocuments: boolean("approve_documents").notNull().default(false),
    treasuryAccounts: jsonb("treasury_accounts")
      .$type<AccountingTreasuryMap>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    syncFrom: date("sync_from").notNull().defaultNow(),
    autoSync: boolean("auto_sync").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("accounting_connections_organization_unique").on(t.organizationId),
    check("accounting_connections_provider_check", inList(t.provider, ACCOUNTING_PROVIDERS)),
    check("accounting_connections_status_check", inList(t.status, ACCOUNTING_CONNECTION_STATUSES)),
    check(
      "accounting_connections_document_type_check",
      inList(t.documentType, ACCOUNTING_DOCUMENT_TYPES),
    ),
    check(
      "accounting_connections_tax_rate_check",
      sql`${t.taxRateBp} >= 0 and ${t.taxRateBp} <= 10000`,
    ),
  ],
);

export const accountingLinks = pgTable(
  "accounting_links",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => accountingConnections.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    /** Id de la persona, el cargo o el pago en la app. */
    localId: uuid("local_id").notNull(),
    externalId: text("external_id"),
    /** Número del documento en la herramienta (F260012), cuando lo da. */
    externalNumber: text("external_number"),
    /** Qué documento se emitió (factura o ticket): sus pagos y su anulación van a esa ruta. */
    documentType: text("document_type"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("accounting_links_connection_entity_local_unique").on(
      t.connectionId,
      t.entity,
      t.localId,
    ),
    index("accounting_links_organization_id_idx").on(t.organizationId),
    index("accounting_links_connection_status_idx").on(t.connectionId, t.status),
    check("accounting_links_entity_check", inList(t.entity, ACCOUNTING_ENTITIES)),
    check("accounting_links_status_check", inList(t.status, ACCOUNTING_LINK_STATUSES)),
    check("accounting_links_attempts_check", sql`${t.attempts} >= 0`),
    check(
      "accounting_links_document_type_check",
      sql`${t.documentType} is null or ${inList(t.documentType, ACCOUNTING_DOCUMENT_TYPES)}`,
    ),
    check(
      "accounting_links_synced_external_check",
      sql`${t.status} not in ('synced', 'cancelled') or ${t.externalId} is not null`,
    ),
  ],
);
