-- Club de demostración, retos por sección o equipo (ADR 0032). El reto de hábitos pasa a ser de
-- la sección de fútbol sala (lo resuelve la migración anterior) y la entrenadora del Alevín A
-- tiene su propio reto de equipo, activo, con tres pruebas técnicas y un registro de Clara Martí
-- pendiente de validar. Todos los datos son ficticios. Idempotente: cada inserción salta si ya existe.

INSERT INTO "challenges" (
  "organization_id", "section_id", "team_id", "season_id", "name", "description",
  "starts_on", "ends_on", "min_points", "target_points", "status", "created_by"
)
SELECT o."id", sec."id", t."id", sea."id", 'Reto técnico del Alevín A',
  'Toques, conducción y gestos técnicos en casa. Solo para el Alevín A; lo valida su entrenadora.',
  DATE '2026-10-15', DATE '2026-11-30', 20, 60, 'active', u."id"
FROM "organizations" o
JOIN "sections" sec ON sec."organization_id" = o."id" AND sec."name" = 'Fútbol sala'
JOIN "seasons" sea ON sea."organization_id" = o."id" AND sea."name" = '2026-27'
JOIN "teams" t ON t."organization_id" = o."id" AND t."section_id" = sec."id"
  AND t."season_id" = sea."id" AND t."name" = 'Alevín A'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM "challenges" c WHERE c."organization_id" = o."id" AND c."name" = 'Reto técnico del Alevín A'
  );

INSERT INTO "challenge_tasks" ("organization_id", "challenge_id", "name", "area", "kind", "points_per_unit", "max_points", "sort_order")
SELECT o."id", c."id", v."name", v."area", v."kind", v."ppu", v."max", v."sort"
FROM "organizations" o
JOIN "challenges" c ON c."organization_id" = o."id" AND c."name" = 'Reto técnico del Alevín A'
CROSS JOIN (VALUES
  ('Reto de 50 toques', 'technique', 'sessions', 2, 20, 10),
  ('Conducción en zigzag', 'technique', 'sessions', 2, 20, 20),
  ('Árbol de gestos técnicos', 'technique', 'rating', 2, 10, 30)
) AS v("name", "area", "kind", "ppu", "max", "sort")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM "challenge_tasks" t WHERE t."challenge_id" = c."id" AND t."name" = v."name"
  );

INSERT INTO "challenge_submissions" (
  "organization_id", "challenge_id", "task_id", "player_id", "submitted_by",
  "quantity", "points", "note", "happened_on", "status"
)
SELECT o."id", c."id", t."id", p."id", fam."id", 2, 4, 'Dos tardes en el patio', DATE '2026-10-18', 'submitted'
FROM "organizations" o
JOIN "challenges" c ON c."organization_id" = o."id" AND c."name" = 'Reto técnico del Alevín A'
JOIN "challenge_tasks" t ON t."challenge_id" = c."id" AND t."name" = 'Conducción en zigzag'
JOIN "players" p ON p."organization_id" = o."id"
JOIN "people" pe ON pe."id" = p."person_id" AND pe."first_name" = 'Clara' AND pe."last_name" = 'Martí'
LEFT JOIN "users" fam ON fam."email" = 'familia@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "challenge_submissions" s WHERE s."challenge_id" = c."id");
