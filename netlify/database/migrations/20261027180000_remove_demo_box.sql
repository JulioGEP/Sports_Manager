-- El box se va a su propio repositorio, inthebox (ADR 0058). Aquí se quita el box de demostración.
--   - La auditoría y los emails del box: al borrar el club quedarían sin club y saldrían como de la
--     plataforma.
--   - El club `demo-box`: todas sus tablas borran en cascada (personas, atletas, horario, clases,
--     reservas, tarifas, cobros, WODs, marcas, planes, ejercicios, anuncios, mensajes y leads).
--   - Las cuentas que solo existían para él: box@, coach@ y atleta@demo.test, si no les queda ningún
--     club ni ficha. admin@demo.test sigue: es la administradora del club `demo`.
-- Las tablas y columnas del box siguen en la base sin uso: se quitan en la siguiente migración de
-- esquema, en otro deploy (docs/deploy.md, regla 6). Idempotente: sin el club, no borra nada.

DELETE FROM "audit_log"
WHERE "organization_id" IN (SELECT "id" FROM "organizations" WHERE "slug" = 'demo-box');

DELETE FROM "email_outbox"
WHERE "organization_id" IN (SELECT "id" FROM "organizations" WHERE "slug" = 'demo-box');

DELETE FROM "organizations" WHERE "slug" = 'demo-box';

DELETE FROM "users" u
WHERE u."email" IN ('box@demo.test', 'coach@demo.test', 'atleta@demo.test')
  AND NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."user_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "people" p WHERE p."user_id" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "platform_admins" a WHERE a."user_id" = u."id");
