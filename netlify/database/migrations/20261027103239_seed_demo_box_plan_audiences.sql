-- Planes para quien sea (ADR 0054) en el box demo. Sobre la planificación de la ADR 0053:
--   - Una tarifa "Programación personalizada" que incluye la programación propia, para saber quién
--     la paga: Carla, Pau y Marc al día; Gerard con el cargo del mes pendiente; Alba, vencido; y
--     Núria, en el grupo sin la tarifa.
--   - "Carla · Halterofilia": un plan solo para Carla Prieto, martes y jueves, en su semana 2 de 6.
--   - "Grupo competición": un plan para un grupo de cinco (Pau, Marc, Gerard, Alba y Núria), lunes,
--     miércoles, viernes y sábado, en su semana 3 de 10.
--   - Las sesiones propias de la semana en curso de los dos planes (publicadas hasta hoy y en
--     borrador las que vienen): quien está en un plan propio las ve en vez del WOD del box.
-- Así, al montar un plan para un nivel (casi todo el box sale RX) el asistente avisa de que esas
-- seis personas ya tienen plan propio. Fechas relativas al día en que se aplica. Idempotente.

-- 1. La tarifa de programación (complemento: no da clases por sí sola).
INSERT INTO "fee_plans" ("organization_id", "name", "amount_cents", "period", "description", "entitlement", "includes_programming")
SELECT o."id", 'Programación personalizada', 3500, 'monthly',
  'Tu plan propio (solo para ti o para tu grupo), con sus sesiones y el seguimiento del coach.',
  'none', true
FROM "organizations" o
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "fee_plans" f WHERE f."organization_id" = o."id" AND f."name" = 'Programación personalizada'
  );

-- 2. Quién la tiene.
INSERT INTO "subscriptions" ("organization_id", "player_id", "fee_plan_id", "starts_on", "status", "created_by")
SELECT o."id", pl."id", f."id", CURRENT_DATE - 40, 'active',
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "fee_plans" f ON f."organization_id" = o."id" AND f."name" = 'Programación personalizada'
JOIN "people" p ON p."organization_id" = o."id"
JOIN "players" pl ON pl."person_id" = p."id"
WHERE o."slug" = 'demo-box'
  AND (p."first_name", p."last_name") IN (
    ('Carla', 'Prieto'), ('Pau', 'Serra'), ('Marc', 'Vila'), ('Gerard', 'Puig'), ('Alba', 'Torres')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "subscriptions" s WHERE s."player_id" = pl."id" AND s."fee_plan_id" = f."id"
  );

-- 3. Sus cargos: el mes pasado, todos cobrados; este, Gerard pendiente y Alba vencida.
INSERT INTO "fee_charges" ("organization_id", "person_id", "fee_plan_id", "concept", "period_label", "amount_cents", "paid_cents", "due_on", "status")
SELECT o."id", p."id", f."id", f."name" || ' · ' || m."label", m."label", f."amount_cents",
  CASE WHEN m."k" = 0 AND p."first_name" IN ('Gerard', 'Alba') THEN 0 ELSE f."amount_cents" END,
  CASE
    WHEN m."k" = 0 AND p."first_name" = 'Gerard' THEN CURRENT_DATE + 3
    WHEN m."k" = 0 AND p."first_name" = 'Alba' THEN CURRENT_DATE - 10
    ELSE m."first" + 4
  END,
  CASE
    WHEN m."k" = 0 AND p."first_name" = 'Gerard' THEN 'pending'
    WHEN m."k" = 0 AND p."first_name" = 'Alba' THEN 'overdue'
    ELSE 'paid'
  END
FROM "organizations" o
JOIN "fee_plans" f ON f."organization_id" = o."id" AND f."name" = 'Programación personalizada'
JOIN "subscriptions" s ON s."fee_plan_id" = f."id"
JOIN "players" pl ON pl."id" = s."player_id"
JOIN "people" p ON p."id" = pl."person_id"
CROSS JOIN LATERAL (
  SELECT k AS "k",
    (date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::date AS "first",
    (ARRAY['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'])[EXTRACT(MONTH FROM date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::int]
      || ' ' || EXTRACT(YEAR FROM date_trunc('month', CURRENT_DATE) - (k * INTERVAL '1 month'))::int AS "label"
  FROM generate_series(0, 1) AS k
) m
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "fee_charges" c WHERE c."organization_id" = o."id" AND c."fee_plan_id" = f."id"
  );

INSERT INTO "payments" ("organization_id", "charge_id", "amount_cents", "method", "paid_on", "recorded_by")
SELECT c."organization_id", c."id", c."amount_cents", 'card', LEAST(c."due_on", CURRENT_DATE),
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "fee_charges" c
JOIN "organizations" o ON o."id" = c."organization_id" AND o."slug" = 'demo-box'
JOIN "fee_plans" f ON f."id" = c."fee_plan_id" AND f."name" = 'Programación personalizada'
WHERE c."status" = 'paid'
  AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."charge_id" = c."id");

-- 4. Los dos planes propios, con la estructura y la proyección que calcula el asistente.
INSERT INTO "box_plans" ("organization_id", "section_id", "name", "template_code", "goal", "starts_on", "weeks", "emphasis", "frequency", "tests", "closures", "structure", "projection", "status", "audience", "audience_level", "audience_name", "weekdays", "created_by")
SELECT o."id", s."id", v."name", v."template", v."goal",
  date_trunc('week', CURRENT_DATE)::date - v."ago", v."weeks", v."emphasis"::jsonb, v."frequency",
  v."tests"::jsonb, '[]'::jsonb, v."structure"::jsonb, v."projection"::jsonb, 'active',
  v."audience", NULL, v."audience_name", v."weekdays"::jsonb,
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'CrossFit'
CROSS JOIN (VALUES
  ('Carla · Halterofilia', 'weightlifting_technique',
    'Arrancada y dos tiempos más limpios y un 5 % más arriba antes de su primera competición.',
    7, 6, '{"strength":25,"weightlifting":50,"gymnastics":0,"engine":5,"intensity":5,"mobility":15}', 2,
    '["snatch","clean_and_jerk"]', '{"discipline":"weightlifting","blocks":[{"kind":"test","startWeek":1,"weeks":1,"emphasis":{"strength":25,"weightlifting":50,"gymnastics":0,"engine":5,"intensity":5,"mobility":15},"focus":null},{"kind":"base","startWeek":2,"weeks":2,"emphasis":{"strength":30,"weightlifting":45,"gymnastics":0,"engine":5,"intensity":5,"mobility":15},"focus":null},{"kind":"build","startWeek":4,"weeks":2,"emphasis":{"strength":20,"weightlifting":55,"gymnastics":0,"engine":5,"intensity":5,"mobility":15},"focus":null},{"kind":"test","startWeek":6,"weeks":1,"emphasis":{"strength":25,"weightlifting":50,"gymnastics":0,"engine":5,"intensity":5,"mobility":15},"focus":null}],"weeks":[{"n":1,"block":0,"kind":"test","volume":40,"intensity":80,"roles":[null,"test",null,"oly_technique",null,null,null],"closed":[],"tags":["test"]},{"n":2,"block":1,"kind":"base","volume":70,"intensity":60,"roles":[null,"oly_strength",null,"heavy_lower",null,null,null],"closed":[],"tags":[]},{"n":3,"block":1,"kind":"base","volume":75,"intensity":65,"roles":[null,"oly_strength",null,"heavy_lower",null,null,null],"closed":[],"tags":[]},{"n":4,"block":2,"kind":"build","volume":75,"intensity":70,"roles":[null,"oly_strength",null,"heavy_lower",null,null,null],"closed":[],"tags":[]},{"n":5,"block":2,"kind":"build","volume":80,"intensity":75,"roles":[null,"oly_strength",null,"heavy_lower",null,null,null],"closed":[],"tags":[]},{"n":6,"block":3,"kind":"test","volume":40,"intensity":80,"roles":[null,"test",null,"oly_technique",null,null,null],"closed":[],"tags":["retest"]}]}', '{"frequencyFactor":0.6,"capacities":[{"capacity":"strength","points":25,"band":"maintain","gain":8.25},{"capacity":"weightlifting","points":50,"band":"up_little","gain":16.5},{"capacity":"gymnastics","points":0,"band":"down","gain":-6},{"capacity":"engine","points":5,"band":"maintain","gain":-3},{"capacity":"intensity","points":5,"band":"maintain","gain":-3},{"capacity":"mobility","points":15,"band":"maintain","gain":4.95}],"tests":[{"code":"snatch","unit":"percent","low":1.2487499999999998,"high":2.4974999999999996},{"code":"clean_and_jerk","unit":"percent","low":1.2149999999999999,"high":2.4299999999999997}]}', 'athlete', NULL, '[2,4]'),
  ('Grupo competición', 'open',
    'Preparar el Open con más volumen que la clase: cuatro días y gimnásticos bajo fatiga.',
    14, 10, '{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":15,"mobility":5}', 4,
    '["back_squat","fran","row_2k","max_pullups"]', '{"discipline":"crossfit","blocks":[{"kind":"test","startWeek":1,"weeks":1,"emphasis":{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":15,"mobility":5},"focus":null},{"kind":"base","startWeek":2,"weeks":3,"emphasis":{"strength":30,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":10,"mobility":5},"focus":null},{"kind":"build","startWeek":5,"weeks":3,"emphasis":{"strength":20,"weightlifting":15,"gymnastics":30,"engine":15,"intensity":15,"mobility":5},"focus":null},{"kind":"peak","startWeek":8,"weeks":2,"emphasis":{"strength":15,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":25,"mobility":5},"focus":null},{"kind":"test","startWeek":10,"weeks":1,"emphasis":{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":15,"mobility":5},"focus":null}],"weeks":[{"n":1,"block":0,"kind":"test","volume":40,"intensity":80,"roles":["test",null,"gymnastics_engine",null,"long_engine","team",null],"closed":[],"tags":["test"]},{"n":2,"block":1,"kind":"base","volume":70,"intensity":60,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":3,"block":1,"kind":"base","volume":75,"intensity":65,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":4,"block":1,"kind":"base","volume":80,"intensity":70,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":5,"block":2,"kind":"build","volume":75,"intensity":70,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":6,"block":2,"kind":"build","volume":80,"intensity":75,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":7,"block":2,"kind":"build","volume":85,"intensity":80,"roles":["heavy_lower",null,"gymnastics_engine",null,"olympic_metcon","long_engine",null],"closed":[],"tags":[]},{"n":8,"block":3,"kind":"peak","volume":70,"intensity":85,"roles":["heavy_lower",null,"open_sim",null,"long_engine","gymnastics_engine",null],"closed":[],"tags":[]},{"n":9,"block":3,"kind":"peak","volume":65,"intensity":88,"roles":["heavy_lower",null,"open_sim",null,"long_engine","gymnastics_engine",null],"closed":[],"tags":[]},{"n":10,"block":4,"kind":"test","volume":40,"intensity":80,"roles":["test",null,"gymnastics_engine",null,"long_engine","team",null],"closed":[],"tags":["retest"]}]}', '{"frequencyFactor":1.25,"capacities":[{"capacity":"strength","points":25,"band":"up","gain":17.187500000000004},{"capacity":"weightlifting","points":15,"band":"up_little","gain":10.3125},{"capacity":"gymnastics","points":25,"band":"up","gain":17.187500000000004},{"capacity":"engine","points":15,"band":"up_little","gain":10.3125},{"capacity":"intensity","points":15,"band":"up_little","gain":10.3125},{"capacity":"mobility","points":5,"band":"maintain","gain":-3}],"tests":[{"code":"back_squat","unit":"percent","low":2.203125,"high":4.40625},{"code":"fran","unit":"percent","low":5.2875000000000005,"high":10.575000000000001},{"code":"row_2k","unit":"percent","low":1.321875,"high":2.64375},{"code":"max_pullups","unit":"reps","low":1.1015625,"high":2.203125}]}', 'group', 'Competición', '[1,3,5,6]')
) AS v("name", "template", "goal", "ago", "weeks", "emphasis", "frequency", "tests", "structure", "projection", "audience", "audience_name", "weekdays")
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "box_plans" p WHERE p."organization_id" = o."id" AND p."name" = v."name"
  );

-- 5. Su gente.
INSERT INTO "box_plan_members" ("organization_id", "plan_id", "player_id", "added_by")
SELECT o."id", bp."id", pl."id", (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "box_plans" bp ON bp."organization_id" = o."id"
JOIN (VALUES
  ('Carla · Halterofilia', 'Carla', 'Prieto'),
  ('Grupo competición', 'Pau', 'Serra'),
  ('Grupo competición', 'Marc', 'Vila'),
  ('Grupo competición', 'Gerard', 'Puig'),
  ('Grupo competición', 'Alba', 'Torres'),
  ('Grupo competición', 'Núria', 'Casals')
) AS v("plan", "first", "last") ON v."plan" = bp."name"
JOIN "people" p ON p."organization_id" = o."id" AND p."first_name" = v."first" AND p."last_name" = v."last"
JOIN "players" pl ON pl."person_id" = p."id"
WHERE o."slug" = 'demo-box'
ON CONFLICT DO NOTHING;

-- 6. Las sesiones propias de la semana en curso: su papel, su intención y su porqué.
INSERT INTO "workouts" ("organization_id", "section_id", "on_date", "title", "status", "created_by", "plan_id", "plan_week", "day_role", "intent_domain", "intent_effort", "intent_feel", "why", "specific")
SELECT bp."organization_id", bp."section_id", d."day", r."title",
  CASE WHEN d."day" <= CURRENT_DATE THEN 'published' ELSE 'draft' END,
  (SELECT u."id" FROM "users" u WHERE u."email" = 'coach@demo.test'),
  bp."id", ((d."day" - bp."starts_on") / 7) + 1, r."role", r."domain", r."effort", r."feel",
  'Semana ' || (((d."day" - bp."starts_on") / 7) + 1) || ' de ' || bp."weeks" || E'.\n' || r."why",
  true
FROM "box_plans" bp
JOIN "organizations" o ON o."id" = bp."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN LATERAL (
  SELECT date_trunc('week', CURRENT_DATE)::date + (w."x"::int - 1) AS "day"
  FROM jsonb_array_elements_text(bp."weekdays") AS w("x")
) d
JOIN (VALUES
  ('Carla · Halterofilia', 2, 'oly_strength', 'Arrancada pesada', NULL, 4, 'Cada repetición, la misma: si la barra se va hacia delante, baja el peso.', 'Fuerza de halterofilia el martes, con 48 h hasta la sentadilla del jueves.'),
  ('Carla · Halterofilia', 4, 'heavy_lower', 'Dos tiempos y sentadilla', 'short', 4, 'Pies rápidos en el jerk; la sentadilla, limpia y sin prisa.', 'El jueves, la pierna: la base de la arrancada del martes que viene.'),
  ('Grupo competición', 1, 'heavy_lower', 'Sentadilla y Fran', 'short', 4, 'Fran sin romper los thrusters más de una vez.', 'El lunes pesado: el grupo llega descansado del fin de semana.'),
  ('Grupo competición', 3, 'gymnastics_engine', 'Muscle-ups y motor', 'medium', 3, 'Series cortas de muscle-ups antes de llegar al fallo.', 'Gimnásticos bajo fatiga: lo que más pesa en el Open.'),
  ('Grupo competición', 5, 'olympic_metcon', 'Dos tiempos y Grace', 'medium', 4, 'Grace a toques rápidos: ni un rebote en el pecho.', 'Halterofilia el viernes, lejos de la sentadilla del lunes.'),
  ('Grupo competición', 6, 'long_engine', 'Motor largo', 'very_long', 2, 'A ritmo de poder hablar los 40 minutos.', 'El sábado, volumen aeróbico: la base de todo lo demás.')
) AS r("plan", "dow", "role", "title", "domain", "effort", "feel", "why")
  ON r."plan" = bp."name" AND r."dow" = EXTRACT(ISODOW FROM d."day")::int
WHERE bp."status" = 'active' AND bp."audience" <> 'section'
  AND NOT EXISTS (SELECT 1 FROM "workouts" x WHERE x."plan_id" = bp."id" AND x."specific");

INSERT INTO "workout_blocks" ("organization_id", "workout_id", "sort_order", "kind", "title", "description", "score_type", "time_cap_seconds", "movement_code", "percent", "foundations", "scaled", "rx", "rx_plus", "capacity", "planned_minutes", "exercise_ids", "track")
SELECT w."organization_id", w."id", b."sort", b."kind", b."title", b."description", b."score", b."cap",
  b."movement", b."pct", NULL, NULL, b."rx", b."rx_plus", b."capacity", b."minutes",
  COALESCE((
    SELECT jsonb_agg(e."id"::text ORDER BY array_position(b."exercises", e."name"))
    FROM "exercises" e
    WHERE e."organization_id" = w."organization_id" AND e."name" = ANY (b."exercises")
  ), '[]'::jsonb),
  'class'
FROM "workouts" w
JOIN "box_plans" bp ON bp."id" = w."plan_id" AND bp."audience" <> 'section'
JOIN (VALUES
  ('Carla · Halterofilia', 'oly_strength', 0, 'warmup', 'Calentamiento con barra técnica', E'2 rondas:\n5 snatch balance\n5 overhead squats\n10 PVC pass-through', 'none', NULL::int, NULL, NULL::int, NULL, NULL, 'mobility', 12, ARRAY['Snatch balance', 'Overhead squat', 'Movilidad de hombro con PVC']),
  ('Carla · Halterofilia', 'oly_strength', 1, 'strength', 'Arrancada 6×2', E'6 series de 2 al 72 %.\nDescanso 2 min.', 'load', NULL, 'snatch', 72, 'Al 72 %.', 'Al 72 % y una serie al 78 % si la última va limpia.', 'weightlifting', 25, ARRAY['Arrancada']),
  ('Carla · Halterofilia', 'oly_strength', 2, 'accessory', 'Tirón de arrancada', E'4 × 3 al 90 % de su arrancada.', 'none', NULL, NULL, NULL, '4 × 3', '4 × 3 con pausa en la rodilla', 'strength', 10, ARRAY['Arrancada']),
  ('Carla · Halterofilia', 'heavy_lower', 0, 'warmup', 'Calentamiento', E'2 rondas:\n250 m remo\n10 goblet squats\n5 front squats con barra vacía', 'none', NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Remo', 'Front squat']),
  ('Carla · Halterofilia', 'heavy_lower', 1, 'strength', 'Clean and jerk 5×1', E'5 singles al 75 %.\nUn minuto y medio entre intentos.', 'load', NULL, 'clean_and_jerk', 75, 'Al 75 %.', 'Al 75 % y dos singles al 80 %.', 'weightlifting', 18, ARRAY['Clean and jerk']),
  ('Carla · Halterofilia', 'heavy_lower', 2, 'strength', 'Back squat 5×3', E'5 series de 3 al 78 %.', 'load', NULL, 'back_squat', 78, 'Al 78 %.', 'Al 78 %.', 'strength', 18, ARRAY['Back squat']),
  ('Grupo competición', 'heavy_lower', 0, 'warmup', 'Calentamiento', E'2 rondas:\n300 m remo\n10 goblet squats\n10 scap pull-ups', 'none', NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Remo']),
  ('Grupo competición', 'heavy_lower', 1, 'strength', 'Back squat 5×3', E'5 series de 3 al 80 %.\nDescanso 2:30.', 'load', NULL, 'back_squat', 80, 'Al 80 %.', 'Al 80 % y una serie al 85 %.', 'strength', 20, ARRAY['Back squat']),
  ('Grupo competición', 'heavy_lower', 2, 'wod', 'Fran', E'21-15-9\nthrusters\ndominadas', 'time', 600, NULL, NULL, 'Thruster 43/30 kg · dominadas', 'Thruster 43/30 kg · chest to bar', 'intensity', 8, ARRAY['Thruster', 'Dominada']),
  ('Grupo competición', 'gymnastics_engine', 0, 'warmup', 'Calentamiento', E'2 rondas:\n200 m carrera\n10 kip swings\n5 transiciones en anillas bajas', 'none', NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Carrera']),
  ('Grupo competición', 'gymnastics_engine', 1, 'skill', 'Muscle-up: series cortas', E'EMOM 10: 2-3 muscle-ups.', 'none', NULL, NULL, NULL, 'Ring muscle-ups', 'Bar y ring muscle-ups alternos', 'gymnastics', 10, ARRAY['Muscle-up']),
  ('Grupo competición', 'gymnastics_engine', 2, 'wod', 'EMOM 16', E'EMOM 16:\n1: 15 cal remo\n2: 12 toes to bar\n3: 10 burpees\n4: descanso', 'reps', NULL, NULL, NULL, '15 cal · 12 T2B · 10 burpees', '18 cal · 15 T2B · 12 burpees', 'gymnastics', 16, ARRAY['Remo', 'Toes to bar', 'Burpee']),
  ('Grupo competición', 'olympic_metcon', 0, 'warmup', 'Calentamiento con barra', E'2 rondas:\n5 hang power cleans\n5 push jerks\n5 front squats', 'none', NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Hang power clean', 'Front squat']),
  ('Grupo competición', 'olympic_metcon', 1, 'strength', 'Clean and jerk 6×2', E'6 series de 2 al 75 %.', 'load', NULL, 'clean_and_jerk', 75, 'Al 75 %.', 'Al 75 % y dos singles al 82 %.', 'weightlifting', 18, ARRAY['Clean and jerk']),
  ('Grupo competición', 'olympic_metcon', 2, 'wod', 'Grace', E'30 clean and jerks por tiempo.', 'time', 480, NULL, NULL, '61/43 kg', '70/48 kg', 'intensity', 6, ARRAY['Clean and jerk']),
  ('Grupo competición', 'long_engine', 0, 'warmup', 'Calentamiento', E'5 min de máquina muy suave y movilidad de cadera.', 'none', NULL, NULL, NULL, NULL, NULL, 'mobility', 8, ARRAY['Remo', 'Movilidad de cadera 90/90']),
  ('Grupo competición', 'long_engine', 1, 'wod', 'Motor largo', E'40 min alternando:\n10 min remo\n10 min bike\n10 min carrera\n10 min SkiErg', 'calories', NULL, NULL, NULL, 'Ritmo de poder hablar', 'Los últimos 10 min, a umbral', 'engine', 40, ARRAY['Remo', 'Bike', 'Carrera', 'SkiErg'])
) AS b("plan", "role", "sort", "kind", "title", "description", "score", "cap", "movement", "pct", "rx", "rx_plus", "capacity", "minutes", "exercises")
  ON b."plan" = bp."name" AND b."role" = w."day_role"
WHERE w."specific"
  AND NOT EXISTS (SELECT 1 FROM "workout_blocks" x WHERE x."workout_id" = w."id");
