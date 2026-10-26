-- Rol de deportista (ADR 0045): el deportista con cuenta propia entra a su ficha. Hasta ahora el
-- adulto con cuenta era "tutor de sí mismo"; aquí pasa a deportista con el vínculo `self`.
-- Idempotente: cada paso salta lo que ya está hecho.
INSERT INTO "roles" ("code", "scope", "name", "sort_order") VALUES
  ('athlete', 'organization', '{"es": "Deportista", "ca": "Esportista", "en": "Athlete"}', 40)
ON CONFLICT ("code") DO NOTHING;

-- 1. Un vínculo de una cuenta con la ficha de su propia persona es el del deportista consigo mismo.
UPDATE "player_guardians" pg
SET "relationship" = 'self'
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id"
WHERE pg."player_id" = pl."id"
  AND p."user_id" = pg."user_id"
  AND pg."relationship" <> 'self';

-- 2. Quien tiene ese vínculo es deportista del club, con el estado que tenía como tutor.
INSERT INTO "memberships" ("user_id", "organization_id", "role_code", "status")
SELECT DISTINCT pg."user_id", pg."organization_id", 'athlete', COALESCE(m."status", 'active')
FROM "player_guardians" pg
LEFT JOIN "memberships" m
  ON m."user_id" = pg."user_id" AND m."organization_id" = pg."organization_id" AND m."role_code" = 'guardian'
WHERE pg."relationship" = 'self'
ON CONFLICT DO NOTHING;

-- 3. Y deja de ser tutor si no tiene a nadie más a su cargo.
DELETE FROM "memberships" m
WHERE m."role_code" = 'guardian'
  AND EXISTS (
    SELECT 1 FROM "player_guardians" pg
    WHERE pg."user_id" = m."user_id" AND pg."organization_id" = m."organization_id" AND pg."relationship" = 'self'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "player_guardians" pg
    WHERE pg."user_id" = m."user_id" AND pg."organization_id" = m."organization_id" AND pg."relationship" <> 'self'
  );

-- Club demo: además de Miguel Lozano (Sénior A, jugador@demo.test), una deportista de una
-- actividad: Carme Segura, de "Yoga suave lunes", entra con deportista@demo.test.
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Carme Segura', 'deportista@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential', '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" = 'deportista@demo.test'
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code")
SELECT u."id", o."id", 'athlete'
FROM "organizations" o
JOIN "users" u ON u."email" = 'deportista@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

UPDATE "people" p
SET "user_id" = u."id", "email" = 'deportista@demo.test'
FROM "organizations" o, "users" u
WHERE o."slug" = 'demo' AND p."organization_id" = o."id" AND u."email" = 'deportista@demo.test'
  AND p."first_name" = 'Carme' AND p."last_name" = 'Segura' AND p."user_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "people" x WHERE x."organization_id" = o."id" AND x."user_id" = u."id"
  );

INSERT INTO "player_guardians" ("organization_id", "player_id", "user_id", "relationship", "guardian_person_id")
SELECT o."id", pl."id", u."id", 'self', p."id"
FROM "organizations" o
JOIN "users" u ON u."email" = 'deportista@demo.test'
JOIN "people" p ON p."organization_id" = o."id" AND p."user_id" = u."id"
JOIN "players" pl ON pl."person_id" = p."id"
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;
