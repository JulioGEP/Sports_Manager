import {
  AI_DEFAULT_WEEKLY_QUOTA,
  AI_MAX_WEEKLY_QUOTA,
  BRAND_COLOR_PATTERN,
  CLUB_VOICES,
  LOCALES,
  ORGANIZATION_SLUG_PATTERN,
  ORGANIZATION_STATUSES,
  PAYMENT_PROVIDERS,
  STRIPE_ACCOUNT_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, inList, regexLiteral, timestamps } from "./_shared.ts";
import { sports } from "./sports.ts";

/** Un club. El slug es su subdominio. Los subdominios reservados se rechazan en la API. */
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    defaultLocale: text("default_locale").notNull(),
    defaultSportId: uuid("default_sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    brandPrimaryColor: text("brand_primary_color").notNull(),
    brandSecondaryColor: text("brand_secondary_color").notNull(),
    /** Clave del logo en Netlify Blobs. Se rellena en el Bloque 5. */
    logoBlobKey: text("logo_blob_key"),
    status: text("status").notNull().default("active"),
    /** Voz del club (DESIGN.md 11, Bloque 11): cercana, profesional o vestuario. */
    voice: text("voice").notNull().default("cercana"),
    /** Zona horaria IANA (Bloque 16): la agenda se genera y se pinta en ella. */
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    /** Cómo cobra el club (Bloque 18): a mano o por Stripe en su cuenta conectada. */
    paymentsProvider: text("payments_provider").notNull().default("manual"),
    stripeAccountId: text("stripe_account_id"),
    /** Lo que Stripe dice de esa cuenta (ADR 0042): en alta, restringida o lista para cobrar. */
    stripeAccountStatus: text("stripe_account_status"),
    /**
     * Clave publicable del catálogo de la tienda (ADR 0041): la web del club la usa para leer sus
     * productos públicos. Nula: catálogo público apagado.
     */
    publicApiKey: text("public_api_key").unique(),
    /** Propuestas de sesión con IA por semana (ADR 0043). Lo fija la plataforma; 0 la apaga. */
    aiWeeklyQuota: integer("ai_weekly_quota").notNull().default(AI_DEFAULT_WEEKLY_QUOTA),
    ...timestamps,
  },
  (t) => [
    check("organizations_slug_format", sql`${t.slug} ~ ${regexLiteral(ORGANIZATION_SLUG_PATTERN)}`),
    check("organizations_default_locale_check", inList(t.defaultLocale, LOCALES)),
    check(
      "organizations_brand_primary_color_format",
      sql`${t.brandPrimaryColor} ~ ${regexLiteral(BRAND_COLOR_PATTERN)}`,
    ),
    check(
      "organizations_brand_secondary_color_format",
      sql`${t.brandSecondaryColor} ~ ${regexLiteral(BRAND_COLOR_PATTERN)}`,
    ),
    check("organizations_status_check", inList(t.status, ORGANIZATION_STATUSES)),
    check("organizations_voice_check", inList(t.voice, CLUB_VOICES)),
    check("organizations_payments_provider_check", inList(t.paymentsProvider, PAYMENT_PROVIDERS)),
    check(
      "organizations_stripe_account_status_check",
      sql`${t.stripeAccountStatus} is null or ${inList(t.stripeAccountStatus, STRIPE_ACCOUNT_STATUSES)}`,
    ),
    check(
      "organizations_ai_weekly_quota_check",
      sql`${t.aiWeeklyQuota} between 0 and ${sql.raw(String(AI_MAX_WEEKLY_QUOTA))}`,
    ),
  ],
);
