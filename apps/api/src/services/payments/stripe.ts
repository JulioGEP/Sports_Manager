import type { StripeAccountStatus } from "@sportsmanager/shared";
import {
  PaymentsProviderError,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentsProvider,
  type WebhookEvent,
} from "./provider.ts";

/**
 * Stripe sin SDK (Bloque 18): llamadas REST con `fetch` y la verificación de firma del webhook
 * con Web Crypto. Las sesiones de Checkout se crean en la cuenta conectada del club (Stripe
 * Connect, cabecera `Stripe-Account`), así el dinero entra en la cuenta del club y la plataforma
 * solo orquesta. Sin claves no se construye: el proveedor del club queda en `manual`.
 *
 * Stripe Connect (ADR 0042): la plataforma crea la cuenta Standard del club y le da un enlace de
 * alta (Account Links). El club rellena allí sus datos y su cuenta bancaria, con Stripe y no con
 * nosotros, y vuelve a los ajustes. La cuenta es del club: su panel, sus cobros y sus pagos.
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

export interface ConnectedAccountInput {
  organizationId: string;
  name: string;
  email: string | null;
  /** País de la cuenta, ISO 3166-1 alfa-2. Los clubes de hoy son de España. */
  country: string;
}

export interface StripeConnect {
  createAccount(input: ConnectedAccountInput): Promise<string>;
  onboardingLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<string>;
  accountStatus(accountId: string): Promise<StripeAccountStatus>;
}

export interface StripeProvider extends PaymentsProvider {
  readonly connect: StripeConnect;
}

const STRIPE_API = "https://api.stripe.com";
const STRIPE_VERSION = "2024-06-20";

export function createStripeProvider(options: StripeProviderOptions): StripeProvider {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const tolerance = options.toleranceSeconds ?? 300;
  const base = options.apiBase ?? STRIPE_API;

  /** Una llamada a Stripe. `account`: en nombre de la cuenta conectada del club. */
  async function call(
    method: "GET" | "POST",
    path: string,
    what: string,
    form?: URLSearchParams,
    account?: string,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.secretKey}`,
          ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          ...(account ? { "stripe-account": account } : {}),
          "stripe-version": STRIPE_VERSION,
        },
        ...(form ? { body: form.toString() } : {}),
      });
    } catch (error) {
      throw new PaymentsProviderError(
        "provider_error",
        `Stripe no responde: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !body) {
      const err = body?.["error"] as { message?: unknown } | undefined;
      const message = typeof err?.message === "string" ? err.message : `HTTP ${response.status}`;
      throw new PaymentsProviderError("provider_error", `Stripe ha rechazado ${what}: ${message}`);
    }
    return body;
  }

  const stringField = (body: Record<string, unknown>, key: string, what: string): string => {
    const value = body[key];
    if (typeof value !== "string" || !value)
      throw new PaymentsProviderError("provider_error", `Stripe no ha devuelto ${what}.`);
    return value;
  };

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
      const body = await call(
        "POST",
        "/v1/checkout/sessions",
        "la sesión",
        form,
        input.organization.stripeAccountId,
      );
      return {
        url: stringField(body, "url", "la URL de pago"),
        sessionId: stringField(body, "id", "la sesión"),
      };
    },

    connect: {
      async createAccount(input) {
        const form = new URLSearchParams();
        form.set("type", "standard");
        form.set("country", input.country);
        if (input.email) form.set("email", input.email);
        form.set("business_profile[name]", input.name);
        form.set("metadata[organization_id]", input.organizationId);
        const body = await call("POST", "/v1/accounts", "la cuenta del club", form);
        return stringField(body, "id", "la cuenta del club");
      },

      async onboardingLink({ accountId, refreshUrl, returnUrl }) {
        const form = new URLSearchParams();
        form.set("account", accountId);
        form.set("refresh_url", refreshUrl);
        form.set("return_url", returnUrl);
        form.set("type", "account_onboarding");
        const body = await call("POST", "/v1/account_links", "el enlace de alta", form);
        return stringField(body, "url", "el enlace de alta");
      },

      async accountStatus(accountId) {
        const body = await call(
          "GET",
          `/v1/accounts/${encodeURIComponent(accountId)}`,
          "la consulta de la cuenta",
        );
        return accountStatusOf(body);
      },
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
        const event = JSON.parse(rawBody) as Partial<WebhookEvent> & { account?: unknown };
        if (typeof event.id !== "string" || typeof event.type !== "string") return null;
        const object =
          event.data && typeof event.data === "object" && event.data.object
            ? event.data.object
            : {};
        return {
          id: event.id,
          type: event.type,
          account: typeof event.account === "string" ? event.account : null,
          data: { object },
        };
      } catch {
        return null;
      }
    },
  };
}

/** Lo que dice Stripe de una cuenta, en tres estados que entiende el club. */
export function accountStatusOf(account: Record<string, unknown>): StripeAccountStatus {
  if (account["charges_enabled"] === true) return "enabled";
  if (account["details_submitted"] === true) return "restricted";
  return "onboarding";
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
