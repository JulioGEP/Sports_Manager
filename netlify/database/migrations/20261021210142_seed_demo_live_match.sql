-- Partido en directo (Bloque 20, ADR 0034): el club demo llega con el catálogo de acciones de
-- fútbol sala (el mismo que propone el deporte en castellano) y dos partidos jugados del Alevín A
-- con su convocatoria y todos sus eventos, para que las estadísticas y el histórico tengan datos.
-- Idempotente: cada inserción salta si ya existe.

-- Catálogo de acciones de la sección de fútbol sala
INSERT INTO "match_action_types" ("organization_id", "section_id", "code", "name", "category", "scope", "own_score", "opponent_score", "counts_foul", "card", "requires_zone", "keeper_only", "weight", "quick", "mirror_of", "sort_order")
SELECT o."id", s."id", v."code", v."name", v."category", v."scope", v."own_score", v."opponent_score", v."counts_foul", v."card", v."requires_zone", v."keeper_only", v."weight", v."quick", v."mirror_of", v."sort_order"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES
  ('goal', 'Gol', 'positive', 'player', 1, 0, false, NULL, true, false, 5, true, NULL, 10),
  ('assist', 'Asistencia', 'positive', 'player', 0, 0, false, NULL, false, false, 3, true, NULL, 20),
  ('shot_on_target', 'Tiro a puerta', 'positive', 'player', 0, 0, false, NULL, true, false, 1, true, NULL, 30),
  ('shot_off_target', 'Tiro fuera', 'positive', 'player', 0, 0, false, NULL, true, false, 0.5, true, NULL, 40),
  ('steal', 'Balón robado', 'positive', 'player', 0, 0, false, NULL, false, false, 1.5, true, NULL, 50),
  ('foul_received', 'Falta recibida', 'positive', 'player', 0, 0, false, NULL, false, false, 1, true, NULL, 60),
  ('save', 'Parada', 'positive', 'player', 0, 0, false, NULL, false, true, 2, true, NULL, 70),
  ('key_pass', 'Pase clave', 'positive', 'player', 0, 0, false, NULL, false, false, 1, false, NULL, 80),
  ('turnover', 'Balón perdido', 'negative', 'player', 0, 0, false, NULL, false, false, -1, true, NULL, 90),
  ('foul', 'Falta cometida', 'negative', 'player', 0, 0, true, NULL, false, false, -1, true, NULL, 100),
  ('yellow_card', 'Tarjeta amarilla', 'negative', 'player', 0, 0, false, 'yellow', false, false, -2, true, NULL, 110),
  ('red_card', 'Tarjeta roja', 'negative', 'player', 0, 0, false, 'red', false, false, -5, true, NULL, 120),
  ('timeout', 'Tiempo muerto', 'neutral', 'team', 0, 0, false, NULL, false, false, 0, true, NULL, 130),
  ('corner', 'Saque de esquina', 'neutral', 'team', 0, 0, false, NULL, false, false, 0, false, NULL, 140),
  ('opp_goal', 'Gol del rival', 'negative', 'opponent', 0, 1, false, NULL, false, false, 0, true, 'goal', 150),
  ('opp_shot_on_target', 'Tiro a puerta del rival', 'neutral', 'opponent', 0, 0, false, NULL, false, false, 0, true, 'shot_on_target', 160),
  ('opp_shot_off_target', 'Tiro fuera del rival', 'neutral', 'opponent', 0, 0, false, NULL, false, false, 0, false, 'shot_off_target', 170),
  ('opp_foul', 'Falta del rival', 'neutral', 'opponent', 0, 0, true, NULL, false, false, 0, true, 'foul', 180),
  ('opp_yellow_card', 'Amarilla al rival', 'neutral', 'opponent', 0, 0, false, 'yellow', false, false, 0, false, 'yellow_card', 190),
  ('opp_red_card', 'Roja al rival', 'neutral', 'opponent', 0, 0, false, 'red', false, false, 0, false, 'red_card', 200),
  ('opp_timeout', 'Tiempo muerto del rival', 'neutral', 'opponent', 0, 0, false, NULL, false, false, 0, false, 'timeout', 210)
) AS v("code", "name", "category", "scope", "own_score", "opponent_score", "counts_foul", "card", "requires_zone", "keeper_only", "weight", "quick", "mirror_of", "sort_order")
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "code") DO NOTHING;

-- Dos partidos jugados del Alevín A
INSERT INTO "matches" ("organization_id", "team_id", "season_id", "opponent", "home_away", "played_on", "status", "formation", "attack_direction", "clock_period", "clock_elapsed_ms", "finished_at", "notes")
SELECT o."id", t."id", t."season_id", v."opponent", v."home_away", v."played_on"::date, 'finished', '1-2-1', 'right', 2, 1200000, (v."played_on"::timestamp + INTERVAL '13 hours') AT TIME ZONE o."timezone", v."notes"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = 'Alevín A'
JOIN "seasons" sea ON sea."id" = t."season_id" AND sea."is_current"
CROSS JOIN (VALUES
  ('FS Castelldefels', 'home', '2026-10-17', 'Buen partido de presión alta. Mejorar las salidas de balón en la segunda parte.'),
  ('AE Poble Sec', 'away', '2026-10-10', NULL)
) AS v("opponent", "home_away", "played_on", "notes")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "matches" m WHERE m."team_id" = t."id" AND m."opponent" = v."opponent");

-- Convocatoria: toda la plantilla; la portera y el quinteto inicial de cada partido
INSERT INTO "match_players" ("organization_id", "match_id", "player_id", "shirt_number", "position", "is_goalkeeper", "starter", "slot", "sort_order")
SELECT m."organization_id", m."id", tp."player_id", tp."shirt_number", tp."position",
  tp."shirt_number" = 1,
  CASE m."opponent" WHEN 'FS Castelldefels' THEN tp."shirt_number" IN (1, 2, 3, 4, 5) ELSE tp."shirt_number" IN (1, 2, 3, 4, 6) END,
  CASE m."opponent"
    WHEN 'FS Castelldefels' THEN CASE WHEN tp."shirt_number" IN (1, 2, 3, 4, 5) THEN tp."shirt_number" - 1 END
    ELSE CASE tp."shirt_number" WHEN 1 THEN 0 WHEN 2 THEN 1 WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 6 THEN 4 END
  END,
  tp."shirt_number" * 10
FROM "matches" m
JOIN "organizations" o ON o."id" = m."organization_id" AND o."slug" = 'demo'
JOIN "teams" t ON t."id" = m."team_id" AND t."name" = 'Alevín A'
JOIN "team_players" tp ON tp."team_id" = t."id"
WHERE m."opponent" IN ('FS Castelldefels', 'AE Poble Sec')
ON CONFLICT ("match_id", "player_id") DO NOTHING;

-- Eventos de los dos partidos: jugadores por dorsal, quién estaba en pista por dorsales
WITH demo_matches AS (
  SELECT m."id", m."organization_id", m."opponent"
  FROM "matches" m
  JOIN "organizations" o ON o."id" = m."organization_id" AND o."slug" = 'demo'
  JOIN "teams" t ON t."id" = m."team_id" AND t."name" = 'Alevín A'
  WHERE m."opponent" IN ('FS Castelldefels', 'AE Poble Sec')
    AND NOT EXISTS (SELECT 1 FROM "match_events" e WHERE e."match_id" = m."id")
), rows("opponent", "seq", "kind", "code", "shirt", "related", "period", "clock_ms", "zone", "on_court") AS (VALUES
  ('FS Castelldefels', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 3, 'action', 'shot_on_target', 5, NULL, 1, 90000, 'r1c2', ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 4, 'action', 'goal', 5, NULL, 1, 150000, 'r1c2', ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 5, 'action', 'assist', 3, NULL, 1, 150000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 6, 'action', 'opp_shot_on_target', NULL, NULL, 1, 240000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 7, 'action', 'save', 1, NULL, 1, 240000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 8, 'action', 'foul', 2, NULL, 1, 300000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 9, 'action', 'opp_goal', NULL, NULL, 1, 420000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 10, 'sub', NULL, 6, 4, 1, 480000, NULL, ARRAY[1,2,3,5,6]),
  ('FS Castelldefels', 11, 'sub', NULL, 7, 2, 1, 480000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 12, 'action', 'steal', 7, NULL, 1, 540000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 13, 'action', 'shot_off_target', 6, NULL, 1, 600000, 'r2c3', ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 14, 'action', 'turnover', 3, NULL, 1, 660000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 15, 'action', 'opp_foul', NULL, NULL, 1, 720000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 16, 'action', 'goal', 7, NULL, 1, 840000, 'r2c1', ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 17, 'action', 'opp_shot_on_target', NULL, NULL, 1, 960000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 18, 'action', 'opp_goal', NULL, NULL, 1, 1020000, NULL, ARRAY[1,3,5,6,7]),
  ('FS Castelldefels', 19, 'sub', NULL, 8, 5, 1, 1080000, NULL, ARRAY[1,3,6,7,8]),
  ('FS Castelldefels', 20, 'sub', NULL, 9, 3, 1, 1080000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 21, 'action', 'foul_received', 9, NULL, 1, 1140000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 22, 'action', 'shot_on_target', 8, NULL, 1, 1200000, 'r1c3', ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 23, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 24, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 25, 'action', 'corner', NULL, NULL, 2, 60000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 26, 'action', 'goal', 4, NULL, 2, 120000, 'r1c1', ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 27, 'action', 'assist', 2, NULL, 2, 120000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 28, 'action', 'opp_foul', NULL, NULL, 2, 200000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 29, 'action', 'foul', 5, NULL, 2, 260000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 30, 'action', 'yellow_card', 5, NULL, 2, 260000, NULL, ARRAY[1,2,3,4,5]),
  ('FS Castelldefels', 31, 'sub', NULL, 6, 5, 2, 300000, NULL, ARRAY[1,2,3,4,6]),
  ('FS Castelldefels', 32, 'action', 'opp_shot_on_target', NULL, NULL, 2, 360000, NULL, ARRAY[1,2,3,4,6]),
  ('FS Castelldefels', 33, 'action', 'save', 1, NULL, 2, 360000, NULL, ARRAY[1,2,3,4,6]),
  ('FS Castelldefels', 34, 'action', 'opp_shot_off_target', NULL, NULL, 2, 420000, NULL, ARRAY[1,2,3,4,6]),
  ('FS Castelldefels', 35, 'sub', NULL, 7, 2, 2, 480000, NULL, ARRAY[1,3,4,6,7]),
  ('FS Castelldefels', 36, 'sub', NULL, 8, 3, 2, 480000, NULL, ARRAY[1,4,6,7,8]),
  ('FS Castelldefels', 37, 'action', 'steal', 6, NULL, 2, 540000, NULL, ARRAY[1,4,6,7,8]),
  ('FS Castelldefels', 38, 'action', 'goal', 6, NULL, 2, 600000, 'r2c2', ARRAY[1,4,6,7,8]),
  ('FS Castelldefels', 39, 'action', 'opp_goal', NULL, NULL, 2, 780000, NULL, ARRAY[1,4,6,7,8]),
  ('FS Castelldefels', 40, 'action', 'timeout', NULL, NULL, 2, 800000, NULL, ARRAY[1,4,6,7,8]),
  ('FS Castelldefels', 41, 'sub', NULL, 9, 4, 2, 840000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 42, 'action', 'opp_timeout', NULL, NULL, 2, 900000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 43, 'action', 'shot_off_target', 9, NULL, 2, 960000, 'r3c2', ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 44, 'action', 'opp_shot_on_target', NULL, NULL, 2, 1080000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 45, 'action', 'save', 1, NULL, 2, 1080000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 46, 'action', 'foul', 7, NULL, 2, 1140000, NULL, ARRAY[1,6,7,8,9]),
  ('FS Castelldefels', 47, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,6,7,8,9]),
  ('AE Poble Sec', 1, 'lineup', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 2, 'period_start', NULL, NULL, NULL, 1, 0, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 3, 'action', 'opp_goal', NULL, NULL, 1, 180000, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 4, 'action', 'shot_on_target', 6, NULL, 1, 300000, 'r1c2', ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 5, 'action', 'goal', 3, NULL, 1, 420000, 'r2c2', ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 6, 'action', 'assist', 6, NULL, 1, 420000, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 7, 'action', 'foul', 4, NULL, 1, 540000, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 8, 'sub', NULL, 5, 6, 1, 600000, NULL, ARRAY[1,2,3,4,5]),
  ('AE Poble Sec', 9, 'sub', NULL, 7, 2, 1, 600000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 10, 'action', 'turnover', 7, NULL, 1, 720000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 11, 'action', 'opp_shot_on_target', NULL, NULL, 1, 780000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 12, 'action', 'save', 1, NULL, 1, 780000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 13, 'action', 'opp_foul', NULL, NULL, 1, 900000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 14, 'action', 'shot_off_target', 5, NULL, 1, 1020000, 'r1c3', ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 15, 'period_end', NULL, NULL, NULL, 1, 1200000, NULL, ARRAY[1,3,4,5,7]),
  ('AE Poble Sec', 16, 'period_start', NULL, NULL, NULL, 2, 0, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 17, 'action', 'steal', 2, NULL, 2, 120000, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 18, 'action', 'goal', 6, NULL, 2, 240000, 'r1c1', ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 19, 'action', 'opp_foul', NULL, NULL, 2, 360000, NULL, ARRAY[1,2,3,4,6]),
  ('AE Poble Sec', 20, 'sub', NULL, 8, 4, 2, 420000, NULL, ARRAY[1,2,3,6,8]),
  ('AE Poble Sec', 21, 'sub', NULL, 9, 3, 2, 420000, NULL, ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 22, 'action', 'foul', 2, NULL, 2, 600000, NULL, ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 23, 'action', 'opp_goal', NULL, NULL, 2, 720000, NULL, ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 24, 'action', 'opp_shot_off_target', NULL, NULL, 2, 900000, NULL, ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 25, 'action', 'shot_on_target', 9, NULL, 2, 1020000, 'r2c3', ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 26, 'action', 'foul_received', 8, NULL, 2, 1080000, NULL, ARRAY[1,2,6,8,9]),
  ('AE Poble Sec', 27, 'period_end', NULL, NULL, NULL, 2, 1200000, NULL, ARRAY[1,2,6,8,9])
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

-- Marcador guardado: la suma de lo que sumó cada evento
UPDATE "matches" m
SET "own_score" = s."own", "opponent_score" = s."opp"
FROM (
  SELECT e."match_id", COALESCE(SUM(e."own_score_delta"), 0) AS "own", COALESCE(SUM(e."opponent_score_delta"), 0) AS "opp"
  FROM "match_events" e
  GROUP BY e."match_id"
) s
JOIN "organizations" o ON o."slug" = 'demo'
WHERE m."id" = s."match_id" AND m."organization_id" = o."id";
