import { createDb, regionFromConnectionString, schema, type DbHandle } from "@sportsmanager/db";
import type { DatabaseStatus } from "@sportsmanager/shared";
import { eq, sql } from "drizzle-orm";

/**
 * Única capa de acceso a datos de la API (ADR 0009).
 * Fuera de este directorio nadie importa @sportsmanager/db, drizzle-orm ni pg:
 * lo impiden ESLint y src/architecture.isolation.test.ts.
 *
 * En el Bloque 3 toda función de consulta recibirá el contexto de organización.
 */
export interface DataLayer {
  checkDatabase(): Promise<DatabaseStatus>;
  getAppMeta(key: string): Promise<string | null>;
  close(): Promise<void>;
}

export interface DataLayerOptions {
  connectionString?: string;
}

export function createDataLayer(options: DataLayerOptions = {}): DataLayer {
  let handle: DbHandle | null = null;

  const getHandle = (): DbHandle => {
    handle ??= createDb(
      options.connectionString ? { connectionString: options.connectionString } : {},
    );
    return handle;
  };

  return {
    async checkDatabase() {
      try {
        const { db, connectionString } = getHandle();
        const started = performance.now();
        await db.execute(sql`select 1`);
        return {
          ok: true,
          region: regionFromConnectionString(connectionString),
          latencyMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        console.error("[data] database check failed", error);
        return { ok: false, region: null, latencyMs: null };
      }
    },

    async getAppMeta(key) {
      const { db } = getHandle();
      const rows = await db
        .select({ value: schema.appMeta.value })
        .from(schema.appMeta)
        .where(eq(schema.appMeta.key, key))
        .limit(1);
      return rows[0]?.value ?? null;
    },

    async close() {
      await handle?.close();
      handle = null;
    },
  };
}
