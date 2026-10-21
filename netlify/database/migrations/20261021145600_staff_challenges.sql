CREATE TABLE "challenge_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"submitted_by" uuid,
	"quantity" integer NOT NULL,
	"points" integer NOT NULL,
	"note" text,
	"happened_on" date NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_submissions_status_check" CHECK ("challenge_submissions"."status" in ('submitted', 'approved', 'rejected')),
	CONSTRAINT "challenge_submissions_quantity_check" CHECK ("challenge_submissions"."quantity" >= 1),
	CONSTRAINT "challenge_submissions_points_check" CHECK ("challenge_submissions"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "challenge_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"name" text NOT NULL,
	"area" text NOT NULL,
	"kind" text NOT NULL,
	"points_per_unit" integer NOT NULL,
	"max_points" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_tasks_area_check" CHECK ("challenge_tasks"."area" in ('training', 'technique', 'habits')),
	CONSTRAINT "challenge_tasks_kind_check" CHECK ("challenge_tasks"."kind" in ('sessions', 'rating')),
	CONSTRAINT "challenge_tasks_status_check" CHECK ("challenge_tasks"."status" in ('active', 'archived')),
	CONSTRAINT "challenge_tasks_points_check" CHECK ("challenge_tasks"."points_per_unit" >= 1),
	CONSTRAINT "challenge_tasks_max_points_check" CHECK ("challenge_tasks"."max_points" is null or "challenge_tasks"."max_points" >= 1)
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"starts_on" date,
	"ends_on" date,
	"min_points" integer DEFAULT 0 NOT NULL,
	"target_points" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_status_check" CHECK ("challenges"."status" in ('draft', 'active', 'closed')),
	CONSTRAINT "challenges_points_check" CHECK ("challenges"."target_points" >= "challenges"."min_points"),
	CONSTRAINT "challenges_dates_check" CHECK ("challenges"."starts_on" is null or "challenges"."ends_on" is null or "challenges"."ends_on" >= "challenges"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "player_events" DROP CONSTRAINT "player_events_kind_check";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "joined_on" date;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_task_id_challenge_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."challenge_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_tasks" ADD CONSTRAINT "challenge_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_tasks" ADD CONSTRAINT "challenge_tasks_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_submissions_challenge_player_idx" ON "challenge_submissions" USING btree ("challenge_id","player_id");--> statement-breakpoint
CREATE INDEX "challenge_submissions_challenge_status_idx" ON "challenge_submissions" USING btree ("challenge_id","status");--> statement-breakpoint
CREATE INDEX "challenge_submissions_organization_id_idx" ON "challenge_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "challenge_tasks_challenge_id_idx" ON "challenge_tasks" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenge_tasks_organization_id_idx" ON "challenge_tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "challenges_organization_id_idx" ON "challenges" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_position_check" CHECK ("memberships"."position" is null or "memberships"."position" in ('director', 'coordinator', 'delegate', 'physio', 'fitness', 'psychologist', 'scout'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_position_check" CHECK ("invitations"."position" is null or "invitations"."position" in ('director', 'coordinator', 'delegate', 'physio', 'fitness', 'psychologist', 'scout'));--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_kind_check" CHECK ("player_events"."kind" in ('joined', 'roster_added', 'roster_removed', 'status_changed', 'objective_updated', 'indicators_updated', 'plan_updated', 'photo_updated', 'note', 'challenge_closed'));