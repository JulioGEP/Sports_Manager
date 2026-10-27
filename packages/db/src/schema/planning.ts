import {
  BOX_EQUIPMENT_KINDS,
  LEVEL_CAPACITIES,
  PLAN_STATUSES,
  PLAN_TEMPLATE_CODES,
  WORKOUT_LEVELS,
  ATHLETE_PREVIEWS,
  type Emphasis,
  type PlanStructure,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { facilities } from "./events.ts";
import { organizations } from "./organizations.ts";
import { players, sections } from "./structure.ts";

/**
 * Planificación del box (ADR 0053): el material de la sala, los ajustes de la programación, el plan
 * con su estructura de bloques y semanas, lo que se decide en la revisión de cada domingo y el nivel
 * que cada atleta fija por capacidad. Todo lleva `organization_id` (ADR 0015).
 */

/** Una línea del inventario: tantas unidades de un tipo de material, en una sala si se dice. */
export const boxEquipment = pgTable(
  "box_equipment",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    /** Unidades fuera de servicio hasta `repair_until` (o hasta que se diga). */
    outOfService: integer("out_of_service").notNull().default(0),
    repairUntil: date("repair_until"),
    minKg: numeric("min_kg", { precision: 5, scale: 1 }),
    maxKg: numeric("max_kg", { precision: 5, scale: 1 }),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("box_equipment_organization_id_idx").on(t.organizationId),
    check("box_equipment_kind_check", inList(t.kind, BOX_EQUIPMENT_KINDS)),
    check("box_equipment_quantity_check", sql`${t.quantity} between 0 and 9999`),
    check(
      "box_equipment_out_check",
      sql`${t.outOfService} >= 0 and ${t.outOfService} <= ${t.quantity}`,
    ),
  ],
);

/** Ajustes de la programación del box: una fila por club; sin fila, los de por defecto. */
export const planningSettings = pgTable(
  "planning_settings",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nombre de cada nivel en el box (`foundations`, `scaled`, `rx`, `rx_plus`). */
    levelNames: jsonb("level_names")
      .$type<Partial<Record<(typeof WORKOUT_LEVELS)[number], string>>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    athletePreview: text("athlete_preview").notNull().default("roles"),
    ...timestamps,
  },
  (t) => [check("planning_settings_preview_check", inList(t.athletePreview, ATHLETE_PREVIEWS))],
);

/**
 * El plan de una disciplina: objetivo, fechas, énfasis, tests y su estructura de bloques y
 * semanas (`PlanStructure`, validada en la API). Un solo plan activo por disciplina.
 */
export const boxPlans = pgTable(
  "box_plans",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateCode: text("template_code").notNull(),
    goal: text("goal"),
    eventName: text("event_name"),
    eventDate: date("event_date"),
    /** Lunes de la primera semana. */
    startsOn: date("starts_on").notNull(),
    weeks: integer("weeks").notNull(),
    emphasis: jsonb("emphasis").$type<Emphasis>().notNull(),
    /** Días por semana de referencia para la proyección. */
    frequency: integer("frequency").notNull().default(3),
    tests: jsonb("tests")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    closures: jsonb("closures")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    structure: jsonb("structure").$type<PlanStructure>().notNull(),
    /** La proyección guardada al crearlo, para calibrar el siguiente al acabar. */
    projection: jsonb("projection").$type<unknown>(),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("box_plans_organization_id_idx").on(t.organizationId),
    index("box_plans_section_idx").on(t.sectionId),
    uniqueIndex("box_plans_active_unique")
      .on(t.sectionId)
      .where(sql`${t.status} = 'active'`),
    check("box_plans_status_check", inList(t.status, PLAN_STATUSES)),
    check("box_plans_template_check", inList(t.templateCode, PLAN_TEMPLATE_CODES)),
    check("box_plans_weeks_check", sql`${t.weeks} between 1 and 60`),
    check("box_plans_frequency_check", sql`${t.frequency} between 2 and 6`),
  ],
);

/** Lo que el coach decide en la revisión de un domingo: un ajuste aceptado o descartado. */
export const planAdjustments = pgTable(
  "plan_adjustments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => boxPlans.id, { onDelete: "cascade" }),
    /** Semana revisada. */
    week: integer("week").notNull(),
    key: text("key").notNull(),
    status: text("status").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("plan_adjustments_unique").on(t.planId, t.week, t.key),
    index("plan_adjustments_organization_id_idx").on(t.organizationId),
    check("plan_adjustments_status_check", inList(t.status, ["accepted", "discarded"])),
  ],
);

/** El nivel que un atleta fija en una capacidad, por encima del que se le sugiere. */
export const athleteLevels = pgTable(
  "athlete_levels",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    capacity: text("capacity").notNull(),
    level: text("level").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("athlete_levels_player_capacity_unique").on(t.playerId, t.capacity),
    index("athlete_levels_organization_id_idx").on(t.organizationId),
    check("athlete_levels_capacity_check", inList(t.capacity, LEVEL_CAPACITIES)),
    check("athlete_levels_level_check", inList(t.level, WORKOUT_LEVELS)),
  ],
);
