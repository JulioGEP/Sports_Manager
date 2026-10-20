-- Organización de demostración (ADR 0016): la sirve la API cuando la petición llega a un host
-- sin subdominio de club (hoy hubsports.netlify.app y las deploy previews). Idempotente.
INSERT INTO "organizations" ("slug", "name", "default_locale", "default_sport_id", "brand_primary_color", "brand_secondary_color")
SELECT 'demo', 'Club de demostración', 'es', s."id", '#d71920', '#e8b52a'
FROM "sports" s
WHERE s."code" = 'futsal'
ON CONFLICT ("slug") DO NOTHING;
