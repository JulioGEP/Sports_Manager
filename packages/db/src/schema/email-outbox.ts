import { EMAIL_STATUSES, EMAIL_TEMPLATES, EMAIL_TRANSPORTS, LOCALES } from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { organizations } from "./organizations.ts";

/**
 * Registro de todos los emails de la plataforma (ADR 0018). Cada envío se guarda aquí antes
 * de salir. Con el transporte `outbox` se queda en `queued` y no se envía: es el modo hasta
 * tener dominio verificado en Resend. Con `resend`, pasa a `sent` o `failed`.
 * El cuerpo contiene enlaces con tokens vivos: la tabla es tan sensible como `invitations`.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    /** Club en cuyo nombre se envía. Nulo en emails de plataforma. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    toEmail: text("to_email").notNull(),
    locale: text("locale").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    textBody: text("text_body").notNull(),
    htmlBody: text("html_body").notNull(),
    transport: text("transport").notNull(),
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("email_outbox_organization_id_idx").on(t.organizationId),
    index("email_outbox_status_created_at_idx").on(t.status, t.createdAt),
    index("email_outbox_to_email_idx").on(t.toEmail),
    check("email_outbox_to_email_lowercase", sql`${t.toEmail} = lower(${t.toEmail})`),
    check("email_outbox_locale_check", inList(t.locale, LOCALES)),
    check("email_outbox_template_check", inList(t.template, EMAIL_TEMPLATES)),
    check("email_outbox_transport_check", inList(t.transport, EMAIL_TRANSPORTS)),
    check("email_outbox_status_check", inList(t.status, EMAIL_STATUSES)),
  ],
);
