import { Resend } from "resend";

/**
 * Lo que la plataforma usa del SDK de Resend (ADR 0018). Es una interfaz propia para poder
 * sustituir el cliente en tests sin tocar la red.
 */
export interface ResendLike {
  emails: {
    send(input: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

export function createResendClient(apiKey: string): ResendLike {
  return new Resend(apiKey);
}
