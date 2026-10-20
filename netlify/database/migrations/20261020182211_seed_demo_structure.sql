-- Club de demostración con estructura precargada (Bloque 11, ADR 0028): una temporada actual,
-- una sección, cuatro equipos con plantilla, y dos cuentas de prueba más (entrenadora y familia)
-- con la misma contraseña que admin@demo.test (123456, ADR 0020). Todos los nombres son ficticios.
-- Idempotente: cada inserción salta si ya existe.

-- Temporada actual
INSERT INTO "seasons" ("organization_id", "name", "starts_on", "ends_on", "is_current")
SELECT o."id", '2026-27', DATE '2026-09-01', DATE '2027-06-30', true
FROM "organizations" o
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "seasons" s WHERE s."organization_id" = o."id")
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- Sección
INSERT INTO "sections" ("organization_id", "name", "sort_order")
SELECT o."id", 'Fútbol sala', 10
FROM "organizations" o
WHERE o."slug" = 'demo'
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- Equipos de la temporada actual
INSERT INTO "teams" ("organization_id", "section_id", "season_id", "name", "category")
SELECT o."id", sec."id", sea."id", v."name", v."category"
FROM "organizations" o
JOIN "sections" sec ON sec."organization_id" = o."id" AND sec."name" = 'Fútbol sala'
JOIN "seasons" sea ON sea."organization_id" = o."id" AND sea."name" = '2026-27'
CROSS JOIN (VALUES
  ('Prebenjamín A', 'Prebenjamín'),
  ('Benjamín A', 'Benjamín'),
  ('Alevín A', 'Alevín'),
  ('Infantil A', 'Infantil')
) AS v("name", "category")
WHERE o."slug" = 'demo'
ON CONFLICT ("season_id", "section_id", "name") DO NOTHING;

-- Jugadores (ficticios) y su plantilla
WITH demo AS (
  SELECT o."id" AS org_id FROM "organizations" o WHERE o."slug" = 'demo'
), roster("team", "first_name", "last_name", "birth_date", "shirt", "position") AS (VALUES
  ('Prebenjamín A', 'Nil', 'Soler', DATE '2019-03-12', 1, 'Portero'),
  ('Prebenjamín A', 'Arnau', 'Pujol', DATE '2019-07-02', 2, 'Cierre'),
  ('Prebenjamín A', 'Leo', 'Ferrer', DATE '2020-01-19', 3, 'Ala'),
  ('Prebenjamín A', 'Martina', 'Roca', DATE '2019-11-05', 4, 'Ala'),
  ('Prebenjamín A', 'Hugo', 'Camps', DATE '2020-04-23', 5, 'Pívot'),
  ('Prebenjamín A', 'Èlia', 'Bosch', DATE '2019-09-14', 6, 'Ala'),
  ('Prebenjamín A', 'Biel', 'Serra', DATE '2020-02-08', 7, 'Cierre'),
  ('Prebenjamín A', 'Ona', 'Mas', DATE '2019-06-27', 8, 'Pívot'),
  ('Prebenjamín A', 'Pau', 'Riera', DATE '2019-12-30', 9, 'Ala'),
  ('Benjamín A', 'Marc', 'Martí', DATE '2017-05-16', 1, 'Portero'),
  ('Benjamín A', 'Júlia', 'Costa', DATE '2017-08-21', 2, 'Cierre'),
  ('Benjamín A', 'Adrià', 'Vila', DATE '2018-01-09', 3, 'Ala'),
  ('Benjamín A', 'Noa', 'Font', DATE '2017-10-03', 4, 'Ala'),
  ('Benjamín A', 'Guillem', 'Prat', DATE '2018-03-25', 5, 'Pívot'),
  ('Benjamín A', 'Aina', 'Torres', DATE '2017-12-11', 6, 'Ala'),
  ('Benjamín A', 'Iker', 'Ruiz', DATE '2018-06-07', 7, 'Cierre'),
  ('Benjamín A', 'Lucía', 'Navarro', DATE '2017-04-29', 8, 'Pívot'),
  ('Benjamín A', 'Roger', 'Puig', DATE '2018-02-14', 9, 'Ala'),
  ('Alevín A', 'Clara', 'Martí', DATE '2015-02-03', 1, 'Portero'),
  ('Alevín A', 'Àlex', 'Moreno', DATE '2015-09-18', 2, 'Cierre'),
  ('Alevín A', 'Jan', 'Garcia', DATE '2016-01-27', 3, 'Ala'),
  ('Alevín A', 'Berta', 'Sala', DATE '2015-06-15', 4, 'Ala'),
  ('Alevín A', 'Oriol', 'Mateu', DATE '2016-04-04', 5, 'Pívot'),
  ('Alevín A', 'Mia', 'Ortega', DATE '2015-11-22', 6, 'Ala'),
  ('Alevín A', 'Pol', 'Vidal', DATE '2016-07-09', 7, 'Cierre'),
  ('Alevín A', 'Emma', 'Gil', DATE '2015-08-30', 8, 'Pívot'),
  ('Alevín A', 'Dani', 'Romero', DATE '2016-03-17', 9, 'Ala'),
  ('Infantil A', 'Joel', 'Castro', DATE '2013-01-24', 1, 'Portero'),
  ('Infantil A', 'Laia', 'Esteve', DATE '2013-07-13', 2, 'Cierre'),
  ('Infantil A', 'Bruno', 'Pérez', DATE '2014-02-06', 3, 'Ala'),
  ('Infantil A', 'Carla', 'Sanz', DATE '2013-10-28', 4, 'Ala'),
  ('Infantil A', 'Mateo', 'Ibáñez', DATE '2014-05-19', 5, 'Pívot'),
  ('Infantil A', 'Nora', 'Jiménez', DATE '2013-04-02', 6, 'Ala'),
  ('Infantil A', 'Álvaro', 'Peña', DATE '2014-08-11', 7, 'Cierre'),
  ('Infantil A', 'Irene', 'Molina', DATE '2013-12-20', 8, 'Pívot'),
  ('Infantil A', 'Sergi', 'Fabra', DATE '2014-06-01', 9, 'Ala')
), inserted AS (
  INSERT INTO "players" ("organization_id", "first_name", "last_name", "birth_date")
  SELECT demo.org_id, r."first_name", r."last_name", r."birth_date"
  FROM roster r, demo
  WHERE NOT EXISTS (
    SELECT 1 FROM "players" p
    WHERE p."organization_id" = demo.org_id
      AND p."first_name" = r."first_name" AND p."last_name" = r."last_name"
  )
  RETURNING "id", "first_name", "last_name"
), all_players AS (
  -- Los recién insertados no son visibles en "players" dentro de la misma sentencia: se unen aquí.
  SELECT i."id", i."first_name", i."last_name" FROM inserted i
  UNION ALL
  SELECT p."id", p."first_name", p."last_name" FROM "players" p, demo WHERE p."organization_id" = demo.org_id
)
INSERT INTO "team_players" ("organization_id", "team_id", "player_id", "shirt_number", "position")
SELECT demo.org_id, t."id", p."id", r."shirt", r."position"
FROM roster r
JOIN demo ON true
JOIN all_players p ON p."first_name" = r."first_name" AND p."last_name" = r."last_name"
JOIN "teams" t ON t."organization_id" = demo.org_id AND t."name" = r."team"
ON CONFLICT ("team_id", "player_id") DO NOTHING;

-- Cuentas de prueba: entrenadora y familia, contraseña 123456 (mismo hash que admin@demo.test)
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Carla Vidal', 'entrenador@demo.test', true, 'es'),
       ('Laura Martí', 'familia@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential',
  '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" IN ('entrenador@demo.test', 'familia@demo.test')
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code")
SELECT u."id", o."id", v."role_code"
FROM "organizations" o
JOIN (VALUES ('entrenador@demo.test', 'coach'), ('familia@demo.test', 'guardian')) AS v("email", "role_code") ON true
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

-- La entrenadora lleva el Alevín A
INSERT INTO "team_staff" ("organization_id", "team_id", "user_id")
SELECT o."id", t."id", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "user_id") DO NOTHING;

-- La familia: madre de Marc (Benjamín A) y Clara (Alevín A)
INSERT INTO "player_guardians" ("organization_id", "player_id", "user_id", "relationship")
SELECT o."id", p."id", u."id", 'mother'
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id" AND p."last_name" = 'Martí' AND p."first_name" IN ('Marc', 'Clara')
JOIN "users" u ON u."email" = 'familia@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id", "user_id") DO NOTHING;
