-- Box de demostración (ADR 0049): un club de fitness para ver la segunda interfaz sin picar datos.
--   - `demo-box`, "Box de demostración": CrossFit (WOD, Open Box, Halterofilia) e HYROX, con su
--     horario semanal, coach y aforo, y las clases de cuatro semanas atrás y dos por delante.
--   - Cuentas (contraseña 123456): box@demo.test (dueña), coach@demo.test (coach) y
--     atleta@demo.test (Laia Ferrer, atleta con tarifa ilimitada). admin@demo.test también
--     administra el box, para pasar de un club a otro.
--   - 40 atletas con tarifa (ilimitada, 3 o 2 por semana, bono de 10, HYROX), una en pausa y uno
--     sin tarifa; reservas, asistencias, no presentados y lista de espera; WODs publicados de
--     cuatro semanas con resultados, marcas y benchmarks; mañana programado, pasado en borrador y
--     el resto por programar; anuncios, mensajes, leads y cobros del mes; tienda con precio de socio.
-- Las fechas van relativas al día en que se aplica. Idempotente: cada bloque salta si ya existe.

-- 1. El box, con su identidad de box (industrial) y su modelo.
INSERT INTO "organizations" (
  "slug", "name", "default_locale", "default_sport_id", "brand_primary_color", "brand_secondary_color",
  "voice", "motto", "style_typography", "style_buttons", "style_icons", "style_background",
  "style_hero", "style_nav", "style_corners", "club_model"
)
SELECT 'demo-box', 'Box de demostración', 'es', s."id", '#0b0d12', '#f2c200',
  'vestuario', 'Sin excusas. Cada día cuenta.', 'deportiva', 'recta', 'gruesa', 'neutro',
  'banda', 'oscuro', 'rectas', 'fitness'
FROM "sports" s
WHERE s."code" = 'crossfit'
ON CONFLICT ("slug") DO NOTHING;

-- 2. Cuentas: dueña, coach y atleta, con la contraseña de las demás cuentas demo (123456).
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES
  ('Marta Vidal', 'box@demo.test', true, 'es'),
  ('Álex Romero', 'coach@demo.test', true, 'es'),
  ('Laia Ferrer', 'atleta@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential', '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" IN ('box@demo.test', 'coach@demo.test', 'atleta@demo.test')
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code")
SELECT u."id", o."id", v."role"
FROM "organizations" o
CROSS JOIN (VALUES
  ('box@demo.test', 'org_admin'),
  ('admin@demo.test', 'org_admin'),
  ('coach@demo.test', 'coach'),
  ('atleta@demo.test', 'athlete')
) AS v("email", "role")
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo-box'
ON CONFLICT DO NOTHING;

-- 3. Política de reservas (la de por defecto, con máximo de dos clases al día).
INSERT INTO "booking_policies" ("organization_id", "max_per_day")
SELECT o."id", 2 FROM "organizations" o WHERE o."slug" = 'demo-box'
ON CONFLICT ("organization_id") DO NOTHING;

-- 4. Temporada, salas, disciplinas, categorías y tipos de clase.
INSERT INTO "seasons" ("organization_id", "name", "starts_on", "ends_on", "is_current")
SELECT o."id", 'Temporada ' || to_char(CURRENT_DATE - 90, 'YYYY') || '-' || to_char(CURRENT_DATE + 275, 'YY'),
  CURRENT_DATE - 90, CURRENT_DATE + 275, true
FROM "organizations" o
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "seasons" s WHERE s."organization_id" = o."id");

INSERT INTO "facilities" ("organization_id", "name", "kind", "capacity", "sort_order")
SELECT o."id", v."name", 'gym', v."capacity", v."sort"
FROM "organizations" o
CROSS JOIN (VALUES ('Sala principal', 24, 10), ('Zona de halterofilia', 10, 20)) AS v("name", "capacity", "sort")
WHERE o."slug" = 'demo-box'
ON CONFLICT ("organization_id", "name") DO NOTHING;

INSERT INTO "sections" ("organization_id", "name", "sport_id", "kind", "description", "sort_order")
SELECT o."id", v."name", s."id", 'activity', v."description", v."sort"
FROM "organizations" o
CROSS JOIN (VALUES
  ('CrossFit', 'crossfit', 'Clases de CrossFit para todos los niveles: fuerza, técnica y WOD.', 10),
  ('HYROX', 'fitness', 'Preparación para HYROX: carrera y estaciones.', 20)
) AS v("name", "sport", "description", "sort")
JOIN "sports" s ON s."code" = v."sport"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "sections" x WHERE x."organization_id" = o."id" AND x."name" = v."name"
  );

INSERT INTO "categories" ("organization_id", "section_id", "name")
SELECT o."id", s."id", 'General'
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."section_id" = s."id");

INSERT INTO "teams" ("organization_id", "section_id", "category_id", "season_id", "name", "capacity", "booking_mode")
SELECT o."id", s."id", c."id", se."id", v."name", v."capacity", 'open'
FROM "organizations" o
JOIN "seasons" se ON se."organization_id" = o."id" AND se."is_current"
CROSS JOIN (VALUES
  ('CrossFit', 'WOD', 14),
  ('CrossFit', 'Open Box', 20),
  ('CrossFit', 'Halterofilia', 10),
  ('HYROX', 'HYROX', 16)
) AS v("section", "name", "capacity")
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = v."section"
JOIN "categories" c ON c."section_id" = s."id"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "teams" t WHERE t."organization_id" = o."id" AND t."name" = v."name"
  );

-- 5. Quién da cada clase: entra en el cuerpo técnico del tipo de clase.
INSERT INTO "team_staff" ("organization_id", "team_id", "user_id", "role_in_team")
SELECT o."id", t."id", u."id", v."role"
FROM "organizations" o
CROSS JOIN (VALUES
  ('WOD', 'coach@demo.test', 'head_coach'),
  ('WOD', 'box@demo.test', 'assistant'),
  ('Open Box', 'box@demo.test', 'head_coach'),
  ('Halterofilia', 'coach@demo.test', 'head_coach'),
  ('HYROX', 'box@demo.test', 'head_coach'),
  ('HYROX', 'coach@demo.test', 'assistant')
) AS v("team", "email", "role")
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = v."team"
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo-box'
ON CONFLICT DO NOTHING;

-- 6. Horario semanal (lunes = 1): franjas con su coach, su sala y su aforo.
INSERT INTO "team_schedules" ("organization_id", "team_id", "weekday", "starts_at", "ends_at", "facility_id", "coach_user_id", "capacity")
SELECT o."id", t."id", v."weekday", v."starts", v."ends", f."id", u."id", v."capacity"
FROM "organizations" o
CROSS JOIN (VALUES
  ('WOD', 1, '07:00', '08:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 2, '07:00', '08:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 3, '07:00', '08:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 4, '07:00', '08:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 5, '07:00', '08:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 1, '09:30', '10:30', 'box@demo.test', 'Sala principal', 12),
  ('WOD', 2, '09:30', '10:30', 'box@demo.test', 'Sala principal', 12),
  ('WOD', 3, '09:30', '10:30', 'box@demo.test', 'Sala principal', 12),
  ('WOD', 4, '09:30', '10:30', 'box@demo.test', 'Sala principal', 12),
  ('WOD', 5, '09:30', '10:30', 'box@demo.test', 'Sala principal', 12),
  ('WOD', 1, '18:00', '19:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 2, '18:00', '19:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 3, '18:00', '19:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 4, '18:00', '19:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 5, '18:00', '19:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 1, '19:00', '20:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 2, '19:00', '20:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 3, '19:00', '20:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 4, '19:00', '20:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 5, '19:00', '20:00', 'coach@demo.test', 'Sala principal', 14),
  ('WOD', 1, '20:00', '21:00', 'box@demo.test', 'Sala principal', 14),
  ('WOD', 2, '20:00', '21:00', 'box@demo.test', 'Sala principal', 14),
  ('WOD', 3, '20:00', '21:00', 'box@demo.test', 'Sala principal', 14),
  ('WOD', 4, '20:00', '21:00', 'box@demo.test', 'Sala principal', 14),
  ('WOD', 6, '10:00', '11:00', 'coach@demo.test', 'Sala principal', 16),
  ('Open Box', 1, '12:00', '14:00', 'box@demo.test', 'Sala principal', 20),
  ('Open Box', 3, '12:00', '14:00', 'box@demo.test', 'Sala principal', 20),
  ('Open Box', 5, '12:00', '14:00', 'box@demo.test', 'Sala principal', 20),
  ('Halterofilia', 2, '20:00', '21:00', 'coach@demo.test', 'Zona de halterofilia', 10),
  ('Halterofilia', 4, '20:00', '21:00', 'coach@demo.test', 'Zona de halterofilia', 10),
  ('HYROX', 1, '19:00', '20:00', 'box@demo.test', 'Zona de halterofilia', 16),
  ('HYROX', 3, '19:00', '20:00', 'box@demo.test', 'Zona de halterofilia', 16),
  ('HYROX', 6, '11:15', '12:15', 'coach@demo.test', 'Sala principal', 16)
) AS v("team", "weekday", "starts", "ends", "coach", "facility", "capacity")
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = v."team"
JOIN "users" u ON u."email" = v."coach"
JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = v."facility"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "team_schedules" x WHERE x."organization_id" = o."id");

-- 7. Las clases de cuatro semanas atrás y dos por delante, como las genera el horario.
INSERT INTO "events" ("organization_id", "kind", "title", "section_id", "team_id", "facility_id", "starts_at", "ends_at", "series_id", "capacity", "coach_user_id")
SELECT o."id", 'activity', t."name", t."section_id", t."id", ts."facility_id",
  (d."day"::date + ts."starts_at"::time) AT TIME ZONE o."timezone",
  (d."day"::date + ts."ends_at"::time) AT TIME ZONE o."timezone",
  ts."id", ts."capacity", ts."coach_user_id"
FROM "organizations" o
JOIN "team_schedules" ts ON ts."organization_id" = o."id"
JOIN "teams" t ON t."id" = ts."team_id"
JOIN LATERAL generate_series(CURRENT_DATE - 28, CURRENT_DATE + 13, INTERVAL '1 day') AS d("day")
  ON EXTRACT(ISODOW FROM d."day") = ts."weekday"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."organization_id" = o."id");

-- 8. Los atletas. Laia Ferrer entra con atleta@demo.test.
INSERT INTO "people" ("organization_id", "first_name", "last_name", "birth_date", "gender", "email", "phone")
SELECT o."id", v."first", v."last", v."birth"::date, v."gender",
  lower(translate(v."first" || '.' || v."last", 'áéíóúÁÉÍÓÚñÑ ', 'aeiouAEIOUnN')) || '@correo.test', v."phone"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Laia', 'Ferrer', '1992-04-11', 'female', '600100101'),
  ('Pau', 'Serra', '1988-09-02', 'male', '600100102'),
  ('Núria', 'Casals', '1995-01-23', 'female', '600100103'),
  ('Jordi', 'Pons', '1983-06-30', 'male', '600100104'),
  ('Marina', 'Soler', '1990-12-05', 'female', '600100105'),
  ('David', 'Martín', '1986-03-17', 'male', '600100106'),
  ('Clara', 'Riera', '1998-07-08', 'female', '600100107'),
  ('Sergio', 'López', '1979-10-26', 'male', '600100108'),
  ('Elena', 'Navarro', '1993-02-14', 'female', '600100109'),
  ('Iván', 'Ortega', '1991-08-19', 'male', '600100110'),
  ('Paula', 'Gil', '1997-05-03', 'female', '600100111'),
  ('Marc', 'Vila', '1989-11-29', 'male', '600100112'),
  ('Lucía', 'Herrera', '1996-09-15', 'female', '600100113'),
  ('Raúl', 'Molina', '1984-04-07', 'male', '600100114'),
  ('Andrea', 'Castro', '1999-03-21', 'female', '600100115'),
  ('Óscar', 'Ramos', '1981-01-12', 'male', '600100116'),
  ('Irene', 'Blanco', '1994-06-24', 'female', '600100117'),
  ('Víctor', 'Rubio', '1987-12-18', 'male', '600100118'),
  ('Sara', 'Iglesias', '2000-08-01', 'female', '600100119'),
  ('Hugo', 'Domínguez', '1992-02-27', 'male', '600100120'),
  ('Alba', 'Torres', '1995-10-10', 'female', '600100121'),
  ('Rubén', 'Flores', '1985-05-16', 'male', '600100122'),
  ('Carla', 'Prieto', '1993-07-29', 'female', '600100123'),
  ('Adrián', 'Méndez', '1990-03-04', 'male', '600100124'),
  ('Noelia', 'Cano', '1988-11-11', 'female', '600100125'),
  ('Javier', 'Garrido', '1982-09-09', 'male', '600100126'),
  ('Ainhoa', 'Lozano', '1997-12-31', 'female', '600100127'),
  ('Gerard', 'Puig', '1991-04-22', 'male', '600100128'),
  ('Mireia', 'Roca', '1996-01-05', 'female', '600100129'),
  ('Tomás', 'Peña', '1978-06-13', 'male', '600100130'),
  ('Eva', 'Sanz', '1989-08-28', 'female', '600100131'),
  ('Daniel', 'Vargas', '1994-05-19', 'male', '600100132'),
  ('Cristina', 'Fuentes', '1986-02-08', 'female', '600100133'),
  ('Álvaro', 'Reyes', '1999-11-03', 'male', '600100134'),
  ('Silvia', 'Arias', '1992-10-17', 'female', '600100135'),
  ('Bruno', 'Esteve', '1987-07-25', 'male', '600100136'),
  ('Julia', 'Bravo', '2001-03-30', 'female', '600100137'),
  ('Mario', 'Pascual', '1983-12-01', 'male', '600100138'),
  ('Olga', 'Marín', '1990-06-06', 'female', '600100139'),
  ('Héctor', 'Calvo', '1985-09-21', 'male', '600100140')
) AS v("first", "last", "birth", "gender", "phone")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "people" p
    WHERE p."organization_id" = o."id" AND p."first_name" = v."first" AND p."last_name" = v."last"
  );

INSERT INTO "players" ("organization_id", "person_id", "joined_on")
SELECT p."organization_id", p."id",
  CURRENT_DATE - (60 + (abs(hashtext(p."last_name" || p."first_name")::bigint) % 600))::int
FROM "people" p
JOIN "organizations" o ON o."id" = p."organization_id" AND o."slug" = 'demo-box'
ON CONFLICT ("person_id") DO NOTHING;

UPDATE "people" p
SET "user_id" = u."id", "email" = 'atleta@demo.test'
FROM "organizations" o, "users" u
WHERE o."slug" = 'demo-box' AND p."organization_id" = o."id" AND u."email" = 'atleta@demo.test'
  AND p."first_name" = 'Laia' AND p."last_name" = 'Ferrer' AND p."user_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "people" x WHERE x."organization_id" = o."id" AND x."user_id" = u."id");

INSERT INTO "player_guardians" ("organization_id", "player_id", "user_id", "relationship", "guardian_person_id")
SELECT o."id", pl."id", u."id", 'self', p."id"
FROM "organizations" o
JOIN "users" u ON u."email" = 'atleta@demo.test'
JOIN "people" p ON p."organization_id" = o."id" AND p."user_id" = u."id"
JOIN "players" pl ON pl."person_id" = p."id"
WHERE o."slug" = 'demo-box'
ON CONFLICT DO NOTHING;

-- 9. Tarifas y bonos con su derecho de uso.
INSERT INTO "fee_plans" ("organization_id", "name", "amount_cents", "period", "description", "entitlement", "sessions", "validity_days", "class_team_ids")
SELECT o."id", v."name", v."amount", v."period", v."description", v."entitlement", v."sessions", v."validity",
  CASE WHEN v."team" IS NULL THEN NULL
    ELSE (SELECT jsonb_build_array(t."id"::text) FROM "teams" t WHERE t."organization_id" = o."id" AND t."name" = v."team") END
FROM "organizations" o
CROSS JOIN (VALUES
  ('Ilimitada', 6900, 'monthly', 'Todas las clases que quieras, todos los días.', 'unlimited', NULL::int, NULL::int, NULL),
  ('3 clases por semana', 5500, 'monthly', 'Tres clases a la semana, de lunes a domingo.', 'per_week', 3, NULL, NULL),
  ('2 clases por semana', 4500, 'monthly', 'Dos clases a la semana.', 'per_week', 2, NULL, NULL),
  ('Bono 10 sesiones', 9000, 'once', 'Diez clases en dos meses, cuando quieras.', 'pack', 10, 60, NULL),
  ('HYROX mensual', 4900, 'monthly', 'Las clases de HYROX del mes.', 'unlimited', NULL, NULL, 'HYROX')
) AS v("name", "amount", "period", "description", "entitlement", "sessions", "validity", "team")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "fee_plans" f WHERE f."organization_id" = o."id" AND f."name" = v."name"
  );

-- 10. Quién tiene cada tarifa. Laia la primera (ilimitada); una en pausa y uno sin tarifa.
INSERT INTO "subscriptions" ("organization_id", "player_id", "fee_plan_id", "starts_on", "status", "paused_until", "created_by")
SELECT a."organization_id", a."player_id", f."id",
  CASE WHEN a."plan" = 'Bono 10 sesiones' THEN CURRENT_DATE - 20 ELSE CURRENT_DATE - (40 + a."n" * 7) END,
  CASE WHEN a."n" = 39 THEN 'paused' ELSE 'active' END,
  CASE WHEN a."n" = 39 THEN CURRENT_DATE + 10 ELSE NULL END,
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM (
  SELECT pl."organization_id", pl."id" AS "player_id", r."n",
    CASE
      WHEN r."n" <= 20 OR r."n" = 39 THEN 'Ilimitada'
      WHEN r."n" <= 28 THEN '3 clases por semana'
      WHEN r."n" <= 32 THEN '2 clases por semana'
      WHEN r."n" <= 36 THEN 'Bono 10 sesiones'
      WHEN r."n" <= 38 THEN 'HYROX mensual'
      ELSE NULL
    END AS "plan"
  FROM "players" pl
  JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
  JOIN (
    SELECT pl2."id", row_number() OVER (
      ORDER BY (p2."email" = 'atleta@demo.test') DESC, p2."phone"
    )::int AS "n"
    FROM "players" pl2
    JOIN "people" p2 ON p2."id" = pl2."person_id"
    JOIN "organizations" o2 ON o2."id" = pl2."organization_id" AND o2."slug" = 'demo-box'
  ) r ON r."id" = pl."id"
) a
JOIN "fee_plans" f ON f."organization_id" = a."organization_id" AND f."name" = a."plan"
WHERE NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."organization_id" = a."organization_id");

-- 11. Reservas. Cada atleta tiene su hora de siempre y su frecuencia según la tarifa; las pasadas
-- quedan como asistidas (y alguna como no presentado o cancelación tardía), las futuras reservadas
-- y la próxima de las 19, llena y con espera.
INSERT INTO "bookings" ("organization_id", "event_id", "player_id", "status", "consumes", "subscription_id", "queued_at", "cancelled_at", "checked_in_at", "source")
SELECT x."organization_id", x."event_id", x."player_id",
  CASE
    WHEN x."past" AND x."roll" < 5 THEN 'no_show'
    WHEN x."past" AND x."roll" < 8 THEN 'late_cancel'
    WHEN x."past" THEN 'attended'
    WHEN x."seat" <= x."capacity" THEN 'booked'
    ELSE 'waitlist'
  END,
  NOT (NOT x."past" AND x."seat" > x."capacity"),
  x."subscription_id",
  CASE WHEN x."past" THEN x."starts_at" - INTERVAL '1 day' ELSE now() - INTERVAL '3 days' END
    + (x."seat" * INTERVAL '1 minute'),
  CASE WHEN x."past" AND x."roll" BETWEEN 5 AND 7 THEN x."starts_at" - INTERVAL '30 minutes' END,
  CASE WHEN x."past" AND x."roll" >= 8 THEN x."starts_at" - INTERVAL '5 minutes' END,
  'self'
FROM (
  SELECT c.*, row_number() OVER (
    PARTITION BY c."event_id" ORDER BY c."is_laia" DESC, c."roll", c."player_id"
  )::int AS "seat"
  FROM (
    SELECT e."organization_id", e."id" AS "event_id", e."starts_at", e."capacity",
      a."player_id", a."subscription_id", a."is_laia",
      e."starts_at" < now() AS "past",
      (abs(hashtext(a."player_id"::text || e."id"::text)::bigint) % 100)::int AS "roll"
    FROM "events" e
    JOIN "organizations" o ON o."id" = e."organization_id" AND o."slug" = 'demo-box'
    JOIN "teams" t ON t."id" = e."team_id"
    JOIN (
      SELECT pl."id" AS "player_id", s."id" AS "subscription_id", r."n",
        p."email" = 'atleta@demo.test' AS "is_laia",
        f."name" AS "plan",
        (ARRAY['07:00', '09:30', '18:00', '19:00', '19:00', '19:00', '20:00', '20:00'])[1 + (r."n" % 8)] AS "slot",
        CASE
          WHEN p."email" = 'atleta@demo.test' THEN 5
          ELSE CASE f."name"
          WHEN 'Ilimitada' THEN 4
          WHEN '3 clases por semana' THEN 3
          WHEN '2 clases por semana' THEN 2
          WHEN 'Bono 10 sesiones' THEN 1
          ELSE 0
          END
        END AS "per_week"
      FROM "players" pl
      JOIN "people" p ON p."id" = pl."person_id"
      JOIN "organizations" o3 ON o3."id" = pl."organization_id" AND o3."slug" = 'demo-box'
      JOIN "subscriptions" s ON s."player_id" = pl."id" AND s."status" = 'active'
      JOIN "fee_plans" f ON f."id" = s."fee_plan_id"
      JOIN (
        SELECT pl2."id", row_number() OVER (
          ORDER BY (p2."email" = 'atleta@demo.test') DESC, p2."phone"
        )::int AS "n"
        FROM "players" pl2
        JOIN "people" p2 ON p2."id" = pl2."person_id"
        JOIN "organizations" o2 ON o2."id" = pl2."organization_id" AND o2."slug" = 'demo-box'
      ) r ON r."id" = pl."id"
    ) a ON (
      -- WOD a su hora, tantos días como permite su tarifa (de cinco laborables).
      (t."name" = 'WOD' AND EXTRACT(ISODOW FROM e."starts_at" AT TIME ZONE o."timezone") <= 5
        AND to_char(e."starts_at" AT TIME ZONE o."timezone", 'HH24:MI') = a."slot"
        AND abs(hashtext(a."player_id"::text || (e."starts_at" AT TIME ZONE o."timezone")::date::text)::bigint) % 5 < a."per_week")
      -- El sábado, uno de cada tres con tarifa ilimitada.
      OR (t."name" = 'WOD' AND EXTRACT(ISODOW FROM e."starts_at" AT TIME ZONE o."timezone") = 6
        AND a."plan" = 'Ilimitada' AND abs(hashtext(a."player_id"::text || e."id"::text)::bigint) % 3 = 0)
      -- La próxima de las 19 se llena: también quienes van a las 20, y hay espera.
      OR (a."slot" = '20:00' AND a."per_week" > 0 AND e."id" = (
        SELECT e2."id" FROM "events" e2 JOIN "teams" t2 ON t2."id" = e2."team_id"
        WHERE e2."organization_id" = o."id" AND t2."name" = 'WOD'
          AND to_char(e2."starts_at" AT TIME ZONE o."timezone", 'HH24:MI') = '19:00'
          AND e2."starts_at" > now() + INTERVAL '2 hours'
        ORDER BY e2."starts_at" LIMIT 1
      ))
      OR (t."name" = 'Open Box' AND a."plan" = 'Ilimitada' AND a."n" % 5 = 2
        AND abs(hashtext(a."player_id"::text || e."id"::text)::bigint) % 2 = 0)
      OR (t."name" = 'Halterofilia' AND a."plan" IN ('Ilimitada', '3 clases por semana') AND a."n" % 4 = 1)
      OR (t."name" = 'HYROX' AND (a."plan" = 'HYROX mensual' OR (a."plan" = 'Ilimitada' AND a."n" % 6 = 4)))
    )
    WHERE e."starts_at" < now() + INTERVAL '7 days'
  ) c
) x
WHERE x."past" AND x."seat" <= x."capacity"
   OR NOT x."past" AND x."seat" <= x."capacity" + 3
ON CONFLICT ("event_id", "player_id") DO NOTHING;

-- Pase de lista de las clases pasadas: presente quien vino, ausente quien no se presentó.
INSERT INTO "attendance" ("organization_id", "event_id", "player_id", "status", "recorded_by")
SELECT b."organization_id", b."event_id", b."player_id",
  CASE WHEN b."status" = 'attended' THEN 'present' ELSE 'absent' END,
  e."coach_user_id"
FROM "bookings" b
JOIN "events" e ON e."id" = b."event_id"
JOIN "organizations" o ON o."id" = b."organization_id" AND o."slug" = 'demo-box'
WHERE b."status" IN ('attended', 'no_show')
ON CONFLICT ("event_id", "player_id") DO NOTHING;

-- 12. Programación de CrossFit: siete plantillas que rotan de lunes a sábado. Hasta hoy, publicado;
-- mañana, programado para esta noche; los dos días siguientes, en borrador; y el resto de la semana,
-- por programar. HYROX tiene su WOD los días que hay clase.
INSERT INTO "workouts" ("organization_id", "section_id", "on_date", "title", "notes", "status", "publish_at", "created_by")
SELECT o."id", s."id", d."day"::date,
  (ARRAY['Fran day', 'Deadlift + Cindy', 'Helen', 'Clean + EMOM', 'Front squat + Grace', 'Chipper por parejas', 'Press + AMRAP'])[1 + (((d."day"::date - DATE '2026-01-05') / 7) * 6 + EXTRACT(ISODOW FROM d."day")::int - 1) % 7],
  CASE WHEN (((d."day"::date - DATE '2026-01-05') / 7) * 6 + EXTRACT(ISODOW FROM d."day")::int - 1) % 7 = 5 THEN 'Por parejas: uno trabaja y el otro descansa. Repartid las reps como queráis.' END,
  CASE WHEN d."day"::date <= CURRENT_DATE + 1 THEN 'published' ELSE 'draft' END,
  CASE WHEN d."day"::date = CURRENT_DATE + 1 THEN (CURRENT_DATE + TIME '20:00') AT TIME ZONE o."timezone" END,
  (SELECT u."id" FROM "users" u WHERE u."email" = 'coach@demo.test')
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'CrossFit'
CROSS JOIN generate_series(CURRENT_DATE - 28, CURRENT_DATE + 3, INTERVAL '1 day') AS d("day")
WHERE o."slug" = 'demo-box'
  AND EXTRACT(ISODOW FROM d."day") <= 6
  AND NOT EXISTS (SELECT 1 FROM "workouts" w WHERE w."organization_id" = o."id");

INSERT INTO "workout_blocks" ("organization_id", "workout_id", "sort_order", "kind", "title", "description", "score_type", "time_cap_seconds", "movement_code", "percent", "rm_reps", "scaled", "rx", "rx_plus")
SELECT w."organization_id", w."id", b."sort", b."kind", b."title", b."description", b."score", b."cap", b."movement", b."percent", b."rm", b."scaled", b."rx", b."rx_plus"
FROM "workouts" w
JOIN "organizations" o ON o."id" = w."organization_id" AND o."slug" = 'demo-box'
JOIN (VALUES
  (0, 0, 'warmup', 'Calentamiento', E'3 rondas:\n200 m remo\n10 air squats\n10 PVC pass-through\n5 inchworms', 'none', NULL::int, NULL, NULL::int, NULL::int, NULL, NULL, NULL),
  (0, 1, 'strength', 'Back squat 5x5', E'5 series de 5 al 75 %.\nDescanso 2 min entre series.', 'load', NULL, 'back_squat', 75, NULL, NULL, NULL, NULL),
  (0, 2, 'wod', 'Fran', E'21-15-9\nThrusters\nPull-ups', 'time', 600, NULL, NULL, NULL, '30/20 kg · ring rows', '43/30 kg · pull-ups', '43/30 kg · chest to bar'),
  (1, 0, 'strength', 'Deadlift 3RM', E'Sube hasta tu 3RM del día.\nTécnica antes que kilos.', 'load', NULL, 'deadlift', NULL, 3, NULL, NULL, NULL),
  (1, 1, 'wod', 'Cindy', E'AMRAP 20\n5 pull-ups\n10 push-ups\n15 air squats', 'rounds_reps', 1200, NULL, NULL, NULL, 'Ring rows · push-ups en caja', 'Tal cual', 'Chaleco 9/6 kg'),
  (2, 0, 'skill', 'Pino', E'10 min de práctica:\nkick-ups a pared, aguantes de 20-30 s.', 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (2, 1, 'wod', 'Helen', E'3 rondas:\n400 m carrera\n21 kettlebell swings\n12 pull-ups', 'time', 900, NULL, NULL, NULL, '16/12 kg · ring rows', '24/16 kg', '32/24 kg · chest to bar'),
  (3, 0, 'strength', 'Power clean 1RM', E'Sube hasta tu 1RM de power clean.', 'load', NULL, 'power_clean', NULL, 1, NULL, NULL, NULL),
  (3, 1, 'wod', 'EMOM 12', E'Minuto 1: 12 cal remo\nMinuto 2: 10 burpees\nMinuto 3: 8 toes to bar', 'none', NULL, NULL, NULL, NULL, '9 cal · 8 burpees · knee raises', 'Tal cual', '15 cal · 12 burpees'),
  (4, 0, 'strength', 'Front squat 4x6', E'4 series de 6 al 70 %.', 'load', NULL, 'front_squat', 70, NULL, NULL, NULL, NULL),
  (4, 1, 'wod', 'Grace', E'30 clean and jerks por tiempo.', 'time', 600, NULL, NULL, NULL, '30/20 kg', '61/43 kg', '70/48 kg'),
  (5, 0, 'wod', 'Chipper por parejas', E'Por tiempo, por parejas:\n100 cal remo\n80 wall balls\n60 box jumps\n40 power cleans\n20 bar muscle-ups', 'time', 1800, NULL, NULL, NULL, '6/4 kg · step-ups · 40/30 kg · pull-ups', '9/6 kg · 60/50 cm · 60/40 kg', '9/6 kg · 75/60 cm · 70/50 kg'),
  (6, 0, 'strength', 'Strict press 5x3', E'5 series de 3 al 80 %.', 'load', NULL, 'strict_press', 80, NULL, NULL, NULL, NULL),
  (6, 1, 'wod', 'AMRAP 12', E'AMRAP 12\n10 dumbbell snatches\n10 box jumps\n200 m carrera', 'rounds_reps', 720, NULL, NULL, NULL, '15/10 kg · step-ups', '22,5/15 kg · 60/50 cm', '30/20 kg · 75/60 cm')
) AS b("template", "sort", "kind", "title", "description", "score", "cap", "movement", "percent", "rm", "scaled", "rx", "rx_plus")
  ON b."template" = (((w."on_date" - DATE '2026-01-05') / 7) * 6 + EXTRACT(ISODOW FROM w."on_date")::int - 1) % 7
WHERE NOT EXISTS (SELECT 1 FROM "workout_blocks" x WHERE x."workout_id" = w."id");

INSERT INTO "workouts" ("organization_id", "section_id", "on_date", "title", "status", "created_by")
SELECT o."id", s."id", d."day"::date,
  CASE EXTRACT(ISODOW FROM d."day")::int WHEN 1 THEN 'Engine HYROX' WHEN 3 THEN 'Estaciones' ELSE 'Simulación media HYROX' END,
  'published',
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'HYROX'
CROSS JOIN generate_series(CURRENT_DATE - 28, CURRENT_DATE + 1, INTERVAL '1 day') AS d("day")
WHERE o."slug" = 'demo-box'
  AND EXTRACT(ISODOW FROM d."day") IN (1, 3, 6)
  AND NOT EXISTS (SELECT 1 FROM "workouts" w WHERE w."section_id" = s."id");

INSERT INTO "workout_blocks" ("organization_id", "workout_id", "sort_order", "kind", "title", "description", "score_type", "time_cap_seconds", "scaled", "rx", "rx_plus")
SELECT w."organization_id", w."id", 0, 'wod', w."title", b."description", b."score", b."cap", b."scaled", b."rx", b."rx_plus"
FROM "workouts" w
JOIN "sections" s ON s."id" = w."section_id" AND s."name" = 'HYROX'
JOIN "organizations" o ON o."id" = w."organization_id" AND o."slug" = 'demo-box'
JOIN (VALUES
  (1, E'4 rondas:\n1 km carrera\n20 wall balls\n40 m sled push\n15 cal remo', 'time', 2700, '6/4 kg · trineo ligero', '9/6 kg · trineo de competición', '9/6 kg · trineo pro'),
  (3, E'AMRAP 30\n500 m SkiErg\n20 sandbag lunges\n20 burpee broad jumps', 'rounds_reps', 1800, '10 kg', '20/10 kg', '30/20 kg'),
  (6, E'Media simulación por tiempo:\n4 x (1 km carrera + estación)\nSkiErg · sled push · burpees · remo', 'time', 3600, 'Estaciones a la mitad', 'Estaciones de competición', 'Pro')
) AS b("dow", "description", "score", "cap", "scaled", "rx", "rx_plus") ON b."dow" = EXTRACT(ISODOW FROM w."on_date")::int
WHERE NOT EXISTS (SELECT 1 FROM "workout_blocks" x WHERE x."workout_id" = w."id");

-- 13. Marcas de cada atleta: sus máximas de los básicos, a partir de un nivel propio.
INSERT INTO "personal_records" ("organization_id", "player_id", "movement_code", "reps", "load_kg", "on_date", "source")
SELECT pl."organization_id", pl."id", m."code", 1,
  round(((CASE WHEN p."gender" = 'female' THEN 0.7 ELSE 1.0 END) * m."base" * (0.75 + (abs(hashtext(pl."id"::text || m."code")::bigint) % 50) / 100.0)) / 2.5) * 2.5,
  CURRENT_DATE - (20 + (abs(hashtext(m."code" || pl."id"::text)::bigint) % 150))::int,
  'manual'
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id"
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN (VALUES
  ('back_squat', 120.0), ('deadlift', 150.0), ('front_squat', 100.0), ('power_clean', 85.0),
  ('strict_press', 55.0), ('snatch', 65.0)
) AS m("code", "base")
WHERE NOT (p."email" = 'atleta@demo.test' AND m."code" = 'back_squat')
  AND NOT EXISTS (SELECT 1 FROM "personal_records" r WHERE r."organization_id" = o."id");

-- La historia de Laia en el back squat: va subiendo.
INSERT INTO "personal_records" ("organization_id", "player_id", "movement_code", "reps", "load_kg", "on_date", "note", "source")
SELECT pl."organization_id", pl."id", 'back_squat', v."reps", v."kg", CURRENT_DATE - v."ago", v."note", 'manual'
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id" AND p."email" = 'atleta@demo.test'
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN (VALUES
  (1, 70.0, 300, 'Primera vez a 1RM'),
  (1, 77.5, 200, NULL),
  (3, 72.5, 120, NULL),
  (5, 65.0, 60, 'Cinco limpias'),
  (1, 82.5, 25, 'PR en la semana de test')
) AS v("reps", "kg", "ago", "note")
WHERE NOT EXISTS (
  SELECT 1 FROM "personal_records" r WHERE r."player_id" = pl."id" AND r."movement_code" = 'back_squat'
);

-- 14. Resultados de los WOD pasados: quien vino ese día apunta su marcador.
INSERT INTO "workout_results" ("organization_id", "block_id", "player_id", "level", "time_seconds", "rounds", "reps", "load_kg", "completed", "effort", "created_at", "updated_at")
SELECT DISTINCT ON (wb."id", b."player_id")
  b."organization_id", wb."id", b."player_id",
  CASE WHEN h."h" % 10 < 3 THEN 'scaled' WHEN h."h" % 10 < 9 THEN 'rx' ELSE 'rx_plus' END,
  CASE WHEN wb."score_type" = 'time' THEN (wb."time_cap_seconds" * (0.45 + (h."h" % 50) / 100.0))::int END,
  CASE WHEN wb."score_type" = 'rounds_reps' THEN (wb."time_cap_seconds" / 100) + (h."h" % 9)::int END,
  CASE WHEN wb."score_type" = 'rounds_reps' THEN (h."h" % 25)::int END,
  CASE WHEN wb."score_type" = 'load' THEN
    round(COALESCE(
      (SELECT max(r."load_kg") FROM "personal_records" r WHERE r."player_id" = b."player_id" AND r."movement_code" = wb."movement_code" AND r."reps" = 1),
      60) * COALESCE(wb."percent", 95) / 100.0 / 2.5) * 2.5
  END,
  true,
  1 + (h."h" % 5)::int,
  e."ends_at" + INTERVAL '20 minutes',
  e."ends_at" + INTERVAL '20 minutes'
FROM "bookings" b
JOIN "organizations" o ON o."id" = b."organization_id" AND o."slug" = 'demo-box'
JOIN "events" e ON e."id" = b."event_id" AND e."ends_at" < now()
JOIN "teams" t ON t."id" = e."team_id" AND t."name" IN ('WOD', 'Open Box', 'HYROX')
JOIN "workouts" w ON w."organization_id" = o."id" AND w."section_id" = e."section_id"
  AND w."on_date" = (e."starts_at" AT TIME ZONE o."timezone")::date AND w."status" = 'published'
JOIN "workout_blocks" wb ON wb."workout_id" = w."id" AND wb."score_type" <> 'none'
CROSS JOIN LATERAL (SELECT abs(hashtext(b."player_id"::text || wb."id"::text)::bigint) AS "h") h
WHERE b."status" = 'attended'
  AND NOT EXISTS (SELECT 1 FROM "workout_results" x WHERE x."organization_id" = o."id" AND x."block_id" = wb."id")
ORDER BY wb."id", b."player_id"
ON CONFLICT ("block_id", "player_id") DO NOTHING;

-- 15. Benchmarks de Laia y de algunos más.
INSERT INTO "benchmark_results" ("organization_id", "player_id", "benchmark_code", "level", "time_seconds", "rounds", "reps", "distance_m", "completed", "on_date", "note")
SELECT pl."organization_id", pl."id", v."code", v."level", v."time", v."rounds", v."reps", v."distance", true, CURRENT_DATE - v."ago", v."note"
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id" AND p."email" = 'atleta@demo.test'
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN (VALUES
  ('fran', 'scaled', 412, NULL::int, NULL::int, NULL::int, 180, 'Con 30 kg'),
  ('fran', 'rx', 352, NULL, NULL, NULL, 40, 'Primera Fran RX'),
  ('cindy', 'rx', NULL, 17, 8, NULL, 75, NULL),
  ('grace', 'scaled', 221, NULL, NULL, NULL, 120, NULL),
  ('row_2k', 'rx', 478, NULL, NULL, 2000, 30, NULL)
) AS v("code", "level", "time", "rounds", "reps", "distance", "ago", "note")
WHERE NOT EXISTS (SELECT 1 FROM "benchmark_results" b WHERE b."organization_id" = o."id");

INSERT INTO "benchmark_results" ("organization_id", "player_id", "benchmark_code", "level", "time_seconds", "completed", "on_date")
SELECT pl."organization_id", pl."id", 'fran',
  CASE WHEN abs(hashtext(pl."id"::text)::bigint) % 3 = 0 THEN 'scaled' ELSE 'rx' END,
  (210 + abs(hashtext(pl."id"::text || 'fran')::bigint) % 240)::int, true,
  CURRENT_DATE - (10 + abs(hashtext(pl."id"::text || 'f')::bigint) % 120)::int
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id" AND p."email" <> 'atleta@demo.test'
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
WHERE abs(hashtext(pl."id"::text || 'b')::bigint) % 3 = 0
  AND NOT EXISTS (SELECT 1 FROM "benchmark_results" b WHERE b."player_id" = pl."id");

-- 16. Medidas de Laia (privadas; las comparte con su coach) y privacidad de dos atletas.
INSERT INTO "body_measurements" ("organization_id", "player_id", "on_date", "weight_kg", "body_fat_pct", "waist_cm", "hip_cm")
SELECT pl."organization_id", pl."id", CURRENT_DATE - v."ago", v."weight", v."fat", v."waist", v."hip"
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id" AND p."email" = 'atleta@demo.test'
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN (VALUES
  (120, 64.2, 25.1, 74.0, 98.0),
  (90, 63.5, 24.2, 72.5, 97.5),
  (60, 62.8, 23.4, 71.5, 97.0),
  (30, 62.1, 22.8, 70.5, 96.5),
  (3, 61.6, 22.1, 70.0, 96.0)
) AS v("ago", "weight", "fat", "waist", "hip")
WHERE NOT EXISTS (SELECT 1 FROM "body_measurements" b WHERE b."organization_id" = o."id");

INSERT INTO "fitness_preferences" ("organization_id", "player_id", "hide_from_attendees", "hide_from_leaderboards", "share_body_with_coach")
SELECT pl."organization_id", pl."id", v."attendees", v."leaderboards", v."body"
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id"
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
JOIN (VALUES
  ('atleta@demo.test', false, false, true),
  ('cristina.fuentes@correo.test', false, true, false),
  ('tomas.pena@correo.test', true, true, false)
) AS v("email", "attendees", "leaderboards", "body") ON v."email" = p."email"
ON CONFLICT ("player_id") DO NOTHING;

-- 17. Anuncios del box y el hilo de Laia con el box.
INSERT INTO "announcements" ("organization_id", "title", "body", "audience", "section_id", "pinned", "published_at", "created_by")
SELECT o."id", v."title", v."body", v."audience",
  CASE WHEN v."section" IS NULL THEN NULL ELSE (SELECT s."id" FROM "sections" s WHERE s."organization_id" = o."id" AND s."name" = v."section") END,
  v."pinned", now() - v."ago" * INTERVAL '1 day',
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
CROSS JOIN (VALUES
  ('Nueva clase de HYROX los sábados', 'Desde este sábado, HYROX a las 11:15 después del WOD. Reserva como siempre desde la app.', 'section', 'HYROX', true, 2),
  ('Inscripciones para el Open', 'Este año hacemos el Open juntos: cada viernes, WOD del Open en las clases de la tarde y jueces del box. Apúntate en recepción.', 'all', NULL, false, 6),
  ('Horario de festivos', 'El próximo festivo abrimos solo por la mañana: WOD a las 9:30 y Open Box hasta las 13:00.', 'all', NULL, false, 12)
) AS v("title", "body", "audience", "section", "pinned", "ago")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "announcements" a WHERE a."organization_id" = o."id");

INSERT INTO "announcement_reads" ("organization_id", "announcement_id", "user_id")
SELECT a."organization_id", a."id", u."id"
FROM "announcements" a
JOIN "organizations" o ON o."id" = a."organization_id" AND o."slug" = 'demo-box'
JOIN "users" u ON u."email" IN ('atleta@demo.test', 'box@demo.test')
WHERE a."title" = 'Horario de festivos' OR u."email" = 'box@demo.test'
ON CONFLICT DO NOTHING;

INSERT INTO "direct_messages" ("organization_id", "player_id", "author_user_id", "from_athlete", "body", "read_at", "created_at")
SELECT pl."organization_id", pl."id", u."id", v."from_athlete", v."body",
  CASE WHEN v."read" THEN now() - (v."ago" - 1) * INTERVAL '1 hour' END,
  now() - v."ago" * INTERVAL '1 hour'
FROM "players" pl
JOIN "people" p ON p."id" = pl."person_id" AND p."email" = 'atleta@demo.test'
JOIN "organizations" o ON o."id" = pl."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN (VALUES
  ('atleta@demo.test', true, 'Hola. Esta semana tengo molestias en el hombro. ¿Escalo los pull-ups de Fran?', true, 50),
  ('coach@demo.test', false, 'Sí, haz ring rows y baja el thruster a 30 kg. Si sigue la molestia, avísame y lo miramos en clase.', true, 48),
  ('atleta@demo.test', true, 'Perfecto, gracias. ¡Nos vemos mañana a las 19!', false, 2)
) AS v("email", "from_athlete", "body", "read", "ago")
JOIN "users" u ON u."email" = v."email"
WHERE NOT EXISTS (SELECT 1 FROM "direct_messages" d WHERE d."organization_id" = o."id");

-- 18. Leads: de la web, de paso y por recomendación, en cada punto del embudo.
INSERT INTO "leads" ("organization_id", "first_name", "last_name", "email", "phone", "source", "status", "notes", "trial_event_id", "created_at")
SELECT o."id", v."first", v."last", v."email", v."phone", v."source", v."status", v."notes",
  CASE WHEN v."trial" THEN (
    SELECT e."id" FROM "events" e JOIN "teams" t ON t."id" = e."team_id"
    WHERE e."organization_id" = o."id" AND t."name" = 'WOD' AND e."starts_at" > now() + INTERVAL '1 day'
    ORDER BY e."starts_at" LIMIT 1
  ) END,
  now() - v."ago" * INTERVAL '1 day'
FROM "organizations" o
CROSS JOIN (VALUES
  ('Nora', 'Quintana', 'nora.quintana@correo.test', '611200301', 'web', 'trial_booked', 'Viene de correr; quiere probar el WOD.', true, 1),
  ('Rafa', 'Delgado', 'rafa.delgado@correo.test', NULL, 'web', 'new', NULL, false, 0),
  ('Celia', 'Moreno', NULL, '611200303', 'walk_in', 'new', 'Pasó por recepción a preguntar precios.', false, 3),
  ('Kevin', 'Salas', 'kevin.salas@correo.test', '611200304', 'referral', 'trial_done', 'Amigo de Pau. Le gustó; pendiente de tarifa.', false, 9),
  ('Lara', 'Benítez', 'lara.benitez@correo.test', NULL, 'social', 'lost', 'Le queda lejos.', false, 20),
  ('Teo', 'Campos', 'teo.campos@correo.test', '611200306', 'web', 'trial_booked', NULL, true, 2)
) AS v("first", "last", "email", "phone", "source", "status", "notes", "trial", "ago")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."organization_id" = o."id");

-- 19. Cobros: el mes pasado, todo cobrado; este mes, casi todo, dos pendientes y uno vencido.
INSERT INTO "fee_charges" ("organization_id", "person_id", "fee_plan_id", "concept", "period_label", "amount_cents", "paid_cents", "due_on", "status")
SELECT s."organization_id", pl."person_id", f."id",
  f."name" || ' · ' || m."label", m."label", f."amount_cents",
  CASE WHEN m."offset" = 1 OR r."n" % 9 NOT IN (3, 6, 7) THEN f."amount_cents" ELSE 0 END,
  m."first" + 4,
  CASE
    WHEN m."offset" = 1 OR r."n" % 9 NOT IN (3, 6, 7) THEN 'paid'
    WHEN r."n" % 9 = 3 AND m."first" + 4 < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END
FROM "subscriptions" s
JOIN "organizations" o ON o."id" = s."organization_id" AND o."slug" = 'demo-box'
JOIN "players" pl ON pl."id" = s."player_id"
JOIN "fee_plans" f ON f."id" = s."fee_plan_id" AND f."period" = 'monthly'
JOIN (
  SELECT s2."id", row_number() OVER (ORDER BY s2."created_at", s2."id")::int AS "n"
  FROM "subscriptions" s2
  JOIN "organizations" o2 ON o2."id" = s2."organization_id" AND o2."slug" = 'demo-box'
) r ON r."id" = s."id"
CROSS JOIN LATERAL (
  SELECT k AS "offset",
    (date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::date AS "first",
    (ARRAY['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'])[EXTRACT(MONTH FROM date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::int]
      || ' ' || EXTRACT(YEAR FROM date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::int AS "label"
  FROM generate_series(0, 1) AS k
) m
WHERE NOT EXISTS (SELECT 1 FROM "fee_charges" c WHERE c."organization_id" = o."id");

INSERT INTO "fee_charges" ("organization_id", "person_id", "fee_plan_id", "concept", "amount_cents", "paid_cents", "due_on", "status")
SELECT s."organization_id", pl."person_id", f."id", f."name", f."amount_cents", f."amount_cents", s."starts_on", 'paid'
FROM "subscriptions" s
JOIN "organizations" o ON o."id" = s."organization_id" AND o."slug" = 'demo-box'
JOIN "players" pl ON pl."id" = s."player_id"
JOIN "fee_plans" f ON f."id" = s."fee_plan_id" AND f."period" = 'once'
WHERE NOT EXISTS (
  SELECT 1 FROM "fee_charges" c WHERE c."organization_id" = o."id" AND c."fee_plan_id" = f."id"
);

INSERT INTO "payments" ("organization_id", "charge_id", "amount_cents", "method", "paid_on", "recorded_by")
SELECT c."organization_id", c."id", c."amount_cents",
  CASE WHEN abs(hashtext(c."id"::text)::bigint) % 3 = 0 THEN 'transfer' ELSE 'card' END,
  LEAST(c."due_on", CURRENT_DATE),
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "fee_charges" c
JOIN "organizations" o ON o."id" = c."organization_id" AND o."slug" = 'demo-box'
WHERE c."status" = 'paid'
  AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."charge_id" = c."id");

-- 20. Tienda del box, con precio para atletas con tarifa.
INSERT INTO "store_products" ("organization_id", "name", "description", "category", "price_cents", "member_price_cents", "status", "visibility")
SELECT o."id", v."name", v."description", v."category", v."price", v."member", 'active', v."visibility"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Camiseta del box', 'Camiseta técnica con el logo del box. Corte unisex.', 'apparel', 2500, 2000, 'public'),
  ('Rodilleras 7 mm', 'Rodilleras de neopreno para sentadillas y halterofilia. Se venden por pares.', 'equipment', 4500, 3900, 'public'),
  ('Proteína whey 1 kg', 'Proteína de suero sabor chocolate.', 'other', 3900, 3300, 'members'),
  ('Comba speed', 'Comba de cable con rodamientos para double unders.', 'equipment', 1800, NULL::int, 'public')
) AS v("name", "description", "category", "price", "member", "visibility")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "store_products" p WHERE p."organization_id" = o."id" AND p."name" = v."name");

INSERT INTO "store_product_variants" ("organization_id", "product_id", "label", "stock", "sort_order")
SELECT p."organization_id", p."id", v."label", v."stock", v."sort"
FROM "store_products" p
JOIN "organizations" o ON o."id" = p."organization_id" AND o."slug" = 'demo-box'
JOIN (VALUES
  ('Camiseta del box', 'S', 8, 10),
  ('Camiseta del box', 'M', 12, 20),
  ('Camiseta del box', 'L', 6, 30),
  ('Camiseta del box', 'XL', 2, 40),
  ('Rodilleras 7 mm', 'S', 3, 10),
  ('Rodilleras 7 mm', 'M', 5, 20),
  ('Rodilleras 7 mm', 'L', 4, 30),
  ('Proteína whey 1 kg', NULL, 15, 10),
  ('Comba speed', NULL, 20, 10)
) AS v("product", "label", "stock", "sort") ON v."product" = p."name"
WHERE NOT EXISTS (SELECT 1 FROM "store_product_variants" x WHERE x."product_id" = p."id");
