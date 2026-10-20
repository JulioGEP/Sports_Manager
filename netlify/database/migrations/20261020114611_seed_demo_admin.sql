-- Administrador del club de demostración (Bloque 4). Permite entrar en el club de reserva
-- (ADR 0016) en previews y en producción sin pasar por una invitación. Contraseña de prueba
-- fijada por el responsable de producto (ADR 0020): 123456, guardada como hash de Better Auth.
-- Idempotente: no toca nada si el usuario ya existe.
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Admin Demo', 'admin@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential',
  '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" = 'admin@demo.test'
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code")
SELECT u."id", o."id", 'org_admin'
FROM "users" u
JOIN "organizations" o ON o."slug" = 'demo'
WHERE u."email" = 'admin@demo.test'
ON CONFLICT DO NOTHING;
