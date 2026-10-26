import { EXERCISE_CATEGORIES, EXERCISE_STATUSES } from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { sections } from "./structure.ts";

/**
 * Biblioteca de ejercicios del box (ADR 0050): cómo se hace cada ejercicio, en qué fijarse, los
 * errores de siempre, cómo se escala y su vídeo. Es la biblioteca de tareas de un club deportivo
 * en versión box: sin pizarra, sin jugadores ni espacio. El nombre es único en el club sin
 * distinguir mayúsculas. `movement_code` lo enlaza con el catálogo de movimientos (máximas y kilos).
 */
export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    /** Códigos de material (`EXERCISE_EQUIPMENT`). */
    equipment: jsonb("equipment")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    movementCode: text("movement_code"),
    description: text("description"),
    coachingPoints: text("coaching_points"),
    commonFaults: text("common_faults"),
    scaling: text("scaling"),
    videoUrl: text("video_url"),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("exercises_org_name_unique").on(t.organizationId, sql`lower(${t.name})`),
    index("exercises_organization_id_idx").on(t.organizationId),
    check("exercises_category_check", inList(t.category, EXERCISE_CATEGORIES)),
    check("exercises_status_check", inList(t.status, EXERCISE_STATUSES)),
    check("exercises_equipment_array_check", sql`jsonb_typeof(${t.equipment}) = 'array'`),
  ],
);
