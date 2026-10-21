-- Club de demostración, Bloque 19 (ADR 0033): la dirección deportiva lleva las cuatro secciones
-- y la fisioterapeuta atiende a Clara y Marc Martí, para que cada cuenta vea su ámbito sin
-- picar datos. Todos los datos son ficticios. Idempotente: cada inserción salta si ya existe.

INSERT INTO "section_staff" ("organization_id", "section_id", "user_id")
SELECT o."id", s."id", u."id"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id"
JOIN "users" u ON u."email" = 'director@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "user_id") DO NOTHING;

INSERT INTO "player_staff" ("organization_id", "player_id", "user_id", "assigned_by")
SELECT o."id", p."id", u."id", a."id"
FROM "organizations" o
JOIN "players" p ON p."organization_id" = o."id"
JOIN "people" x ON x."id" = p."person_id" AND x."last_name" = 'Martí' AND x."first_name" IN ('Clara', 'Marc')
JOIN "users" u ON u."email" = 'fisio@demo.test'
LEFT JOIN "users" a ON a."email" = 'admin@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id", "user_id") DO NOTHING;
