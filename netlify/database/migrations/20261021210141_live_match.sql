CREATE TABLE "match_action_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"scope" text NOT NULL,
	"own_score" integer DEFAULT 0 NOT NULL,
	"opponent_score" integer DEFAULT 0 NOT NULL,
	"counts_foul" boolean DEFAULT false NOT NULL,
	"card" text,
	"requires_zone" boolean DEFAULT false NOT NULL,
	"keeper_only" boolean DEFAULT false NOT NULL,
	"weight" numeric(6, 2) DEFAULT '0' NOT NULL,
	"quick" boolean DEFAULT false NOT NULL,
	"mirror_of" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_action_types_category_check" CHECK ("match_action_types"."category" in ('positive', 'negative', 'neutral')),
	CONSTRAINT "match_action_types_scope_check" CHECK ("match_action_types"."scope" in ('player', 'team', 'opponent')),
	CONSTRAINT "match_action_types_status_check" CHECK ("match_action_types"."status" in ('active', 'archived')),
	CONSTRAINT "match_action_types_card_check" CHECK ("match_action_types"."card" is null or "match_action_types"."card" in ('yellow', 'red')),
	CONSTRAINT "match_action_types_score_check" CHECK ("match_action_types"."own_score" >= 0 and "match_action_types"."opponent_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"action_type_id" uuid,
	"action_code" text,
	"player_id" uuid,
	"related_player_id" uuid,
	"side" text DEFAULT 'own' NOT NULL,
	"period" integer NOT NULL,
	"clock_ms" integer NOT NULL,
	"zone" text,
	"on_court" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"own_score_delta" integer DEFAULT 0 NOT NULL,
	"opponent_score_delta" integer DEFAULT 0 NOT NULL,
	"note" text,
	"client_id" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_events_kind_check" CHECK ("match_events"."kind" in ('action', 'sub', 'period_start', 'period_end', 'lineup')),
	CONSTRAINT "match_events_side_check" CHECK ("match_events"."side" in ('own', 'opponent')),
	CONSTRAINT "match_events_zone_check" CHECK ("match_events"."zone" is null or "match_events"."zone" in ('r1c1', 'r1c2', 'r1c3', 'r2c1', 'r2c2', 'r2c3', 'r3c1', 'r3c2', 'r3c3')),
	CONSTRAINT "match_events_period_check" CHECK ("match_events"."period" >= 1 and "match_events"."clock_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"shirt_number" integer,
	"position" text,
	"is_goalkeeper" boolean DEFAULT false NOT NULL,
	"starter" boolean DEFAULT false NOT NULL,
	"slot" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_players_shirt_number_check" CHECK ("match_players"."shirt_number" is null or "match_players"."shirt_number" >= 0),
	CONSTRAINT "match_players_slot_check" CHECK ("match_players"."slot" is null or "match_players"."slot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"event_id" uuid,
	"opponent" text NOT NULL,
	"home_away" text NOT NULL,
	"played_on" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"formation" text,
	"attack_direction" text DEFAULT 'right' NOT NULL,
	"own_score" integer DEFAULT 0 NOT NULL,
	"opponent_score" integer DEFAULT 0 NOT NULL,
	"clock_period" integer DEFAULT 1 NOT NULL,
	"clock_elapsed_ms" integer DEFAULT 0 NOT NULL,
	"clock_running_since" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" in ('scheduled', 'live', 'finished')),
	CONSTRAINT "matches_home_away_check" CHECK ("matches"."home_away" in ('home', 'away')),
	CONSTRAINT "matches_attack_direction_check" CHECK ("matches"."attack_direction" in ('left', 'right')),
	CONSTRAINT "matches_score_check" CHECK ("matches"."own_score" >= 0 and "matches"."opponent_score" >= 0),
	CONSTRAINT "matches_clock_check" CHECK ("matches"."clock_period" >= 1 and "matches"."clock_elapsed_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "match_settings" jsonb;--> statement-breakpoint
ALTER TABLE "match_action_types" ADD CONSTRAINT "match_action_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_action_types" ADD CONSTRAINT "match_action_types_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_action_type_id_match_action_types_id_fk" FOREIGN KEY ("action_type_id") REFERENCES "public"."match_action_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_related_player_id_players_id_fk" FOREIGN KEY ("related_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_action_types_section_code_unique" ON "match_action_types" USING btree ("section_id","code");--> statement-breakpoint
CREATE INDEX "match_action_types_organization_id_idx" ON "match_action_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "match_action_types_section_id_idx" ON "match_action_types" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_match_seq_unique" ON "match_events" USING btree ("match_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_match_client_unique" ON "match_events" USING btree ("match_id","client_id") WHERE "match_events"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "match_events_organization_id_idx" ON "match_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "match_events_player_id_idx" ON "match_events" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_player_unique" ON "match_players" USING btree ("match_id","player_id");--> statement-breakpoint
CREATE INDEX "match_players_organization_id_idx" ON "match_players" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "match_players_player_id_idx" ON "match_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_organization_id_idx" ON "matches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "matches_team_played_idx" ON "matches" USING btree ("team_id","played_on");--> statement-breakpoint
CREATE INDEX "matches_event_id_idx" ON "matches" USING btree ("event_id");