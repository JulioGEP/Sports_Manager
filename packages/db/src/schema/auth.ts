import { LOCALES } from "@sportsmanager/shared";
import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";

/**
 * Tablas de Better Auth 1.7, generadas con su CLI y adaptadas a la convención del proyecto:
 * UUID generados por la base (Better Auth con `generateId: false`) y fechas con zona horaria.
 * Columna propia: `users.locale` (idioma preferido, Bloque 7).
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    locale: text("locale"),
    ...timestamps,
  },
  (t) => [
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_locale_check", sql`${t.locale} is null or ${inList(t.locale, LOCALES)}`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/**
 * Relaciones para Better Auth con `joins` (ADR 0060): la sesión y su usuario salen en una sola
 * consulta en cada petición, en vez de dos seguidas. No cambian el esquema ni las migraciones.
 */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
