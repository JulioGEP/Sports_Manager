-- Planificación del box demo (ADR 0053). Sobre el box de la ADR 0049:
--   - Material de la sala con cantidades, pesos y un remo en reparación hasta dentro de tres días.
--   - "Ilimitada" incluye Clase+ y una tarifa nueva, "Clase+", para venderla como complemento.
--   - Un plan terminado, "Base de fuerza · primavera", con marcas de antes y de después para que
--     el siguiente plan se calibre con lo que pasó de verdad.
--   - El plan activo de CrossFit, "Camino al Open": empezó el lunes de hace cuatro semanas (hoy es la
--     semana 5, la última de carga de la base). La programación de CrossFit de esas semanas se
--     rehace siguiendo el plan (papel de cada día, intención, porqué, progresión de fuerza, cuatro
--     niveles, Clase+ y ejercicios enlazados) con sus resultados: el martes sale más largo de lo
--     previsto y el jueves más intenso, que es lo que encuentra la revisión del domingo.
-- Las fechas van relativas al día en que se aplica. Idempotente: cada bloque salta si ya existe.

-- 1. Material.
INSERT INTO "box_equipment" ("organization_id", "facility_id", "kind", "name", "quantity", "out_of_service", "repair_until", "min_kg", "max_kg", "notes", "sort_order")
SELECT o."id", f."id", v."kind", v."name", v."qty", v."out",
  CASE WHEN v."out" > 0 THEN CURRENT_DATE + 3 END, v."min", v."max", v."notes", v."sort"
FROM "organizations" o
CROSS JOIN (VALUES
  ('barbell', 'Barra olímpica 20/15 kg', 14, 0, NULL::numeric, NULL::numeric, '8 de 20 kg y 6 de 15 kg', 'Sala principal', 10),
  ('barbell', 'Barra técnica', 4, 0, 5, 10, NULL, 'Zona de halterofilia', 20),
  ('other', 'Discos bumper (pares)', 40, 0, 5, 25, 'De 5 a 25 kg', 'Sala principal', 30),
  ('rower', 'Remo', 6, 1, NULL, NULL, 'Uno con la cadena rota', 'Sala principal', 40),
  ('bike', 'Assault bike', 4, 0, NULL, NULL, NULL, 'Sala principal', 50),
  ('ski', 'SkiErg', 3, 0, NULL, NULL, NULL, 'Sala principal', 60),
  ('pullup_bar', 'Rig: barras de dominadas', 12, 0, NULL, NULL, 'Puestos a la vez', 'Sala principal', 70),
  ('rings', 'Anillas (pares)', 8, 0, NULL, NULL, 'En el rig', 'Sala principal', 80),
  ('rope', 'Cuerda de trepa', 2, 0, NULL, NULL, '4,5 m', 'Sala principal', 90),
  ('kettlebell', 'Kettlebells', 20, 0, 8, 32, 'De 24 kg, 4; de 16 kg, 6', 'Sala principal', 100),
  ('dumbbell', 'Mancuernas (pares)', 12, 0, 5, 30, NULL, 'Sala principal', 110),
  ('wall_ball', 'Wall balls', 12, 0, 4, 9, 'De 4, 6 y 9 kg', 'Sala principal', 120),
  ('box', 'Cajones', 14, 0, NULL, NULL, '50 y 60 cm', 'Sala principal', 130),
  ('jump_rope', 'Combas', 20, 0, NULL, NULL, 'Speed y PVC', 'Sala principal', 140),
  ('sled', 'Trineo', 2, 0, NULL, NULL, 'Empuje y arrastre', 'Zona de halterofilia', 150),
  ('sandbag', 'Sandbags', 6, 0, 20, 70, NULL, 'Zona de halterofilia', 160),
  ('med_ball', 'Balones medicinales', 6, 0, 3, 9, NULL, 'Sala principal', 170)
) AS v("kind", "name", "qty", "out", "min", "max", "notes", "facility", "sort")
LEFT JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = v."facility"
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "box_equipment" e WHERE e."organization_id" = o."id");

-- 2. Clase+: la ilimitada la incluye y se vende también como complemento.
UPDATE "fee_plans" f SET "includes_plus" = true
FROM "organizations" o
WHERE f."organization_id" = o."id" AND o."slug" = 'demo-box' AND f."name" = 'Ilimitada';

INSERT INTO "fee_plans" ("organization_id", "name", "amount_cents", "period", "description", "entitlement", "includes_plus")
SELECT o."id", 'Clase+', 1500, 'monthly',
  'Complemento de tu tarifa: el trabajo extra del plan para el Open Box (gimnásticos, halterofilia y debilidades).',
  'none', true
FROM "organizations" o
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "fee_plans" f WHERE f."organization_id" = o."id" AND f."name" = 'Clase+');

-- 3. El plan terminado de primavera y sus marcas de antes y de después (todos menos Laia).
INSERT INTO "box_plans" ("organization_id", "section_id", "name", "template_code", "goal", "starts_on", "weeks", "emphasis", "frequency", "tests", "closures", "structure", "projection", "status", "created_by")
SELECT o."id", s."id", 'Base de fuerza · primavera', 'strength_base',
  'Subir los básicos antes del verano.',
  date_trunc('week', CURRENT_DATE)::date - 210, 8,
  '{"strength":45,"weightlifting":15,"gymnastics":15,"engine":15,"intensity":5,"mobility":5}'::jsonb,
  3, '["back_squat","deadlift","strict_press"]'::jsonb, '[]'::jsonb,
  '{"discipline":"crossfit","blocks":[{"kind":"test","startWeek":1,"weeks":1,"emphasis":{"strength":45,"weightlifting":15,"gymnastics":15,"engine":15,"intensity":5,"mobility":5},"focus":null},{"kind":"base","startWeek":2,"weeks":3,"emphasis":{"strength":50,"weightlifting":15,"gymnastics":15,"engine":15,"intensity":0,"mobility":5},"focus":null},{"kind":"deload","startWeek":5,"weeks":1,"emphasis":{"strength":45,"weightlifting":15,"gymnastics":15,"engine":15,"intensity":0,"mobility":10},"focus":null},{"kind":"build","startWeek":6,"weeks":2,"emphasis":{"strength":35,"weightlifting":20,"gymnastics":20,"engine":15,"intensity":5,"mobility":5},"focus":null},{"kind":"test","startWeek":8,"weeks":1,"emphasis":{"strength":45,"weightlifting":15,"gymnastics":15,"engine":15,"intensity":5,"mobility":5},"focus":null}],"weeks":[{"n":1,"block":0,"kind":"test","volume":40,"intensity":80,"roles":["test","gymnastics_engine","test","long_engine","test","team",null],"closed":[],"tags":["test"]},{"n":2,"block":1,"kind":"base","volume":70,"intensity":60,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":3,"block":1,"kind":"base","volume":75,"intensity":65,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":4,"block":1,"kind":"base","volume":80,"intensity":70,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":5,"block":2,"kind":"deload","volume":50,"intensity":50,"roles":["skill_mobility","gymnastics_engine","olympic_metcon","long_engine","skill_mobility","team",null],"closed":[],"tags":[]},{"n":6,"block":3,"kind":"build","volume":75,"intensity":70,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":7,"block":3,"kind":"build","volume":80,"intensity":75,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":8,"block":4,"kind":"test","volume":40,"intensity":80,"roles":["test","gymnastics_engine","test","long_engine","test","team",null],"closed":[],"tags":["retest"]}]}'::jsonb,
  '{"frequencyFactor":1,"capacities":[{"capacity":"strength","points":45,"band":"up","gain":24.750000000000004},{"capacity":"weightlifting","points":15,"band":"maintain","gain":8.25},{"capacity":"gymnastics","points":15,"band":"maintain","gain":8.25},{"capacity":"engine","points":15,"band":"maintain","gain":8.25},{"capacity":"intensity","points":5,"band":"maintain","gain":-3},{"capacity":"mobility","points":5,"band":"maintain","gain":-3}],"tests":[{"code":"back_squat","unit":"percent","low":2.939625,"high":5.87925},{"code":"deadlift","unit":"percent","low":2.939625,"high":5.87925},{"code":"strict_press","unit":"percent","low":2.939625,"high":5.87925}]}'::jsonb,
  'finished',
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'CrossFit'
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (SELECT 1 FROM "box_plans" p WHERE p."organization_id" = o."id");

INSERT INTO "personal_records" ("organization_id", "player_id", "movement_code", "reps", "load_kg", "on_date", "note", "source")
SELECT r."organization_id", r."player_id", 'back_squat', 1, v."kg", v."on", v."note", 'manual'
FROM (
  SELECT DISTINCT ON (pr."player_id") pr."organization_id", pr."player_id", pr."load_kg",
    abs(hashtext(pr."player_id"::text || 'primavera')::bigint) AS "h"
  FROM "personal_records" pr
  JOIN "organizations" o ON o."id" = pr."organization_id" AND o."slug" = 'demo-box'
  JOIN "players" pl ON pl."id" = pr."player_id"
  JOIN "people" p ON p."id" = pl."person_id" AND p."email" IS DISTINCT FROM 'atleta@demo.test'
  WHERE pr."movement_code" = 'back_squat' AND pr."reps" = 1
  ORDER BY pr."player_id", pr."load_kg" DESC
) r
CROSS JOIN LATERAL (VALUES
  (round(r."load_kg" / (1.03 + (r."h" % 5) / 100.0) / 2.5) * 2.5, date_trunc('week', CURRENT_DATE)::date - 214, 'Test de partida de la base de fuerza'),
  (r."load_kg", date_trunc('week', CURRENT_DATE)::date - 157, 'Retest de la base de fuerza')
) AS v("kg", "on", "note")
WHERE NOT EXISTS (
  SELECT 1 FROM "personal_records" x
  WHERE x."organization_id" = r."organization_id" AND x."note" = 'Retest de la base de fuerza'
);

-- 4. El plan activo: Camino al Open, desde el lunes de hace cuatro semanas.
INSERT INTO "box_plans" ("organization_id", "section_id", "name", "template_code", "goal", "event_name", "starts_on", "weeks", "emphasis", "frequency", "tests", "closures", "structure", "projection", "status", "created_by")
SELECT o."id", s."id", 'Camino al Open', 'open',
  'Llegar al Open con más gimnásticos bajo fatiga y los básicos de fuerza un 5 % más arriba.',
  'CrossFit Open',
  date_trunc('week', CURRENT_DATE)::date - 28, 15,
  '{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":15,"mobility":5}'::jsonb,
  3, '["back_squat","fran","row_2k","max_pullups"]'::jsonb, '[]'::jsonb,
  '{"discipline":"crossfit","blocks":[{"kind":"base","startWeek":1,"weeks":5,"emphasis":{"strength":30,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":10,"mobility":5},"focus":null},{"kind":"deload","startWeek":6,"weeks":1,"emphasis":{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":10,"mobility":10},"focus":null},{"kind":"build","startWeek":7,"weeks":4,"emphasis":{"strength":20,"weightlifting":15,"gymnastics":30,"engine":15,"intensity":15,"mobility":5},"focus":null},{"kind":"deload","startWeek":11,"weeks":1,"emphasis":{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":10,"mobility":10},"focus":null},{"kind":"peak","startWeek":12,"weeks":3,"emphasis":{"strength":15,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":25,"mobility":5},"focus":null},{"kind":"test","startWeek":15,"weeks":1,"emphasis":{"strength":25,"weightlifting":15,"gymnastics":25,"engine":15,"intensity":15,"mobility":5},"focus":null}],"weeks":[{"n":1,"block":0,"kind":"base","volume":70,"intensity":60,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":2,"block":0,"kind":"base","volume":75,"intensity":65,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":3,"block":0,"kind":"base","volume":80,"intensity":70,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":4,"block":0,"kind":"base","volume":85,"intensity":75,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":5,"block":0,"kind":"base","volume":85,"intensity":75,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","team",null],"closed":[],"tags":[]},{"n":6,"block":1,"kind":"deload","volume":50,"intensity":50,"roles":["skill_mobility","gymnastics_engine","olympic_metcon","long_engine","skill_mobility","team",null],"closed":[],"tags":[]},{"n":7,"block":2,"kind":"build","volume":75,"intensity":70,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":8,"block":2,"kind":"build","volume":80,"intensity":75,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":9,"block":2,"kind":"build","volume":85,"intensity":80,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":10,"block":2,"kind":"build","volume":85,"intensity":85,"roles":["heavy_lower","gymnastics_engine","olympic_metcon","long_engine","upper_intervals","benchmark",null],"closed":[],"tags":[]},{"n":11,"block":3,"kind":"deload","volume":50,"intensity":50,"roles":["skill_mobility","gymnastics_engine","olympic_metcon","long_engine","skill_mobility","team",null],"closed":[],"tags":[]},{"n":12,"block":4,"kind":"peak","volume":70,"intensity":85,"roles":["heavy_lower","open_sim","olympic_metcon","long_engine","gymnastics_engine","open_sim",null],"closed":[],"tags":[]},{"n":13,"block":4,"kind":"peak","volume":65,"intensity":88,"roles":["heavy_lower","open_sim","olympic_metcon","long_engine","gymnastics_engine","open_sim",null],"closed":[],"tags":[]},{"n":14,"block":4,"kind":"peak","volume":60,"intensity":91,"roles":["heavy_lower","open_sim","olympic_metcon","long_engine","gymnastics_engine","open_sim",null],"closed":[],"tags":[]},{"n":15,"block":5,"kind":"test","volume":40,"intensity":80,"roles":["test","gymnastics_engine","test","long_engine","test","team",null],"closed":[],"tags":["retest"]}]}'::jsonb,
  '{"frequencyFactor":1,"capacities":[{"capacity":"strength","points":25,"band":"up","gain":13.750000000000002},{"capacity":"weightlifting","points":15,"band":"up_little","gain":8.25},{"capacity":"gymnastics","points":25,"band":"up","gain":13.750000000000002},{"capacity":"engine","points":15,"band":"up_little","gain":8.25},{"capacity":"intensity","points":15,"band":"up_little","gain":8.25},{"capacity":"mobility","points":5,"band":"maintain","gain":-3}],"tests":[{"code":"back_squat","unit":"percent","low":3.0621093750000004,"high":6.124218750000001},{"code":"fran","unit":"percent","low":7.3490625000000005,"high":14.698125000000001},{"code":"row_2k","unit":"percent","low":1.837265625,"high":3.67453125},{"code":"max_pullups","unit":"reps","low":1.5310546875000002,"high":3.0621093750000004}]}'::jsonb,
  'active',
  (SELECT u."id" FROM "users" u WHERE u."email" = 'box@demo.test')
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'CrossFit'
WHERE o."slug" = 'demo-box'
  AND NOT EXISTS (
    SELECT 1 FROM "box_plans" p WHERE p."organization_id" = o."id" AND p."status" = 'active'
  );

-- 5. La programación de CrossFit de esas semanas se rehace siguiendo el plan.
DELETE FROM "workouts" w
USING "box_plans" p, "organizations" o
WHERE p."organization_id" = o."id" AND o."slug" = 'demo-box' AND p."status" = 'active'
  AND w."organization_id" = o."id" AND w."section_id" = p."section_id" AND w."plan_id" IS NULL
  AND w."on_date" BETWEEN p."starts_on" AND CURRENT_DATE + 3
  AND NOT EXISTS (SELECT 1 FROM "workouts" x WHERE x."plan_id" = p."id");

-- La progresión del bloque base (y la descarga de la semana 6) es la que calcula el plan. Los
-- papeles de la semana 6 son los de una descarga: técnica y movilidad el lunes y el viernes.
INSERT INTO "workouts" ("organization_id", "section_id", "on_date", "title", "status", "publish_at", "created_by", "plan_id", "plan_week", "day_role", "intent_domain", "intent_effort", "intent_feel", "why")
SELECT p."organization_id", p."section_id", d."day"::date, r."title",
  CASE WHEN d."day"::date <= CURRENT_DATE + 1 THEN 'published' ELSE 'draft' END,
  CASE WHEN d."day"::date = CURRENT_DATE + 1 THEN (CURRENT_DATE + TIME '20:00') AT TIME ZONE o."timezone" END,
  (SELECT u."id" FROM "users" u WHERE u."email" = 'coach@demo.test'),
  p."id", w."n", r."role", r."domain",
  CASE WHEN w."n" = 6 THEN least(r."effort", 3) ELSE r."effort" END,
  r."feel",
  'Semana ' || w."n" || ' de 15: bloque ' || CASE WHEN w."n" = 6 THEN 'Descarga' ELSE 'Base' END || '.' ||
  CASE r."role"
    WHEN 'heavy_lower' THEN CASE WHEN w."n" > 1 THEN E'\nBack squat: la semana pasada ' || prev."sq" || ' · ' || prev."sq_pct" || ' %, esta ' || g."sq" || ' · ' || g."sq_pct" || ' %.' ELSE '' END
      || E'\nCorto porque el jueves es el día de motor largo.\nDominadas en el calentamiento: quien viene lunes y jueves no toca gimnásticos otro día.'
    WHEN 'gymnastics_engine' THEN E'\nGimnásticos y motor el martes: lejos del press del viernes.'
    WHEN 'olympic_metcon' THEN E'\nPower clean después del lunes pesado: piernas recuperadas en 48 h.'
    WHEN 'long_engine' THEN E'\n' || g."engine" || E' minutos de motor: la progresión del bloque.\nGoblet squat en el calentamiento: quien viene martes y jueves no toca la barra pesada.'
    WHEN 'upper_intervals' THEN CASE WHEN w."n" > 1 THEN E'\nStrict press: la semana pasada ' || prev."pr" || ' · ' || prev."pr_pct" || ' %, esta ' || g."pr" || ' · ' || g."pr_pct" || ' %.' ELSE '' END
    WHEN 'skill_mobility' THEN E'\nDescarga: técnica y rangos para llegar fresco al bloque de desarrollo.'
    ELSE E'\nCierra la semana con volumen y sin barra pesada.'
  END
FROM "box_plans" p
JOIN "organizations" o ON o."id" = p."organization_id" AND o."slug" = 'demo-box'
CROSS JOIN generate_series(p."starts_on", CURRENT_DATE + 3, INTERVAL '1 day') AS d("day")
CROSS JOIN LATERAL (SELECT ((d."day"::date - p."starts_on") / 7) + 1 AS "n") w
JOIN (VALUES
    (1, '5×5', 70, '5×3', 65, '5×5', 70, 25, 4, 5),
    (2, '5×4', 75, '5×3', 70, '5×4', 75, 28, 5, 5),
    (3, '4×4', 78, '4×2', 75, '4×4', 78, 32, 5, 5),
    (4, '4×3', 82, '4×2', 78, '4×3', 82, 35, 6, 5),
    (5, '4×3', 84, '5×2', 78, '4×3', 84, 35, 6, 5),
    (6, '3×5', 60, '3×2', 60, '3×5', 60, 20, 3, 6)
  ) AS g("week", "sq", "sq_pct", "cl", "cl_pct", "pr", "pr_pct", "engine", "rounds", "each") ON g."week" = w."n"
LEFT JOIN (VALUES
    (1, '5×5', 70, '5×3', 65, '5×5', 70, 25, 4, 5),
    (2, '5×4', 75, '5×3', 70, '5×4', 75, 28, 5, 5),
    (3, '4×4', 78, '4×2', 75, '4×4', 78, 32, 5, 5),
    (4, '4×3', 82, '4×2', 78, '4×3', 82, 35, 6, 5),
    (5, '4×3', 84, '5×2', 78, '4×3', 84, 35, 6, 5),
    (6, '3×5', 60, '3×2', 60, '3×5', 60, 20, 3, 6)
  ) AS prev("week", "sq", "sq_pct", "cl", "cl_pct", "pr", "pr_pct", "engine", "rounds", "each") ON prev."week" = w."n" - 1
JOIN (VALUES
  (1, false, 'heavy_lower', 'Sentadilla pesada y sprint', 'short', 4, 'Sin parar más de 5 segundos en el WOD.'),
  (2, false, 'gymnastics_engine', 'Gimnásticos y carrera', 'medium', 3, 'Un ritmo que puedas mantener: no bajes de la barra más de dos veces por ronda.'),
  (3, false, 'olympic_metcon', 'Power clean y swings', 'medium', 3, 'Técnica limpia antes que kilos.'),
  (4, false, 'long_engine', 'Cinco de cinco', 'very_long', 2, 'A ritmo de poder hablar.'),
  (5, false, 'upper_intervals', 'Press e intervalos', 'medium', 4, 'Intervalos duros con descanso completo.'),
  (6, false, 'team', 'Chipper por parejas', 'long', 3, 'Divertido y largo: repartid como queráis.'),
  (1, true, 'skill_mobility', 'Técnica y movilidad', NULL, 2, 'Suave: técnica y rangos.'),
  (2, true, 'gymnastics_engine', 'Gimnásticos y carrera', 'medium', 3, 'Un ritmo que puedas mantener.'),
  (3, true, 'olympic_metcon', 'Power clean y swings', 'medium', 3, 'Técnica limpia, cargas ligeras.'),
  (4, true, 'long_engine', 'Cinco de cinco', 'very_long', 2, 'A ritmo de poder hablar.'),
  (5, true, 'skill_mobility', 'Técnica y movilidad', NULL, 2, 'Suave: técnica y rangos.'),
  (6, true, 'team', 'Chipper por parejas', 'long', 3, 'Divertido y largo: repartid como queráis.')
) AS r("dow", "deload", "role", "title", "domain", "effort", "feel")
  ON r."dow" = EXTRACT(ISODOW FROM d."day")::int AND r."deload" = (w."n" = 6)
WHERE p."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "workouts" x WHERE x."plan_id" = p."id");

-- Los bloques de cada día, con la progresión de su semana y los ejercicios de la biblioteca.
INSERT INTO "workout_blocks" ("organization_id", "workout_id", "sort_order", "kind", "title", "description", "score_type", "time_cap_seconds", "movement_code", "percent", "foundations", "scaled", "rx", "rx_plus", "capacity", "planned_minutes", "exercise_ids", "track")
SELECT w."organization_id", w."id", b."sort", b."kind",
  replace(b."title", '{scheme}', m."scheme"),
  replace(replace(replace(replace(replace(b."description",
    '{sets}', split_part(m."scheme", '×', 1)), '{reps}', split_part(m."scheme", '×', 2)),
    '{pct}', m."pct"::text), '{rounds}', g."rounds"::text), '{each}', g."each"::text),
  b."score", b."cap", b."movement", m."pct_or_null",
  replace(replace(replace(b."foundations", '{pct}', m."pct"::text), '{pct_s}', (m."pct" - 7)::text), '{pct_p}', least(100, m."pct" + 5)::text),
  replace(replace(replace(b."scaled", '{pct}', m."pct"::text), '{pct_s}', (m."pct" - 7)::text), '{pct_p}', least(100, m."pct" + 5)::text),
  replace(replace(replace(b."rx", '{pct}', m."pct"::text), '{pct_s}', (m."pct" - 7)::text), '{pct_p}', least(100, m."pct" + 5)::text),
  replace(replace(replace(b."rx_plus", '{pct}', m."pct"::text), '{pct_s}', (m."pct" - 7)::text), '{pct_p}', least(100, m."pct" + 5)::text),
  b."capacity",
  CASE WHEN b."kind" = 'wod' AND w."day_role" = 'long_engine' THEN g."engine" ELSE b."minutes" END,
  COALESCE((
    SELECT jsonb_agg(e."id"::text ORDER BY array_position(b."exercises", e."name"))
    FROM "exercises" e
    WHERE e."organization_id" = w."organization_id" AND e."name" = ANY (b."exercises")
  ), '[]'::jsonb),
  b."track"
FROM "workouts" w
JOIN "box_plans" p ON p."id" = w."plan_id" AND p."status" = 'active'
JOIN (VALUES
    (1, '5×5', 70, '5×3', 65, '5×5', 70, 25, 4, 5),
    (2, '5×4', 75, '5×3', 70, '5×4', 75, 28, 5, 5),
    (3, '4×4', 78, '4×2', 75, '4×4', 78, 32, 5, 5),
    (4, '4×3', 82, '4×2', 78, '4×3', 82, 35, 6, 5),
    (5, '4×3', 84, '5×2', 78, '4×3', 84, 35, 6, 5),
    (6, '3×5', 60, '3×2', 60, '3×5', 60, 20, 3, 6)
  ) AS g("week", "sq", "sq_pct", "cl", "cl_pct", "pr", "pr_pct", "engine", "rounds", "each") ON g."week" = w."plan_week"
JOIN (VALUES
  ('heavy_lower', 0, 'warmup', 'Calentamiento', E'2 rondas:\n250 m remo\n10 goblet squats\n10 band pull-aparts\n5 inchworms', 'none', NULL::int, NULL, NULL, NULL, NULL, NULL, 'mobility', 12, ARRAY['Remo'], 'class'),
  ('heavy_lower', 1, 'skill', 'Complemento: EMOM 4 de dominadas estrictas', E'EMOM 4: dominadas estrictas.', 'none', NULL, NULL, 'Ring rows', 'Con goma', '3 estrictas', '5 estrictas', 'gymnastics', 4, ARRAY['Dominada'], 'class'),
  ('heavy_lower', 2, 'strength', 'Back squat {scheme}', E'{sets} series de {reps} al {pct} %.\nDescanso 2:30 entre series.', 'load', NULL, 'back_squat', 'Goblet squat con tempo: técnica antes que kilos.', 'Al {pct_s} %.', 'Al {pct} %.', 'Al {pct} % y una serie más al {pct_p} % si la última va limpia.', 'strength', 20, ARRAY['Back squat'], 'class'),
  ('heavy_lower', 3, 'wod', '21-15-9', E'21-15-9\ncal en máquina\nhand-release push-ups', 'time', 420, NULL, '15-12-9 · flexiones a cajón', '21-15-9 · flexiones (rodillas si hace falta)', '21-15-9 · hand-release push-ups', '21-15-9 · ring dips', 'intensity', 9, ARRAY['Remo', 'Bike', 'SkiErg', 'Flexión'], 'class'),
  ('heavy_lower', 4, 'accessory', 'RDL y hollow', E'3 rondas:\n10 RDL con mancuernas\n30 s hollow hold', 'none', NULL, NULL, 'KB 12-16 kg · 20 s', '2 × 12,5 kg · 30 s', '2 × 17,5 kg · 30 s', '2 × 22,5 kg · 45 s', 'strength', 8, ARRAY['Peso muerto', 'Hollow hold'], 'class'),
  ('heavy_lower', 5, 'skill', 'HSPU estrictos', E'5 series de 3 HSPU estrictos.\nDescanso 2 min.', 'none', NULL, NULL, 'Pike push-ups', 'Con abmat', '3 estrictos', '3 con déficit de 5 cm', 'gymnastics', 20, ARRAY['Handstand push-up'], 'plus'),
  ('gymnastics_engine', 0, 'warmup', 'Calentamiento', E'2 rondas:\n200 m carrera suave\n10 PVC pass-through\n10 scap pull-ups\n20 s hollow', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 12, ARRAY['Carrera', 'Movilidad de hombro con PVC'], 'class'),
  ('gymnastics_engine', 1, 'skill', 'Kipping: swing y transición', E'10 min por niveles:\nswing en barra, kip swings y toes to bar.', 'none', NULL, NULL, 'Swing en barra', 'Kip swings', 'Toes to bar en series de 5', 'Toes to bar en series de 10', 'gymnastics', 10, ARRAY['Toes to bar'], 'class'),
  ('gymnastics_engine', 2, 'wod', '3 rondas', E'Por tiempo, cap 20:\n3 rondas\n400 m carrera\n15 toes to bar\n12 burpees', 'time', 1200, NULL, '2 rondas · 200 m · knee raises · burpees sin salto', '3 rondas · 400 m · hanging knee raises · burpees', '3 rondas · 400 m · toes to bar · burpees', '3 rondas · 400 m · toes to bar · bar-facing burpees', 'gymnastics', 16, ARRAY['Carrera', 'Toes to bar', 'Burpee'], 'class'),
  ('olympic_metcon', 0, 'warmup', 'Calentamiento con barra técnica', E'2 rondas:\n250 m remo\n5 hang power cleans con barra técnica\n5 front squats\n5 strict press', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Remo'], 'class'),
  ('olympic_metcon', 1, 'strength', 'Power clean {scheme}', E'{sets} series de {reps} al {pct} %.\nTécnica antes que kilos.', 'load', NULL, 'power_clean', 'Hang power clean con barra técnica.', 'Al {pct_s} %.', 'Al {pct} %.', 'Al {pct} %, desde el suelo.', 'weightlifting', 18, ARRAY['Power clean'], 'class'),
  ('olympic_metcon', 2, 'wod', '5 rondas', E'Por tiempo, cap 12:\n5 rondas\n10 kettlebell swings\n10 box jumps\n200 m carrera', 'time', 720, NULL, '3 rondas · KB 12/8 kg · step-ups', 'KB 16/12 kg · 50 cm', 'KB 24/16 kg · 60/50 cm', 'KB 32/24 kg · 75/60 cm', 'intensity', 12, ARRAY['Kettlebell swing', 'Box jump', 'Carrera'], 'class'),
  ('olympic_metcon', 3, 'skill', 'Arrancada técnica', E'EMOM 10:\n2 power snatch + 1 overhead squat al 60 %.', 'none', NULL, NULL, 'Con PVC', 'Barra técnica', 'Al 60 %', 'Al 70 %', 'weightlifting', 15, ARRAY['Power snatch', 'Overhead squat'], 'plus'),
  ('long_engine', 0, 'warmup', 'Calentamiento', E'5 min en la máquina que toque a ritmo muy suave.\nMovilidad de tobillo y cadera.', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 8, ARRAY['Remo', 'Bike', 'SkiErg'], 'class'),
  ('long_engine', 1, 'skill', 'Complemento: 3×6 goblet squat con tempo', E'3 series de 6 goblet squats con 3 segundos de bajada.', 'none', NULL, NULL, 'KB 8-12 kg', 'KB 16 kg', 'KB 24 kg', 'KB 32 kg', 'strength', 6, ARRAY['Back squat'], 'class'),
  ('long_engine', 2, 'wod', 'Cinco de cinco', E'{rounds} × {each} min a ritmo de poder hablar.\nLa máquina que toque y 1 min para cambiar.', 'calories', NULL, NULL, 'Un minuto menos por ronda.', 'Ritmo cómodo.', 'Ritmo de poder hablar.', 'La última ronda, a ritmo de umbral.', 'engine', 35, ARRAY['Remo', 'Bike', 'SkiErg'], 'class'),
  ('long_engine', 3, 'cooldown', 'Movilidad de cadera 90/90', E'6 min de movilidad de cadera 90/90.', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 6, ARRAY['Movilidad de cadera 90/90'], 'class'),
  ('upper_intervals', 0, 'warmup', 'Calentamiento', E'2 rondas:\n200 m bike\n10 PVC pass-through\n10 push-ups\n5 strict press con barra vacía', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Bike', 'Movilidad de hombro con PVC'], 'class'),
  ('upper_intervals', 1, 'strength', 'Strict press {scheme}', E'{sets} series de {reps} al {pct} %.\nGlúteos y abdomen apretados.', 'load', NULL, 'strict_press', 'Press con mancuernas.', 'Al {pct_s} %.', 'Al {pct} %.', 'Al {pct} % y una serie más al {pct_p} %.', 'strength', 18, ARRAY['Strict press'], 'class'),
  ('upper_intervals', 2, 'wod', '4 × 3 min', E'4 × 3 min, 1 min de descanso:\n12 cal bike\nmáximo de wall balls', 'reps', NULL, NULL, '8 cal · wall ball de 4 kg a 2,7 m', '10 cal · wall ball 6/4 kg', '12 cal · wall ball 9/6 kg', '15 cal · wall ball 9/6 kg a 3 m', 'intensity', 16, ARRAY['Bike', 'Wall ball'], 'class'),
  ('upper_intervals', 3, 'accessory', 'Toes to bar', E'EMOM 8: 6 toes to bar sin bajar de la barra.', 'none', NULL, NULL, 'Knee raises', '6 hanging knee raises', '6 toes to bar', '10 toes to bar', 'gymnastics', 10, ARRAY['Toes to bar'], 'plus'),
  ('team', 0, 'warmup', 'Calentamiento por parejas', E'Por parejas, 10 min:\n200 m de relevos\n10 air squats\n10 push-ups', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Carrera', 'Air squat', 'Flexión'], 'class'),
  ('team', 1, 'wod', 'Chipper por parejas', E'Por tiempo, por parejas, cap 30:\n100 wall balls\n80 cal\n60 kettlebell swings\n40 burpees\n20 sandbag lunges', 'time', 1800, NULL, 'Mitad de reps · wall ball de 4 kg', 'Wall ball 6/4 kg · KB 16/12 kg', 'Wall ball 9/6 kg · KB 24/16 kg', 'Wall ball 9/6 kg · KB 32/24 kg · sandbag 30/20 kg', 'intensity', 30, ARRAY['Wall ball', 'Remo', 'Kettlebell swing', 'Burpee', 'Sandbag lunges'], 'class'),
  ('skill_mobility', 0, 'warmup', 'Calentamiento', E'8 min en la máquina que toque, muy suave.', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 8, ARRAY['Remo', 'Bike'], 'class'),
  ('skill_mobility', 1, 'strength', 'Back squat {scheme}', E'{sets} series de {reps} al {pct} %: técnica y velocidad.', 'none', NULL, 'back_squat', 'Goblet squat.', 'Al {pct_s} %.', 'Al {pct} %.', 'Al {pct} %.', 'strength', 15, ARRAY['Back squat'], 'class'),
  ('skill_mobility', 2, 'skill', 'Pino y hollow', E'15 min por niveles:\nkick-ups a pared, aguantes de 20-30 s y hollow.', 'none', NULL, NULL, 'Aguante con pies en cajón', 'Kick-ups', 'Aguantes de 30 s', 'Paseo en pino', 'gymnastics', 15, ARRAY['Handstand push-up', 'Hollow hold'], 'class'),
  ('skill_mobility', 3, 'cooldown', 'Movilidad', E'Cadera 90/90 y hombro con PVC.', 'none', NULL, NULL, NULL, NULL, NULL, NULL, 'mobility', 10, ARRAY['Movilidad de cadera 90/90', 'Movilidad de hombro con PVC'], 'class')
) AS b("role", "sort", "kind", "title", "description", "score", "cap", "movement", "foundations", "scaled", "rx", "rx_plus", "capacity", "minutes", "exercises", "track")
  ON b."role" = w."day_role"
CROSS JOIN LATERAL (
  SELECT
    CASE b."movement" WHEN 'power_clean' THEN g."cl" WHEN 'strict_press' THEN g."pr" ELSE g."sq" END AS "scheme",
    CASE b."movement" WHEN 'power_clean' THEN g."cl_pct" WHEN 'strict_press' THEN g."pr_pct" ELSE g."sq_pct" END AS "pct",
    CASE WHEN b."movement" IS NULL THEN NULL
      WHEN b."movement" = 'power_clean' THEN g."cl_pct" WHEN b."movement" = 'strict_press' THEN g."pr_pct" ELSE g."sq_pct" END AS "pct_or_null"
) m
WHERE NOT EXISTS (SELECT 1 FROM "workout_blocks" x WHERE x."workout_id" = w."id");

-- 6. Resultados de los WOD pasados del plan: el martes sale más largo de lo previsto y el jueves,
-- más intenso; la sentadilla la completa casi todo el mundo.
INSERT INTO "workout_results" ("organization_id", "block_id", "player_id", "level", "time_seconds", "rounds", "reps", "load_kg", "calories", "completed", "effort", "created_at", "updated_at")
SELECT DISTINCT ON (wb."id", b."player_id")
  b."organization_id", wb."id", b."player_id",
  CASE WHEN h."h" % 20 < 2 THEN 'foundations' WHEN h."h" % 20 < 8 THEN 'scaled' WHEN h."h" % 20 < 18 THEN 'rx' ELSE 'rx_plus' END,
  CASE WHEN wb."score_type" = 'time' THEN (wb."time_cap_seconds" * CASE EXTRACT(ISODOW FROM w."on_date")::int
      WHEN 1 THEN 0.62 + (h."h" % 30) / 100.0
      WHEN 2 THEN 0.86 + (h."h" % 14) / 100.0
      WHEN 3 THEN 0.70 + (h."h" % 25) / 100.0
      ELSE 0.78 + (h."h" % 20) / 100.0 END)::int END,
  NULL,
  CASE WHEN wb."score_type" = 'reps' THEN 60 + (h."h" % 40)::int END,
  CASE WHEN wb."score_type" = 'load' THEN
    round(COALESCE(
      (SELECT max(r."load_kg") FROM "personal_records" r WHERE r."player_id" = b."player_id" AND r."movement_code" = wb."movement_code" AND r."reps" = 1),
      60) * COALESCE(wb."percent", 80) / 100.0 / 2.5) * 2.5
  END,
  CASE WHEN wb."score_type" = 'calories' THEN 250 + (h."h" % 120)::int END,
  CASE WHEN wb."score_type" = 'load' THEN h."h" % 100 < 85 ELSE true END,
  CASE EXTRACT(ISODOW FROM w."on_date")::int
    WHEN 4 THEN 3 + (h."h" % 2)::int
    ELSE greatest(1, least(5, w."intent_effort" + (h."h" % 3)::int - 1))
  END,
  e."ends_at" + INTERVAL '20 minutes',
  e."ends_at" + INTERVAL '20 minutes'
FROM "bookings" b
JOIN "organizations" o ON o."id" = b."organization_id" AND o."slug" = 'demo-box'
JOIN "events" e ON e."id" = b."event_id" AND e."ends_at" < now()
JOIN "teams" t ON t."id" = e."team_id" AND t."name" IN ('WOD', 'Open Box')
JOIN "workouts" w ON w."organization_id" = o."id" AND w."section_id" = e."section_id"
  AND w."on_date" = (e."starts_at" AT TIME ZONE o."timezone")::date AND w."status" = 'published'
  AND w."plan_id" IS NOT NULL
JOIN "workout_blocks" wb ON wb."workout_id" = w."id" AND wb."score_type" <> 'none' AND wb."track" = 'class'
CROSS JOIN LATERAL (SELECT abs(hashtext(b."player_id"::text || wb."id"::text)::bigint) AS "h") h
WHERE b."status" = 'attended'
ORDER BY wb."id", b."player_id"
ON CONFLICT ("block_id", "player_id") DO NOTHING;
