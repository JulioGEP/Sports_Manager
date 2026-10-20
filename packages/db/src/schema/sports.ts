import type { LocalizedText } from "@sportsmanager/shared";
import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared.ts";

/** Catálogo de deportes. El deporte es configuración en datos, no código. */
export const sports = pgTable("sports", {
  id: id(),
  code: text("code").notNull().unique(),
  name: jsonb("name").$type<LocalizedText>().notNull(),
  /** Posiciones, duración de partido y demás configuración por deporte. Vacío en la Fase 0. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
