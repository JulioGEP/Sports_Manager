import {
  BRAND_COLOR_PATTERN,
  LOCALES,
  ORGANIZATION_SLUG_PATTERN,
  ORGANIZATION_STATUSES,
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
  ],
);
