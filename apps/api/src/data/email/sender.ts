import type { EmailStatus, EmailTemplate, Locale } from "@sportsmanager/shared";
import type { EmailConfig } from "../../config.ts";
import type { EmailOutboxRepo } from "./outbox.ts";
import { createResendClient, type ResendLike } from "./resend.ts";

export interface OutgoingEmail {
  organizationId: string | null;
  to: string;
  locale: Locale;
  template: EmailTemplate;
  subject: string;
  text: string;
  html: string;
}

export interface SentEmail {
  id: string;
  status: EmailStatus;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<SentEmail>;
}

export interface EmailSenderDeps {
  config: EmailConfig;
  outbox: EmailOutboxRepo;
  /** Cliente de Resend. Si falta y el transporte es `resend`, se crea con la clave de la configuración. */
  resend?: ResendLike | null;
  /** Destino del log de depuración. Por defecto, la consola de la función. */
  log?: (line: string) => void;
}

/**
 * Puerto de envío de email (ADR 0018). Siempre deja rastro en `email_outbox`; después, según el
 * transporte, envía por Resend o se queda en cola. Nunca lanza: un fallo de envío no debe
 * deshacer la invitación o el restablecimiento que lo originó; queda en el registro como `failed`.
 */
export function createEmailSender(deps: EmailSenderDeps): EmailSender {
  const { config, outbox } = deps;
  const log = deps.log ?? ((line: string) => console.log(line));
  let resend: ResendLike | null = deps.resend ?? null;

  return {
    async send(email) {
      const id = await outbox.enqueue({
        organizationId: email.organizationId,
        toEmail: email.to,
        locale: email.locale,
        template: email.template,
        subject: email.subject,
        textBody: email.text,
        htmlBody: email.html,
        transport: config.transport,
      });

      if (config.debugLog) {
        log(
          `[email:${config.transport}] to=${email.to} template=${email.template} locale=${email.locale} subject=${JSON.stringify(email.subject)}\n${email.text}`,
        );
      }

      if (config.transport === "outbox") return { id, status: "queued" };

      try {
        if (!config.from) throw new Error("Falta EMAIL_FROM.");
        resend ??= createResendClient(config.resendApiKey ?? "");
        const result = await resend.emails.send({
          from: config.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        if (result.error) throw new Error(result.error.message);
        await outbox.markSent(id, result.data?.id ?? null);
        return { id, status: "sent" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[email] envío fallido (${id}): ${message}`);
        await outbox.markFailed(id, message);
        return { id, status: "failed" };
      }
    },
  };
}
