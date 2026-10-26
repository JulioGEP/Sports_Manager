import { z } from "zod";
import { PlanEntitlementFieldsSchema } from "./fitness.ts";
import { DateOnlySchema } from "./structure.ts";

/**
 * Cuotas y cobros (Bloque 18). Un plan de cuota dice cuánto y cada cuánto; un cargo es lo que
 * una persona debe por un periodo; un pago es lo que ha entrado, a mano (efectivo, transferencia)
 * o por Stripe. Los importes van en céntimos: nunca decimales en base.
 */

export const FEE_PERIODS = ["monthly", "quarterly", "yearly", "once"] as const;
export type FeePeriod = (typeof FEE_PERIODS)[number];
export const FeePeriodSchema = z.enum(FEE_PERIODS);
export const FEE_PLAN_STATUSES = ["active", "archived"] as const;
export type FeePlanStatus = (typeof FEE_PLAN_STATUSES)[number];

const ShortName = z.string().trim().min(1).max(60);
const Cents = z.number().int().min(0).max(100_000_000);

export const FeePlanCreateSchema = z
  .object({
    name: ShortName,
    amountCents: Cents,
    period: FeePeriodSchema,
    /** A quién va: a un tipo de socio, a una sección (deportistas), o a todos si no se indica. */
    memberTypeId: z.string().uuid().nullable().optional(),
    sectionId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(400).nullable().optional(),
  })
  .merge(PlanEntitlementFieldsSchema);
export type FeePlanCreate = z.infer<typeof FeePlanCreateSchema>;
export const FeePlanUpdateSchema = z
  .object({
    name: ShortName.optional(),
    amountCents: Cents.optional(),
    period: FeePeriodSchema.optional(),
    memberTypeId: z.string().uuid().nullable().optional(),
    sectionId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(400).nullable().optional(),
    status: z.enum(FEE_PLAN_STATUSES).optional(),
  })
  .merge(PlanEntitlementFieldsSchema);
export type FeePlanUpdate = z.infer<typeof FeePlanUpdateSchema>;

/** Un cargo nace pendiente; vencido se deduce de la fecha, pero se guarda para poder listarlo. */
export const FEE_CHARGE_STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;
export type FeeChargeStatus = (typeof FEE_CHARGE_STATUSES)[number];
export const FeeChargeStatusSchema = z.enum(FEE_CHARGE_STATUSES);

export const FeeChargeCreateSchema = z.object({
  personId: z.string().uuid(),
  feePlanId: z.string().uuid().nullable().optional(),
  concept: z.string().trim().min(1).max(120),
  amountCents: z.number().int().min(1).max(100_000_000),
  dueOn: DateOnlySchema,
  /** "Octubre 2026", "Temporada 2026-27". */
  periodLabel: z.string().trim().max(60).nullable().optional(),
});
export type FeeChargeCreate = z.infer<typeof FeeChargeCreateSchema>;

/** Genera el cargo de un periodo para todas las personas a las que aplica el plan. */
export const FeeChargeGenerateSchema = z.object({
  feePlanId: z.string().uuid(),
  periodLabel: z.string().trim().min(1).max(60),
  dueOn: DateOnlySchema,
});
export type FeeChargeGenerate = z.infer<typeof FeeChargeGenerateSchema>;

export const FeeChargeUpdateSchema = z.object({
  status: z.enum(["pending", "cancelled"]).optional(),
  dueOn: DateOnlySchema.optional(),
  concept: z.string().trim().min(1).max(120).optional(),
});
export type FeeChargeUpdate = z.infer<typeof FeeChargeUpdateSchema>;

/** Cómo entró el dinero. `stripe` lo pone el webhook, nunca una persona a mano. */
export const PAYMENT_METHODS = ["cash", "transfer", "card", "stripe", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MANUAL_PAYMENT_METHODS = ["cash", "transfer", "card", "other"] as const;

export const PaymentCreateSchema = z.object({
  amountCents: z.number().int().min(1).max(100_000_000),
  method: z.enum(MANUAL_PAYMENT_METHODS),
  paidOn: DateOnlySchema,
  note: z.string().trim().max(200).nullable().optional(),
});
export type PaymentCreate = z.infer<typeof PaymentCreateSchema>;

/**
 * Proveedor de cobro del club. `manual`: el club apunta los pagos. `stripe`: las familias y los
 * socios pagan por Stripe Checkout en la cuenta conectada del club (Stripe Connect); el webhook
 * registra el pago. Como con Resend, Stripe queda preparado y sin conectar hasta tener claves.
 */
export const PAYMENT_PROVIDERS = ["manual", "stripe"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const PaymentProviderSchema = z.enum(PAYMENT_PROVIDERS);

/**
 * Estado de la cuenta de Stripe del club (Stripe Connect, ADR 0042). `onboarding`: creada, faltan
 * datos del club. `restricted`: datos enviados, Stripe todavía no deja cobrar. `enabled`: cobra.
 * Nulo: sin cuenta, o una cuenta escrita a mano de la que Stripe aún no ha dicho nada.
 */
export const STRIPE_ACCOUNT_STATUSES = ["onboarding", "restricted", "enabled"] as const;
export type StripeAccountStatus = (typeof STRIPE_ACCOUNT_STATUSES)[number];

/** Si con ese estado la cuenta puede recibir cobros: lista, o desconocida (escrita a mano). */
export function stripeAccountCanCharge(status: StripeAccountStatus | null): boolean {
  return status === null || status === "enabled";
}

export const PaymentsSettingsUpdateSchema = z.object({
  provider: PaymentProviderSchema.optional(),
  /** Cuenta conectada de Stripe del club (`acct_…`). Nula: sin conectar. */
  stripeAccountId: z
    .string()
    .trim()
    .regex(/^acct_[A-Za-z0-9]+$/, "Identificador de cuenta de Stripe inválido.")
    .nullable()
    .optional(),
});
export type PaymentsSettingsUpdate = z.infer<typeof PaymentsSettingsUpdateSchema>;

/** Importe en céntimos como texto con dos decimales, sin símbolo. La web añade la moneda. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
