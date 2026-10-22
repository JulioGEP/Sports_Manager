-- Planificación de entrenamientos, carga y salud (bloques 21 a 26, ADR 0038). El club demo llega
-- con lo necesario para ver el concepto sin picar datos:
--   - Fútbol sala con seguimiento completo, sus contenidos, la biblioteca de arranque y dos semanas tipo.
--   - Un equipo Sénior A con doce jugadores adultos, su cuerpo técnico (entrenador, preparadora física
--     y la fisioterapeuta), cuatro partidos jugados y cuatro semanas de sesiones cerradas con RPE.
--   - Carga, bienestar, un jugador limitado, otro en readaptación tras una lesión con consentimiento,
--     tests físicos y un jugador adulto con su cuenta (jugador@demo.test).
--   - El Alevín A con una sesión cerrada y otra planificada.
-- Cuentas nuevas con la contraseña de siempre (123456): senior@demo.test, preparador@demo.test y
-- jugador@demo.test. Todos los nombres son ficticios. Idempotente: cada inserción salta si ya existe.

-- Seguimiento completo en fútbol sala: RPE individual, bienestar y tests.
UPDATE "sections" s
SET "training_settings" = '{"tracking": "full"}'::jsonb
FROM "organizations" o
WHERE o."slug" = 'demo' AND s."organization_id" = o."id" AND s."name" = 'Fútbol sala' AND s."training_settings" IS NULL;

-- Contenidos de fútbol sala (los que propone el deporte, en castellano)
INSERT INTO "training_contents" ("organization_id", "section_id", "code", "name", "kind", "related_action_codes", "sort_order")
SELECT o."id", s."id", v."code", v."name", v."kind", v."related"::jsonb, v."sort"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES
  ('finishing', 'Finalización', 'technical', '["goal", "shot_on_target", "shot_off_target"]', 10),
  ('passing', 'Pase y control', 'technical', '["key_pass", "assist", "turnover"]', 20),
  ('one_v_one_attack', '1x1 ofensivo', 'technical', '["foul_received", "turnover"]', 30),
  ('build_up', 'Salida de presión', 'tactical', '["turnover"]', 40),
  ('positional_attack', 'Ataque posicional', 'tactical', '["key_pass", "shot_on_target", "assist"]', 50),
  ('pressing', 'Presión y recuperación', 'tactical', '["steal", "opp_shot_on_target"]', 60),
  ('transitions', 'Transiciones', 'tactical', '["steal", "turnover", "opp_goal"]', 70),
  ('defending_without_fouls', 'Defensa sin falta y 1x1 defensivo', 'tactical', '["foul", "yellow_card"]', 80),
  ('set_piece_attack', 'ABP ofensiva', 'set_piece', '["corner"]', 90),
  ('set_piece_defence', 'ABP defensiva', 'set_piece', '["opp_goal"]', 100),
  ('power_play', 'Portero-jugador (5x4)', 'tactical', '[]', 110),
  ('goalkeeping', 'Juego del portero', 'goalkeeper', '["save", "opp_shot_on_target"]', 120),
  ('intermittent_endurance', 'Resistencia intermitente', 'physical', '[]', 130),
  ('repeated_sprint', 'Velocidad repetida', 'physical', '[]', 140),
  ('strength', 'Fuerza', 'physical', '[]', 150),
  ('injury_prevention', 'Prevención', 'physical', '[]', 160),
  ('concentration', 'Concentración y gestión', 'psychological', '[]', 170)
) AS v("code", "name", "kind", "related", "sort")
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "code") DO NOTHING;

-- Biblioteca de arranque de la sección (la misma que siembra la API al abrirla por primera vez)
INSERT INTO "drills" ("organization_id", "scope", "section_id", "name", "description", "coaching_points", "format", "space", "players_min", "players_max", "duration_min", "target_rpe", "diagram", "restriction_tags", "seed_key")
SELECT o."id", 'section', s."id", v."name", v."description", v."coaching"::text, v."format"::text, v."space", v."pmin"::int, v."pmax"::int, v."duration"::int, v."rpe"::int, v."diagram", v."tags", v."key"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES
  ('seed_1', 'Activación con balón por parejas', 'Pases y conducciones por parejas con movilidad articular y cambios de ritmo progresivos.', NULL, NULL, 'Media pista', 2, NULL, 12, 3, '{"field": "half", "pieces": [{"kind": "own", "x": 30, "y": 30}, {"kind": "own", "x": 60, "y": 30}, {"kind": "own", "x": 30, "y": 70}, {"kind": "own", "x": 60, "y": 70}, {"kind": "ball", "x": 33, "y": 30}], "arrows": [{"kind": "pass", "x1": 32, "y1": 30, "x2": 58, "y2": 30}, {"kind": "dribble", "x1": 32, "y1": 70, "x2": 58, "y2": 70}]}'::jsonb, '[]'::jsonb),
  ('seed_2', 'Rondo 4x4+2 comodines', 'Mantener la posesión con dos comodines exteriores. Punto tras 8 pases seguidos.', 'Perfilarse antes de recibir. Apoyos a los dos lados del poseedor.', '4x4+2', '20 x 20 m', 10, NULL, 15, 6, '{"field": "half", "pieces": [{"kind": "own", "x": 25, "y": 25}, {"kind": "own", "x": 25, "y": 75}, {"kind": "own", "x": 70, "y": 25}, {"kind": "own", "x": 70, "y": 75}, {"kind": "rival", "x": 40, "y": 40}, {"kind": "rival", "x": 55, "y": 40}, {"kind": "rival", "x": 40, "y": 60}, {"kind": "rival", "x": 55, "y": 60}, {"kind": "cone", "x": 10, "y": 50, "label": "C"}, {"kind": "cone", "x": 88, "y": 50, "label": "C"}, {"kind": "ball", "x": 28, "y": 25}], "arrows": []}'::jsonb, '["contact", "direction_changes"]'::jsonb),
  ('seed_3', 'Finalización tras pared', 'Pared con el pívot y tiro a la primera desde zona central. Alternar pierna.', 'Tiro raso y cruzado. Atacar el rechace.', NULL, 'Media pista con portería', 4, NULL, 15, 5, '{"field": "half", "pieces": [{"kind": "goal", "x": 96, "y": 50}, {"kind": "keeper", "x": 90, "y": 50}, {"kind": "own", "x": 40, "y": 50, "label": "A"}, {"kind": "own", "x": 72, "y": 45, "label": "P"}, {"kind": "ball", "x": 43, "y": 50}], "arrows": [{"kind": "pass", "x1": 42, "y1": 50, "x2": 70, "y2": 45}, {"kind": "run", "x1": 42, "y1": 52, "x2": 66, "y2": 58}, {"kind": "pass", "x1": 70, "y1": 47, "x2": 66, "y2": 56}]}'::jsonb, '["shooting"]'::jsonb),
  ('seed_4', 'Finalización por zonas', 'Series de tiro desde las nueve zonas del mapa del partido, con oposición pasiva.', NULL, NULL, 'Media pista con portería', 3, NULL, 12, 5, NULL::jsonb, '["shooting"]'::jsonb),
  ('seed_5', 'Salida de presión 4x3', 'Portero y tres jugadores salen contra tres presionantes. Punto si se supera la línea media conduciendo.', 'Ocupar alturas distintas. Fijar antes de pasar.', '4x3', 'Media pista', 7, NULL, 15, 7, '{"field": "half", "pieces": [{"kind": "goal", "x": 4, "y": 50}, {"kind": "keeper", "x": 8, "y": 50}, {"kind": "own", "x": 25, "y": 20}, {"kind": "own", "x": 25, "y": 80}, {"kind": "own", "x": 45, "y": 50}, {"kind": "rival", "x": 35, "y": 30}, {"kind": "rival", "x": 35, "y": 70}, {"kind": "rival", "x": 55, "y": 50}], "arrows": []}'::jsonb, '["contact", "direction_changes"]'::jsonb),
  ('seed_6', 'Presión tras pérdida 5x5', 'Partido condicionado: tras perder el balón, cinco segundos para recuperarlo o doble punto rival.', NULL, '5x5', 'Pista entera', 10, NULL, 20, 8, NULL::jsonb, '["contact", "direction_changes", "high_intensity"]'::jsonb),
  ('seed_7', 'Defensa sin falta 1x1 en carril', 'Duelo 1x1 en un carril de 5 m. Una falta resta dos puntos: se defiende con el cuerpo y los apoyos, nunca con las manos.', NULL, '1x1', 'Carril de 5 x 15 m', 2, NULL, 12, 7, NULL::jsonb, '["contact", "direction_changes"]'::jsonb),
  ('seed_8', 'Córner ensayado: bloqueo y segundo palo', 'Saque de esquina con bloqueo al defensor del primer palo y llegada al segundo. Tres variantes con señal.', NULL, NULL, 'Media pista con portería', 5, NULL, 10, 4, '{"field": "half", "pieces": [{"kind": "goal", "x": 96, "y": 50}, {"kind": "keeper", "x": 91, "y": 50}, {"kind": "own", "x": 98, "y": 4, "label": "S"}, {"kind": "own", "x": 78, "y": 40, "label": "B"}, {"kind": "own", "x": 70, "y": 62}, {"kind": "rival", "x": 84, "y": 38}, {"kind": "rival", "x": 80, "y": 62}, {"kind": "ball", "x": 97, "y": 6}], "arrows": [{"kind": "run", "x1": 78, "y1": 42, "x2": 83, "y2": 40}, {"kind": "run", "x1": 70, "y1": 64, "x2": 86, "y2": 72}, {"kind": "pass", "x1": 96, "y1": 7, "x2": 86, "y2": 70}]}'::jsonb, '["shooting"]'::jsonb),
  ('seed_9', 'Defensa de ABP en zona mixta', 'Defender córners y faltas laterales con dos en zona y dos al hombre. Rotar quién saca.', NULL, NULL, 'Media pista con portería', 8, NULL, 10, 4, NULL::jsonb, '["contact", "jumps"]'::jsonb),
  ('seed_10', 'Portero-jugador 5x4', 'Ataque con portero-jugador contra defensa en rombo. El equipo defensor puntúa si roba y tira a puerta vacía.', NULL, '5x4', 'Pista entera', 9, NULL, 15, 6, '{"field": "full", "pieces": [{"kind": "goal", "x": 98, "y": 50}, {"kind": "keeper", "x": 94, "y": 50}, {"kind": "own", "x": 55, "y": 25}, {"kind": "own", "x": 55, "y": 75}, {"kind": "own", "x": 70, "y": 10}, {"kind": "own", "x": 70, "y": 90}, {"kind": "own", "x": 80, "y": 50}, {"kind": "rival", "x": 66, "y": 50}, {"kind": "rival", "x": 76, "y": 30}, {"kind": "rival", "x": 76, "y": 70}, {"kind": "rival", "x": 86, "y": 50}], "arrows": []}'::jsonb, '["shooting"]'::jsonb),
  ('seed_11', 'Intermitente 15-15 con balón', 'Series de 15 s a alta intensidad conduciendo y 15 s de recuperación activa. 2 series de 6 minutos.', NULL, NULL, 'Pista entera', 1, NULL, 15, 8, NULL::jsonb, '["high_intensity", "direction_changes"]'::jsonb),
  ('seed_12', 'Velocidad repetida en 20 m', '6 sprints de 20 m con 20 s de recuperación. 2 series con 3 minutos entre ellas.', NULL, NULL, 'Banda de la pista', 1, NULL, 12, 9, NULL::jsonb, '["high_intensity"]'::jsonb),
  ('seed_13', 'Preventivo de aductores e isquios', 'Copenhague y nórdico por parejas, más estabilidad de tobillo. Antes de la parte principal.', NULL, NULL, 'Zona de calentamiento', 2, NULL, 12, 5, NULL::jsonb, '[]'::jsonb),
  ('seed_14', 'Juego del portero: blocaje y salida', 'Blocajes a media altura, caída lateral y salida rápida con la mano al pívot.', NULL, NULL, 'Área y media pista', 2, NULL, 20, 6, NULL::jsonb, '["jumps"]'::jsonb)
) AS v("key", "name", "description", "coaching", "format", "space", "pmin", "pmax", "duration", "rpe", "diagram", "tags")
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "seed_key") WHERE "seed_key" IS NOT NULL DO NOTHING;

INSERT INTO "drill_contents" ("organization_id", "drill_id", "content_id", "is_primary", "sort_order")
SELECT o."id", d."id", c."id", v."ord" = 0, v."ord"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
JOIN (VALUES
  ('seed_1', 'passing', 0),
  ('seed_1', 'injury_prevention', 1),
  ('seed_2', 'passing', 0),
  ('seed_2', 'pressing', 1),
  ('seed_3', 'finishing', 0),
  ('seed_3', 'passing', 1),
  ('seed_4', 'finishing', 0),
  ('seed_5', 'build_up', 0),
  ('seed_5', 'goalkeeping', 1),
  ('seed_6', 'pressing', 0),
  ('seed_6', 'transitions', 1),
  ('seed_7', 'defending_without_fouls', 0),
  ('seed_8', 'set_piece_attack', 0),
  ('seed_8', 'finishing', 1),
  ('seed_9', 'set_piece_defence', 0),
  ('seed_10', 'power_play', 0),
  ('seed_10', 'positional_attack', 1),
  ('seed_11', 'intermittent_endurance', 0),
  ('seed_12', 'repeated_sprint', 0),
  ('seed_13', 'injury_prevention', 0),
  ('seed_13', 'strength', 1),
  ('seed_14', 'goalkeeping', 0)
) AS v("key", "code", "ord") ON true
JOIN "drills" d ON d."section_id" = s."id" AND d."seed_key" = v."key"
JOIN "training_contents" c ON c."section_id" = s."id" AND c."code" = v."code"
WHERE o."slug" = 'demo'
ON CONFLICT ("drill_id", "content_id") DO NOTHING;

-- Semanas tipo de fútbol sala
INSERT INTO "microcycle_templates" ("organization_id", "section_id", "name", "days")
SELECT o."id", s."id", v."name", v."days"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES
  ('Semana con partido el sábado', '[{"offset": -5, "objective": "Recuperación y compensatorio", "minutes": 75, "targetRpe": 4, "startsAt": "20:00"}, {"offset": -4, "objective": "Fuerza y táctica en espacio reducido", "minutes": 90, "targetRpe": 6, "startsAt": "20:00"}, {"offset": -3, "objective": "Táctica en espacio amplio e intermitente", "minutes": 90, "targetRpe": 7, "startsAt": "20:00"}, {"offset": -2, "objective": "Velocidad, finalización y ABP", "minutes": 75, "targetRpe": 5, "startsAt": "20:00"}]'::jsonb),
  ('Semana con dos partidos', '[{"offset": -3, "objective": "Recuperación activa", "minutes": 60, "targetRpe": 3, "startsAt": "20:00"}, {"offset": -2, "objective": "Táctica y ABP sin carga", "minutes": 70, "targetRpe": 5, "startsAt": "20:00"}, {"offset": -1, "objective": "Activación y estrategia", "minutes": 50, "targetRpe": 3, "startsAt": "20:00"}]'::jsonb)
) AS v("name", "days")
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "name") DO NOTHING;

-- Categoría y equipo Sénior A de fútbol sala
INSERT INTO "categories" ("organization_id", "section_id", "name", "gender", "sort_order")
SELECT o."id", s."id", 'Sénior', 'male', 50
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "name") DO NOTHING;

INSERT INTO "teams" ("organization_id", "section_id", "category_id", "season_id", "name")
SELECT o."id", s."id", c."id", sea."id", 'Sénior A'
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
JOIN "categories" c ON c."section_id" = s."id" AND c."name" = 'Sénior'
JOIN "seasons" sea ON sea."organization_id" = o."id" AND sea."is_current"
WHERE o."slug" = 'demo'
ON CONFLICT ("season_id", "section_id", "name") DO NOTHING;

-- Doce jugadores adultos (ficticios)
INSERT INTO "people" ("organization_id", "first_name", "last_name", "birth_date", "gender")
SELECT o."id", v."first", v."last", v."birth"::date, 'male'
FROM "organizations" o
CROSS JOIN (VALUES
  ('Iván', 'Morales', '1994-03-11'),
  ('Sergi', 'Galán', '2002-07-25'),
  ('Raúl', 'Navas', '1995-01-30'),
  ('Toni', 'Bermejo', '1999-09-14'),
  ('Óscar', 'Pena', '2001-04-02'),
  ('Miguel', 'Lozano', '1997-06-19'),
  ('David', 'Requena', '2000-11-08'),
  ('Jordi', 'Ventosa', '1998-02-23'),
  ('Álvaro', 'Cid', '2003-05-17'),
  ('Rubén', 'Marín', '2004-01-29'),
  ('Kike', 'Ramos', '1996-10-05'),
  ('Cristian', 'Soto', '1999-12-21')
) AS v("first", "last", "birth")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (
    SELECT 1 FROM "people" p WHERE p."organization_id" = o."id" AND p."first_name" = v."first" AND p."last_name" = v."last"
  );

INSERT INTO "players" ("organization_id", "person_id", "joined_on", "dominant_foot", "height_cm")
SELECT o."id", p."id", DATE '2026-07-15', v."foot", v."height"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Iván', 'Morales', 'right', 184),
  ('Sergi', 'Galán', 'left', 181),
  ('Raúl', 'Navas', 'right', 178),
  ('Toni', 'Bermejo', 'right', 180),
  ('Óscar', 'Pena', 'left', 176),
  ('Miguel', 'Lozano', 'right', 174),
  ('David', 'Requena', 'left', 172),
  ('Jordi', 'Ventosa', 'right', 175),
  ('Álvaro', 'Cid', 'right', 171),
  ('Rubén', 'Marín', 'left', 173),
  ('Kike', 'Ramos', 'right', 182),
  ('Cristian', 'Soto', 'right', 179)
) AS v("first", "last", "foot", "height")
JOIN "people" p ON p."organization_id" = o."id" AND p."first_name" = v."first" AND p."last_name" = v."last"
WHERE o."slug" = 'demo'
ON CONFLICT ("person_id") DO NOTHING;

INSERT INTO "team_players" ("organization_id", "team_id", "player_id", "shirt_number", "position")
SELECT o."id", t."id", pl."id", v."shirt", v."position"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('Iván', 'Morales', 1, 'Portero'),
  ('Sergi', 'Galán', 13, 'Portero'),
  ('Raúl', 'Navas', 2, 'Cierre'),
  ('Toni', 'Bermejo', 3, 'Cierre'),
  ('Óscar', 'Pena', 11, 'Cierre'),
  ('Miguel', 'Lozano', 4, 'Ala'),
  ('David', 'Requena', 5, 'Ala'),
  ('Jordi', 'Ventosa', 6, 'Ala'),
  ('Álvaro', 'Cid', 7, 'Ala'),
  ('Rubén', 'Marín', 10, 'Ala'),
  ('Kike', 'Ramos', 8, 'Pívot'),
  ('Cristian', 'Soto', 9, 'Pívot')
) AS v("first", "last", "shirt", "position")
JOIN "people" p ON p."organization_id" = o."id" AND p."first_name" = v."first" AND p."last_name" = v."last"
JOIN "players" pl ON pl."person_id" = p."id"
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "player_id") DO NOTHING;

-- Cuentas: entrenador del Sénior A, preparadora física y un jugador adulto con su cuenta
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Rafa Torres', 'senior@demo.test', true, 'es'),
       ('Marta Gil', 'preparador@demo.test', true, 'es'),
       ('Miguel Lozano', 'jugador@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential', '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" IN ('senior@demo.test', 'preparador@demo.test', 'jugador@demo.test')
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
  );

INSERT INTO "memberships" ("user_id", "organization_id", "role_code", "position")
SELECT u."id", o."id", v."role", v."position"
FROM "organizations" o
JOIN (VALUES
  ('senior@demo.test', 'coach', NULL),
  ('preparador@demo.test', 'staff', 'fitness'),
  ('jugador@demo.test', 'guardian', NULL)
) AS v("email", "role", "position") ON true
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

-- Cuerpo técnico del Sénior A: primer entrenador, preparación física y fisioterapia
INSERT INTO "team_staff" ("organization_id", "team_id", "user_id", "role_in_team")
SELECT o."id", t."id", u."id", v."role"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
JOIN (VALUES
  ('senior@demo.test', 'head_coach'),
  ('preparador@demo.test', 'fitness'),
  ('fisio@demo.test', 'physio')
) AS v("email", "role") ON true
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "user_id") DO NOTHING;

-- Miguel Lozano entra con su cuenta: su persona lleva el usuario y la cuenta está vinculada a su ficha
UPDATE "people" p
SET "user_id" = u."id", "email" = 'jugador@demo.test'
FROM "organizations" o, "users" u
WHERE o."slug" = 'demo' AND p."organization_id" = o."id" AND u."email" = 'jugador@demo.test'
  AND p."first_name" = 'Miguel' AND p."last_name" = 'Lozano' AND p."user_id" IS NULL;

INSERT INTO "player_guardians" ("organization_id", "player_id", "user_id", "relationship", "guardian_person_id")
SELECT o."id", pl."id", u."id", 'other', p."id"
FROM "organizations" o
JOIN "people" p ON p."organization_id" = o."id" AND p."first_name" = 'Miguel' AND p."last_name" = 'Lozano'
JOIN "players" pl ON pl."person_id" = p."id"
JOIN "users" u ON u."email" = 'jugador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

-- Horario: de lunes a jueves en la pista 2, y sus entrenamientos de la temporada
INSERT INTO "team_schedules" ("organization_id", "team_id", "weekday", "starts_at", "ends_at", "facility_id")
SELECT o."id", t."id", v."weekday", '20:00', '21:30', f."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = 'Pista 2 exterior'
CROSS JOIN (VALUES (1), (2), (3), (4)) AS v("weekday")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "team_schedules" ts WHERE ts."team_id" = t."id");

INSERT INTO "events" ("organization_id", "kind", "title", "section_id", "team_id", "facility_id", "starts_at", "ends_at", "series_id")
SELECT o."id", 'training', 'Entrenamiento Sénior A', t."section_id", t."id", ts."facility_id",
  ((d."day"::date + ts."starts_at"::time) AT TIME ZONE o."timezone"),
  ((d."day"::date + ts."ends_at"::time) AT TIME ZONE o."timezone"),
  ts."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
JOIN "seasons" sea ON sea."id" = t."season_id"
JOIN "team_schedules" ts ON ts."team_id" = t."id"
JOIN LATERAL generate_series(DATE '2026-09-07', sea."ends_on", INTERVAL '1 day') AS d("day") ON EXTRACT(ISODOW FROM d."day") = ts."weekday"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."series_id" = ts."id");

-- Partidos del Sénior A en la agenda (sábados)
INSERT INTO "events" ("organization_id", "kind", "title", "section_id", "team_id", "facility_id", "starts_at", "ends_at", "opponent", "home_away", "location")
SELECT o."id", 'match', v."title", t."section_id", t."id", CASE v."home_away" WHEN 'home' THEN f."id" END,
  (v."starts"::timestamp AT TIME ZONE o."timezone"), (v."ends"::timestamp AT TIME ZONE o."timezone"), v."opponent", v."home_away",
  CASE v."home_away" WHEN 'away' THEN 'Pabellón de ' || v."opponent" END
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
LEFT JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = 'Pabellón pista 1'
CROSS JOIN (VALUES
  ('Sénior A vs CFS Montcada', '2026-09-26 17:00', '2026-09-26 18:30', 'CFS Montcada', 'home'),
  ('FS Sabadell B vs Sénior A', '2026-10-03 17:00', '2026-10-03 18:30', 'FS Sabadell B', 'away'),
  ('Sénior A vs CN Terrassa', '2026-10-10 17:00', '2026-10-10 18:30', 'CN Terrassa', 'home'),
  ('AE Les Corts vs Sénior A', '2026-10-17 17:00', '2026-10-17 18:30', 'AE Les Corts', 'away'),
  ('Sénior A vs FS Castellbisbal', '2026-10-24 17:00', '2026-10-24 18:30', 'FS Castellbisbal', 'home'),
  ('CFS Montcada vs Sénior A', '2026-10-31 17:00', '2026-10-31 18:30', 'CFS Montcada', 'away')
) AS v("title", "starts", "ends", "opponent", "home_away")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."organization_id" = o."id" AND e."title" = v."title" AND e."starts_at" = (v."starts"::timestamp AT TIME ZONE o."timezone"));

-- Los cuatro partidos jugados, enlazados con la agenda y con el RPE del equipo
INSERT INTO "matches" ("organization_id", "team_id", "season_id", "event_id", "opponent", "home_away", "played_on", "status", "formation", "attack_direction", "clock_period", "clock_elapsed_ms", "finished_at", "rpe")
SELECT o."id", t."id", t."season_id", e."id", v."opponent", v."home_away", v."played"::date, 'finished', '1-2-1', 'right', 2, 1200000,
  (v."played"::timestamp + INTERVAL '19 hours') AT TIME ZONE o."timezone", 8
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('CFS Montcada', '2026-09-26', 'home'),
  ('FS Sabadell B', '2026-10-03', 'away'),
  ('CN Terrassa', '2026-10-10', 'home'),
  ('AE Les Corts', '2026-10-17', 'away')
) AS v("opponent", "played", "home_away")
LEFT JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'match' AND e."opponent" = v."opponent"
  AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."played"::date
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "matches" m WHERE m."team_id" = t."id" AND m."played_on" = v."played"::date);

-- Convocatoria: toda la plantilla; de inicio, el quinteto A
INSERT INTO "match_players" ("organization_id", "match_id", "player_id", "shirt_number", "position", "is_goalkeeper", "starter", "slot", "sort_order")
SELECT m."organization_id", m."id", tp."player_id", tp."shirt_number", tp."position",
  tp."position" = 'Portero',
  tp."shirt_number" IN (1, 2, 4, 5, 8),
  CASE tp."shirt_number" WHEN 1 THEN 0 WHEN 2 THEN 1 WHEN 4 THEN 2 WHEN 5 THEN 3 WHEN 8 THEN 4 END,
  tp."shirt_number" * 10
FROM "matches" m
JOIN "organizations" o ON o."id" = m."organization_id" AND o."slug" = 'demo'
JOIN "teams" t ON t."id" = m."team_id" AND t."name" = 'Sénior A'
JOIN "team_players" tp ON tp."team_id" = t."id"
ON CONFLICT ("match_id", "player_id") DO NOTHING;

-- Eventos de los cuatro partidos: quintetos que se alternan, tiros, faltas, córners y goles
WITH demo_matches AS (
  SELECT m."id", m."organization_id", m."opponent"
  FROM "matches" m
  JOIN "organizations" o ON o."id" = m."organization_id" AND o."slug" = 'demo'
  JOIN "teams" t ON t."id" = m."team_id" AND t."name" = 'Sénior A'
  WHERE NOT EXISTS (SELECT 1 FROM "match_events" e WHERE e."match_id" = m."id")
), rows("opponent", "seq", "kind", "code", "shirt", "related", "period", "clock_ms", "zone", "on_court") AS (VALUES
  ('CFS Montcada', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 3, 'action', 'key_pass', 4, NULL, 1, 90000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 4, 'action', 'corner', NULL, NULL, 1, 120000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 5, 'action', 'assist', 4, NULL, 1, 204000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 6, 'action', 'goal', 8, NULL, 1, 210000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 7, 'action', 'foul', 2, NULL, 1, 240000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 8, 'sub', NULL, 3, 2, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 9, 'sub', NULL, 6, 4, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 10, 'sub', NULL, 7, 5, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 11, 'sub', NULL, 9, 8, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 12, 'action', 'shot_off_target', 7, NULL, 1, 360000, 'r2c3', ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 13, 'action', 'steal', 3, NULL, 1, 420000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 14, 'action', 'goal', 9, NULL, 1, 491999, 'r1c1', ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 15, 'action', 'foul', 3, NULL, 1, 540000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 16, 'sub', NULL, 2, 3, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 17, 'sub', NULL, 4, 6, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 18, 'sub', NULL, 5, 7, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 19, 'sub', NULL, 8, 9, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 20, 'action', 'corner', NULL, NULL, 1, 660000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 21, 'action', 'shot_on_target', 2, NULL, 1, 720000, 'r3c2', ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 22, 'action', 'assist', 2, NULL, 1, 780000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 23, 'action', 'goal', 4, NULL, 1, 786000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 24, 'sub', NULL, 3, 2, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 25, 'sub', NULL, 6, 4, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 26, 'sub', NULL, 7, 5, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 27, 'sub', NULL, 9, 8, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 28, 'action', 'opp_goal', NULL, NULL, 1, 1043999, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 29, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 30, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 31, 'action', 'goal', 5, NULL, 2, 144000, 'r1c3', ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 32, 'action', 'key_pass', 4, NULL, 2, 240000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 33, 'sub', NULL, 3, 2, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 34, 'sub', NULL, 6, 4, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 35, 'sub', NULL, 7, 5, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 36, 'sub', NULL, 9, 8, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 37, 'action', 'foul', 6, NULL, 2, 360000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 38, 'action', 'shot_on_target', 9, NULL, 2, 450000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 39, 'action', 'corner', NULL, NULL, 2, 540000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 40, 'sub', NULL, 2, 3, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 41, 'sub', NULL, 4, 6, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 42, 'sub', NULL, 5, 7, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 43, 'sub', NULL, 8, 9, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 44, 'action', 'assist', 5, NULL, 2, 696000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 45, 'action', 'goal', 8, NULL, 2, 702000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 46, 'action', 'steal', 2, NULL, 2, 750000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 47, 'action', 'key_pass', 4, NULL, 2, 840000, NULL, ARRAY[1,2,4,5,8]),
  ('CFS Montcada', 48, 'sub', NULL, 3, 2, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 49, 'sub', NULL, 6, 4, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 50, 'sub', NULL, 7, 5, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 51, 'sub', NULL, 9, 8, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 52, 'action', 'goal', 6, NULL, 2, 978000, 'r2c1', ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 53, 'action', 'shot_off_target', 7, NULL, 2, 1092000, 'r2c2', ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 54, 'action', 'opp_goal', NULL, NULL, 2, 1128000, NULL, ARRAY[1,3,6,7,9]),
  ('CFS Montcada', 55, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 3, 'action', 'shot_on_target', 8, NULL, 1, 120000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 4, 'action', 'foul', 5, NULL, 1, 180000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 5, 'action', 'assist', 2, NULL, 1, 264000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 6, 'action', 'goal', 4, NULL, 1, 270000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 7, 'sub', NULL, 3, 2, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 8, 'sub', NULL, 6, 4, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 9, 'sub', NULL, 7, 5, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 10, 'sub', NULL, 9, 8, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 11, 'action', 'key_pass', 6, NULL, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 12, 'action', 'corner', NULL, NULL, 1, 360000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 13, 'action', 'shot_off_target', 6, NULL, 1, 420000, 'r2c2', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 14, 'action', 'foul', 7, NULL, 1, 480000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 15, 'action', 'shot_on_target', 9, NULL, 1, 570000, 'r1c3', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 16, 'sub', NULL, 2, 3, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 17, 'sub', NULL, 4, 6, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 18, 'sub', NULL, 5, 7, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 19, 'sub', NULL, 8, 9, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 20, 'action', 'opp_goal', NULL, NULL, 1, 630000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 21, 'action', 'foul', 2, NULL, 1, 660000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 22, 'action', 'steal', 2, NULL, 1, 720000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 23, 'action', 'shot_off_target', 4, NULL, 1, 780000, 'r3c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 24, 'action', 'corner', NULL, NULL, 1, 840000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 25, 'sub', NULL, 3, 2, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 26, 'sub', NULL, 6, 4, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 27, 'sub', NULL, 7, 5, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 28, 'sub', NULL, 9, 8, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 29, 'action', 'turnover', 7, NULL, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 30, 'action', 'goal', 7, NULL, 1, 960000, 'r1c1', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 31, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 32, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 33, 'action', 'shot_off_target', 2, NULL, 2, 60000, 'r3c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 34, 'action', 'assist', 4, NULL, 2, 174000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 35, 'action', 'goal', 8, NULL, 2, 180000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 36, 'action', 'corner', NULL, NULL, 2, 240000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 37, 'sub', NULL, 3, 2, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 38, 'sub', NULL, 6, 4, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 39, 'sub', NULL, 7, 5, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 40, 'sub', NULL, 9, 8, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 41, 'action', 'foul', 3, NULL, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 42, 'action', 'shot_on_target', 7, NULL, 2, 360000, 'r2c1', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 43, 'action', 'shot_off_target', 9, NULL, 2, 480000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 44, 'action', 'key_pass', 6, NULL, 2, 540000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 45, 'sub', NULL, 2, 3, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 46, 'sub', NULL, 4, 6, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 47, 'sub', NULL, 5, 7, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 48, 'sub', NULL, 8, 9, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 49, 'action', 'steal', 4, NULL, 2, 660000, NULL, ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 50, 'action', 'goal', 5, NULL, 2, 744000, 'r2c3', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 51, 'action', 'shot_on_target', 5, NULL, 2, 840000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('FS Sabadell B', 52, 'sub', NULL, 3, 2, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 53, 'sub', NULL, 6, 4, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 54, 'sub', NULL, 7, 5, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 55, 'sub', NULL, 9, 8, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 56, 'action', 'opp_goal', NULL, NULL, 2, 972000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 57, 'action', 'shot_off_target', 6, NULL, 2, 1020000, 'r1c3', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 58, 'action', 'shot_on_target', 6, NULL, 2, 1110000, 'r2c2', ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 59, 'action', 'opp_goal', NULL, NULL, 2, 1146000, NULL, ARRAY[1,3,6,7,9]),
  ('FS Sabadell B', 60, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 3, 'action', 'shot_off_target', 4, NULL, 1, 90000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 4, 'action', 'foul', 2, NULL, 1, 120000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 5, 'action', 'shot_on_target', 8, NULL, 1, 180000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 6, 'action', 'corner', NULL, NULL, 1, 240000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 7, 'sub', NULL, 3, 2, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 8, 'sub', NULL, 6, 4, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 9, 'sub', NULL, 7, 5, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 10, 'sub', NULL, 9, 8, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 11, 'action', 'foul', 3, NULL, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 12, 'action', 'shot_off_target', 7, NULL, 1, 390000, 'r2c3', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 13, 'action', 'foul', 6, NULL, 1, 420000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 14, 'action', 'opp_goal', NULL, NULL, 1, 450000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 15, 'action', 'turnover', 3, NULL, 1, 480000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 16, 'action', 'shot_on_target', 6, NULL, 1, 540000, 'r1c1', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 17, 'sub', NULL, 2, 3, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 18, 'sub', NULL, 4, 6, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 19, 'sub', NULL, 5, 7, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 20, 'sub', NULL, 8, 9, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 21, 'action', 'turnover', 4, NULL, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 22, 'action', 'foul', 5, NULL, 1, 660000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 23, 'action', 'shot_off_target', 5, NULL, 1, 720000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 24, 'action', 'foul', 4, NULL, 1, 810000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 25, 'action', 'shot_off_target', 8, NULL, 1, 870000, 'r1c3', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 26, 'sub', NULL, 3, 2, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 27, 'sub', NULL, 6, 4, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 28, 'sub', NULL, 7, 5, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 29, 'sub', NULL, 9, 8, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 30, 'action', 'corner', NULL, NULL, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 31, 'action', 'steal', 3, NULL, 1, 960000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 32, 'action', 'shot_on_target', 3, NULL, 1, 1020000, 'r3c2', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 33, 'action', 'opp_goal', NULL, NULL, 1, 1080000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 34, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 35, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 36, 'action', 'shot_off_target', 2, NULL, 2, 120000, 'r3c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 37, 'action', 'corner', NULL, NULL, 2, 180000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 38, 'action', 'shot_on_target', 8, NULL, 2, 240000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 39, 'sub', NULL, 3, 2, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 40, 'sub', NULL, 6, 4, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 41, 'sub', NULL, 7, 5, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 42, 'sub', NULL, 9, 8, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 43, 'action', 'turnover', 6, NULL, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 44, 'action', 'shot_off_target', 6, NULL, 2, 360000, 'r2c1', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 45, 'action', 'assist', 7, NULL, 2, 504000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 46, 'action', 'goal', 9, NULL, 2, 510000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 47, 'action', 'foul', 7, NULL, 2, 540000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 48, 'sub', NULL, 2, 3, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 49, 'sub', NULL, 4, 6, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 50, 'sub', NULL, 5, 7, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 51, 'sub', NULL, 8, 9, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 52, 'action', 'shot_on_target', 4, NULL, 2, 660000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 53, 'action', 'key_pass', 4, NULL, 2, 720000, NULL, ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 54, 'action', 'shot_off_target', 5, NULL, 2, 780000, 'r1c3', ARRAY[1,2,4,5,8]),
  ('CN Terrassa', 55, 'sub', NULL, 3, 2, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 56, 'sub', NULL, 6, 4, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 57, 'sub', NULL, 7, 5, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 58, 'sub', NULL, 9, 8, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 59, 'action', 'shot_on_target', 7, NULL, 2, 960000, 'r2c2', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 60, 'action', 'opp_goal', NULL, NULL, 2, 1050000, NULL, ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 61, 'action', 'shot_off_target', 9, NULL, 2, 1080000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 62, 'action', 'shot_on_target', 9, NULL, 2, 1140000, 'r1c1', ARRAY[1,3,6,7,9]),
  ('CN Terrassa', 63, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 3, 'action', 'shot_on_target', 5, NULL, 1, 60000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 4, 'action', 'foul', 5, NULL, 1, 90000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 5, 'action', 'steal', 2, NULL, 1, 150000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 6, 'action', 'shot_off_target', 8, NULL, 1, 210000, 'r1c3', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 7, 'action', 'foul', 2, NULL, 1, 270000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 8, 'sub', NULL, 3, 2, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 9, 'sub', NULL, 6, 4, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 10, 'sub', NULL, 7, 5, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 11, 'sub', NULL, 9, 8, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 12, 'action', 'corner', NULL, NULL, 1, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 13, 'action', 'shot_on_target', 9, NULL, 1, 360000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 14, 'action', 'foul', 7, NULL, 1, 390000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 15, 'action', 'key_pass', 6, NULL, 1, 450000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 16, 'action', 'shot_off_target', 6, NULL, 1, 480000, 'r2c1', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 17, 'action', 'foul', 3, NULL, 1, 540000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 18, 'sub', NULL, 2, 3, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 19, 'sub', NULL, 4, 6, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 20, 'sub', NULL, 5, 7, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 21, 'sub', NULL, 8, 9, 1, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 22, 'action', 'assist', 5, NULL, 1, 684000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 23, 'action', 'goal', 4, NULL, 1, 690000, 'r1c2', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 24, 'action', 'foul', 4, NULL, 1, 720000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 25, 'action', 'shot_off_target', 2, NULL, 1, 840000, 'r3c2', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 26, 'sub', NULL, 3, 2, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 27, 'sub', NULL, 6, 4, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 28, 'sub', NULL, 7, 5, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 29, 'sub', NULL, 9, 8, 1, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 30, 'action', 'opp_goal', NULL, NULL, 1, 990000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 31, 'action', 'shot_on_target', 7, NULL, 1, 1050000, 'r2c3', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 32, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 33, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 34, 'action', 'corner', NULL, NULL, 2, 90000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 35, 'action', 'shot_off_target', 4, NULL, 2, 150000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 36, 'action', 'key_pass', 4, NULL, 2, 210000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 37, 'sub', NULL, 3, 2, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 38, 'sub', NULL, 6, 4, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 39, 'sub', NULL, 7, 5, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 40, 'sub', NULL, 9, 8, 2, 300000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 41, 'action', 'shot_on_target', 7, NULL, 2, 300000, 'r1c3', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 42, 'action', 'assist', 6, NULL, 2, 414000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 43, 'action', 'goal', 9, NULL, 2, 420000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 44, 'action', 'shot_off_target', 9, NULL, 2, 540000, 'r1c1', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 45, 'sub', NULL, 2, 3, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 46, 'sub', NULL, 4, 6, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 47, 'sub', NULL, 5, 7, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 48, 'sub', NULL, 8, 9, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 49, 'action', 'foul', 4, NULL, 2, 600000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 50, 'action', 'steal', 2, NULL, 2, 660000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 51, 'action', 'shot_off_target', 5, NULL, 2, 750000, 'r2c2', ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 52, 'action', 'turnover', 8, NULL, 2, 780000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 53, 'action', 'corner', NULL, NULL, 2, 840000, NULL, ARRAY[1,2,4,5,8]),
  ('AE Les Corts', 54, 'sub', NULL, 3, 2, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 55, 'sub', NULL, 6, 4, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 56, 'sub', NULL, 7, 5, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 57, 'sub', NULL, 9, 8, 2, 900000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 58, 'action', 'shot_on_target', 3, NULL, 2, 930000, 'r3c2', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 59, 'action', 'shot_off_target', 6, NULL, 2, 1080000, 'r1c2', ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 60, 'action', 'opp_goal', NULL, NULL, 2, 1164000, NULL, ARRAY[1,3,6,7,9]),
  ('AE Les Corts', 61, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,3,6,7,9])
)
INSERT INTO "match_events" ("organization_id", "match_id", "seq", "kind", "action_type_id", "action_code", "player_id", "related_player_id", "side", "period", "clock_ms", "zone", "on_court", "own_score_delta", "opponent_score_delta")
SELECT dm."organization_id", dm."id", r."seq", r."kind", at."id", at."code",
  pin."player_id", pout."player_id",
  CASE WHEN at."scope" = 'opponent' THEN 'opponent' ELSE 'own' END,
  r."period", r."clock_ms", r."zone",
  COALESCE((SELECT jsonb_agg(mp."player_id" ORDER BY mp."shirt_number") FROM "match_players" mp WHERE mp."match_id" = dm."id" AND mp."shirt_number" = ANY(r."on_court")), '[]'::jsonb),
  COALESCE(at."own_score", 0), COALESCE(at."opponent_score", 0)
FROM rows r
JOIN demo_matches dm ON dm."opponent" = r."opponent"
LEFT JOIN "match_action_types" at ON at."organization_id" = dm."organization_id" AND at."code" = r."code"
  AND at."section_id" = (SELECT t."section_id" FROM "matches" m JOIN "teams" t ON t."id" = m."team_id" WHERE m."id" = dm."id")
LEFT JOIN "match_players" pin ON pin."match_id" = dm."id" AND pin."shirt_number" = r."shirt"
LEFT JOIN "match_players" pout ON pout."match_id" = dm."id" AND pout."shirt_number" = r."related"
ON CONFLICT ("match_id", "seq") DO NOTHING;

UPDATE "matches" m
SET "own_score" = s."own", "opponent_score" = s."opp"
FROM (
  SELECT e."match_id", COALESCE(SUM(e."own_score_delta"), 0) AS "own", COALESCE(SUM(e."opponent_score_delta"), 0) AS "opp"
  FROM "match_events" e
  GROUP BY e."match_id"
) s, "teams" t, "organizations" o
WHERE m."id" = s."match_id" AND t."id" = m."team_id" AND t."name" = 'Sénior A'
  AND o."id" = m."organization_id" AND o."slug" = 'demo';

-- Plan de temporada y sus ciclos
INSERT INTO "training_plans" ("organization_id", "team_id", "season_id", "name", "notes")
SELECT o."id", t."id", t."season_id", 'Plan 2026-27', 'Objetivo: playoff de ascenso. Base física en pretemporada y ataque posicional en la primera vuelta.'
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "season_id") DO NOTHING;

INSERT INTO "training_cycles" ("organization_id", "plan_id", "name", "starts_on", "ends_on", "focus_content_ids", "target_weekly_load", "notes")
SELECT o."id", p."id", v."name", v."starts"::date, v."ends"::date,
  COALESCE((SELECT jsonb_agg(c."id" ORDER BY array_position(v."codes", c."code")) FROM "training_contents" c WHERE c."section_id" = t."section_id" AND c."code" = ANY(v."codes")), '[]'::jsonb),
  v."load", v."notes"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
JOIN "training_plans" p ON p."team_id" = t."id"
CROSS JOIN (VALUES
  ('Pretemporada', '2026-09-01', '2026-09-27', ARRAY['intermittent_endurance', 'strength', 'injury_prevention'], 2600, 'Volumen alto y prevención.'),
  ('Mesociclo 1: octubre', '2026-09-28', '2026-11-01', ARRAY['finishing', 'defending_without_fouls', 'set_piece_defence', 'concentration'], 2200, 'Afinar la finalización y dejar de llegar pronto a la quinta falta.'),
  ('Mesociclo 2: noviembre', '2026-11-02', '2026-11-29', ARRAY['positional_attack', 'power_play', 'transitions'], 2100, NULL)
) AS v("name", "starts", "ends", "codes", "load", "notes")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "training_cycles" cy WHERE cy."plan_id" = p."id" AND cy."name" = v."name");

-- Sesiones del Sénior A del 28 de septiembre a hoy: cerradas las pasadas, planificada la de hoy
INSERT INTO "training_sessions" ("organization_id", "event_id", "team_id", "cycle_id", "objective", "content_ids", "status", "target_rpe", "rating", "actual_minutes", "closed_at", "created_by")
SELECT o."id", e."id", t."id", cy."id", v."objective", '[]'::jsonb, v."status", v."rpe", v."rating", v."minutes",
  CASE v."status" WHEN 'done' THEN e."ends_at" END, u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('2026-09-28', 'Recuperación y compensatorio', 4, 'done', 3, 52),
  ('2026-09-29', 'Salida de presión y defensa sin falta', 7, 'done', 3, 59),
  ('2026-09-30', 'Táctica en espacio amplio e intermitente', 7, 'done', 2, 62),
  ('2026-10-01', 'Velocidad, finalización y ABP', 5, 'done', 3, 57),
  ('2026-10-05', 'Recuperación y compensatorio', 4, 'done', 3, 52),
  ('2026-10-06', 'Salida de presión y defensa sin falta', 7, 'done', 3, 59),
  ('2026-10-07', 'Táctica en espacio amplio e intermitente', 7, 'done', 2, 62),
  ('2026-10-08', 'Velocidad, finalización y ABP', 5, 'done', 3, 57),
  ('2026-10-12', 'Recuperación y compensatorio', 4, 'done', 3, 52),
  ('2026-10-13', 'Salida de presión y defensa sin falta', 7, 'done', 3, 59),
  ('2026-10-14', 'Táctica en espacio amplio e intermitente', 7, 'done', 2, 62),
  ('2026-10-15', 'Velocidad, finalización y ABP', 5, 'done', 3, 57),
  ('2026-10-19', 'Recuperación y compensatorio', 4, 'done', 3, 52),
  ('2026-10-20', 'Salida de presión y defensa sin falta', 7, 'done', 3, 59),
  ('2026-10-21', 'Táctica en espacio amplio e intermitente', 7, 'done', 2, 62),
  ('2026-10-22', 'Velocidad, finalización y ABP', 5, 'planned', NULL, NULL)
) AS v("day", "objective", "rpe", "status", "rating", "minutes")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
LEFT JOIN "training_plans" p ON p."team_id" = t."id"
LEFT JOIN "training_cycles" cy ON cy."plan_id" = p."id" AND v."day"::date BETWEEN cy."starts_on" AND cy."ends_on"
LEFT JOIN "users" u ON u."email" = 'senior@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id") DO NOTHING;

-- Tareas de cada sesión: de la biblioteca (con sus contenidos y restricciones) o libres
INSERT INTO "training_session_items" ("organization_id", "session_id", "drill_id", "title", "block", "sort_order", "minutes", "target_rpe", "group_label", "player_ids", "content_ids", "restriction_tags", "rating", "owner_user_id")
SELECT o."id", ss."id", d."id", COALESCE(v."title", d."name"), v."block", v."sort", v."minutes", v."rpe", v."group",
  CASE v."who"
    WHEN 'gk' THEN (SELECT jsonb_agg(tp."player_id" ORDER BY tp."shirt_number") FROM "team_players" tp WHERE tp."team_id" = t."id" AND tp."position" = 'Portero')
    WHEN 'rehab' THEN (SELECT jsonb_agg(pl."id") FROM "players" pl JOIN "people" pe ON pe."id" = pl."person_id" WHERE pe."organization_id" = o."id" AND pe."first_name" = 'Toni' AND pe."last_name" = 'Bermejo')
  END,
  COALESCE((SELECT jsonb_agg(dc."content_id" ORDER BY dc."sort_order") FROM "drill_contents" dc WHERE dc."drill_id" = d."id"), '[]'::jsonb),
  COALESCE(d."restriction_tags", '[]'::jsonb),
  v."rating", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('2026-09-28', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-09-28', 'main', 20, 'seed_2', NULL, 15, 6, NULL, NULL, 3),
  ('2026-09-28', 'main', 30, 'seed_4', NULL, 15, 5, NULL, NULL, 3),
  ('2026-09-28', 'cooldown', 40, NULL, 'Estiramientos y movilidad', 10, 2, NULL, NULL, 3),
  ('2026-09-29', 'warmup', 10, 'seed_1', NULL, 12, 3, NULL, NULL, 3),
  ('2026-09-29', 'main', 20, 'seed_5', NULL, 15, 7, NULL, NULL, 3),
  ('2026-09-29', 'main', 30, 'seed_7', NULL, 12, 7, NULL, NULL, 3),
  ('2026-09-29', 'main', 40, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-09-29', 'goalkeepers', 50, 'seed_14', NULL, 20, 6, 'Porteros', 'gk', 3),
  ('2026-09-30', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-09-30', 'main', 20, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-09-30', 'main', 30, 'seed_10', NULL, 15, 6, NULL, NULL, 3),
  ('2026-09-30', 'main', 40, 'seed_11', NULL, 15, 8, NULL, NULL, 3),
  ('2026-10-01', 'warmup', 10, 'seed_1', NULL, 10, 3, NULL, NULL, 3),
  ('2026-10-01', 'main', 20, 'seed_3', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-01', 'main', 30, 'seed_8', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-01', 'main', 40, 'seed_9', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-01', 'main', 50, 'seed_12', NULL, 12, 9, NULL, NULL, 3),
  ('2026-10-05', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-05', 'main', 20, 'seed_2', NULL, 15, 6, NULL, NULL, 1),
  ('2026-10-05', 'main', 30, 'seed_4', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-05', 'cooldown', 40, NULL, 'Estiramientos y movilidad', 10, 2, NULL, NULL, 3),
  ('2026-10-06', 'warmup', 10, 'seed_1', NULL, 12, 3, NULL, NULL, 3),
  ('2026-10-06', 'main', 20, 'seed_5', NULL, 15, 7, NULL, NULL, 3),
  ('2026-10-06', 'main', 30, 'seed_7', NULL, 12, 7, NULL, NULL, 3),
  ('2026-10-06', 'main', 40, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-06', 'goalkeepers', 50, 'seed_14', NULL, 20, 6, 'Porteros', 'gk', 3),
  ('2026-10-07', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-07', 'main', 20, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-07', 'main', 30, 'seed_10', NULL, 15, 6, NULL, NULL, 3),
  ('2026-10-07', 'main', 40, 'seed_11', NULL, 15, 8, NULL, NULL, 3),
  ('2026-10-08', 'warmup', 10, 'seed_1', NULL, 10, 3, NULL, NULL, 3),
  ('2026-10-08', 'main', 20, 'seed_3', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-08', 'main', 30, 'seed_8', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-08', 'main', 40, 'seed_9', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-08', 'main', 50, 'seed_12', NULL, 12, 9, NULL, NULL, 3),
  ('2026-10-12', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-12', 'main', 20, 'seed_2', NULL, 15, 6, NULL, NULL, 1),
  ('2026-10-12', 'main', 30, 'seed_4', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-12', 'cooldown', 40, NULL, 'Estiramientos y movilidad', 10, 2, NULL, NULL, 3),
  ('2026-10-13', 'warmup', 10, 'seed_1', NULL, 12, 3, NULL, NULL, 3),
  ('2026-10-13', 'main', 20, 'seed_5', NULL, 15, 7, NULL, NULL, 3),
  ('2026-10-13', 'main', 30, 'seed_7', NULL, 12, 7, NULL, NULL, 3),
  ('2026-10-13', 'main', 40, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-13', 'goalkeepers', 50, 'seed_14', NULL, 20, 6, 'Porteros', 'gk', 3),
  ('2026-10-14', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-14', 'main', 20, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-14', 'main', 30, 'seed_10', NULL, 15, 6, NULL, NULL, 3),
  ('2026-10-14', 'main', 40, 'seed_11', NULL, 15, 8, NULL, NULL, 3),
  ('2026-10-15', 'warmup', 10, 'seed_1', NULL, 10, 3, NULL, NULL, 3),
  ('2026-10-15', 'main', 20, 'seed_3', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-15', 'main', 30, 'seed_8', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-15', 'main', 40, 'seed_9', NULL, 10, 4, NULL, NULL, 3),
  ('2026-10-15', 'main', 50, 'seed_12', NULL, 12, 9, NULL, NULL, 3),
  ('2026-10-19', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-19', 'main', 20, 'seed_2', NULL, 15, 6, NULL, NULL, 1),
  ('2026-10-19', 'main', 30, 'seed_4', NULL, 15, 5, NULL, NULL, 3),
  ('2026-10-19', 'cooldown', 40, NULL, 'Estiramientos y movilidad', 10, 2, NULL, NULL, 3),
  ('2026-10-20', 'warmup', 10, 'seed_1', NULL, 12, 3, NULL, NULL, 3),
  ('2026-10-20', 'main', 20, 'seed_5', NULL, 15, 7, NULL, NULL, 3),
  ('2026-10-20', 'main', 30, 'seed_7', NULL, 12, 7, NULL, NULL, 3),
  ('2026-10-20', 'main', 40, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-20', 'goalkeepers', 50, 'seed_14', NULL, 20, 6, 'Porteros', 'gk', 3),
  ('2026-10-21', 'warmup', 10, 'seed_13', NULL, 12, 5, NULL, NULL, 3),
  ('2026-10-21', 'main', 20, 'seed_6', NULL, 20, 8, NULL, NULL, 3),
  ('2026-10-21', 'main', 30, 'seed_10', NULL, 15, 6, NULL, NULL, 3),
  ('2026-10-21', 'main', 40, 'seed_11', NULL, 15, 8, NULL, NULL, 3),
  ('2026-10-22', 'warmup', 10, 'seed_1', NULL, 10, 3, NULL, NULL, NULL),
  ('2026-10-22', 'main', 20, 'seed_3', NULL, 15, 5, NULL, NULL, NULL),
  ('2026-10-22', 'main', 30, 'seed_8', NULL, 10, 4, NULL, NULL, NULL),
  ('2026-10-22', 'main', 40, 'seed_9', NULL, 10, 4, NULL, NULL, NULL),
  ('2026-10-22', 'main', 50, 'seed_12', NULL, 12, 9, NULL, NULL, NULL),
  ('2026-10-22', 'rehab', 60, NULL, 'Readaptación: carrera y cambios de ritmo', 30, 4, 'Readaptación', 'rehab', NULL)
) AS v("day", "block", "sort", "seed", "title", "minutes", "rpe", "group", "who", "rating")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
JOIN "training_sessions" ss ON ss."event_id" = e."id"
LEFT JOIN "drills" d ON d."section_id" = t."section_id" AND d."seed_key" = v."seed"
LEFT JOIN "users" u ON u."email" = CASE WHEN v."block" IN ('warmup', 'cooldown') THEN 'preparador@demo.test' WHEN v."block" = 'rehab' THEN 'fisio@demo.test' ELSE 'senior@demo.test' END
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "training_session_items" x WHERE x."session_id" = ss."id" AND x."sort_order" = v."sort" AND x."block" = v."block");

-- Pase de lista de las sesiones cerradas
INSERT INTO "attendance" ("organization_id", "event_id", "player_id", "status", "recorded_by")
SELECT o."id", e."id", tp."player_id", v."status", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('2026-09-28', 1, 'present'),
  ('2026-09-28', 13, 'present'),
  ('2026-09-28', 2, 'present'),
  ('2026-09-28', 3, 'present'),
  ('2026-09-28', 11, 'present'),
  ('2026-09-28', 4, 'present'),
  ('2026-09-28', 5, 'present'),
  ('2026-09-28', 6, 'present'),
  ('2026-09-28', 7, 'present'),
  ('2026-09-28', 10, 'present'),
  ('2026-09-28', 8, 'present'),
  ('2026-09-28', 9, 'present'),
  ('2026-09-29', 1, 'present'),
  ('2026-09-29', 13, 'present'),
  ('2026-09-29', 2, 'present'),
  ('2026-09-29', 3, 'present'),
  ('2026-09-29', 11, 'present'),
  ('2026-09-29', 4, 'present'),
  ('2026-09-29', 5, 'present'),
  ('2026-09-29', 6, 'present'),
  ('2026-09-29', 7, 'present'),
  ('2026-09-29', 10, 'present'),
  ('2026-09-29', 8, 'present'),
  ('2026-09-29', 9, 'absent'),
  ('2026-09-30', 1, 'present'),
  ('2026-09-30', 13, 'present'),
  ('2026-09-30', 2, 'present'),
  ('2026-09-30', 3, 'present'),
  ('2026-09-30', 11, 'present'),
  ('2026-09-30', 4, 'present'),
  ('2026-09-30', 5, 'present'),
  ('2026-09-30', 6, 'present'),
  ('2026-09-30', 7, 'present'),
  ('2026-09-30', 10, 'present'),
  ('2026-09-30', 8, 'present'),
  ('2026-09-30', 9, 'present'),
  ('2026-10-01', 1, 'present'),
  ('2026-10-01', 13, 'present'),
  ('2026-10-01', 2, 'present'),
  ('2026-10-01', 3, 'present'),
  ('2026-10-01', 11, 'present'),
  ('2026-10-01', 4, 'present'),
  ('2026-10-01', 5, 'present'),
  ('2026-10-01', 6, 'present'),
  ('2026-10-01', 7, 'present'),
  ('2026-10-01', 10, 'present'),
  ('2026-10-01', 8, 'present'),
  ('2026-10-01', 9, 'absent'),
  ('2026-10-05', 1, 'present'),
  ('2026-10-05', 13, 'present'),
  ('2026-10-05', 2, 'present'),
  ('2026-10-05', 3, 'present'),
  ('2026-10-05', 11, 'present'),
  ('2026-10-05', 4, 'present'),
  ('2026-10-05', 5, 'present'),
  ('2026-10-05', 6, 'present'),
  ('2026-10-05', 7, 'present'),
  ('2026-10-05', 10, 'present'),
  ('2026-10-05', 8, 'present'),
  ('2026-10-05', 9, 'present'),
  ('2026-10-06', 1, 'present'),
  ('2026-10-06', 13, 'present'),
  ('2026-10-06', 2, 'present'),
  ('2026-10-06', 3, 'present'),
  ('2026-10-06', 11, 'present'),
  ('2026-10-06', 4, 'present'),
  ('2026-10-06', 5, 'present'),
  ('2026-10-06', 6, 'present'),
  ('2026-10-06', 7, 'present'),
  ('2026-10-06', 10, 'present'),
  ('2026-10-06', 8, 'present'),
  ('2026-10-06', 9, 'present'),
  ('2026-10-07', 1, 'present'),
  ('2026-10-07', 13, 'present'),
  ('2026-10-07', 2, 'present'),
  ('2026-10-07', 3, 'present'),
  ('2026-10-07', 11, 'present'),
  ('2026-10-07', 4, 'present'),
  ('2026-10-07', 5, 'present'),
  ('2026-10-07', 6, 'present'),
  ('2026-10-07', 7, 'present'),
  ('2026-10-07', 10, 'present'),
  ('2026-10-07', 8, 'present'),
  ('2026-10-07', 9, 'absent'),
  ('2026-10-08', 1, 'present'),
  ('2026-10-08', 13, 'present'),
  ('2026-10-08', 2, 'present'),
  ('2026-10-08', 3, 'present'),
  ('2026-10-08', 11, 'present'),
  ('2026-10-08', 4, 'present'),
  ('2026-10-08', 5, 'present'),
  ('2026-10-08', 6, 'present'),
  ('2026-10-08', 7, 'present'),
  ('2026-10-08', 10, 'present'),
  ('2026-10-08', 8, 'present'),
  ('2026-10-08', 9, 'present'),
  ('2026-10-12', 1, 'present'),
  ('2026-10-12', 13, 'present'),
  ('2026-10-12', 2, 'present'),
  ('2026-10-12', 3, 'excused'),
  ('2026-10-12', 11, 'present'),
  ('2026-10-12', 4, 'present'),
  ('2026-10-12', 5, 'present'),
  ('2026-10-12', 6, 'present'),
  ('2026-10-12', 7, 'present'),
  ('2026-10-12', 10, 'present'),
  ('2026-10-12', 8, 'present'),
  ('2026-10-12', 9, 'absent'),
  ('2026-10-13', 1, 'present'),
  ('2026-10-13', 13, 'present'),
  ('2026-10-13', 2, 'present'),
  ('2026-10-13', 3, 'excused'),
  ('2026-10-13', 11, 'present'),
  ('2026-10-13', 4, 'present'),
  ('2026-10-13', 5, 'present'),
  ('2026-10-13', 6, 'present'),
  ('2026-10-13', 7, 'present'),
  ('2026-10-13', 10, 'present'),
  ('2026-10-13', 8, 'present'),
  ('2026-10-13', 9, 'present'),
  ('2026-10-14', 1, 'present'),
  ('2026-10-14', 13, 'present'),
  ('2026-10-14', 2, 'present'),
  ('2026-10-14', 3, 'excused'),
  ('2026-10-14', 11, 'present'),
  ('2026-10-14', 4, 'present'),
  ('2026-10-14', 5, 'present'),
  ('2026-10-14', 6, 'present'),
  ('2026-10-14', 7, 'present'),
  ('2026-10-14', 10, 'present'),
  ('2026-10-14', 8, 'present'),
  ('2026-10-14', 9, 'present'),
  ('2026-10-15', 1, 'present'),
  ('2026-10-15', 13, 'present'),
  ('2026-10-15', 2, 'present'),
  ('2026-10-15', 3, 'excused'),
  ('2026-10-15', 11, 'present'),
  ('2026-10-15', 4, 'present'),
  ('2026-10-15', 5, 'present'),
  ('2026-10-15', 6, 'present'),
  ('2026-10-15', 7, 'present'),
  ('2026-10-15', 10, 'present'),
  ('2026-10-15', 8, 'present'),
  ('2026-10-15', 9, 'absent'),
  ('2026-10-19', 1, 'present'),
  ('2026-10-19', 13, 'present'),
  ('2026-10-19', 2, 'present'),
  ('2026-10-19', 3, 'present'),
  ('2026-10-19', 11, 'present'),
  ('2026-10-19', 4, 'present'),
  ('2026-10-19', 5, 'present'),
  ('2026-10-19', 6, 'present'),
  ('2026-10-19', 7, 'present'),
  ('2026-10-19', 10, 'present'),
  ('2026-10-19', 8, 'present'),
  ('2026-10-19', 9, 'present'),
  ('2026-10-20', 1, 'present'),
  ('2026-10-20', 13, 'present'),
  ('2026-10-20', 2, 'present'),
  ('2026-10-20', 3, 'present'),
  ('2026-10-20', 11, 'present'),
  ('2026-10-20', 4, 'present'),
  ('2026-10-20', 5, 'present'),
  ('2026-10-20', 6, 'present'),
  ('2026-10-20', 7, 'present'),
  ('2026-10-20', 10, 'present'),
  ('2026-10-20', 8, 'present'),
  ('2026-10-20', 9, 'absent'),
  ('2026-10-21', 1, 'present'),
  ('2026-10-21', 13, 'present'),
  ('2026-10-21', 2, 'present'),
  ('2026-10-21', 3, 'present'),
  ('2026-10-21', 11, 'present'),
  ('2026-10-21', 4, 'present'),
  ('2026-10-21', 5, 'present'),
  ('2026-10-21', 6, 'present'),
  ('2026-10-21', 7, 'present'),
  ('2026-10-21', 10, 'present'),
  ('2026-10-21', 8, 'present'),
  ('2026-10-21', 9, 'present')
) AS v("day", "shirt", "status")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
JOIN "team_players" tp ON tp."team_id" = t."id" AND tp."shirt_number" = v."shirt"
LEFT JOIN "users" u ON u."email" = 'senior@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id", "player_id") DO NOTHING;

-- Carga de sesión: minutos y RPE de cada jugador presente
INSERT INTO "player_loads" ("organization_id", "player_id", "source", "event_id", "on_date", "minutes", "rpe", "participation", "recorded_by")
SELECT o."id", tp."player_id", 'session', e."id", v."day"::date, v."minutes", v."rpe", v."participation", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('2026-09-28', 1, 52, 4, 'full'),
  ('2026-09-28', 13, 52, 4, 'full'),
  ('2026-09-28', 2, 52, 5, 'full'),
  ('2026-09-28', 3, 52, 3, 'full'),
  ('2026-09-28', 11, 52, 5, 'full'),
  ('2026-09-28', 4, 52, 4, 'full'),
  ('2026-09-28', 5, 52, 5, 'full'),
  ('2026-09-28', 6, 52, 3, 'full'),
  ('2026-09-28', 7, 52, 4, 'full'),
  ('2026-09-28', 10, 52, 4, 'full'),
  ('2026-09-28', 8, 52, 5, 'full'),
  ('2026-09-28', 9, 52, 3, 'full'),
  ('2026-09-29', 1, 79, 8, 'full'),
  ('2026-09-29', 13, 79, 8, 'full'),
  ('2026-09-29', 2, 59, 6, 'full'),
  ('2026-09-29', 3, 59, 7, 'full'),
  ('2026-09-29', 11, 59, 6, 'full'),
  ('2026-09-29', 4, 59, 8, 'full'),
  ('2026-09-29', 5, 59, 6, 'full'),
  ('2026-09-29', 6, 59, 7, 'full'),
  ('2026-09-29', 7, 59, 8, 'full'),
  ('2026-09-29', 10, 59, 8, 'full'),
  ('2026-09-29', 8, 59, 6, 'full'),
  ('2026-09-30', 1, 62, 6, 'full'),
  ('2026-09-30', 13, 62, 6, 'full'),
  ('2026-09-30', 2, 62, 7, 'full'),
  ('2026-09-30', 3, 62, 8, 'full'),
  ('2026-09-30', 11, 62, 7, 'full'),
  ('2026-09-30', 4, 62, 6, 'full'),
  ('2026-09-30', 5, 62, 7, 'full'),
  ('2026-09-30', 6, 62, 8, 'full'),
  ('2026-09-30', 7, 62, 6, 'full'),
  ('2026-09-30', 10, 62, 6, 'full'),
  ('2026-09-30', 8, 62, 7, 'full'),
  ('2026-09-30', 9, 62, 8, 'full'),
  ('2026-10-01', 1, 57, 5, 'full'),
  ('2026-10-01', 13, 57, 5, 'full'),
  ('2026-10-01', 2, 57, 6, 'full'),
  ('2026-10-01', 3, 57, 4, 'full'),
  ('2026-10-01', 11, 57, 6, 'full'),
  ('2026-10-01', 4, 57, 5, 'full'),
  ('2026-10-01', 5, 57, 6, 'full'),
  ('2026-10-01', 6, 57, 4, 'full'),
  ('2026-10-01', 7, 57, 5, 'full'),
  ('2026-10-01', 10, 57, 5, 'full'),
  ('2026-10-01', 8, 57, 6, 'full'),
  ('2026-10-05', 1, 52, 5, 'full'),
  ('2026-10-05', 13, 52, 5, 'full'),
  ('2026-10-05', 2, 52, 3, 'full'),
  ('2026-10-05', 3, 52, 4, 'full'),
  ('2026-10-05', 11, 52, 3, 'full'),
  ('2026-10-05', 4, 52, 5, 'full'),
  ('2026-10-05', 5, 52, 3, 'full'),
  ('2026-10-05', 6, 52, 4, 'full'),
  ('2026-10-05', 7, 52, 5, 'full'),
  ('2026-10-05', 10, 52, 5, 'full'),
  ('2026-10-05', 8, 52, 3, 'full'),
  ('2026-10-05', 9, 52, 4, 'full'),
  ('2026-10-06', 1, 79, 6, 'full'),
  ('2026-10-06', 13, 79, 6, 'full'),
  ('2026-10-06', 2, 59, 7, 'full'),
  ('2026-10-06', 3, 59, 8, 'full'),
  ('2026-10-06', 11, 59, 7, 'full'),
  ('2026-10-06', 4, 59, 6, 'full'),
  ('2026-10-06', 5, 59, 7, 'full'),
  ('2026-10-06', 6, 59, 8, 'full'),
  ('2026-10-06', 7, 59, 6, 'full'),
  ('2026-10-06', 10, 59, 6, 'full'),
  ('2026-10-06', 8, 59, 7, 'full'),
  ('2026-10-06', 9, 59, 8, 'full'),
  ('2026-10-07', 1, 62, 7, 'full'),
  ('2026-10-07', 13, 62, 7, 'full'),
  ('2026-10-07', 2, 62, 8, 'full'),
  ('2026-10-07', 3, 62, 6, 'full'),
  ('2026-10-07', 11, 62, 8, 'full'),
  ('2026-10-07', 4, 62, 7, 'full'),
  ('2026-10-07', 5, 62, 8, 'full'),
  ('2026-10-07', 6, 62, 6, 'full'),
  ('2026-10-07', 7, 62, 7, 'full'),
  ('2026-10-07', 10, 62, 7, 'full'),
  ('2026-10-07', 8, 62, 8, 'full'),
  ('2026-10-08', 1, 57, 6, 'full'),
  ('2026-10-08', 13, 57, 6, 'full'),
  ('2026-10-08', 2, 57, 4, 'full'),
  ('2026-10-08', 3, 57, 5, 'full'),
  ('2026-10-08', 11, 57, 4, 'full'),
  ('2026-10-08', 4, 57, 6, 'full'),
  ('2026-10-08', 5, 57, 4, 'full'),
  ('2026-10-08', 6, 57, 5, 'full'),
  ('2026-10-08', 7, 57, 6, 'full'),
  ('2026-10-08', 10, 57, 6, 'full'),
  ('2026-10-08', 8, 57, 4, 'full'),
  ('2026-10-08', 9, 57, 5, 'full'),
  ('2026-10-12', 1, 52, 3, 'full'),
  ('2026-10-12', 13, 52, 3, 'full'),
  ('2026-10-12', 2, 52, 4, 'full'),
  ('2026-10-12', 11, 52, 4, 'full'),
  ('2026-10-12', 4, 52, 3, 'full'),
  ('2026-10-12', 5, 52, 4, 'full'),
  ('2026-10-12', 6, 52, 5, 'full'),
  ('2026-10-12', 7, 52, 3, 'full'),
  ('2026-10-12', 10, 52, 3, 'full'),
  ('2026-10-12', 8, 52, 4, 'full'),
  ('2026-10-13', 1, 79, 7, 'full'),
  ('2026-10-13', 13, 79, 7, 'full'),
  ('2026-10-13', 2, 59, 8, 'full'),
  ('2026-10-13', 11, 59, 8, 'full'),
  ('2026-10-13', 4, 59, 7, 'full'),
  ('2026-10-13', 5, 59, 8, 'full'),
  ('2026-10-13', 6, 59, 6, 'full'),
  ('2026-10-13', 7, 59, 7, 'full'),
  ('2026-10-13', 10, 59, 7, 'full'),
  ('2026-10-13', 8, 59, 8, 'full'),
  ('2026-10-13', 9, 59, 6, 'full'),
  ('2026-10-14', 1, 62, 8, 'full'),
  ('2026-10-14', 13, 62, 8, 'full'),
  ('2026-10-14', 2, 62, 6, 'full'),
  ('2026-10-14', 11, 62, 6, 'full'),
  ('2026-10-14', 4, 62, 8, 'full'),
  ('2026-10-14', 5, 62, 6, 'full'),
  ('2026-10-14', 6, 62, 7, 'full'),
  ('2026-10-14', 7, 62, 8, 'full'),
  ('2026-10-14', 10, 62, 8, 'full'),
  ('2026-10-14', 8, 62, 6, 'full'),
  ('2026-10-14', 9, 62, 7, 'full'),
  ('2026-10-15', 1, 57, 4, 'full'),
  ('2026-10-15', 13, 57, 4, 'full'),
  ('2026-10-15', 2, 57, 5, 'full'),
  ('2026-10-15', 11, 57, 5, 'full'),
  ('2026-10-15', 4, 57, 4, 'full'),
  ('2026-10-15', 5, 57, 5, 'full'),
  ('2026-10-15', 6, 57, 6, 'full'),
  ('2026-10-15', 7, 57, 4, 'full'),
  ('2026-10-15', 10, 57, 4, 'full'),
  ('2026-10-15', 8, 57, 5, 'full'),
  ('2026-10-19', 1, 52, 4, 'full'),
  ('2026-10-19', 13, 52, 4, 'full'),
  ('2026-10-19', 2, 52, 5, 'full'),
  ('2026-10-19', 3, 30, 4, 'rehab'),
  ('2026-10-19', 11, 52, 5, 'full'),
  ('2026-10-19', 4, 52, 4, 'full'),
  ('2026-10-19', 5, 52, 5, 'full'),
  ('2026-10-19', 6, 52, 3, 'full'),
  ('2026-10-19', 7, 52, 4, 'full'),
  ('2026-10-19', 10, 52, 4, 'full'),
  ('2026-10-19', 8, 52, 5, 'full'),
  ('2026-10-19', 9, 52, 3, 'full'),
  ('2026-10-20', 1, 79, 8, 'full'),
  ('2026-10-20', 13, 79, 8, 'full'),
  ('2026-10-20', 2, 59, 6, 'full'),
  ('2026-10-20', 3, 30, 4, 'rehab'),
  ('2026-10-20', 11, 59, 6, 'full'),
  ('2026-10-20', 4, 59, 8, 'full'),
  ('2026-10-20', 5, 59, 6, 'full'),
  ('2026-10-20', 6, 59, 9, 'full'),
  ('2026-10-20', 7, 59, 8, 'full'),
  ('2026-10-20', 10, 59, 8, 'full'),
  ('2026-10-20', 8, 45, 4, 'partial'),
  ('2026-10-21', 1, 62, 6, 'full'),
  ('2026-10-21', 13, 62, 6, 'full'),
  ('2026-10-21', 2, 62, 7, 'full'),
  ('2026-10-21', 3, 30, 4, 'rehab'),
  ('2026-10-21', 11, 62, 7, 'full'),
  ('2026-10-21', 4, 62, 6, 'full'),
  ('2026-10-21', 5, 62, 7, 'full'),
  ('2026-10-21', 6, 62, 9, 'full'),
  ('2026-10-21', 7, 62, 6, 'full'),
  ('2026-10-21', 10, 62, 6, 'full'),
  ('2026-10-21', 8, 45, 4, 'partial'),
  ('2026-10-21', 9, 62, 8, 'full')
) AS v("day", "shirt", "minutes", "rpe", "participation")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
JOIN "team_players" tp ON tp."team_id" = t."id" AND tp."shirt_number" = v."shirt"
LEFT JOIN "users" u ON u."email" = 'preparador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id", "player_id") WHERE "event_id" IS NOT NULL DO NOTHING;

-- Carga extra: Álvaro Cid añade gimnasio esta semana (se dispara su carga aguda)
INSERT INTO "player_loads" ("organization_id", "player_id", "source", "on_date", "minutes", "rpe", "participation", "note", "recorded_by")
SELECT o."id", pl."id", 'extra', v."day"::date, 75, 9, 'full', 'Gimnasio por su cuenta', u."id"
FROM "organizations" o
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = 'Álvaro' AND pe."last_name" = 'Cid'
JOIN "players" pl ON pl."person_id" = pe."id"
CROSS JOIN (VALUES ('2026-10-19'), ('2026-10-20'), ('2026-10-21')) AS v("day")
LEFT JOIN "users" u ON u."email" = 'preparador@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "player_loads" x WHERE x."player_id" = pl."id" AND x."source" = 'extra' AND x."on_date" = v."day"::date);

-- Bienestar diario de octubre (cinco preguntas de 1 a 5; 5 es lo mejor)
INSERT INTO "wellness_entries" ("organization_id", "player_id", "on_date", "sleep", "fatigue", "soreness", "stress", "mood", "soreness_area")
SELECT o."id", tp."player_id", v."day"::date, v."sleep", v."fatigue", v."soreness", v."stress", v."mood", v."area"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('2026-10-01', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-01', 13, 4, 4, 4, 4, 4, NULL),
  ('2026-10-01', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-01', 3, 4, 3, 4, 4, 4, NULL),
  ('2026-10-01', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-01', 4, 4, 4, 4, 4, 4, NULL),
  ('2026-10-01', 5, 4, 4, 4, 3, 4, NULL),
  ('2026-10-01', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-01', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-01', 10, 4, 4, 4, 4, 4, NULL),
  ('2026-10-01', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-01', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-02', 1, 4, 4, 4, 4, 4, NULL),
  ('2026-10-02', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-02', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-02', 3, 4, 4, 4, 4, 5, NULL),
  ('2026-10-02', 11, 4, 4, 4, 4, 4, NULL),
  ('2026-10-02', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-02', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-02', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-02', 7, 4, 4, 4, 4, 4, NULL),
  ('2026-10-02', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-02', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-02', 9, 4, 4, 4, 4, 5, NULL),
  ('2026-10-03', 1, 4, 4, 4, 3, 4, NULL),
  ('2026-10-03', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-03', 2, 4, 4, 4, 4, 5, NULL),
  ('2026-10-03', 3, 4, 3, 4, 4, 4, NULL),
  ('2026-10-03', 11, 4, 4, 4, 3, 4, NULL),
  ('2026-10-03', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-03', 5, 4, 4, 4, 4, 5, NULL),
  ('2026-10-03', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-03', 7, 4, 4, 4, 3, 4, NULL),
  ('2026-10-03', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-03', 8, 4, 4, 4, 4, 5, NULL),
  ('2026-10-03', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 13, 4, 4, 4, 4, 5, NULL),
  ('2026-10-04', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 3, 4, 4, 4, 3, 4, NULL),
  ('2026-10-04', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 4, 4, 4, 4, 4, 5, NULL),
  ('2026-10-04', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 6, 4, 4, 4, 3, 4, NULL),
  ('2026-10-04', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 10, 4, 4, 4, 4, 5, NULL),
  ('2026-10-04', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-04', 9, 4, 4, 4, 3, 4, NULL),
  ('2026-10-05', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-05', 13, 4, 4, 4, 4, 4, NULL),
  ('2026-10-05', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-05', 3, 4, 3, 4, 4, 4, NULL),
  ('2026-10-05', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-05', 4, 4, 4, 4, 4, 4, NULL),
  ('2026-10-05', 5, 4, 4, 4, 3, 4, NULL),
  ('2026-10-05', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-05', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-05', 10, 4, 4, 4, 4, 4, NULL),
  ('2026-10-05', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-05', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-06', 1, 4, 4, 4, 4, 4, NULL),
  ('2026-10-06', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-06', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-06', 3, 4, 4, 4, 4, 5, NULL),
  ('2026-10-06', 11, 4, 4, 4, 4, 4, NULL),
  ('2026-10-06', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-06', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-06', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-06', 7, 4, 4, 4, 4, 4, NULL),
  ('2026-10-06', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-06', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-06', 9, 4, 4, 4, 4, 5, NULL),
  ('2026-10-07', 1, 4, 4, 4, 3, 4, NULL),
  ('2026-10-07', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-07', 2, 4, 4, 4, 4, 5, NULL),
  ('2026-10-07', 3, 4, 4, 4, 4, 4, NULL),
  ('2026-10-07', 11, 4, 4, 4, 3, 4, NULL),
  ('2026-10-07', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-07', 5, 4, 4, 4, 4, 5, NULL),
  ('2026-10-07', 6, 4, 4, 4, 4, 4, NULL),
  ('2026-10-07', 7, 4, 4, 4, 3, 4, NULL),
  ('2026-10-07', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-07', 8, 4, 4, 4, 4, 5, NULL),
  ('2026-10-07', 9, 4, 4, 4, 4, 4, NULL),
  ('2026-10-08', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-08', 13, 4, 4, 4, 4, 5, NULL),
  ('2026-10-08', 2, 4, 4, 4, 4, 4, NULL),
  ('2026-10-08', 3, 4, 4, 4, 3, 4, NULL),
  ('2026-10-08', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-08', 4, 4, 4, 4, 4, 5, NULL),
  ('2026-10-08', 5, 4, 4, 4, 4, 4, NULL),
  ('2026-10-08', 6, 4, 4, 4, 3, 4, NULL),
  ('2026-10-08', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-08', 10, 4, 4, 4, 4, 5, NULL),
  ('2026-10-08', 8, 4, 4, 4, 4, 4, NULL),
  ('2026-10-08', 9, 4, 4, 4, 3, 4, NULL),
  ('2026-10-09', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-09', 13, 4, 4, 4, 4, 4, NULL),
  ('2026-10-09', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-09', 3, 4, 3, 4, 4, 4, NULL),
  ('2026-10-09', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-09', 4, 4, 4, 4, 4, 4, NULL),
  ('2026-10-09', 5, 4, 4, 4, 3, 4, NULL),
  ('2026-10-09', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-09', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-09', 10, 4, 4, 4, 4, 4, NULL),
  ('2026-10-09', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-09', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-10', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 3, 4, 4, 2, 4, 5, 'Isquiotibial derecho'),
  ('2026-10-10', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-10', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-10', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-10', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-10', 9, 4, 4, 4, 4, 5, NULL),
  ('2026-10-11', 1, 4, 4, 4, 3, 4, NULL),
  ('2026-10-11', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-11', 2, 4, 4, 4, 4, 5, NULL),
  ('2026-10-11', 3, 4, 3, 2, 4, 4, 'Isquiotibial derecho'),
  ('2026-10-11', 11, 4, 4, 4, 3, 4, NULL),
  ('2026-10-11', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-11', 5, 4, 4, 4, 4, 5, NULL),
  ('2026-10-11', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-11', 7, 4, 4, 4, 3, 4, NULL),
  ('2026-10-11', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-11', 8, 4, 4, 4, 4, 5, NULL),
  ('2026-10-11', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-12', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-12', 13, 4, 4, 4, 4, 5, NULL),
  ('2026-10-12', 2, 4, 4, 4, 4, 4, NULL),
  ('2026-10-12', 3, 4, 4, 2, 3, 4, 'Isquiotibial derecho'),
  ('2026-10-12', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-12', 4, 4, 4, 4, 4, 5, NULL),
  ('2026-10-12', 5, 4, 4, 4, 4, 4, NULL),
  ('2026-10-12', 6, 4, 4, 4, 3, 4, NULL),
  ('2026-10-12', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-12', 10, 4, 4, 4, 4, 5, NULL),
  ('2026-10-12', 8, 4, 4, 4, 4, 4, NULL),
  ('2026-10-12', 9, 4, 4, 4, 3, 4, NULL),
  ('2026-10-13', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-13', 13, 4, 4, 4, 4, 4, NULL),
  ('2026-10-13', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-13', 3, 4, 3, 2, 4, 4, 'Isquiotibial derecho'),
  ('2026-10-13', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-13', 4, 4, 4, 4, 4, 4, NULL),
  ('2026-10-13', 5, 4, 4, 4, 3, 4, NULL),
  ('2026-10-13', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-13', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-13', 10, 4, 4, 4, 4, 4, NULL),
  ('2026-10-13', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-13', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-14', 1, 4, 4, 4, 4, 4, NULL),
  ('2026-10-14', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-14', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-14', 3, 4, 4, 2, 4, 5, 'Isquiotibial derecho'),
  ('2026-10-14', 11, 4, 4, 4, 4, 4, NULL),
  ('2026-10-14', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-14', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-14', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-14', 7, 4, 4, 4, 4, 4, NULL),
  ('2026-10-14', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-14', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-14', 9, 4, 4, 4, 4, 5, NULL),
  ('2026-10-15', 1, 4, 4, 4, 3, 4, NULL),
  ('2026-10-15', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-15', 2, 4, 4, 4, 4, 5, NULL),
  ('2026-10-15', 3, 4, 4, 2, 4, 4, 'Isquiotibial derecho'),
  ('2026-10-15', 11, 4, 4, 4, 3, 4, NULL),
  ('2026-10-15', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-15', 5, 4, 4, 4, 4, 5, NULL),
  ('2026-10-15', 6, 4, 4, 4, 4, 4, NULL),
  ('2026-10-15', 7, 4, 4, 4, 3, 4, NULL),
  ('2026-10-15', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-15', 8, 4, 4, 4, 4, 5, NULL),
  ('2026-10-15', 9, 4, 4, 4, 4, 4, NULL),
  ('2026-10-16', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-16', 13, 4, 4, 4, 4, 5, NULL),
  ('2026-10-16', 2, 4, 4, 4, 4, 4, NULL),
  ('2026-10-16', 3, 4, 4, 2, 3, 4, 'Isquiotibial derecho'),
  ('2026-10-16', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-16', 4, 4, 4, 4, 4, 5, NULL),
  ('2026-10-16', 5, 4, 4, 4, 4, 4, NULL),
  ('2026-10-16', 6, 4, 4, 4, 3, 4, NULL),
  ('2026-10-16', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-16', 10, 4, 4, 4, 4, 5, NULL),
  ('2026-10-16', 8, 4, 4, 4, 4, 4, NULL),
  ('2026-10-16', 9, 4, 4, 4, 3, 4, NULL),
  ('2026-10-17', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-17', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-17', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-17', 3, 4, 3, 2, 4, 4, 'Isquiotibial derecho'),
  ('2026-10-17', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-17', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-17', 5, 4, 4, 4, 3, 4, NULL),
  ('2026-10-17', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-17', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-17', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-17', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-17', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-18', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 3, 4, 4, 2, 4, 5, 'Isquiotibial derecho'),
  ('2026-10-18', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-18', 5, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-18', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-18', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-18', 9, 4, 4, 4, 4, 5, NULL),
  ('2026-10-19', 1, 4, 4, 4, 3, 4, NULL),
  ('2026-10-19', 13, 4, 3, 4, 4, 4, NULL),
  ('2026-10-19', 2, 4, 4, 4, 4, 5, NULL),
  ('2026-10-19', 3, 4, 4, 4, 4, 4, NULL),
  ('2026-10-19', 11, 4, 4, 4, 3, 4, NULL),
  ('2026-10-19', 4, 4, 3, 4, 4, 4, NULL),
  ('2026-10-19', 5, 4, 4, 4, 4, 5, NULL),
  ('2026-10-19', 6, 4, 4, 4, 4, 4, NULL),
  ('2026-10-19', 7, 4, 4, 4, 3, 4, NULL),
  ('2026-10-19', 10, 4, 3, 4, 4, 4, NULL),
  ('2026-10-19', 8, 4, 4, 4, 4, 5, NULL),
  ('2026-10-19', 9, 4, 4, 4, 4, 4, NULL),
  ('2026-10-20', 1, 4, 3, 4, 4, 4, NULL),
  ('2026-10-20', 13, 4, 4, 4, 4, 5, NULL),
  ('2026-10-20', 2, 4, 4, 4, 4, 4, NULL),
  ('2026-10-20', 3, 4, 4, 4, 3, 4, NULL),
  ('2026-10-20', 11, 4, 3, 4, 4, 4, NULL),
  ('2026-10-20', 4, 4, 4, 4, 4, 5, NULL),
  ('2026-10-20', 5, 4, 4, 4, 4, 4, NULL),
  ('2026-10-20', 6, 4, 4, 4, 3, 4, NULL),
  ('2026-10-20', 7, 4, 3, 4, 4, 4, NULL),
  ('2026-10-20', 10, 4, 4, 4, 4, 5, NULL),
  ('2026-10-20', 8, 4, 4, 4, 4, 4, NULL),
  ('2026-10-20', 9, 4, 4, 4, 3, 4, NULL),
  ('2026-10-21', 1, 4, 4, 4, 4, 5, NULL),
  ('2026-10-21', 13, 4, 4, 4, 4, 4, NULL),
  ('2026-10-21', 2, 4, 4, 4, 3, 4, NULL),
  ('2026-10-21', 3, 4, 3, 4, 4, 4, NULL),
  ('2026-10-21', 11, 4, 4, 4, 4, 5, NULL),
  ('2026-10-21', 4, 4, 4, 4, 4, 4, NULL),
  ('2026-10-21', 5, 4, 4, 3, 3, 4, NULL),
  ('2026-10-21', 6, 4, 3, 4, 4, 4, NULL),
  ('2026-10-21', 7, 4, 4, 4, 4, 5, NULL),
  ('2026-10-21', 10, 4, 4, 4, 4, 4, NULL),
  ('2026-10-21', 8, 4, 4, 4, 3, 4, NULL),
  ('2026-10-21', 9, 4, 3, 4, 4, 4, NULL),
  ('2026-10-22', 1, 4, 4, 4, 4, 4, NULL),
  ('2026-10-22', 13, 4, 4, 4, 3, 4, NULL),
  ('2026-10-22', 2, 4, 3, 4, 4, 4, NULL),
  ('2026-10-22', 3, 4, 4, 4, 4, 5, NULL),
  ('2026-10-22', 11, 4, 4, 4, 4, 4, NULL),
  ('2026-10-22', 4, 4, 4, 4, 3, 4, NULL),
  ('2026-10-22', 5, 4, 2, 2, 4, 4, 'Gemelo derecho'),
  ('2026-10-22', 6, 4, 4, 4, 4, 5, NULL),
  ('2026-10-22', 7, 4, 4, 4, 4, 4, NULL),
  ('2026-10-22', 10, 4, 4, 4, 3, 4, NULL),
  ('2026-10-22', 8, 4, 3, 4, 4, 4, NULL),
  ('2026-10-22', 9, 4, 4, 4, 4, 5, NULL)
) AS v("day", "shirt", "sleep", "fatigue", "soreness", "stress", "mood", "area")
JOIN "team_players" tp ON tp."team_id" = t."id" AND tp."shirt_number" = v."shirt"
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id", "on_date") DO NOTHING;

-- Consentimiento de salud de Toni Bermejo y Kike Ramos (dado por ellos mismos, adultos)
INSERT INTO "health_consents" ("organization_id", "player_id", "granted_by_name", "relationship", "granted_on", "text_version", "recorded_by")
SELECT o."id", pl."id", pe."first_name" || ' ' || pe."last_name", 'self', DATE '2026-09-15', '2026-10', u."id"
FROM "organizations" o
JOIN "people" pe ON pe."organization_id" = o."id" AND (pe."first_name", pe."last_name") IN (('Toni', 'Bermejo'), ('Kike', 'Ramos'))
JOIN "players" pl ON pl."person_id" = pe."id"
LEFT JOIN "users" u ON u."email" = 'fisio@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id") DO NOTHING;

-- Lesión de Toni Bermejo en el partido del día 10, con su readaptación por fases
INSERT INTO "injuries" ("organization_id", "player_id", "occurred_on", "context", "match_id", "body_area", "side", "kind", "mechanism", "recurrence", "diagnosis", "clinical_notes", "expected_return_on", "status", "created_by")
SELECT o."id", pl."id", DATE '2026-10-10', 'match', m."id", 'thigh_back', 'right', 'muscle', 'non_contact', false,
  'Rotura fibrilar de grado I del bíceps femoral derecho',
  'Ecografía del día 12: lesión de 1,5 cm sin afectación del tendón. Buena evolución con el trabajo excéntrico.',
  DATE '2026-10-29', 'rehab', u."id"
FROM "organizations" o
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = 'Toni' AND pe."last_name" = 'Bermejo'
JOIN "players" pl ON pl."person_id" = pe."id"
LEFT JOIN "matches" m ON m."organization_id" = o."id" AND m."opponent" = 'CN Terrassa' AND m."played_on" = DATE '2026-10-10'
LEFT JOIN "users" u ON u."email" = 'fisio@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "injuries" i WHERE i."player_id" = pl."id" AND i."occurred_on" = DATE '2026-10-10');

INSERT INTO "rehab_phases" ("organization_id", "injury_id", "sort_order", "name", "criteria", "started_on", "done_on")
SELECT o."id", i."id", v."sort", v."name", v."criteria", v."started"::date, v."done"::date
FROM "organizations" o
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = 'Toni' AND pe."last_name" = 'Bermejo'
JOIN "players" pl ON pl."person_id" = pe."id"
JOIN "injuries" i ON i."player_id" = pl."id" AND i."occurred_on" = DATE '2026-10-10'
CROSS JOIN (VALUES
  (10, 'Control del dolor y movilidad', 'Sin dolor al caminar y en estiramiento pasivo.', '2026-10-11', '2026-10-15'),
  (20, 'Fuerza excéntrica', 'Nórdico sin dolor y fuerza al 80 % de la otra pierna.', '2026-10-16', '2026-10-21'),
  (30, 'Carrera y cambios de ritmo', 'Sprints al 90 % y cambios de dirección sin molestias.', '2026-10-22', NULL),
  (40, 'Trabajo con balón y contacto', 'Entrenamiento completo con el grupo dos días seguidos.', NULL, NULL)
) AS v("sort", "name", "criteria", "started", "done")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "rehab_phases" r WHERE r."injury_id" = i."id");

-- Disponibilidad: Toni de baja del 10 al 18 y en readaptación desde entonces; Kike limitado desde el 20
INSERT INTO "player_availability" ("organization_id", "player_id", "status", "restrictions", "max_minutes", "from_on", "expected_return_on", "ended_on", "note", "injury_id", "set_by")
SELECT o."id", pl."id", v."status", v."restrictions"::jsonb, v."max", v."from"::date, v."expected"::date, v."ended"::date, v."note",
  (SELECT i."id" FROM "injuries" i WHERE i."player_id" = pl."id" ORDER BY i."occurred_on" DESC LIMIT 1), u."id"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Toni', 'Bermejo', 'out', '[]', NULL::int, '2026-10-10', '2026-10-18', '2026-10-18', 'Baja hasta nueva valoración.'),
  ('Toni', 'Bermejo', 'rehab', '[]', NULL::int, '2026-10-18', '2026-10-29', NULL, 'Trabajo aparte con la fisio. Sin contacto.'),
  ('Kike', 'Ramos', 'limited', '["contact", "jumps"]', 60, '2026-10-20', '2026-10-27', NULL, 'Sin contacto ni saltos hasta el martes.')
) AS v("first", "last", "status", "restrictions", "max", "from", "expected", "ended", "note")
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = v."first" AND pe."last_name" = v."last"
JOIN "players" pl ON pl."person_id" = pe."id"
LEFT JOIN "users" u ON u."email" = 'fisio@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "player_availability" a WHERE a."player_id" = pl."id" AND a."from_on" = v."from"::date AND a."status" = v."status");

UPDATE "player_availability" a
SET "injury_id" = NULL
FROM "players" pl, "people" pe, "organizations" o
WHERE a."player_id" = pl."id" AND pe."id" = pl."person_id" AND pe."first_name" = 'Kike' AND pe."last_name" = 'Ramos'
  AND o."id" = a."organization_id" AND o."slug" = 'demo';

-- Objetivos individuales y los contenidos que los trabajan
INSERT INTO "player_objectives" ("organization_id", "player_id", "title", "progress", "owner_user_id", "review_on")
SELECT o."id", pl."id", v."title", v."progress", u."id", v."review"::date
FROM "organizations" o
CROSS JOIN (VALUES
  ('Miguel', 'Lozano', 'Mejorar el golpeo con la pierna izquierda', 30, '2026-11-05'),
  ('Rubén', 'Marín', 'Juego de espaldas y 1x1 como pívot', 20, '2026-10-27')
) AS v("first", "last", "title", "progress", "review")
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = v."first" AND pe."last_name" = v."last"
JOIN "players" pl ON pl."person_id" = pe."id"
LEFT JOIN "users" u ON u."email" = 'senior@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id") DO NOTHING;

INSERT INTO "player_focus_contents" ("organization_id", "player_id", "content_id")
SELECT o."id", pl."id", c."id"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES ('Miguel', 'Lozano', 'finishing'), ('Rubén', 'Marín', 'one_v_one_attack')) AS v("first", "last", "code")
JOIN "people" pe ON pe."organization_id" = o."id" AND pe."first_name" = v."first" AND pe."last_name" = v."last"
JOIN "players" pl ON pl."person_id" = pe."id"
JOIN "training_contents" c ON c."section_id" = s."id" AND c."code" = v."code"
WHERE o."slug" = 'demo'
ON CONFLICT ("player_id", "content_id") DO NOTHING;

-- Tests físicos del club y dos mediciones del Sénior A (septiembre y octubre)
INSERT INTO "physical_tests" ("organization_id", "code", "name", "unit", "direction", "sort_order")
SELECT o."id", v."code", v."name", v."unit", v."direction", v."sort"
FROM "organizations" o
CROSS JOIN (VALUES
  ('cmj', 'Salto con contramovimiento (CMJ)', 'cm', 'higher_better', 10),
  ('sprint_10', 'Sprint 10 m', 's', 'lower_better', 20),
  ('sprint_20', 'Sprint 20 m', 's', 'lower_better', 30),
  ('ift_30_15', '30-15 IFT (velocidad final)', 'km_h', 'higher_better', 40),
  ('rsa_mean', 'Velocidad repetida (media 6 x 20 m)', 's', 'lower_better', 50)
) AS v("code", "name", "unit", "direction", "sort")
WHERE o."slug" = 'demo'
ON CONFLICT ("organization_id", "code") DO NOTHING;

INSERT INTO "physical_test_results" ("organization_id", "test_id", "player_id", "on_date", "value", "recorded_by")
SELECT o."id", pt."id", tp."player_id", v."day"::date, v."value", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Sénior A'
CROSS JOIN (VALUES
  ('cmj', '2026-09-08', 1, 36.0),
  ('cmj', '2026-10-13', 1, 37.2),
  ('sprint_10', '2026-09-08', 1, 1.82),
  ('sprint_10', '2026-10-13', 1, 1.78),
  ('cmj', '2026-09-08', 13, 37.6),
  ('cmj', '2026-10-13', 13, 38.8),
  ('sprint_10', '2026-09-08', 13, 1.79),
  ('sprint_10', '2026-10-13', 13, 1.75),
  ('cmj', '2026-09-08', 2, 39.2),
  ('cmj', '2026-10-13', 2, 40.4),
  ('sprint_10', '2026-09-08', 2, 1.76),
  ('sprint_10', '2026-10-13', 2, 1.72),
  ('cmj', '2026-09-08', 3, 40.8),
  ('cmj', '2026-10-13', 3, 38.3),
  ('sprint_10', '2026-09-08', 3, 1.73),
  ('sprint_10', '2026-10-13', 3, 1.78),
  ('cmj', '2026-09-08', 11, 42.4),
  ('cmj', '2026-10-13', 11, 43.6),
  ('sprint_10', '2026-09-08', 11, 1.82),
  ('sprint_10', '2026-10-13', 11, 1.78),
  ('cmj', '2026-09-08', 4, 36.0),
  ('cmj', '2026-10-13', 4, 37.2),
  ('sprint_10', '2026-09-08', 4, 1.79),
  ('sprint_10', '2026-10-13', 4, 1.75),
  ('cmj', '2026-09-08', 5, 37.6),
  ('cmj', '2026-10-13', 5, 38.8),
  ('sprint_10', '2026-09-08', 5, 1.76),
  ('sprint_10', '2026-10-13', 5, 1.72),
  ('cmj', '2026-09-08', 6, 39.2),
  ('cmj', '2026-10-13', 6, 40.4),
  ('sprint_10', '2026-09-08', 6, 1.73),
  ('sprint_10', '2026-10-13', 6, 1.69),
  ('cmj', '2026-09-08', 7, 40.8),
  ('cmj', '2026-10-13', 7, 42.0),
  ('sprint_10', '2026-09-08', 7, 1.82),
  ('sprint_10', '2026-10-13', 7, 1.78),
  ('cmj', '2026-09-08', 10, 42.4),
  ('cmj', '2026-10-13', 10, 43.6),
  ('sprint_10', '2026-09-08', 10, 1.79),
  ('sprint_10', '2026-10-13', 10, 1.75),
  ('cmj', '2026-09-08', 8, 36.0),
  ('cmj', '2026-10-13', 8, 37.2),
  ('sprint_10', '2026-09-08', 8, 1.76),
  ('sprint_10', '2026-10-13', 8, 1.72),
  ('cmj', '2026-09-08', 9, 37.6),
  ('cmj', '2026-10-13', 9, 38.8),
  ('sprint_10', '2026-09-08', 9, 1.73),
  ('sprint_10', '2026-10-13', 9, 1.69)
) AS v("code", "day", "shirt", "value")
JOIN "physical_tests" pt ON pt."organization_id" = o."id" AND pt."code" = v."code"
JOIN "team_players" tp ON tp."team_id" = t."id" AND tp."shirt_number" = v."shirt"
LEFT JOIN "users" u ON u."email" = 'preparador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("test_id", "player_id", "on_date") DO NOTHING;

-- Alevín A: la sesión del martes cerrada con RPE de grupo y la de hoy planificada
INSERT INTO "training_sessions" ("organization_id", "event_id", "team_id", "objective", "content_ids", "status", "target_rpe", "rating", "actual_minutes", "closed_at", "created_by")
SELECT o."id", e."id", t."id", v."objective", '[]'::jsonb, v."status", v."rpe", v."rating", v."minutes", CASE v."status" WHEN 'done' THEN e."ends_at" END, u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
CROSS JOIN (VALUES
  ('2026-10-20', 'Pase y finalización en espacio reducido', 5, 'done', 3, 60),
  ('2026-10-22', 'Rondos y finalización antes del partido', 4, 'planned', NULL::int, NULL::int)
) AS v("day", "objective", "rpe", "status", "rating", "minutes")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id") DO NOTHING;

INSERT INTO "training_session_items" ("organization_id", "session_id", "drill_id", "title", "block", "sort_order", "minutes", "target_rpe", "content_ids", "restriction_tags", "rating", "owner_user_id")
SELECT o."id", ss."id", d."id", d."name", v."block", v."sort", v."minutes", d."target_rpe",
  COALESCE((SELECT jsonb_agg(dc."content_id" ORDER BY dc."sort_order") FROM "drill_contents" dc WHERE dc."drill_id" = d."id"), '[]'::jsonb),
  d."restriction_tags", v."rating", u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
CROSS JOIN (VALUES
  ('2026-10-20', 'warmup', 10, 'seed_1', 10, 3),
  ('2026-10-20', 'main', 20, 'seed_2', 15, 3),
  ('2026-10-20', 'main', 30, 'seed_3', 15, 2),
  ('2026-10-20', 'main', 40, 'seed_4', 12, 3),
  ('2026-10-22', 'warmup', 10, 'seed_1', 10, NULL::int),
  ('2026-10-22', 'main', 20, 'seed_2', 15, NULL::int),
  ('2026-10-22', 'main', 30, 'seed_3', 15, NULL::int)
) AS v("day", "block", "sort", "seed", "minutes", "rating")
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = v."day"::date
JOIN "training_sessions" ss ON ss."event_id" = e."id"
JOIN "drills" d ON d."section_id" = t."section_id" AND d."seed_key" = v."seed"
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "training_session_items" x WHERE x."session_id" = ss."id" AND x."sort_order" = v."sort" AND x."block" = v."block");

INSERT INTO "attendance" ("organization_id", "event_id", "player_id", "status", "recorded_by")
SELECT o."id", e."id", tp."player_id", CASE WHEN tp."shirt_number" = 7 THEN 'absent' ELSE 'present' END, u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = DATE '2026-10-20'
JOIN "team_players" tp ON tp."team_id" = t."id"
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id", "player_id") DO NOTHING;

INSERT INTO "player_loads" ("organization_id", "player_id", "source", "event_id", "on_date", "minutes", "rpe", "participation", "recorded_by")
SELECT o."id", a."player_id", 'session', e."id", DATE '2026-10-20', 52, 5, 'full', u."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
JOIN "events" e ON e."team_id" = t."id" AND e."kind" = 'training' AND (e."starts_at" AT TIME ZONE o."timezone")::date = DATE '2026-10-20'
JOIN "attendance" a ON a."event_id" = e."id" AND a."status" = 'present'
LEFT JOIN "users" u ON u."email" = 'entrenador@demo.test'
WHERE o."slug" = 'demo'
ON CONFLICT ("event_id", "player_id") WHERE "event_id" IS NOT NULL DO NOTHING;
