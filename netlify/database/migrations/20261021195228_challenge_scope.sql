ALTER TABLE "challenges" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "team_id" uuid;--> statement-breakpoint
-- Retos anteriores a esta migración (ADR 0032): la sección donde juegan, esta temporada, los
-- jugadores con registros; si no hay registros, la primera sección activa del club.
UPDATE "challenges" c
SET "section_id" = picked."section_id"
FROM (
  SELECT DISTINCT ON (s."challenge_id") s."challenge_id", t."section_id"
  FROM "challenge_submissions" s
  JOIN "team_players" tp ON tp."player_id" = s."player_id" AND tp."organization_id" = s."organization_id"
  JOIN "teams" t ON t."id" = tp."team_id"
  JOIN "seasons" se ON se."id" = t."season_id" AND se."is_current" = true
  GROUP BY s."challenge_id", t."section_id"
  ORDER BY s."challenge_id", count(*) DESC, t."section_id"
) picked
WHERE picked."challenge_id" = c."id" AND c."section_id" IS NULL;--> statement-breakpoint
UPDATE "challenges" c
SET "section_id" = (
  SELECT s."id" FROM "sections" s
  WHERE s."organization_id" = c."organization_id"
  ORDER BY (s."status" = 'active') DESC, s."sort_order", s."name"
  LIMIT 1
)
WHERE c."section_id" IS NULL;--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenges_section_id_idx" ON "challenges" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "challenges_team_id_idx" ON "challenges" USING btree ("team_id");
