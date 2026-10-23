CREATE TABLE "accounting_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"api_key_hint" text NOT NULL,
	"account_name" text,
	"document_type" text DEFAULT 'invoice' NOT NULL,
	"tax_key" text,
	"tax_name" text,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"numbering_series_id" text,
	"approve_documents" boolean DEFAULT false NOT NULL,
	"treasury_accounts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_from" date DEFAULT now() NOT NULL,
	"auto_sync" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_connections_provider_check" CHECK ("accounting_connections"."provider" in ('holded')),
	CONSTRAINT "accounting_connections_status_check" CHECK ("accounting_connections"."status" in ('active', 'paused')),
	CONSTRAINT "accounting_connections_document_type_check" CHECK ("accounting_connections"."document_type" in ('invoice', 'sales_receipt')),
	CONSTRAINT "accounting_connections_tax_rate_check" CHECK ("accounting_connections"."tax_rate_bp" >= 0 and "accounting_connections"."tax_rate_bp" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "accounting_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"local_id" uuid NOT NULL,
	"external_id" text,
	"external_number" text,
	"document_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_links_entity_check" CHECK ("accounting_links"."entity" in ('contact', 'document', 'payment')),
	CONSTRAINT "accounting_links_status_check" CHECK ("accounting_links"."status" in ('pending', 'synced', 'failed', 'cancelled')),
	CONSTRAINT "accounting_links_attempts_check" CHECK ("accounting_links"."attempts" >= 0),
	CONSTRAINT "accounting_links_document_type_check" CHECK ("accounting_links"."document_type" is null or "accounting_links"."document_type" in ('invoice', 'sales_receipt')),
	CONSTRAINT "accounting_links_synced_external_check" CHECK ("accounting_links"."status" not in ('synced', 'cancelled') or "accounting_links"."external_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_account_status" text;--> statement-breakpoint
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_links" ADD CONSTRAINT "accounting_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_links" ADD CONSTRAINT "accounting_links_connection_id_accounting_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."accounting_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_connections_organization_unique" ON "accounting_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_links_connection_entity_local_unique" ON "accounting_links" USING btree ("connection_id","entity","local_id");--> statement-breakpoint
CREATE INDEX "accounting_links_organization_id_idx" ON "accounting_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "accounting_links_connection_status_idx" ON "accounting_links" USING btree ("connection_id","status");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_account_status_check" CHECK ("organizations"."stripe_account_status" is null or "organizations"."stripe_account_status" in ('onboarding', 'restricted', 'enabled'));