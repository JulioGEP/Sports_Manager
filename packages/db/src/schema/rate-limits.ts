import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";
import { id } from "./_shared.ts";

/**
 * Contadores del límite de intentos de Better Auth (ADR 0020), compartidos entre instancias
 * de la función. Clave = IP + ruta. Better Auth los crea, actualiza y borra; nadie más los toca.
 */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  /** Marca de tiempo en milisegundos, tal como la guarda Better Auth. */
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
