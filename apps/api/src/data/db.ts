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
