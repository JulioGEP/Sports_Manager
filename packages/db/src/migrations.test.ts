import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./index.ts";
import { appMeta } from "./schema/index.ts";

/**
 * Arranca un Postgres local embebido, aplica las migraciones del repo y comprueba
 * que el esquema y la semilla llegan bien. Es la misma cadena que ejecuta Netlify en
 * cada deploy preview y en producción.
 */
describe("migraciones", () => {
  let local: NetlifyDB;
  let handle: DbHandle;

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../netlify/database/migrations", import.meta.url).pathname,
    );
    handle = createDb({ connectionString, maxConnections: 1 });
  });

  afterAll(async () => {
    await handle?.close();
    await local?.stop();
  });

  it("crea app_meta y siembra la versión de esquema", async () => {
    const rows = await handle.db.select().from(appMeta);
    const version = rows.find((row) => row.key === "schema_version");
    expect(version?.value).toBe("1");
  });
});
