CREATE TABLE "access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile" text,
	"user_id" uuid,
	"area" text NOT NULL,
	"effect" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_rules_area_check" CHECK ("access_rules"."area" in ('sections', 'players', 'club_members', 'staff', 'agenda', 'facilities', 'challenges', 'fees', 'activity')),
	CONSTRAINT "access_rules_effect_check" CHECK ("access_rules"."effect" in ('allow', 'deny')),
	CONSTRAINT "access_rules_profile_check" CHECK ("access_rules"."profile" is null or "access_rules"."profile" in ('org_admin', 'staff', 'coach', 'guardian', 'director', 'coordinator', 'delegate', 'physio', 'fitness', 'psychologist', 'scout')),
	CONSTRAINT "access_rules_subject_check" CHECK (("access_rules"."profile" is null) <> ("access_rules"."user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "player_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_staff" ADD CONSTRAINT "player_staff_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_staff" ADD CONSTRAINT "player_staff_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_staff" ADD CONSTRAINT "player_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_staff" ADD CONSTRAINT "player_staff_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_staff" ADD CONSTRAINT "section_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_rules_org_profile_area_unique" ON "access_rules" USING btree ("organization_id","profile","area") WHERE "access_rules"."profile" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_rules_org_user_area_unique" ON "access_rules" USING btree ("organization_id","user_id","area") WHERE "access_rules"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "access_rules_organization_id_idx" ON "access_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_staff_player_user_unique" ON "player_staff" USING btree ("player_id","user_id");--> statement-breakpoint
CREATE INDEX "player_staff_organization_id_idx" ON "player_staff" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "player_staff_user_id_idx" ON "player_staff" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_staff_section_user_unique" ON "section_staff" USING btree ("section_id","user_id");--> statement-breakpoint
CREATE INDEX "section_staff_organization_id_idx" ON "section_staff" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "section_staff_user_id_idx" ON "section_staff" USING btree ("user_id");