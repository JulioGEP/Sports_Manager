import {
  SUGGESTION_AREAS,
  SUGGESTION_ETA_PATTERN,
  SUGGESTION_PUBLIC_STATUSES,
  SUGGESTION_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { id, inList, regexLiteral, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

/**
 * Mejoras de la plataforma (ADR 0046). La única tabla que no es de un club: una mejora publicada la
 * ven y la votan todos. Lleva el club que la pidió (nulo si la añadió la plataforma o si el club ya
 * no existe), pero la API nunca lo enseña a otro club.
 */
export const suggestions = pgTable(
  "suggestions",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Lo que escribió el club, tal cual: solo lo ven ese club y la plataforma. */
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    area: text("area").notNull(),
    status: text("status").notNull().default("submitted"),
    /** La versión para la hoja de ruta, reescrita por la plataforma: sin nombres ni datos del club. */
    publicTitle: text("public_title"),
    publicBody: text("public_body"),
    /** Lo que la plataforma contesta al club que la pidió (el porqué de un descarte, por ejemplo). */
    response: text("response"),
    /** Fecha aproximada: un mes (2027-03) o un trimestre (2027-Q1). */
    eta: text("eta"),
    /** Orden en lo que viene (en desarrollo y planificadas): menor, antes. */
    position: integer("position"),
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => suggestions.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("suggestions_organization_id_idx").on(t.organizationId),
    index("suggestions_status_idx").on(t.status),
    index("suggestions_merged_into_id_idx").on(t.mergedIntoId),
    check("suggestions_status_check", inList(t.status, SUGGESTION_STATUSES)),
    check("suggestions_area_check", inList(t.area, SUGGESTION_AREAS)),
    check(
      "suggestions_eta_format",
      sql`${t.eta} is null or ${t.eta} ~ ${regexLiteral(SUGGESTION_ETA_PATTERN)}`,
    ),
    check("suggestions_not_merged_into_itself", sql`${t.mergedIntoId} is distinct from ${t.id}`),
    // Lo que sale en la hoja de ruta siempre lleva su versión pública.
    check(
      "suggestions_public_title_check",
      sql`not (${inList(t.status, SUGGESTION_PUBLIC_STATUSES)}) or ${t.publicTitle} is not null`,
    ),
  ],
);

/**
 * Un voto es de un club, no de una persona: se prioriza por clubes, y un club con cuatro
 * administradores no pesa cuatro veces. Queda quién lo dio.
 */
export const suggestionVotes = pgTable(
  "suggestion_votes",
  {
    id: id(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => suggestions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("suggestion_votes_suggestion_org_unique").on(t.suggestionId, t.organizationId),
    index("suggestion_votes_organization_id_idx").on(t.organizationId),
  ],
);
