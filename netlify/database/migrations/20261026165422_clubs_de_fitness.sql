CREATE TABLE "announcement_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"section_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_audience_check" CHECK ("announcements"."audience" in ('all', 'section')),
	CONSTRAINT "announcements_section_check" CHECK ("announcements"."audience" <> 'section' or "announcements"."section_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "benchmark_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"benchmark_code" text NOT NULL,
	"level" text NOT NULL,
	"time_seconds" integer,
	"rounds" integer,
	"reps" integer,
	"load_kg" numeric(6, 2),
	"distance_m" integer,
	"calories" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"on_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_results_level_check" CHECK ("benchmark_results"."level" in ('scaled', 'rx', 'rx_plus'))
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_pct" numeric(4, 1),
	"waist_cm" numeric(5, 1),
	"hip_cm" numeric(5, 1),
	"chest_cm" numeric(5, 1),
	"arm_cm" numeric(5, 1),
	"thigh_cm" numeric(5, 1),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opens_days_before" integer DEFAULT 7 NOT NULL,
	"closes_minutes_before" integer DEFAULT 0 NOT NULL,
	"cancel_hours_before" integer DEFAULT 2 NOT NULL,
	"late_cancel_consumes" boolean DEFAULT true NOT NULL,
	"no_show_consumes" boolean DEFAULT true NOT NULL,
	"max_per_day" integer,
	"waitlist" boolean DEFAULT true NOT NULL,
	"show_attendees" boolean DEFAULT true NOT NULL,
	"show_leaderboards" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_policies_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "booking_policies_opens_check" CHECK ("booking_policies"."opens_days_before" between 0 and 60),
	CONSTRAINT "booking_policies_closes_check" CHECK ("booking_policies"."closes_minutes_before" between 0 and 1440),
	CONSTRAINT "booking_policies_cancel_check" CHECK ("booking_policies"."cancel_hours_before" between 0 and 72),
	CONSTRAINT "booking_policies_max_per_day_check" CHECK ("booking_policies"."max_per_day" is null or "booking_policies"."max_per_day" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" text NOT NULL,
	"consumes" boolean DEFAULT true NOT NULL,
	"subscription_id" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"source" text DEFAULT 'self' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" in ('booked', 'waitlist', 'cancelled', 'late_cancel', 'no_show', 'attended')),
	CONSTRAINT "bookings_source_check" CHECK ("bookings"."source" in ('self', 'staff', 'waitlist'))
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"author_user_id" uuid,
	"from_athlete" boolean NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitness_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"hide_from_attendees" boolean DEFAULT false NOT NULL,
	"hide_from_leaderboards" boolean DEFAULT false NOT NULL,
	"share_body_with_coach" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitness_preferences_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"trial_event_id" uuid,
	"converted_player_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('web', 'walk_in', 'referral', 'social', 'other')),
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('new', 'trial_booked', 'trial_done', 'converted', 'lost')),
	CONSTRAINT "leads_email_lowercase" CHECK ("leads"."email" is null or "leads"."email" = lower("leads"."email"))
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"movement_code" text NOT NULL,
	"reps" integer NOT NULL,
	"load_kg" numeric(6, 2) NOT NULL,
	"on_date" date NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"result_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_records_reps_check" CHECK ("personal_records"."reps" in (1, 2, 3, 5, 10)),
	CONSTRAINT "personal_records_source_check" CHECK ("personal_records"."source" in ('manual', 'result'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"fee_plan_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_until" date,
	"billing" text DEFAULT 'manual' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_status" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'paused', 'cancelled', 'expired')),
	CONSTRAINT "subscriptions_billing_check" CHECK ("subscriptions"."billing" in ('manual', 'stripe')),
	CONSTRAINT "subscriptions_dates_check" CHECK ("subscriptions"."ends_on" is null or "subscriptions"."ends_on" >= "subscriptions"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "workout_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"score_type" text DEFAULT 'none' NOT NULL,
	"time_cap_seconds" integer,
	"movement_code" text,
	"percent" integer,
	"rm_reps" integer,
	"scaled" text,
	"rx" text,
	"rx_plus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_blocks_kind_check" CHECK ("workout_blocks"."kind" in ('warmup', 'strength', 'skill', 'wod', 'accessory', 'cooldown')),
	CONSTRAINT "workout_blocks_score_type_check" CHECK ("workout_blocks"."score_type" in ('time', 'rounds_reps', 'load', 'reps', 'distance', 'calories', 'none')),
	CONSTRAINT "workout_blocks_percent_check" CHECK ("workout_blocks"."percent" is null or "workout_blocks"."percent" between 1 and 150)
);
--> statement-breakpoint
CREATE TABLE "workout_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"level" text NOT NULL,
	"time_seconds" integer,
	"rounds" integer,
	"reps" integer,
	"load_kg" numeric(6, 2),
	"distance_m" integer,
	"calories" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"effort" integer,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_results_level_check" CHECK ("workout_results"."level" in ('scaled', 'rx', 'rx_plus')),
	CONSTRAINT "workout_results_effort_check" CHECK ("workout_results"."effort" is null or "workout_results"."effort" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"team_id" uuid,
	"on_date" date NOT NULL,
	"title" text,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_status_check" CHECK ("workouts"."status" in ('draft', 'published'))
);
--> statement-breakpoint
ALTER TABLE "physical_tests" DROP CONSTRAINT "physical_tests_unit_check";--> statement-breakpoint
ALTER TABLE "ai_generations" ALTER COLUMN "team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "club_model" text DEFAULT 'sports' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "booking_mode" text DEFAULT 'roster' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "coach_user_id" uuid;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD COLUMN "coach_user_id" uuid;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "entitlement" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "sessions" integer;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "validity_days" integer;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "class_team_ids" jsonb;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "member_price_cents" integer;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "kind" text DEFAULT 'training' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_preferences" ADD CONSTRAINT "fitness_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_preferences" ADD CONSTRAINT "fitness_preferences_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_trial_event_id_events_id_fk" FOREIGN KEY ("trial_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_player_id_players_id_fk" FOREIGN KEY ("converted_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_result_id_workout_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."workout_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_block_id_workout_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_reads_unique" ON "announcement_reads" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_organization_id_idx" ON "announcement_reads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "announcements_org_published_idx" ON "announcements" USING btree ("organization_id","published_at");--> statement-breakpoint
CREATE INDEX "benchmark_results_player_code_idx" ON "benchmark_results" USING btree ("player_id","benchmark_code");--> statement-breakpoint
CREATE INDEX "benchmark_results_organization_id_idx" ON "benchmark_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "body_measurements_player_date_idx" ON "body_measurements" USING btree ("player_id","on_date");--> statement-breakpoint
CREATE INDEX "body_measurements_organization_id_idx" ON "body_measurements" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_event_player_unique" ON "bookings" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE INDEX "bookings_organization_id_idx" ON "bookings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bookings_player_id_idx" ON "bookings" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "bookings_event_status_idx" ON "bookings" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "direct_messages_player_created_idx" ON "direct_messages" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "direct_messages_organization_id_idx" ON "direct_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fitness_preferences_organization_id_idx" ON "fitness_preferences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leads_org_status_idx" ON "leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "personal_records_player_movement_idx" ON "personal_records" USING btree ("player_id","movement_code");--> statement-breakpoint
CREATE INDEX "personal_records_organization_id_idx" ON "personal_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_player_id_idx" ON "subscriptions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "workout_blocks_workout_id_idx" ON "workout_blocks" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "workout_blocks_organization_id_idx" ON "workout_blocks" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_results_block_player_unique" ON "workout_results" USING btree ("block_id","player_id");--> statement-breakpoint
CREATE INDEX "workout_results_organization_id_idx" ON "workout_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workout_results_player_id_idx" ON "workout_results" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "workouts_organization_date_idx" ON "workouts" USING btree ("organization_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_section_date_unique" ON "workouts" USING btree ("section_id","on_date") WHERE "workouts"."team_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_team_date_unique" ON "workouts" USING btree ("team_id","on_date") WHERE "workouts"."team_id" is not null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD CONSTRAINT "team_schedules_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_coach_user_id_idx" ON "events" USING btree ("coach_user_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_club_model_check" CHECK ("organizations"."club_model" in ('sports', 'fitness'));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_booking_mode_check" CHECK ("teams"."booking_mode" in ('roster', 'open'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_check" CHECK ("events"."capacity" is null or "events"."capacity" >= 1);--> statement-breakpoint
ALTER TABLE "team_schedules" ADD CONSTRAINT "team_schedules_capacity_check" CHECK ("team_schedules"."capacity" is null or "team_schedules"."capacity" >= 1);--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_entitlement_check" CHECK ("fee_plans"."entitlement" in ('none', 'unlimited', 'per_week', 'per_month', 'pack'));--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_sessions_check" CHECK ("fee_plans"."entitlement" not in ('per_week', 'per_month', 'pack') or "fee_plans"."sessions" >= 1);--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_member_price_check" CHECK ("store_products"."member_price_cents" is null or "store_products"."member_price_cents" between 0 and "store_products"."price_cents");--> statement-breakpoint
ALTER TABLE "physical_tests" ADD CONSTRAINT "physical_tests_unit_check" CHECK ("physical_tests"."unit" in ('s', 'cm', 'm', 'km_h', 'level', 'count', 'kg'));--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_kind_check" CHECK ("ai_generations"."kind" in ('training', 'wod'));--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_team_check" CHECK ("ai_generations"."kind" <> 'training' or "ai_generations"."team_id" is not null);