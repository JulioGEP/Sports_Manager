-- Catálogo de deportes. Migración manual de datos, idempotente.
INSERT INTO "sports" ("code", "name", "config", "is_active")
VALUES ('futsal', '{"es": "Fútbol sala", "ca": "Futbol sala", "en": "Futsal"}', '{}', true)
ON CONFLICT ("code") DO NOTHING;
