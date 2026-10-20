CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"organization_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_organization_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");