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
 * NETLIFY_DB_URL, y por último la que inyecta la plataforma de Netlify (`Netlify.env`).
 *
 * Se lee `Netlify.env` a mano, igual que `getConnectionString()` de `@netlify/database`, para no
 * importar ese paquete: arrastra el driver serverless de Neon y `ws`, que la API no usa y que
 * costaban en cada arranque en frío de la función (ADR 0060).
 */
export function resolveConnectionString(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env["NETLIFY_DB_URL"];
  if (fromEnv) return fromEnv;
  const netlify = (globalThis as { Netlify?: { env?: { get(key: string): string | undefined } } })
    .Netlify;
  const fromPlatform = netlify?.env?.get("NETLIFY_DB_URL");
  if (fromPlatform) return fromPlatform;
  throw new Error(
    "Falta NETLIFY_DB_URL: el entorno no tiene Netlify Database configurada (https://ntl.fyi/database-environment).",
  );
}

/**
 * Crea el cliente de Drizzle sobre node-postgres. No conecta hasta la primera consulta.
 *
 * Pool pensado para funciones (ADR 0060): abrir una conexión con TLS cuesta varias idas y vueltas,
 * así que la conexión se queda abierta un minuto entre peticiones (por defecto `pg` la cerraba a
 * los 10 s, y casi cada clic pagaba una conexión nueva). Si la base corta una conexión ociosa, el
 * pool la descarta sin tumbar la función y la siguiente consulta abre otra. Cinco conexiones: un
 * lote de lecturas de una pantalla (`/api/batch`) consulta en paralelo, y con tres las consultas
 * hacían cola. Si algún día faltan conexiones en Neon, la cadena con pooler (`-pooler`) admite miles.
 */
export function createDb(options: CreateDbOptions = {}): DbHandle {
  const connectionString = resolveConnectionString(options.connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: options.maxConnections ?? 5,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", (error) => {
    console.error("[db] conexión ociosa cerrada por la base", error.message);
  });
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
