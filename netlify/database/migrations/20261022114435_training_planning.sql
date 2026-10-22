CREATE TABLE "drill_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"drill_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"section_id" uuid,
	"team_id" uuid,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"rules" text,
	"coaching_points" text,
	"variants" text,
	"format" text,
	"space" text,
	"players_min" integer,
	"players_max" integer,
	"duration_min" integer,
	"target_rpe" integer,
	"material" text,
	"diagram" jsonb,
	"video_url" text,
	"restriction_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seed_key" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drills_scope_check" CHECK ("drills"."scope" in ('club', 'section', 'team', 'personal')),
	CONSTRAINT "drills_status_check" CHECK ("drills"."status" in ('active', 'archived')),
	CONSTRAINT "drills_target_rpe_check" CHECK ("drills"."target_rpe" is null or "drills"."target_rpe" between 0 and 10),
	CONSTRAINT "drills_duration_check" CHECK ("drills"."duration_min" is null or "drills"."duration_min" between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "health_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"granted_by_name" text NOT NULL,
	"relationship" text NOT NULL,
	"granted_on" date NOT NULL,
	"text_version" text NOT NULL,
	"revoked_on" date,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_consents_relationship_check" CHECK ("health_consents"."relationship" in ('self', 'guardian'))
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"context" text NOT NULL,
	"event_id" uuid,
	"match_id" uuid,
	"body_area" text NOT NULL,
	"side" text NOT NULL,
	"kind" text NOT NULL,
	"mechanism" text NOT NULL,
	"recurrence" boolean DEFAULT false NOT NULL,
	"diagnosis" text,
	"clinical_notes" text,
	"expected_return_on" date,
	"returned_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "injuries_context_check" CHECK ("injuries"."context" in ('training', 'match', 'other')),
	CONSTRAINT "injuries_body_area_check" CHECK ("injuries"."body_area" in ('head', 'neck', 'shoulder', 'arm', 'wrist_hand', 'chest', 'back', 'hip_groin', 'thigh_front', 'thigh_back', 'knee', 'calf', 'ankle', 'foot', 'other')),
	CONSTRAINT "injuries_side_check" CHECK ("injuries"."side" in ('left', 'right', 'both', 'none')),
	CONSTRAINT "injuries_kind_check" CHECK ("injuries"."kind" in ('muscle', 'ligament', 'tendon', 'bone', 'joint', 'contusion', 'concussion', 'illness', 'other')),
	CONSTRAINT "injuries_mechanism_check" CHECK ("injuries"."mechanism" in ('contact', 'non_contact')),
	CONSTRAINT "injuries_status_check" CHECK ("injuries"."status" in ('active', 'rehab', 'recovered')),
	CONSTRAINT "injuries_dates_check" CHECK ("injuries"."returned_on" is null or "injuries"."returned_on" >= "injuries"."occurred_on")
);
--> statement-breakpoint
CREATE TABLE "insight_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid,
	"rule" text NOT NULL,
	"fingerprint" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"snooze_until" date,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_feedback_outcome_check" CHECK ("insight_feedback"."outcome" in ('applied', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "microcycle_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"value" numeric(10, 3) NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "physical_tests_unit_check" CHECK ("physical_tests"."unit" in ('s', 'cm', 'm', 'km_h', 'level', 'count')),
	CONSTRAINT "physical_tests_direction_check" CHECK ("physical_tests"."direction" in ('higher_better', 'lower_better')),
	CONSTRAINT "physical_tests_status_check" CHECK ("physical_tests"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "player_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" text NOT NULL,
	"restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_minutes" integer,
	"from_on" date NOT NULL,
	"expected_return_on" date,
	"ended_on" date,
	"note" text,
	"injury_id" uuid,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_availability_status_check" CHECK ("player_availability"."status" in ('limited', 'rehab', 'out')),
	CONSTRAINT "player_availability_dates_check" CHECK ("player_availability"."ended_on" is null or "player_availability"."ended_on" >= "player_availability"."from_on")
);
--> statement-breakpoint
CREATE TABLE "player_focus_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"event_id" uuid,
	"match_id" uuid,
	"on_date" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"rpe" integer,
	"participation" text DEFAULT 'full' NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_loads_source_check" CHECK ("player_loads"."source" in ('session', 'match', 'extra')),
	CONSTRAINT "player_loads_participation_check" CHECK ("player_loads"."participation" in ('full', 'partial', 'rehab')),
	CONSTRAINT "player_loads_rpe_check" CHECK ("player_loads"."rpe" is null or "player_loads"."rpe" between 0 and 10),
	CONSTRAINT "player_loads_minutes_check" CHECK ("player_loads"."minutes" between 0 and 600),
	CONSTRAINT "player_loads_origin_check" CHECK (("player_loads"."source" = 'session' and "player_loads"."event_id" is not null) or ("player_loads"."source" = 'match' and "player_loads"."match_id" is not null) or ("player_loads"."source" = 'extra' and "player_loads"."event_id" is null and "player_loads"."match_id" is null))
);
--> statement-breakpoint
CREATE TABLE "rehab_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"injury_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"criteria" text,
	"started_on" date,
	"done_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"related_action_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_contents_kind_check" CHECK ("training_contents"."kind" in ('technical', 'tactical', 'physical', 'set_piece', 'goalkeeper', 'psychological')),
	CONSTRAINT "training_contents_status_check" CHECK ("training_contents"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "training_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"focus_content_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_weekly_load" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_cycles_dates_check" CHECK ("training_cycles"."ends_on" >= "training_cycles"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_session_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"drill_id" uuid,
	"title" text NOT NULL,
	"block" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"minutes" integer NOT NULL,
	"sets" integer,
	"reps" integer,
	"rest_sec" integer,
	"target_rpe" integer,
	"group_label" text,
	"player_ids" jsonb,
	"content_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"restriction_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"rating" integer,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_session_items_block_check" CHECK ("training_session_items"."block" in ('warmup', 'main', 'goalkeepers', 'rehab', 'cooldown')),
	CONSTRAINT "training_session_items_minutes_check" CHECK ("training_session_items"."minutes" between 1 and 240),
	CONSTRAINT "training_session_items_target_rpe_check" CHECK ("training_session_items"."target_rpe" is null or "training_session_items"."target_rpe" between 0 and 10),
	CONSTRAINT "training_session_items_rating_check" CHECK ("training_session_items"."rating" is null or "training_session_items"."rating" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"cycle_id" uuid,
	"md_label" text,
	"objective" text,
	"content_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_rpe" integer,
	"actual_minutes" integer,
	"rating" integer,
	"notes" text,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_status_check" CHECK ("training_sessions"."status" in ('draft', 'planned', 'done', 'cancelled')),
	CONSTRAINT "training_sessions_md_label_check" CHECK ("training_sessions"."md_label" is null or "training_sessions"."md_label" ~ '^MD([+-][1-6])?$'),
	CONSTRAINT "training_sessions_target_rpe_check" CHECK ("training_sessions"."target_rpe" is null or "training_sessions"."target_rpe" between 0 and 10),
	CONSTRAINT "training_sessions_rating_check" CHECK ("training_sessions"."rating" is null or "training_sessions"."rating" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "wellness_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"sleep" integer NOT NULL,
	"fatigue" integer NOT NULL,
	"soreness" integer NOT NULL,
	"stress" integer NOT NULL,
	"mood" integer NOT NULL,
	"soreness_area" text,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_entries_scale_check" CHECK ("wellness_entries"."sleep" between 1 and 5 and "wellness_entries"."fatigue" between 1 and 5 and "wellness_entries"."soreness" between 1 and 5 and "wellness_entries"."stress" between 1 and 5 and "wellness_entries"."mood" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "team_staff" DROP CONSTRAINT "team_staff_role_check";--> statement-breakpoint
ALTER TABLE "access_rules" DROP CONSTRAINT "access_rules_area_check";--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "training_settings" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "rpe" integer;--> statement-breakpoint
ALTER TABLE "drill_contents" ADD CONSTRAINT "drill_contents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_contents" ADD CONSTRAINT "drill_contents_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_contents" ADD CONSTRAINT "drill_contents_content_id_training_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."training_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_feedback" ADD CONSTRAINT "insight_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_feedback" ADD CONSTRAINT "insight_feedback_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_feedback" ADD CONSTRAINT "insight_feedback_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_feedback" ADD CONSTRAINT "insight_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microcycle_templates" ADD CONSTRAINT "microcycle_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microcycle_templates" ADD CONSTRAINT "microcycle_templates_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_test_id_physical_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."physical_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_tests" ADD CONSTRAINT "physical_tests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_availability" ADD CONSTRAINT "player_availability_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_availability" ADD CONSTRAINT "player_availability_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_availability" ADD CONSTRAINT "player_availability_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_availability" ADD CONSTRAINT "player_availability_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_focus_contents" ADD CONSTRAINT "player_focus_contents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_focus_contents" ADD CONSTRAINT "player_focus_contents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_focus_contents" ADD CONSTRAINT "player_focus_contents_content_id_training_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."training_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_loads" ADD CONSTRAINT "player_loads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_loads" ADD CONSTRAINT "player_loads_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_loads" ADD CONSTRAINT "player_loads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_loads" ADD CONSTRAINT "player_loads_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_loads" ADD CONSTRAINT "player_loads_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_phases" ADD CONSTRAINT "rehab_phases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_phases" ADD CONSTRAINT "rehab_phases_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_items" ADD CONSTRAINT "training_session_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_items" ADD CONSTRAINT "training_session_items_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_items" ADD CONSTRAINT "training_session_items_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_items" ADD CONSTRAINT "training_session_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_entries" ADD CONSTRAINT "wellness_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_entries" ADD CONSTRAINT "wellness_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_entries" ADD CONSTRAINT "wellness_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drill_contents_drill_content_unique" ON "drill_contents" USING btree ("drill_id","content_id");--> statement-breakpoint
CREATE INDEX "drill_contents_organization_id_idx" ON "drill_contents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "drill_contents_content_id_idx" ON "drill_contents" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "drills_organization_id_idx" ON "drills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "drills_section_id_idx" ON "drills" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "drills_team_id_idx" ON "drills" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drills_section_seed_unique" ON "drills" USING btree ("section_id","seed_key") WHERE "drills"."seed_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "health_consents_player_unique" ON "health_consents" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "health_consents_organization_id_idx" ON "health_consents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "injuries_organization_id_idx" ON "injuries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "injuries_player_id_idx" ON "injuries" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "insight_feedback_organization_id_idx" ON "insight_feedback" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "insight_feedback_team_id_idx" ON "insight_feedback" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_feedback_team_fingerprint_unique" ON "insight_feedback" USING btree ("team_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "microcycle_templates_section_name_unique" ON "microcycle_templates" USING btree ("section_id","name");--> statement-breakpoint
CREATE INDEX "microcycle_templates_organization_id_idx" ON "microcycle_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "physical_test_results_unique" ON "physical_test_results" USING btree ("test_id","player_id","on_date");--> statement-breakpoint
CREATE INDEX "physical_test_results_organization_id_idx" ON "physical_test_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "physical_test_results_player_id_idx" ON "physical_test_results" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "physical_tests_org_code_unique" ON "physical_tests" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "player_availability_organization_id_idx" ON "player_availability" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_availability_player_id_idx" ON "player_availability" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_availability_open_unique" ON "player_availability" USING btree ("player_id") WHERE "player_availability"."ended_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "player_focus_contents_player_content_unique" ON "player_focus_contents" USING btree ("player_id","content_id");--> statement-breakpoint
CREATE INDEX "player_focus_contents_organization_id_idx" ON "player_focus_contents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_loads_organization_id_idx" ON "player_loads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_loads_player_date_idx" ON "player_loads" USING btree ("player_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "player_loads_event_player_unique" ON "player_loads" USING btree ("event_id","player_id") WHERE "player_loads"."event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "player_loads_match_player_unique" ON "player_loads" USING btree ("match_id","player_id") WHERE "player_loads"."match_id" is not null;--> statement-breakpoint
CREATE INDEX "rehab_phases_organization_id_idx" ON "rehab_phases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rehab_phases_injury_id_idx" ON "rehab_phases" USING btree ("injury_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_contents_section_code_unique" ON "training_contents" USING btree ("section_id","code");--> statement-breakpoint
CREATE INDEX "training_contents_organization_id_idx" ON "training_contents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_cycles_organization_id_idx" ON "training_cycles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_cycles_plan_id_idx" ON "training_cycles" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plans_team_season_unique" ON "training_plans" USING btree ("team_id","season_id");--> statement-breakpoint
CREATE INDEX "training_plans_organization_id_idx" ON "training_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_session_items_organization_id_idx" ON "training_session_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_session_items_session_id_idx" ON "training_session_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "training_session_items_drill_id_idx" ON "training_session_items" USING btree ("drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_event_unique" ON "training_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "training_sessions_organization_id_idx" ON "training_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_sessions_team_id_idx" ON "training_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wellness_entries_player_date_unique" ON "wellness_entries" USING btree ("player_id","on_date");--> statement-breakpoint
CREATE INDEX "wellness_entries_organization_id_idx" ON "wellness_entries" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_role_check" CHECK ("team_staff"."role_in_team" in ('head_coach', 'assistant', 'goalkeeper_coach', 'fitness', 'delegate', 'physio', 'other'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_rpe_check" CHECK ("matches"."rpe" is null or "matches"."rpe" between 0 and 10);--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_area_check" CHECK ("access_rules"."area" in ('sections', 'players', 'club_members', 'staff', 'agenda', 'facilities', 'challenges', 'training', 'health', 'fees', 'activity'));