CREATE TABLE "player_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_guardians_relationship_check" CHECK ("player_guardians"."relationship" in ('mother', 'father', 'guardian', 'grandparent', 'other'))
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_status_check" CHECK ("players"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_dates_check" CHECK ("seasons"."ends_on" > "seasons"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_status_check" CHECK ("sections"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "team_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"shirt_number" integer,
	"position" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_players_shirt_number_check" CHECK ("team_players"."shirt_number" is null or "team_players"."shirt_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "team_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_status_check" CHECK ("teams"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "voice" text DEFAULT 'cercana' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "relationship" text;--> statement-breakpoint
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_guardians_player_user_unique" ON "player_guardians" USING btree ("player_id","user_id");--> statement-breakpoint
CREATE INDEX "player_guardians_organization_id_idx" ON "player_guardians" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_guardians_user_id_idx" ON "player_guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "players_organization_id_idx" ON "players" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "players_org_name_idx" ON "players" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_org_name_unique" ON "seasons" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_org_current_unique" ON "seasons" USING btree ("organization_id") WHERE "seasons"."is_current" = true;--> statement-breakpoint
CREATE INDEX "seasons_organization_id_idx" ON "seasons" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_org_name_unique" ON "sections" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "sections_organization_id_idx" ON "sections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_players_team_player_unique" ON "team_players" USING btree ("team_id","player_id");--> statement-breakpoint
CREATE INDEX "team_players_organization_id_idx" ON "team_players" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_players_player_id_idx" ON "team_players" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_staff_team_user_unique" ON "team_staff" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_staff_organization_id_idx" ON "team_staff" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_staff_user_id_idx" ON "team_staff" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_season_section_name_unique" ON "teams" USING btree ("season_id","section_id","name");--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teams_season_id_idx" ON "teams" USING btree ("season_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_voice_check" CHECK ("organizations"."voice" in ('cercana', 'profesional', 'vestuario'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_relationship_check" CHECK ("invitations"."relationship" is null or "invitations"."relationship" in ('mother', 'father', 'guardian', 'grandparent', 'other'));