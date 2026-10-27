import {
  AI_FAILURES,
  AI_GENERATION_KINDS,
  AI_GENERATION_STATUSES,
  type AiContext,
  type AiDraftRequest,
  type AiProposalOutput,
  type AiProposalResolved,
  type AiWodContext,
  type AiWodOutput,
  type AiWodProposal,
  type AiWodRequest,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { boxPlans } from "./planning.ts";
import { sections, teams } from "./structure.ts";

/**
 * Propuesta de sesión con IA (ADR 0044). Todo lleva `organization_id` (ADR 0015).
 */

/** Inventario de material de una sección: lo que hay para entrenar. */
export const sectionEquipment = pgTable(
  "section_equipment",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("section_equipment_section_name_unique").on(t.sectionId, t.name),
    index("section_equipment_organization_id_idx").on(t.organizationId),
    check(
      "section_equipment_quantity_check",
      sql`${t.quantity} is null or ${t.quantity} between 1 and 9999`,
    ),
  ],
);

/**
 * Una propuesta pedida a la IA: la petición, el contexto exacto que vio el modelo (sin datos
 * personales: los jugadores van por referencia), la salida, la propuesta validada, el consumo y
 * si se aplicó. Es el registro de la cuota (por semana del club) y la base para medir si sirve.
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Qué se pide (ADR 0049): las sesiones de un equipo (`training`, siempre con equipo) o el WOD
     * de un día de una disciplina de fitness (`wod`, con tipo de clase o sin él). Gastan la misma
     * cuota semanal.
     */
    kind: text("kind").notNull().default("training"),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    /** El plan del que se pide algo (ADR 0053): una semana o un cambio del copiloto. */
    planId: uuid("plan_id").references(() => boxPlans.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** Lunes de la semana del club en que se pidió: la cuota cuenta por semana. */
    weekStart: date("week_start").notNull(),
    status: text("status").notNull().default("queued"),
    failure: text("failure"),
    profileCode: text("profile_code").notNull(),
    profileVersion: integer("profile_version").notNull(),
    model: text("model").notNull(),
    request: jsonb("request")
      .$type<AiDraftRequest | AiWodRequest | Record<string, unknown>>()
      .notNull(),
    context: jsonb("context").$type<AiContext | AiWodContext | Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<AiProposalOutput | AiWodOutput | Record<string, unknown>>(),
    proposal: jsonb("proposal").$type<
      AiProposalResolved | AiWodProposal | Record<string, unknown>
    >(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Coste en millonésimas de dólar. */
    costMicros: integer("cost_micros").notNull().default(0),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedBy: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
    /** Tareas que entraron en las sesiones al aplicarla. */
    appliedItems: integer("applied_items").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("ai_generations_organization_id_idx").on(t.organizationId),
    index("ai_generations_org_week_idx").on(t.organizationId, t.weekStart),
    index("ai_generations_team_id_idx").on(t.teamId),
    index("ai_generations_plan_id_idx").on(t.planId),
    check("ai_generations_status_check", inList(t.status, AI_GENERATION_STATUSES)),
    check("ai_generations_kind_check", inList(t.kind, AI_GENERATION_KINDS)),
    // Las sesiones son siempre de un equipo; el WOD puede ser de toda la disciplina.
    check("ai_generations_team_check", sql`${t.kind} <> 'training' or ${t.teamId} is not null`),
    check(
      "ai_generations_failure_check",
      sql`${t.failure} is null or ${inList(t.failure, AI_FAILURES)}`,
    ),
  ],
);
