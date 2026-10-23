import { z } from "zod";
import {
  FEE_CHARGE_STATUSES,
  FEE_PERIODS,
  FEE_PLAN_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  STRIPE_ACCOUNT_STATUSES,
} from "../fees.ts";
import { ACCOUNTING_LINK_STATUSES, ACCOUNTING_PROVIDERS } from "../accounting.ts";

/** Contratos de cuotas y cobros (Bloque 18). Solo con `org.fees.read`. */

export const FeePlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  amountCents: z.number().int(),
  period: z.enum(FEE_PERIODS),
  memberType: z.object({ id: z.string(), name: z.string() }).nullable(),
  section: z.object({ id: z.string(), name: z.string() }).nullable(),
  description: z.string().nullable(),
  status: z.enum(FEE_PLAN_STATUSES),
  /** Personas a las que aplica hoy (socios activos del tipo, deportistas de la sección o todos). */
  appliesTo: z.number().int().nonnegative(),
});
export type FeePlan = z.infer<typeof FeePlanSchema>;
export const FeePlansResponseSchema = z.object({ plans: z.array(FeePlanSchema) });
export type FeePlansResponse = z.infer<typeof FeePlansResponseSchema>;
export const FeePlanResponseSchema = z.object({ plan: FeePlanSchema });

export const PaymentSchema = z.object({
  id: z.string(),
  amountCents: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  paidOn: z.string(),
  note: z.string().nullable(),
  recordedBy: z.object({ userId: z.string(), name: z.string() }).nullable(),
  providerRef: z.string().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const FeeChargeSchema = z.object({
  id: z.string(),
  person: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  plan: z.object({ id: z.string(), name: z.string() }).nullable(),
  concept: z.string(),
  periodLabel: z.string().nullable(),
  amountCents: z.number().int(),
  paidCents: z.number().int(),
  dueOn: z.string(),
  status: z.enum(FEE_CHARGE_STATUSES),
  payments: z.array(PaymentSchema),
  /** Enlace de pago de Stripe Checkout, si el club cobra por Stripe y el cargo está pendiente. */
  checkoutUrl: z.string().nullable(),
  createdAt: z.string(),
  /**
   * Su documento en la herramienta de contabilidad (ADR 0042), si el club la tiene conectada:
   * estado del envío y número de factura. Solo para quien gestiona las cuotas.
   */
  accounting: z
    .object({
      provider: z.enum(ACCOUNTING_PROVIDERS),
      status: z.enum(ACCOUNTING_LINK_STATUSES),
      number: z.string().nullable(),
    })
    .nullable()
    .optional(),
});
export type FeeCharge = z.infer<typeof FeeChargeSchema>;
export const FeeChargesResponseSchema = z.object({
  charges: z.array(FeeChargeSchema),
  totals: z.object({
    pendingCents: z.number().int().nonnegative(),
    overdueCents: z.number().int().nonnegative(),
    paidCents: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    overdueCount: z.number().int().nonnegative(),
  }),
});
export type FeeChargesResponse = z.infer<typeof FeeChargesResponseSchema>;
export const FeeChargeResponseSchema = z.object({ charge: FeeChargeSchema });
export const FeeChargesGeneratedResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** Ajustes de cobro del club: proveedor y estado de la conexión con Stripe. */
export const PaymentsSettingsSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  stripeAccountId: z.string().nullable(),
  /** La plataforma tiene claves de Stripe configuradas (como el transporte de email con Resend). */
  stripeConfigured: z.boolean(),
  /** Estado de la cuenta conectada según Stripe (ADR 0042). Nulo: sin cuenta o sin consultar. */
  stripeAccountStatus: z.enum(STRIPE_ACCOUNT_STATUSES).nullable(),
  /** Moneda de las cuotas. Fija por ahora. */
  currency: z.literal("EUR"),
});
export type PaymentsSettings = z.infer<typeof PaymentsSettingsSchema>;
export const PaymentsSettingsResponseSchema = z.object({ payments: PaymentsSettingsSchema });

/** Lo que una familia o un socio ve de sus cuotas: sus cargos y el enlace de pago si lo hay. */
export const MyFeesResponseSchema = z.object({
  charges: z.array(FeeChargeSchema),
  provider: z.enum(PAYMENT_PROVIDERS),
});
export type MyFeesResponse = z.infer<typeof MyFeesResponseSchema>;

/** Pedir una sesión de pago: a qué ruta de la web volver al acabar (por defecto, las cuotas propias). */
export const CheckoutSessionRequestSchema = z.object({
  returnPath: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/(?!\/)[^\s]*$/, "Ruta de vuelta inválida.")
    .optional(),
});
export type CheckoutSessionRequest = z.infer<typeof CheckoutSessionRequestSchema>;

/** Sesión de pago de Stripe Checkout creada para un cargo. */
export const CheckoutSessionResponseSchema = z.object({ url: z.string() });

/** Enlace de alta en Stripe (Stripe Connect, ADR 0042): el club completa allí sus datos y vuelve. */
export const StripeOnboardingRequestSchema = z.object({
  returnPath: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/(?!\/)[^\s]*$/, "Ruta de vuelta inválida.")
    .optional(),
});
export const StripeOnboardingResponseSchema = z.object({ url: z.string() });
