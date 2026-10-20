import { regionFromConnectionString, schema } from "@sportsmanager/db";
import type { DatabaseStatus } from "@sportsmanager/shared";
import { eq, sql } from "drizzle-orm";
import type { ApiConfig } from "../config.ts";
import { createAuth, type Auth } from "./auth/index.ts";
import { createLazyDb } from "./db.ts";
import { membershipsRepo } from "./memberships.ts";
import { organizationsRepo } from "./organizations.ts";
import { platformRepo } from "./platform.ts";

export type { OrgScope } from "./scope.ts";
export type { OrganizationRow, OrganizationSport, SupportCounts } from "./organizations.ts";
export type { AssignRoleResult, Member, RemoveRoleResult, UserMembership } from "./memberships.ts";
export { userLocale } from "./memberships.ts";

/**
 * Única capa de acceso a datos de la API (ADR 0009 y 0015).
 * Fuera de este directorio nadie importa @sportsmanager/db, drizzle-orm, pg ni better-auth:
 * lo impiden ESLint y src/architecture.isolation.test.ts.
 */
export interface DataLayerOptions {
  config: ApiConfig;
  connectionString?: string;
}

export function createDataLayer(options: DataLayerOptions) {
  const lazy = createLazyDb(
    options.connectionString ? { connectionString: options.connectionString } : {},
  );
  const db = () => lazy.get().db;
  let auth: Auth | null = null;

  return {
    get auth(): Auth {
      auth ??= createAuth(db(), options.config);
      return auth;
    },
    organizations: organizationsRepo(db),
    memberships: membershipsRepo(db),
    platform: platformRepo(db),

    async checkDatabase(): Promise<DatabaseStatus> {
      try {
        const { db: database, connectionString } = lazy.get();
        const started = performance.now();
        await database.execute(sql`select 1`);
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

    async getAppMeta(key: string): Promise<string | null> {
      const rows = await db()
        .select({ value: schema.appMeta.value })
        .from(schema.appMeta)
        .where(eq(schema.appMeta.key, key))
        .limit(1);
      return rows[0]?.value ?? null;
    },

    async close() {
      await lazy.close();
      auth = null;
    },
  };
}

export type DataLayer = ReturnType<typeof createDataLayer>;
