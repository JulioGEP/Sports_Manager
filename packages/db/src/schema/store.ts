import {
  STORE_ORDER_CHANNELS,
  STORE_ORDER_STATUSES,
  STORE_PRODUCT_CATEGORIES,
  STORE_PRODUCT_STATUSES,
  STORE_PRODUCT_VISIBILITIES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { feeCharges } from "./fees.ts";
import { organizations } from "./organizations.ts";
import { people } from "./people.ts";
import { sections, teams } from "./structure.ts";

/**
 * Tienda del club (ADR 0041). Productos con opciones (tallas) y su stock, y pedidos para una
 * persona. El cobro de un pedido es un cargo de cuotas (`fee_charges`): mismo pago a mano o por
 * Stripe, mismo webhook. Importes en céntimos. Todo lleva `organization_id` (ADR 0015).
 */
export const storeProducts = pgTable(
  "store_products",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Precio para quien tiene tarifa activa o es socio (ADR 0049). Nulo: el mismo para todos. */
    memberPriceCents: integer("member_price_cents"),
    /** Clave de la foto en Netlify Blobs (store `store-images`). */
    imageBlobKey: text("image_blob_key"),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("members"),
    /** A quién se vende en la app: todo el club (los dos nulos), una sección o un equipo. */
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    availableUntil: date("available_until"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("store_products_organization_id_idx").on(t.organizationId),
    index("store_products_org_status_idx").on(t.organizationId, t.status),
    check("store_products_category_check", inList(t.category, STORE_PRODUCT_CATEGORIES)),
    check("store_products_status_check", inList(t.status, STORE_PRODUCT_STATUSES)),
    check("store_products_visibility_check", inList(t.visibility, STORE_PRODUCT_VISIBILITIES)),
    check("store_products_price_check", sql`${t.priceCents} >= 0`),
    check(
      "store_products_member_price_check",
      sql`${t.memberPriceCents} is null or ${t.memberPriceCents} between 0 and ${t.priceCents}`,
    ),
    check("store_products_audience_check", sql`${t.sectionId} is null or ${t.teamId} is null`),
  ],
);

/** Una opción del producto: una talla, un turno. Sin etiqueta, el producto no tiene opciones. */
export const storeProductVariants = pgTable(
  "store_product_variants",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => storeProducts.id, { onDelete: "cascade" }),
    label: text("label"),
    /** Unidades disponibles. Nulo: sin límite. */
    stock: integer("stock"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("store_product_variants_organization_id_idx").on(t.organizationId),
    index("store_product_variants_product_id_idx").on(t.productId),
    check("store_product_variants_stock_check", sql`${t.stock} is null or ${t.stock} >= 0`),
  ],
);

export const storeOrders = pgTable(
  "store_orders",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Correlativo por club: `T-0012`. */
    number: integer("number").notNull(),
    /** Para quién es: el deportista menor o el propio adulto. */
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    placedBy: uuid("placed_by").references(() => users.id, { onDelete: "set null" }),
    channel: text("channel").notNull().default("app"),
    status: text("status").notNull().default("pending"),
    totalCents: integer("total_cents").notNull(),
    note: text("note"),
    /** El cargo de cuotas con el que se cobra. Nulo en un pedido de importe cero. */
    chargeId: uuid("charge_id").references(() => feeCharges.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("store_orders_org_number_unique").on(t.organizationId, t.number),
    index("store_orders_organization_id_idx").on(t.organizationId),
    index("store_orders_person_id_idx").on(t.personId),
    index("store_orders_charge_id_idx").on(t.chargeId),
    check("store_orders_status_check", inList(t.status, STORE_ORDER_STATUSES)),
    check("store_orders_channel_check", inList(t.channel, STORE_ORDER_CHANNELS)),
    check("store_orders_total_check", sql`${t.totalCents} >= 0`),
    check("store_orders_number_check", sql`${t.number} >= 1`),
  ],
);

/** Una línea del pedido. Guarda nombre, opción y precio de cuando se compró. */
export const storeOrderItems = pgTable(
  "store_order_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => storeOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => storeProducts.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => storeProductVariants.id, {
      onDelete: "set null",
    }),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (t) => [
    index("store_order_items_organization_id_idx").on(t.organizationId),
    index("store_order_items_order_id_idx").on(t.orderId),
    index("store_order_items_variant_id_idx").on(t.variantId),
    check("store_order_items_quantity_check", sql`${t.quantity} >= 1`),
    check("store_order_items_price_check", sql`${t.unitPriceCents} >= 0`),
  ],
);
