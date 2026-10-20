import { createDb, type DbHandle } from "@sportsmanager/db";

export interface DbOptions {
  connectionString?: string;
}

/** Conexión perezosa: no abre nada hasta la primera consulta. */
export function createLazyDb(options: DbOptions) {
  let handle: DbHandle | null = null;
  return {
    get(): DbHandle {
      handle ??= createDb(
        options.connectionString ? { connectionString: options.connectionString } : {},
      );
      return handle;
    },
    async close() {
      await handle?.close();
      handle = null;
    },
  };
}

/** Violación de índice único de Postgres (23505), venga directa de `pg` o envuelta por Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  return isUniqueViolation((error as { cause?: unknown }).cause);
}
