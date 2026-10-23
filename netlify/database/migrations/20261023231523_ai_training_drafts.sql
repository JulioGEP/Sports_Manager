CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"requested_by" uuid,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"failure" text,
	"profile_code" text NOT NULL,
	"profile_version" integer NOT NULL,
	"model" text NOT NULL,
	"request" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"output" jsonb,
	"proposal" jsonb,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"applied_items" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_status_check" CHECK ("ai_generations"."status" in ('queued', 'running', 'ready', 'failed')),
	CONSTRAINT "ai_generations_failure_check" CHECK ("ai_generations"."failure" is null or "ai_generations"."failure" in ('not_configured', 'model_error', 'invalid_output', 'refused', 'timeout'))
);
--> statement-breakpoint
CREATE TABLE "section_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_equipment_quantity_check" CHECK ("section_equipment"."quantity" is null or "section_equipment"."quantity" between 1 and 9999)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_weekly_quota" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_session_items" ADD COLUMN "ai_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_equipment" ADD CONSTRAINT "section_equipment_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_equipment" ADD CONSTRAINT "section_equipment_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_organization_id_idx" ON "ai_generations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_generations_org_week_idx" ON "ai_generations" USING btree ("organization_id","week_start");--> statement-breakpoint
CREATE INDEX "ai_generations_team_id_idx" ON "ai_generations" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_equipment_section_name_unique" ON "section_equipment" USING btree ("section_id","name");--> statement-breakpoint
CREATE INDEX "section_equipment_organization_id_idx" ON "section_equipment" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "training_session_items" ADD CONSTRAINT "training_session_items_ai_generation_id_ai_generations_id_fk" FOREIGN KEY ("ai_generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_session_items_ai_generation_id_idx" ON "training_session_items" USING btree ("ai_generation_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ai_weekly_quota_check" CHECK ("organizations"."ai_weekly_quota" between 0 and 100);