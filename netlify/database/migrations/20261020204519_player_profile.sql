CREATE TABLE "player_development_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"technical" text,
	"tactical" text,
	"physical" text,
	"emotional" text,
	"habits" text,
	"person" text,
	"coordinator_user_id" uuid,
	"next_review_on" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_development_plans_status_check" CHECK ("player_development_plans"."status" in ('draft', 'active', 'shared'))
);
--> statement-breakpoint
CREATE TABLE "player_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"happened_on" date NOT NULL,
	"details" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_events_kind_check" CHECK ("player_events"."kind" in ('joined', 'roster_added', 'roster_removed', 'status_changed', 'objective_updated', 'indicators_updated', 'plan_updated', 'photo_updated', 'note'))
);
--> statement-breakpoint
CREATE TABLE "player_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_indicators_dimension_check" CHECK ("player_indicators"."dimension" in ('sport', 'body', 'wellbeing', 'commitment')),
	CONSTRAINT "player_indicators_score_check" CHECK ("player_indicators"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "player_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"title" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"owner_user_id" uuid,
	"review_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_objectives_progress_check" CHECK ("player_objectives"."progress" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "photo_blob_key" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "dominant_foot" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "player_development_plans" ADD CONSTRAINT "player_development_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_development_plans" ADD CONSTRAINT "player_development_plans_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_development_plans" ADD CONSTRAINT "player_development_plans_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_indicators" ADD CONSTRAINT "player_indicators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_indicators" ADD CONSTRAINT "player_indicators_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_indicators" ADD CONSTRAINT "player_indicators_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_objectives" ADD CONSTRAINT "player_objectives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_objectives" ADD CONSTRAINT "player_objectives_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_objectives" ADD CONSTRAINT "player_objectives_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_development_plans_player_unique" ON "player_development_plans" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_development_plans_organization_id_idx" ON "player_development_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_events_player_happened_idx" ON "player_events" USING btree ("player_id","happened_on");--> statement-breakpoint
CREATE INDEX "player_events_organization_id_idx" ON "player_events" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_indicators_player_dimension_unique" ON "player_indicators" USING btree ("player_id","dimension");--> statement-breakpoint
CREATE INDEX "player_indicators_organization_id_idx" ON "player_indicators" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_objectives_player_unique" ON "player_objectives" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_objectives_organization_id_idx" ON "player_objectives" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_dominant_foot_check" CHECK ("players"."dominant_foot" is null or "players"."dominant_foot" in ('right', 'left', 'both'));--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_height_cm_check" CHECK ("players"."height_cm" is null or "players"."height_cm" between 50 and 250);