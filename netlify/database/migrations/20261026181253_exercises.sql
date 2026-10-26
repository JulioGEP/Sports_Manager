CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"movement_code" text,
	"description" text,
	"coaching_points" text,
	"common_faults" text,
	"scaling" text,
	"video_url" text,
	"section_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_category_check" CHECK ("exercises"."category" in ('weightlifting', 'strength', 'gymnastics', 'monostructural', 'kettlebell', 'accessory', 'mobility')),
	CONSTRAINT "exercises_status_check" CHECK ("exercises"."status" in ('active', 'archived')),
	CONSTRAINT "exercises_equipment_array_check" CHECK (jsonb_typeof("exercises"."equipment") = 'array')
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_org_name_unique" ON "exercises" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "exercises_organization_id_idx" ON "exercises" USING btree ("organization_id");