import {
  BRAND_COLOR_PATTERN,
  CLUB_BACKGROUNDS,
  CLUB_BUTTON_STYLES,
  CLUB_CORNERS,
  CLUB_HERO_STYLES,
  CLUB_ICON_STYLES,
  CLUB_MOTTO_MAX,
  CLUB_NAV_STYLES,
  CLUB_TYPOGRAPHIES,
  CLUB_VOICES,
  LOCALES,
  ORGANIZATION_SLUG_PATTERN,
  ORGANIZATION_STATUSES,
  PAYMENT_PROVIDERS,
  STRIPE_ACCOUNT_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
    /**
     * Identidad visual (ADR 0043): opciones cerradas del design system. Los valores por defecto son
     * el aspecto de siempre, así que un club que no toca nada se ve igual.
     */
    styleTypography: text("style_typography").notNull().default("moderna"),
    styleButtons: text("style_buttons").notNull().default("sistema"),
    styleIcons: text("style_icons").notNull().default("duotono"),
    styleBackground: text("style_background").notNull().default("liso"),
    styleHero: text("style_hero").notNull().default("liso"),
    styleNav: text("style_nav").notNull().default("claro"),
    styleCorners: text("style_corners").notNull().default("sistema"),
    /** Lema del club en la portada (ADR 0043). Nulo: sin lema. */
    motto: text("motto"),
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
    check("organizations_style_typography_check", inList(t.styleTypography, CLUB_TYPOGRAPHIES)),
    check("organizations_style_buttons_check", inList(t.styleButtons, CLUB_BUTTON_STYLES)),
    check("organizations_style_icons_check", inList(t.styleIcons, CLUB_ICON_STYLES)),
    check("organizations_style_background_check", inList(t.styleBackground, CLUB_BACKGROUNDS)),
    check("organizations_style_hero_check", inList(t.styleHero, CLUB_HERO_STYLES)),
    check("organizations_style_nav_check", inList(t.styleNav, CLUB_NAV_STYLES)),
    check("organizations_style_corners_check", inList(t.styleCorners, CLUB_CORNERS)),
    check(
      "organizations_motto_length",
      sql`${t.motto} is null or char_length(${t.motto}) between 1 and ${sql.raw(String(CLUB_MOTTO_MAX))}`,
    ),
    check("organizations_payments_provider_check", inList(t.paymentsProvider, PAYMENT_PROVIDERS)),
    check(
      "organizations_stripe_account_status_check",
      sql`${t.stripeAccountStatus} is null or ${inList(t.stripeAccountStatus, STRIPE_ACCOUNT_STATUSES)}`,
    ),
  ],
);
