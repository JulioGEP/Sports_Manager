-- Ficha ampliada del club de demostración (Bloque 12, ADR 0029): Clara Martí (Alevín A) llega con
-- altura, pie dominante, indicadores, objetivo individual, plan de desarrollo y registros, para
-- ver la ficha completa sin picar datos. La entrenadora (entrenador@demo.test) es la responsable.
-- Todos los datos son ficticios. Idempotente: cada inserción salta si ya existe.

-- Datos deportivos
UPDATE "players" p
SET "dominant_foot" = 'right', "height_cm" = 142
FROM "organizations" o
WHERE o."slug" = 'demo'
  AND p."organization_id" = o."id"
  AND p."first_name" = 'Clara' AND p."last_name" = 'Martí'
  AND p."dominant_foot" IS NULL AND p."height_cm" IS NULL;

-- Objetivo individual vigente
INSERT INTO "player_objectives" ("organization_id", "player_id", "title", "progress", "owner_user_id", "review_on")
SELECT o."id", p."id", 'Mejorar la conducción con la pierna no dominante', 45, u."id", DATE '2026-11-15'
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id" AND p."first_name" = 'Clara' AND p."last_name" = 'Martí'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id") DO NOTHING;

-- Indicadores
INSERT INTO "player_indicators" ("organization_id", "player_id", "dimension", "score", "note", "updated_by")
SELECT o."id", p."id", v."dimension", v."score", v."note", u."id"
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id" AND p."first_name" = 'Clara' AND p."last_name" = 'Martí'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
CROSS JOIN (VALUES
  ('sport', 72, 'Bien · Técnica y táctica'),
  ('body', 80, 'Estable · Disponibilidad y carga'),
  ('wellbeing', 68, 'Atención · Motivación y estado emocional'),
  ('commitment', 90, 'Correcto · Asistencia y participación')
) AS v("dimension", "score", "note")
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id", "dimension") DO NOTHING;

-- Plan de desarrollo individual
INSERT INTO "player_development_plans" (
  "organization_id", "player_id", "technical", "tactical", "physical", "emotional", "habits", "person",
  "coordinator_user_id", "next_review_on", "status"
)
SELECT o."id", p."id",
  'Conducción con la pierna izquierda',
  'Lectura del segundo palo',
  'Coordinación',
  'Gestión de la frustración',
  'Dormir 9 horas',
  'Ayudar a quien llega nuevo al equipo',
  u."id", DATE '2026-12-01', 'draft'
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id" AND p."first_name" = 'Clara' AND p."last_name" = 'Martí'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id") DO NOTHING;

-- Registros del timeline (el alta en el club sale de la fecha de creación, no se guarda)
INSERT INTO "player_events" ("organization_id", "player_id", "kind", "happened_on", "details", "actor_user_id")
SELECT o."id", p."id", v."kind", v."happened_on", v."details"::jsonb, u."id"
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id" AND p."first_name" = 'Clara' AND p."last_name" = 'Martí'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
CROSS JOIN (VALUES
  ('note', DATE '2026-06-20', '{"text":"Cierra la temporada 2025-26 con el Benjamín A: gran progresión en portería."}'),
  ('roster_added', DATE '2026-09-01', '{"team":"Alevín A","season":"2026-27"}'),
  ('objective_updated', DATE '2026-10-05', '{"title":"Mejorar la conducción con la pierna no dominante","progress":45}')
) AS v("kind", "happened_on", "details")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "player_events" e WHERE e."player_id" = p."id");
