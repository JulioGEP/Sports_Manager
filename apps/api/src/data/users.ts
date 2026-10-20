import { schema, type Database } from "@sportsmanager/db";
import { isLocale, type Locale } from "@sportsmanager/shared";
import { eq } from "drizzle-orm";
import type { Auth } from "./auth/index.ts";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  locale: Locale | null;
}

/**
 * Usuarios. El alta pública está cerrada (registro solo por invitación), así que la cuenta
 * se crea con el adaptador interno de Better Auth (ADR 0019): mismas tablas, mismo hash de
 * contraseña y mismas validaciones que su registro normal, sin abrir el endpoint público.
 */
export function usersRepo(db: () => Database, auth: () => Auth) {
  return {
    async findByEmail(email: string): Promise<UserRecord | null> {
      const rows = await db()
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          locale: schema.users.locale,
        })
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase()))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { ...row, locale: isLocale(row.locale) ? row.locale : null };
    },

    /** Crea usuario y cuenta de contraseña. El email llega verificado: viene de una invitación aceptada. */
    async createWithPassword(input: {
      email: string;
      name: string;
      password: string;
      locale: Locale | null;
    }): Promise<UserRecord> {
      const ctx = await auth().$context;
      const user = await ctx.internalAdapter.createUser(
        {
          email: input.email.toLowerCase(),
          name: input.name,
          emailVerified: true,
          locale: input.locale,
        },
        /** Origen del alta, para los hooks de validación de Better Auth. */
        { method: "invitation" },
      );
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await ctx.password.hash(input.password),
      });
      return { id: user.id, name: user.name, email: user.email, locale: input.locale };
    },
  };
}
