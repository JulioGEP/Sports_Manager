-- Índices de rendimiento (ADR 0060), escritos a mano: la migración que genera drizzle-kit hoy
-- arrastraría también el borrado de las tablas del box (ADR 0058), que va aparte.
--   - events (organization_id, ends_at): la agenda, el inicio y la ficha de sección piden lo que
--     termina después de un instante; con solo (organization_id, starts_at) cada consulta recorría
--     todos los eventos pasados del club, que crecen sin fin con el horario de cada equipo.
--   - challenge_submissions (task_id, player_id): cada prueba de un reto suma lo registrado en ella.
-- `if not exists`: los dos están ya en el esquema, así que la próxima migración generada también los
-- traerá; hay que quitarlos de ella (ver la ADR 0060).
CREATE INDEX IF NOT EXISTS "events_org_ends_idx" ON "events" USING btree ("organization_id","ends_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_submissions_task_player_idx" ON "challenge_submissions" USING btree ("task_id","player_id");
