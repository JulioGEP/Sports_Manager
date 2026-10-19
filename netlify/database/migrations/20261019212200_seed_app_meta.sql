-- Semilla mínima para verificar la cadena de migraciones de extremo a extremo.
-- Migración manual de datos (DML). Idempotente.
INSERT INTO "app_meta" ("key", "value") VALUES ('schema_version', '1')
ON CONFLICT ("key") DO NOTHING;
