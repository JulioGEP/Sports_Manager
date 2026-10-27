import { z } from "zod";
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

export const FeePlanCreateSchema = z.object({
  name: ShortName,
  amountCents: Cents,
  period: FeePeriodSchema,
  /** A quién va: a un tipo de socio, a una sección (deportistas), o a todos si no se indica. */
  memberTypeId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(400).nullable().optional(),
});
export type FeePlanCreate = z.infer<typeof FeePlanCreateSchema>;
export const FeePlanUpdateSchema = z.object({
  name: ShortName.optional(),
  amountCents: Cents.optional(),
  period: FeePeriodSchema.optional(),
  memberTypeId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(400).nullable().optional(),
  status: z.enum(FEE_PLAN_STATUSES).optional(),
});
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

/**
 * Importe para leer, igual en toda la app y en todos los idiomas: punto de miles, coma decimal y
 * siempre dos decimales, sin símbolo. `123456` → `1.234,56`.
 */
export function formatAmount(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const units = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${units},${String(abs % 100).padStart(2, "0")}`;
}

/** Dinero para leer: `1.234,56 €`. Con otro símbolo para otra moneda (`12,40 $`). */
export function formatMoney(cents: number, symbol = "€"): string {
  return `${formatAmount(cents)} ${symbol}`;
}

/**
 * Lo que alguien escribe en un campo de importe, en céntimos. Acepta `1.234,56`, `1234,56`,
 * `1234.56`, `12,5`, `12` y el símbolo del euro. Con coma, los puntos son de miles; sin coma, un
 * punto seguido de grupos de tres cifras también lo es (`1.234`), y si no, es el decimal (`12.50`).
 * Nulo si no es un número.
 */
export function parseMoney(text: string): number | null {
  let t = text.replace(/[€\s\u00a0]/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Importe en céntimos como texto con dos decimales y punto decimal, sin símbolo: para APIs. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
