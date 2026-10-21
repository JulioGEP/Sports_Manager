-- Club de demostración, Bloque 13 (ADR 0030): fecha de alta de los jugadores, dos cuentas de
-- personal con cargo (director deportivo y fisioterapeuta) y un reto por puntos activo con el
-- catálogo de ejemplo y registros de una familia, para ver las pantallas sin picar datos.
-- Todos los datos son ficticios. Idempotente: cada inserción salta si ya existe.

-- Fecha de alta: la temporada actual para todos; Clara y Marc Martí llevan más tiempo.
UPDATE "players" p
SET "joined_on" = DATE '2026-09-01'
FROM "organizations" o
WHERE o."slug" = 'demo' AND p."organization_id" = o."id" AND p."joined_on" IS NULL;

UPDATE "players" p
SET "joined_on" = CASE p."first_name" WHEN 'Clara' THEN DATE '2022-09-01' ELSE DATE '2024-09-01' END
FROM "organizations" o
WHERE o."slug" = 'demo' AND p."organization_id" = o."id"
  AND p."last_name" = 'Martí' AND p."first_name" IN ('Clara', 'Marc')
  AND p."joined_on" = DATE '2026-09-01';

-- Cuentas de personal: contraseña 123456 (mismo hash que admin@demo.test)
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Jordi Camps', 'director@demo.test', true, 'es'),
       ('Núria Font', 'fisio@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential',
  '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" IN ('director@demo.test', 'fisio@demo.test')
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code", "position")
SELECT u."id", o."id", 'staff', v."position"
FROM "organizations" o
JOIN (VALUES ('director@demo.test', 'director'), ('fisio@demo.test', 'physio')) AS v("email", "position") ON true
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

-- Reto activo de la temporada actual
INSERT INTO "challenges" ("organization_id", "season_id", "name", "description", "starts_on", "ends_on", "min_points", "target_points", "status", "created_by")
SELECT o."id", s."id", 'Reto de hábitos 2026-27',
  'Entrenar, mejorar la técnica y cuidar los hábitos fuera de la pista. La familia registra; el club valida.',
  DATE '2026-10-01', DATE '2026-12-20', 50, 150, 'active', u."id"
FROM "organizations" o
LEFT JOIN "seasons" s ON s."organization_id" = o."id" AND s."name" = '2026-27'
LEFT JOIN "users" u ON u."email" = 'admin@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM "challenges" c WHERE c."organization_id" = o."id" AND c."name" = 'Reto de hábitos 2026-27'
  );

-- Catálogo de ejemplo del prototipo
INSERT INTO "challenge_tasks" ("organization_id", "challenge_id", "name", "area", "kind", "points_per_unit", "max_points", "sort_order")
SELECT o."id", c."id", v."name", v."area", v."kind", v."ppu", v."max", v."sort"
FROM "organizations" o
JOIN "challenges" c ON c."organization_id" = o."id" AND c."name" = 'Reto de hábitos 2026-27'
CROSS JOIN (VALUES
  ('Entrenamiento completo', 'training', 'sessions', 2, 20, 10),
  ('Trabajo exterior extra', 'training', 'sessions', 1, 10, 20),
  ('Reto de 50 toques', 'technique', 'sessions', 2, 20, 30),
  ('Reto de 100 toques', 'technique', 'sessions', 4, 40, 40),
  ('Árbol de gestos técnicos', 'technique', 'rating', 2, 10, 50),
  ('Comer sano', 'habits', 'rating', 1, 5, 60),
  ('Dormir bien', 'habits', 'rating', 1, 5, 70),
  ('Lectura', 'habits', 'rating', 1, 5, 80),
  ('Foto del club por el mundo', 'habits', 'sessions', 5, 10, 90),
  ('Ver un partido del club', 'habits', 'sessions', 1, 10, 100)
) AS v("name", "area", "kind", "ppu", "max", "sort")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM "challenge_tasks" t WHERE t."challenge_id" = c."id" AND t."name" = v."name"
  );

-- Registros de la familia Martí: dos aprobados por la entrenadora y dos a la espera.
INSERT INTO "challenge_submissions" (
  "organization_id", "challenge_id", "task_id", "player_id", "submitted_by",
  "quantity", "points", "note", "happened_on", "status", "reviewed_by", "reviewed_at"
)
SELECT o."id", c."id", t."id", p."id", fam."id",
  v."quantity", v."points", v."note", v."happened_on", v."status",
  CASE WHEN v."status" = 'approved' THEN coach."id" END,
  CASE WHEN v."status" = 'approved' THEN now() END
FROM "organizations" o
JOIN "challenges" c ON c."organization_id" = o."id" AND c."name" = 'Reto de hábitos 2026-27'
LEFT JOIN "users" fam ON fam."email" = 'familia@demo.test'
LEFT JOIN "users" coach ON coach."email" = 'entrenador@demo.test'
CROSS JOIN (VALUES
  ('Clara', 'Entrenamiento completo', 2, 4, NULL, DATE '2026-10-06', 'approved'),
  ('Clara', 'Reto de 50 toques', 1, 2, 'Vídeo en la carpeta de la familia', DATE '2026-10-10', 'approved'),
  ('Clara', 'Comer sano', 3, 3, NULL, DATE '2026-10-14', 'submitted'),
  ('Marc', 'Lectura', 2, 2, 'Un cuento cada noche', DATE '2026-10-12', 'submitted')
) AS v("player", "task", "quantity", "points", "note", "happened_on", "status")
JOIN "players" p ON p."organization_id" = o."id" AND p."first_name" = v."player" AND p."last_name" = 'Martí'
JOIN "challenge_tasks" t ON t."challenge_id" = c."id" AND t."name" = v."task"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "challenge_submissions" s WHERE s."challenge_id" = c."id");
