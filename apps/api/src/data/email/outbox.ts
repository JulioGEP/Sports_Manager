import { schema, type Database } from "@sportsmanager/db";
import type { EmailStatus, EmailTemplate, EmailTransport, Locale } from "@sportsmanager/shared";
import { eq } from "drizzle-orm";

export interface OutboxEntry {
  organizationId: string | null;
  toEmail: string;
  locale: Locale;
  template: EmailTemplate;
  subject: string;
  textBody: string;
  htmlBody: string;
  transport: EmailTransport;
}

/** Registro de emails (ADR 0018). Cada envío se guarda antes de salir; el estado cuenta qué pasó. */
export function emailOutboxRepo(db: () => Database) {
  return {
    async enqueue(entry: OutboxEntry): Promise<string> {
      const rows = await db()
        .insert(schema.emailOutbox)
        .values({ ...entry, status: "queued" satisfies EmailStatus })
        .returning({ id: schema.emailOutbox.id });
      return rows[0]!.id;
    },

    async markSent(id: string, providerMessageId: string | null): Promise<void> {
      await db()
        .update(schema.emailOutbox)
        .set({ status: "sent" satisfies EmailStatus, providerMessageId, sentAt: new Date() })
        .where(eq(schema.emailOutbox.id, id));
    },

    async markFailed(id: string, error: string): Promise<void> {
      await db()
        .update(schema.emailOutbox)
        .set({ status: "failed" satisfies EmailStatus, error: error.slice(0, 2000) })
        .where(eq(schema.emailOutbox.id, id));
    },
  };
}

export type EmailOutboxRepo = ReturnType<typeof emailOutboxRepo>;
