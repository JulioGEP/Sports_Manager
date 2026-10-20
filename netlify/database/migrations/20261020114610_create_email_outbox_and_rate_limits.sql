CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"to_email" text NOT NULL,
	"locale" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"transport" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_to_email_lowercase" CHECK ("email_outbox"."to_email" = lower("email_outbox"."to_email")),
	CONSTRAINT "email_outbox_locale_check" CHECK ("email_outbox"."locale" in ('es', 'ca', 'en')),
	CONSTRAINT "email_outbox_template_check" CHECK ("email_outbox"."template" in ('invitation', 'password_reset')),
	CONSTRAINT "email_outbox_transport_check" CHECK ("email_outbox"."transport" in ('outbox', 'resend')),
	CONSTRAINT "email_outbox_status_check" CHECK ("email_outbox"."status" in ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "locale" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_organization_id_idx" ON "email_outbox" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_at_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_to_email_idx" ON "email_outbox" USING btree ("to_email");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_locale_check" CHECK ("invitations"."locale" in ('es', 'ca', 'en'));