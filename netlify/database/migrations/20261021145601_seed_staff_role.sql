-- Rol de personal del club (Bloque 13, ADR 0030): director, coordinación, delegación, fisio,
-- preparación física, psicología y scout entran con este rol y un cargo en la pertenencia.
INSERT INTO "roles" ("code", "scope", "name", "sort_order") VALUES
  ('staff', 'organization', '{"es": "Personal del club", "ca": "Personal del club", "en": "Club staff"}', 15)
ON CONFLICT ("code") DO NOTHING;
