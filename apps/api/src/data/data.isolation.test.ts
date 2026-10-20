import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "./index.ts";

describe("capa de datos contra una base real", () => {
  let local: NetlifyDB;
  let data: DataLayer;

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../../netlify/database/migrations", import.meta.url).pathname,
    );
    data = createDataLayer({ config: loadConfig({ NODE_ENV: "test" }), connectionString });
  });

  afterAll(async () => {
    await data?.close();
    await local?.stop();
  });

  it("comprueba la base y lee la semilla", async () => {
    const status = await data.checkDatabase();
    expect(status.ok).toBe(true);
    expect(status.latencyMs).not.toBeNull();
    expect(await data.getAppMeta("schema_version")).toBe("1");
    expect(await data.getAppMeta("no_existe")).toBeNull();
  });

  it("resuelve el club de demostración por slug y nunca uno inexistente", async () => {
    const demo = await data.organizations.findBySlug("demo");
    expect(demo?.organization.name).toBe("Club de demostración");
    expect(await data.organizations.findBySlug("no-existe")).toBeNull();
  });
});
