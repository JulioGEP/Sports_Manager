CREATE TABLE "athlete_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"capacity" text NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_levels_capacity_check" CHECK ("athlete_levels"."capacity" in ('strength', 'weightlifting', 'gymnastics', 'engine')),
	CONSTRAINT "athlete_levels_level_check" CHECK ("athlete_levels"."level" in ('foundations', 'scaled', 'rx', 'rx_plus'))
);
--> statement-breakpoint
CREATE TABLE "box_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"facility_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"out_of_service" integer DEFAULT 0 NOT NULL,
	"repair_until" date,
	"min_kg" numeric(5, 1),
	"max_kg" numeric(5, 1),
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_equipment_kind_check" CHECK ("box_equipment"."kind" in ('barbell', 'dumbbell', 'kettlebell', 'rings', 'pullup_bar', 'box', 'rower', 'bike', 'ski', 'wall_ball', 'jump_rope', 'sled', 'sandbag', 'med_ball', 'ghd', 'rope', 'parallettes', 'yoke', 'bench', 'bands', 'other')),
	CONSTRAINT "box_equipment_quantity_check" CHECK ("box_equipment"."quantity" between 0 and 9999),
	CONSTRAINT "box_equipment_out_check" CHECK ("box_equipment"."out_of_service" >= 0 and "box_equipment"."out_of_service" <= "box_equipment"."quantity")
);
--> statement-breakpoint
CREATE TABLE "box_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_code" text NOT NULL,
	"goal" text,
	"event_name" text,
	"event_date" date,
	"starts_on" date NOT NULL,
	"weeks" integer NOT NULL,
	"emphasis" jsonb NOT NULL,
	"frequency" integer DEFAULT 3 NOT NULL,
	"tests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structure" jsonb NOT NULL,
	"projection" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_plans_status_check" CHECK ("box_plans"."status" in ('draft', 'active', 'finished', 'archived')),
	CONSTRAINT "box_plans_template_check" CHECK ("box_plans"."template_code" in ('continuous', 'open', 'strength_base', 'engine', 'muscle_up', 'back_to_box', 'hyrox_race', 'weightlifting_technique', 'custom')),
	CONSTRAINT "box_plans_weeks_check" CHECK ("box_plans"."weeks" between 1 and 60),
	CONSTRAINT "box_plans_frequency_check" CHECK ("box_plans"."frequency" between 2 and 6)
);
--> statement-breakpoint
CREATE TABLE "plan_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_adjustments_status_check" CHECK ("plan_adjustments"."status" in ('accepted', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "planning_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"level_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"athlete_preview" text DEFAULT 'roles' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_settings_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "planning_settings_preview_check" CHECK ("planning_settings"."athlete_preview" in ('none', 'roles', 'wod'))
);
--> statement-breakpoint
ALTER TABLE "ai_generations" DROP CONSTRAINT "ai_generations_kind_check";--> statement-breakpoint
ALTER TABLE "benchmark_results" DROP CONSTRAINT "benchmark_results_level_check";--> statement-breakpoint
ALTER TABLE "workout_results" DROP CONSTRAINT "workout_results_level_check";--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "includes_plus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "foundations" text;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "capacity" text;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "planned_minutes" integer;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "exercise_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "track" text DEFAULT 'class' NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "plan_week" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "day_role" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "intent_domain" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "intent_effort" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "intent_feel" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "why" text;--> statement-breakpoint
ALTER TABLE "athlete_levels" ADD CONSTRAINT "athlete_levels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_levels" ADD CONSTRAINT "athlete_levels_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_equipment" ADD CONSTRAINT "box_equipment_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_equipment" ADD CONSTRAINT "box_equipment_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustments" ADD CONSTRAINT "plan_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustments" ADD CONSTRAINT "plan_adjustments_plan_id_box_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."box_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustments" ADD CONSTRAINT "plan_adjustments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_settings" ADD CONSTRAINT "planning_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_levels_player_capacity_unique" ON "athlete_levels" USING btree ("player_id","capacity");--> statement-breakpoint
CREATE INDEX "athlete_levels_organization_id_idx" ON "athlete_levels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "box_equipment_organization_id_idx" ON "box_equipment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "box_plans_organization_id_idx" ON "box_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "box_plans_section_idx" ON "box_plans" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "box_plans_active_unique" ON "box_plans" USING btree ("section_id") WHERE "box_plans"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "plan_adjustments_unique" ON "plan_adjustments" USING btree ("plan_id","week","key");--> statement-breakpoint
CREATE INDEX "plan_adjustments_organization_id_idx" ON "plan_adjustments" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_plan_id_box_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."box_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_plan_id_box_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."box_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_plan_id_idx" ON "ai_generations" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workouts_plan_idx" ON "workouts" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_kind_check" CHECK ("ai_generations"."kind" in ('training', 'wod', 'plan_architect', 'plan_week', 'plan_copilot'));--> statement-breakpoint
ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_level_check" CHECK ("benchmark_results"."level" in ('foundations', 'scaled', 'rx', 'rx_plus'));--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_capacity_check" CHECK ("workout_blocks"."capacity" is null or "workout_blocks"."capacity" in ('strength', 'weightlifting', 'gymnastics', 'engine', 'intensity', 'mobility'));--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_track_check" CHECK ("workout_blocks"."track" in ('class', 'plus'));--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_minutes_check" CHECK ("workout_blocks"."planned_minutes" is null or "workout_blocks"."planned_minutes" between 1 and 120);--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_exercise_ids_check" CHECK (jsonb_typeof("workout_blocks"."exercise_ids") = 'array');--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_level_check" CHECK ("workout_results"."level" in ('foundations', 'scaled', 'rx', 'rx_plus'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_day_role_check" CHECK ("workouts"."day_role" is null or "workouts"."day_role" in ('heavy_lower', 'gymnastics_engine', 'olympic_metcon', 'long_engine', 'upper_intervals', 'team', 'skill_mobility', 'test', 'benchmark', 'open_sim', 'hyrox_stations', 'hyrox_strength', 'hyrox_sim', 'oly_technique', 'oly_strength'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_intent_domain_check" CHECK ("workouts"."intent_domain" is null or "workouts"."intent_domain" in ('short', 'medium', 'long', 'very_long'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_intent_effort_check" CHECK ("workouts"."intent_effort" is null or "workouts"."intent_effort" between 1 and 5);