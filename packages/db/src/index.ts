import { getConnectionString } from "@netlify/database";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

export { schema };
export type Database = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Cadena de conexión explícita. Si falta, se usa NETLIFY_DB_URL o la que inyecta Netlify. */
  connectionString?: string;
  /** Conexiones máximas del pool. En funciones serverless conviene que sea bajo. */
  maxConnections?: number;
}

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  connectionString: string;
  close: () => Promise<void>;
}

/**
 * Resuelve la cadena de conexión por este orden: argumento explícito, variable
 * NETLIFY_DB_URL, y por último la que inyecta la plataforma de Netlify.
 */
export function resolveConnectionString(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env["NETLIFY_DB_URL"];
  if (fromEnv) return fromEnv;
  return getConnectionString();
}

/** Crea el cliente de Drizzle sobre node-postgres. No conecta hasta la primera consulta. */
export function createDb(options: CreateDbOptions = {}): DbHandle {
  const connectionString = resolveConnectionString(options.connectionString);
  const pool = new pg.Pool({ connectionString, max: options.maxConnections ?? 3 });
  const db = drizzle(pool, { schema });
  return { db, pool, connectionString, close: () => pool.end() };
}

const AWS_REGION_PATTERN = /\b([a-z]{2}-[a-z]+-\d)\b/;

/**
 * Deduce la región AWS del servidor a partir del host de la cadena de conexión.
 * Solo devuelve la región, nunca el host ni las credenciales.
 */
export function regionFromConnectionString(connectionString: string): string | null {
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return null;
  }
  return AWS_REGION_PATTERN.exec(host)?.[1] ?? null;
}
