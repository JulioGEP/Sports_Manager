CREATE TABLE "club_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"member_number" integer NOT NULL,
	"member_type_id" uuid,
	"joined_on" date DEFAULT now() NOT NULL,
	"left_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_status_check" CHECK ("club_members"."status" in ('active', 'pending', 'suspended', 'left')),
	CONSTRAINT "club_members_number_check" CHECK ("club_members"."member_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "member_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_types_status_check" CHECK ("member_types"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" date,
	"gender" text,
	"email" text,
	"phone" text,
	"national_id" text,
	"photo_blob_key" text,
	"user_id" uuid,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_status_check" CHECK ("people"."status" in ('active', 'inactive')),
	CONSTRAINT "people_gender_check" CHECK ("people"."gender" is null or "people"."gender" in ('female', 'male', 'other')),
	CONSTRAINT "people_email_lowercase" CHECK ("people"."email" is null or "people"."email" = lower("people"."email"))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" text,
	"birth_year_from" integer,
	"birth_year_to" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_status_check" CHECK ("categories"."status" in ('active', 'archived')),
	CONSTRAINT "categories_gender_check" CHECK ("categories"."gender" is null or "categories"."gender" in ('male', 'female', 'mixed')),
	CONSTRAINT "categories_years_check" CHECK ("categories"."birth_year_from" is null or "categories"."birth_year_to" is null or "categories"."birth_year_from" <= "categories"."birth_year_to")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_status_check" CHECK ("attendance"."status" in ('present', 'absent', 'excused'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"section_id" uuid,
	"team_id" uuid,
	"facility_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"opponent" text,
	"home_away" text,
	"notes" text,
	"series_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_kind_check" CHECK ("events"."kind" in ('training', 'match', 'activity', 'meeting', 'booking', 'other')),
	CONSTRAINT "events_home_away_check" CHECK ("events"."home_away" is null or "events"."home_away" in ('home', 'away')),
	CONSTRAINT "events_range_check" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"capacity" integer,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_kind_check" CHECK ("facilities"."kind" in ('pool', 'court', 'field', 'room', 'gym', 'other')),
	CONSTRAINT "facilities_status_check" CHECK ("facilities"."status" in ('active', 'archived')),
	CONSTRAINT "facilities_capacity_check" CHECK ("facilities"."capacity" is null or "facilities"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "facility_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_hours_weekday_check" CHECK ("facility_hours"."weekday" between 1 and 7),
	CONSTRAINT "facility_hours_range_check" CHECK ("facility_hours"."closes_at" > "facility_hours"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "team_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"facility_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_schedules_weekday_check" CHECK ("team_schedules"."weekday" between 1 and 7),
	CONSTRAINT "team_schedules_range_check" CHECK ("team_schedules"."ends_at" > "team_schedules"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"fee_plan_id" uuid,
	"concept" text NOT NULL,
	"period_label" text,
	"amount_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_charges_status_check" CHECK ("fee_charges"."status" in ('pending', 'paid', 'overdue', 'cancelled')),
	CONSTRAINT "fee_charges_amount_check" CHECK ("fee_charges"."amount_cents" >= 1),
	CONSTRAINT "fee_charges_paid_check" CHECK ("fee_charges"."paid_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"period" text NOT NULL,
	"member_type_id" uuid,
	"section_id" uuid,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_plans_period_check" CHECK ("fee_plans"."period" in ('monthly', 'quarterly', 'yearly', 'once')),
	CONSTRAINT "fee_plans_status_check" CHECK ("fee_plans"."status" in ('active', 'archived')),
	CONSTRAINT "fee_plans_amount_check" CHECK ("fee_plans"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"paid_on" date NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref"),
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash', 'transfer', 'card', 'stripe', 'other')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_cents" >= 1)
);
--> statement-breakpoint
DROP INDEX "players_org_name_idx";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" text DEFAULT 'Europe/Madrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "payments_provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "player_guardians" ADD COLUMN "guardian_person_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "sport_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "kind" text DEFAULT 'competition' NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "coordinator_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "team_staff" ADD COLUMN "role_in_team" text DEFAULT 'head_coach' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_member_type_id_member_types_id_fk" FOREIGN KEY ("member_type_id") REFERENCES "public"."member_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_types" ADD CONSTRAINT "member_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_hours" ADD CONSTRAINT "facility_hours_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_hours" ADD CONSTRAINT "facility_hours_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD CONSTRAINT "team_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD CONSTRAINT "team_schedules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_schedules" ADD CONSTRAINT "team_schedules_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_member_type_id_member_types_id_fk" FOREIGN KEY ("member_type_id") REFERENCES "public"."member_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fee_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."fee_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_members_org_person_unique" ON "club_members" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_members_org_number_unique" ON "club_members" USING btree ("organization_id","member_number");--> statement-breakpoint
CREATE INDEX "club_members_organization_id_idx" ON "club_members" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_types_org_name_unique" ON "member_types" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "member_types_organization_id_idx" ON "member_types" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "people_organization_id_idx" ON "people" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "people_org_name_idx" ON "people" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "people_org_user_unique" ON "people" USING btree ("organization_id","user_id") WHERE "people"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_section_name_unique" ON "categories" USING btree ("section_id","name");--> statement-breakpoint
CREATE INDEX "categories_organization_id_idx" ON "categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "categories_section_id_idx" ON "categories" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_event_player_unique" ON "attendance" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE INDEX "attendance_organization_id_idx" ON "attendance" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attendance_player_id_idx" ON "attendance" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "events_org_starts_idx" ON "events" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_team_id_idx" ON "events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "events_facility_id_idx" ON "events" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "events_series_id_idx" ON "events" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_org_name_unique" ON "facilities" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "facilities_organization_id_idx" ON "facilities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "facility_hours_facility_id_idx" ON "facility_hours" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "facility_hours_organization_id_idx" ON "facility_hours" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_schedules_team_id_idx" ON "team_schedules" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_schedules_organization_id_idx" ON "team_schedules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fee_charges_organization_id_idx" ON "fee_charges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fee_charges_person_id_idx" ON "fee_charges" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "fee_charges_org_status_due_idx" ON "fee_charges" USING btree ("organization_id","status","due_on");--> statement-breakpoint
CREATE INDEX "fee_plans_organization_id_idx" ON "fee_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_organization_id_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_charge_id_idx" ON "payments" USING btree ("charge_id");--> statement-breakpoint
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_person_unique" ON "players" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "teams_category_id_idx" ON "teams" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_payments_provider_check" CHECK ("organizations"."payments_provider" in ('manual', 'stripe'));--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_kind_check" CHECK ("sections"."kind" in ('competition', 'activity'));--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_role_check" CHECK ("team_staff"."role_in_team" in ('head_coach', 'assistant', 'delegate', 'physio', 'other'));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_capacity_check" CHECK ("teams"."capacity" is null or "teams"."capacity" >= 1);
--> statement-breakpoint
-- Migración de datos (Bloque 14, ADR 0031). Se ejecuta con las columnas nuevas ya creadas y antes
-- de hacerlas obligatorias. Idempotente: cada paso salta lo que ya está migrado.
-- 1. Cada sección hereda el deporte del club.
UPDATE "sections" s
SET "sport_id" = o."default_sport_id"
FROM "organizations" o
WHERE o."id" = s."organization_id" AND s."sport_id" IS NULL;--> statement-breakpoint
-- 2. Cada texto de categoría distinto dentro de una sección pasa a ser una categoría; sin texto, "General".
INSERT INTO "categories" ("organization_id", "section_id", "name", "sort_order")
SELECT DISTINCT t."organization_id", t."section_id", COALESCE(NULLIF(trim(t."category"), ''), 'General'),
  CASE COALESCE(NULLIF(trim(t."category"), ''), 'General')
    WHEN 'Prebenjamín' THEN 10 WHEN 'Benjamín' THEN 20 WHEN 'Alevín' THEN 30 WHEN 'Infantil' THEN 40
    WHEN 'Cadete' THEN 50 WHEN 'Juvenil' THEN 60 WHEN 'Júnior' THEN 70 WHEN 'Sénior' THEN 80 ELSE 100 END
FROM "teams" t
WHERE t."category_id" IS NULL
ON CONFLICT ("section_id", "name") DO NOTHING;--> statement-breakpoint
UPDATE "teams" t
SET "category_id" = c."id"
FROM "categories" c
WHERE t."category_id" IS NULL
  AND c."section_id" = t."section_id"
  AND c."name" = COALESCE(NULLIF(trim(t."category"), ''), 'General');--> statement-breakpoint
-- 3. Cada jugador pasa a ser una persona del club con su nombre, nacimiento y foto. Una columna
--    temporal guarda el id del jugador para casar cada fila sin ambigüedad.
ALTER TABLE "people" ADD COLUMN "legacy_player_id" uuid;--> statement-breakpoint
INSERT INTO "people" ("organization_id", "first_name", "last_name", "birth_date", "photo_blob_key", "status", "created_at", "legacy_player_id")
SELECT p."organization_id", p."first_name", p."last_name", p."birth_date", p."photo_blob_key",
  CASE p."status" WHEN 'inactive' THEN 'inactive' ELSE 'active' END, p."created_at", p."id"
FROM "players" p
WHERE p."person_id" IS NULL;--> statement-breakpoint
UPDATE "players" p
SET "person_id" = x."id"
FROM "people" x
WHERE p."person_id" IS NULL AND x."legacy_player_id" = p."id";--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN "legacy_player_id";--> statement-breakpoint
-- 4. Cada cuenta de familia tiene su persona, para poder ser socia y pagar cuotas.
INSERT INTO "people" ("organization_id", "first_name", "last_name", "email", "user_id")
SELECT DISTINCT ON (g."organization_id", g."user_id") g."organization_id",
  COALESCE(NULLIF(split_part(u."name", ' ', 1), ''), u."name"),
  COALESCE(NULLIF(substr(u."name", length(split_part(u."name", ' ', 1)) + 2), ''), '·'),
  u."email", u."id"
FROM "player_guardians" g
JOIN "users" u ON u."id" = g."user_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "people" x WHERE x."organization_id" = g."organization_id" AND x."user_id" = g."user_id"
);--> statement-breakpoint
UPDATE "player_guardians" g
SET "guardian_person_id" = x."id"
FROM "people" x
WHERE g."guardian_person_id" IS NULL
  AND x."organization_id" = g."organization_id" AND x."user_id" = g."user_id";--> statement-breakpoint
-- 5. Todo club tiene un tipo de socio por defecto.
INSERT INTO "member_types" ("organization_id", "name", "sort_order")
SELECT o."id", 'Socio', 10 FROM "organizations" o
ON CONFLICT ("organization_id", "name") DO NOTHING;--> statement-breakpoint
-- 6. Y ahora las columnas pasan a ser obligatorias, como dice el esquema.
ALTER TABLE "players" ALTER COLUMN "person_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ALTER COLUMN "sport_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "category_id" SET NOT NULL;
