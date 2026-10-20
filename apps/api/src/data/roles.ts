import { schema, type Database } from "@sportsmanager/db";
import type { LocalizedText, RoleCode } from "@sportsmanager/shared";
import { eq } from "drizzle-orm";

/** Catálogo de roles (ADR 0008): solo lectura desde la API. */
export function rolesRepo(db: () => Database) {
  return {
    async nameOf(code: RoleCode): Promise<LocalizedText> {
      const rows = await db()
        .select({ name: schema.roles.name })
        .from(schema.roles)
        .where(eq(schema.roles.code, code))
        .limit(1);
      const name = rows[0]?.name;
      if (!name) throw new Error(`Falta el rol ${code} en la tabla roles.`);
      return name;
    },
  };
}
