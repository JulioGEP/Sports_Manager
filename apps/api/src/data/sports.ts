import { schema, type Database } from "@sportsmanager/db";
import type { LocalizedText } from "@sportsmanager/shared";
import { asc } from "drizzle-orm";

/** Catálogo de deportes: datos, no código (ADR 0008). Solo lectura desde la API. */
export function sportsRepo(db: () => Database) {
  return {
    async list(): Promise<{ code: string; name: LocalizedText }[]> {
      const rows = await db()
        .select({ code: schema.sports.code, name: schema.sports.name })
        .from(schema.sports)
        .orderBy(asc(schema.sports.code));
      return rows.map((row) => ({ code: row.code, name: row.name }));
    },
  };
}
