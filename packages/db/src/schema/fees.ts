import {
  FEE_CHARGE_STATUSES,
  FEE_PERIODS,
  FEE_PLAN_STATUSES,
  PAYMENT_METHODS,
  PLAN_ENTITLEMENTS,
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
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { memberTypes, people } from "./people.ts";
import { sections } from "./structure.ts";

/**
 * Cuotas y cobros (Bloque 18). Importes en céntimos. Un plan dice cuánto y cada cuánto; un cargo
 * es lo que una persona debe por un periodo; un pago es lo que entró, a mano o por Stripe.
 */
export const feePlans = pgTable(
  "fee_plans",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    period: text("period").notNull(),
    memberTypeId: uuid("member_type_id").references(() => memberTypes.id, {
      onDelete: "set null",
    }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    description: text("description"),
    status: text("status").notNull().default("active"),
    /** Derecho de uso (ADR 0049): qué clases da la tarifa. `none`: una cuota sin reservas. */
    entitlement: text("entitlement").notNull().default("none"),
    sessions: integer("sessions"),
    validityDays: integer("validity_days"),
    /** Tipos de clase que incluye. Nulo: todos. */
    classTeamIds: jsonb("class_team_ids").$type<string[]>(),
    /** Planificación (ADR 0053): la tarifa incluye Clase+, el trabajo extra del Open Box. */
    includesPlus: boolean("includes_plus").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("fee_plans_organization_id_idx").on(t.organizationId),
    check("fee_plans_period_check", inList(t.period, FEE_PERIODS)),
    check("fee_plans_status_check", inList(t.status, FEE_PLAN_STATUSES)),
    check("fee_plans_amount_check", sql`${t.amountCents} >= 0`),
    check("fee_plans_entitlement_check", inList(t.entitlement, PLAN_ENTITLEMENTS)),
    check(
      "fee_plans_sessions_check",
      sql`${t.entitlement} not in ('per_week', 'per_month', 'pack') or ${t.sessions} >= 1`,
    ),
  ],
);

export const feeCharges = pgTable(
  "fee_charges",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    feePlanId: uuid("fee_plan_id").references(() => feePlans.id, { onDelete: "set null" }),
    concept: text("concept").notNull(),
    periodLabel: text("period_label"),
    amountCents: integer("amount_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    dueOn: date("due_on").notNull(),
    status: text("status").notNull().default("pending"),
    /** Stripe Checkout (Bloque 18): sesión y pago, cuando el club cobra por Stripe. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("fee_charges_organization_id_idx").on(t.organizationId),
    index("fee_charges_person_id_idx").on(t.personId),
    index("fee_charges_org_status_due_idx").on(t.organizationId, t.status, t.dueOn),
    check("fee_charges_status_check", inList(t.status, FEE_CHARGE_STATUSES)),
    check("fee_charges_amount_check", sql`${t.amountCents} >= 1`),
    check("fee_charges_paid_check", sql`${t.paidCents} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => feeCharges.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull(),
    paidOn: date("paid_on").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    /** Referencia del proveedor (id del pago de Stripe) para no registrar dos veces el mismo. */
    providerRef: text("provider_ref").unique(),
    ...timestamps,
  },
  (t) => [
    index("payments_organization_id_idx").on(t.organizationId),
    index("payments_charge_id_idx").on(t.chargeId),
    check("payments_method_check", inList(t.method, PAYMENT_METHODS)),
    check("payments_amount_check", sql`${t.amountCents} >= 1`),
  ],
);
