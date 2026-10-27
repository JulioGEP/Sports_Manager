CREATE TABLE "box_plan_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "box_plans" DROP CONSTRAINT "box_plans_frequency_check";--> statement-breakpoint
DROP INDEX "workouts_section_date_unique";--> statement-breakpoint
DROP INDEX "workouts_team_date_unique";--> statement-breakpoint
DROP INDEX "box_plans_active_unique";--> statement-breakpoint
ALTER TABLE "fee_plans" ADD COLUMN "includes_programming" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "specific" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "box_plans" ADD COLUMN "audience" text DEFAULT 'section' NOT NULL;--> statement-breakpoint
ALTER TABLE "box_plans" ADD COLUMN "audience_level" text;--> statement-breakpoint
ALTER TABLE "box_plans" ADD COLUMN "audience_name" text;--> statement-breakpoint
ALTER TABLE "box_plans" ADD COLUMN "weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "box_plan_members" ADD CONSTRAINT "box_plan_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plan_members" ADD CONSTRAINT "box_plan_members_plan_id_box_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."box_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plan_members" ADD CONSTRAINT "box_plan_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_plan_members" ADD CONSTRAINT "box_plan_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "box_plan_members_unique" ON "box_plan_members" USING btree ("plan_id","player_id");--> statement-breakpoint
CREATE INDEX "box_plan_members_organization_id_idx" ON "box_plan_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "box_plan_members_player_idx" ON "box_plan_members" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_plan_date_unique" ON "workouts" USING btree ("plan_id","on_date") WHERE "workouts"."specific";--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_section_date_unique" ON "workouts" USING btree ("section_id","on_date") WHERE "workouts"."team_id" is null and not "workouts"."specific";--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_team_date_unique" ON "workouts" USING btree ("team_id","on_date") WHERE "workouts"."team_id" is not null and not "workouts"."specific";--> statement-breakpoint
CREATE UNIQUE INDEX "box_plans_active_unique" ON "box_plans" USING btree ("section_id") WHERE "box_plans"."status" = 'active' and "box_plans"."audience" = 'section';--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_specific_plan_check" CHECK (not "workouts"."specific" or "workouts"."plan_id" is not null);--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_audience_check" CHECK ("box_plans"."audience" in ('section', 'level', 'group', 'athlete'));--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_audience_level_check" CHECK ("box_plans"."audience_level" is null or "box_plans"."audience_level" in ('foundations', 'scaled', 'rx', 'rx_plus'));--> statement-breakpoint
ALTER TABLE "box_plans" ADD CONSTRAINT "box_plans_frequency_check" CHECK ("box_plans"."frequency" between 1 and 7);