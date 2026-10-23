import type { Context } from "hono";
import type { AppEnv } from "./context.ts";

/**
 * Trabajo que no debe hacer esperar a quien pide (ADR 0042): mandar un cargo a la contabilidad
 * tras cobrarlo. En Netlify sigue después de responder (`waitUntil`); en local y en tests se
 * espera, para que el resultado sea el mismo cada vez. Nunca rompe la respuesta.
 */
export async function afterResponse(c: Context<AppEnv>, work: () => Promise<void>): Promise<void> {
  const promise = work().catch((error: unknown) => {
    console.error("[api] trabajo en segundo plano fallido", error);
  });
  const waitUntil = c.env?.context?.waitUntil;
  if (waitUntil) {
    waitUntil(promise);
    return;
  }
  await promise;
}
