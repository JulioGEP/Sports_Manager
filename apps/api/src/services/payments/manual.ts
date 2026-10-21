import { PaymentsProviderError, type PaymentsProvider } from "./provider.ts";

/** Cobro a mano: no hay sesiones de pago ni webhooks. El club registra cada pago. */
export function createManualProvider(): PaymentsProvider {
  return {
    kind: "manual",
    createCheckoutSession() {
      return Promise.reject(
        new PaymentsProviderError("not_configured", "El club cobra a mano: no hay pago en línea."),
      );
    },
    verifyWebhook() {
      return Promise.resolve(null);
    },
  };
}
