-- Acciones del partido (ADR 0038): el catálogo de fútbol sala del club demo gana las tres acciones
-- sin equipo que propone el deporte (partido parado, parón por lesión y decisión arbitral), para
-- que la consola enseñe la bandeja del partido junto a la del equipo. Idempotente.
INSERT INTO "match_action_types" ("organization_id", "section_id", "code", "name", "category", "scope", "own_score", "opponent_score", "counts_foul", "card", "requires_zone", "keeper_only", "weight", "quick", "mirror_of", "sort_order")
SELECT o."id", s."id", v."code", v."name", 'neutral', 'match', 0, 0, false, NULL, false, false, 0, true, NULL, v."sort_order"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
CROSS JOIN (VALUES
  ('stoppage', 'Partido parado', 220),
  ('injury_stop', 'Parón por lesión', 230),
  ('referee_decision', 'Decisión arbitral', 240)
) AS v("code", "name", "sort_order")
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "code") DO NOTHING;
