import type { PaymentProvider } from "@sportsmanager/shared";

/**
 * Proveedor de cobro (Bloque 18). `manual`: el club apunta los pagos. `stripe`: Stripe Checkout
 * en la cuenta conectada del club y webhook firmado. La API habla con esta interfaz; el proveedor
 * concreto se elige por club y por configuración de la plataforma, como el transporte de email.
 */
export interface CheckoutInput {
  charge: { id: string; concept: string; amountCents: number; organizationId: string };
  organization: { name: string; stripeAccountId: string | null };
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null | undefined;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

/** Evento de webhook ya verificado. Solo se leen los campos que la API necesita. */
export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface PaymentsProvider {
  readonly kind: PaymentProvider;
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession>;
  /** Devuelve el evento si la firma es válida; null si no lo es o no hay secreto. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookEvent | null>;
}

export class PaymentsProviderError extends Error {
  constructor(
    readonly reason: "not_configured" | "provider_error" | "not_connected",
    message: string,
  ) {
    super(message);
    this.name = "PaymentsProviderError";
  }
}
