CREATE TABLE "suggestion_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by" uuid,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"area" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"public_title" text,
	"public_body" text,
	"response" text,
	"eta" text,
	"position" integer,
	"merged_into_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_status_check" CHECK ("suggestions"."status" in ('submitted', 'open', 'planned', 'in_progress', 'released', 'declined', 'merged')),
	CONSTRAINT "suggestions_area_check" CHECK ("suggestions"."area" in ('structure', 'people', 'agenda', 'training', 'matches', 'fees', 'store', 'family', 'communication', 'settings', 'other')),
	CONSTRAINT "suggestions_eta_format" CHECK ("suggestions"."eta" is null or "suggestions"."eta" ~ '^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$'),
	CONSTRAINT "suggestions_not_merged_into_itself" CHECK ("suggestions"."merged_into_id" is distinct from "suggestions"."id"),
	CONSTRAINT "suggestions_public_title_check" CHECK (not ("suggestions"."status" in ('open', 'planned', 'in_progress', 'released')) or "suggestions"."public_title" is not null)
);
--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_merged_into_id_suggestions_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suggestion_votes_suggestion_org_unique" ON "suggestion_votes" USING btree ("suggestion_id","organization_id");--> statement-breakpoint
CREATE INDEX "suggestion_votes_organization_id_idx" ON "suggestion_votes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "suggestions_organization_id_idx" ON "suggestions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suggestions_merged_into_id_idx" ON "suggestions" USING btree ("merged_into_id");