-- Propuesta de sesión con IA (ADR 0043). El club demo llega con lo que la IA lee además de los
-- datos de siempre: el material de fútbol sala y de yoga, y "cómo entrenamos aquí" en las dos
-- secciones. La IA no está activa sin ANTHROPIC_API_KEY. Idempotente: cada inserción salta si ya
-- existe y la metodología solo se escribe si la sección no tiene una.

INSERT INTO "section_equipment" ("organization_id", "section_id", "name", "quantity", "notes", "sort_order")
SELECT o."id", s."id", v."name", v."quantity", v."notes", v."sort"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id"
JOIN (VALUES
  ('Fútbol sala', 'Balones', 14, NULL, 10),
  ('Fútbol sala', 'Conos', 40, NULL, 20),
  ('Fútbol sala', 'Petos', 20, 'Dos colores', 30),
  ('Fútbol sala', 'Porterías pequeñas', 4, NULL, 40),
  ('Fútbol sala', 'Escalera de coordinación', 2, NULL, 50),
  ('Fútbol sala', 'Vallas bajas', 8, NULL, 60),
  ('Yoga', 'Esterillas', 20, NULL, 10),
  ('Yoga', 'Bloques', 20, NULL, 20),
  ('Yoga', 'Cinturones', 15, NULL, 30),
  ('Yoga', 'Mantas', 20, NULL, 40),
  ('Yoga', 'Bolsters', 6, 'Para restaurativo', 50)
) AS v("section", "name", "quantity", "notes", "sort") ON v."section" = s."name"
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "name") DO NOTHING;

UPDATE "sections" s
SET "training_settings" = COALESCE(s."training_settings", '{}'::jsonb) || jsonb_build_object('methodologyNotes', v."notes")
FROM "organizations" o,
  (VALUES
    ('Fútbol sala', 'Juego de posición y presión tras pérdida. Casi todo con balón y con portero: las tareas acaban en portería. En formación, juego reducido y todos juegan lo mismo. En el sénior, la semana se organiza alrededor del partido.'),
    ('Yoga', 'Clases de hatha y vinyasa suave para adultos de todas las edades. Cada clase con una intención, alternativas con material para cada postura y diez minutos de relajación final.')
  ) AS v("section", "notes")
WHERE o."slug" = 'demo'
  AND s."organization_id" = o."id"
  AND s."name" = v."section"
  AND (s."training_settings" IS NULL OR NOT (s."training_settings" ? 'methodologyNotes'));
