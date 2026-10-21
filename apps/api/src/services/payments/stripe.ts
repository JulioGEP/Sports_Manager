import {
  PaymentsProviderError,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentsProvider,
  type WebhookEvent,
} from "./provider.ts";

/**
 * Stripe sin SDK (Bloque 18): dos llamadas REST con `fetch` y la verificación de firma del webhook
 * con Web Crypto. Las sesiones de Checkout se crean en la cuenta conectada del club (Stripe
 * Connect, cabecera `Stripe-Account`), así el dinero entra en la cuenta del club y la plataforma
 * solo orquesta. Sin claves no se construye: el proveedor del club queda en `manual`.
 */
export interface StripeProviderOptions {
  secretKey: string;
  webhookSecret: string;
  /** Sustituible en tests. */
  fetch?: typeof fetch;
  /** Reloj sustituible en tests (segundos Unix). */
  now?: () => number;
  /** Tolerancia de la firma del webhook, en segundos. Stripe recomienda 5 minutos. */
  toleranceSeconds?: number;
  apiBase?: string;
}

const STRIPE_API = "https://api.stripe.com";

export function createStripeProvider(options: StripeProviderOptions): PaymentsProvider {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const tolerance = options.toleranceSeconds ?? 300;
  const base = options.apiBase ?? STRIPE_API;

  return {
    kind: "stripe",

    async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
      if (!input.organization.stripeAccountId) {
        throw new PaymentsProviderError(
          "not_connected",
          "El club no tiene conectada su cuenta de Stripe.",
        );
      }
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", input.successUrl);
      form.set("cancel_url", input.cancelUrl);
      form.set("client_reference_id", input.charge.id);
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "eur");
      form.set("line_items[0][price_data][unit_amount]", String(input.charge.amountCents));
      form.set("line_items[0][price_data][product_data][name]", input.charge.concept);
      form.set("metadata[charge_id]", input.charge.id);
      form.set("metadata[organization_id]", input.charge.organizationId);
      if (input.customerEmail) form.set("customer_email", input.customerEmail);

      let response: Response;
      try {
        response = await doFetch(`${base}/v1/checkout/sessions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.secretKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "stripe-account": input.organization.stripeAccountId,
            "stripe-version": "2024-06-20",
          },
          body: form.toString(),
        });
      } catch (error) {
        throw new PaymentsProviderError(
          "provider_error",
          `Stripe no responde: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
        url?: unknown;
        error?: { message?: unknown };
      } | null;
      if (!response.ok || !body || typeof body.id !== "string" || typeof body.url !== "string") {
        const message =
          body?.error && typeof body.error.message === "string"
            ? body.error.message
            : `HTTP ${response.status}`;
        throw new PaymentsProviderError(
          "provider_error",
          `Stripe ha rechazado la sesión: ${message}`,
        );
      }
      return { url: body.url, sessionId: body.id };
    },

    async verifyWebhook(
      rawBody: string,
      signatureHeader: string | null,
    ): Promise<WebhookEvent | null> {
      if (!signatureHeader) return null;
      const parts = signatureHeader.split(",").map((p) => p.trim());
      const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
      const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
      if (!timestamp || signatures.length === 0) return null;
      const t = Number(timestamp);
      if (!Number.isFinite(t) || Math.abs(now() - t) > tolerance) return null;
      const expected = await hmacHex(options.webhookSecret, `${timestamp}.${rawBody}`);
      if (!signatures.some((candidate) => constantTimeEqual(candidate, expected))) return null;
      try {
        const event = JSON.parse(rawBody) as Partial<WebhookEvent>;
        if (typeof event.id !== "string" || typeof event.type !== "string") return null;
        const object =
          event.data && typeof event.data === "object" && event.data.object
            ? event.data.object
            : {};
        return { id: event.id, type: event.type, data: { object } };
      } catch {
        return null;
      }
    },
  };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante: no filtra por cuántos caracteres coinciden. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Firma un cuerpo como lo haría Stripe. Para tests y para el simulador local. */
export async function signStripePayload(
  secret: string,
  rawBody: string,
  timestamp: number,
): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}
