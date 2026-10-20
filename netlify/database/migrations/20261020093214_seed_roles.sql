-- Roles de organización como datos (ADR 0008). Añadir un rol es otra migración como esta
-- más una entrada en ROLE_PERMISSIONS de packages/shared.
INSERT INTO "roles" ("code", "scope", "name", "sort_order") VALUES
  ('org_admin', 'organization', '{"es": "Administrador del club", "ca": "Administrador del club", "en": "Club admin"}', 10),
  ('coach', 'organization', '{"es": "Entrenador", "ca": "Entrenador", "en": "Coach"}', 20),
  ('guardian', 'organization', '{"es": "Tutor", "ca": "Tutor", "en": "Guardian"}', 30)
ON CONFLICT ("code") DO NOTHING;
