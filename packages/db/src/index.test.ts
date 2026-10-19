import { describe, expect, it } from "vitest";
import { regionFromConnectionString, resolveConnectionString } from "./index.ts";

describe("regionFromConnectionString", () => {
  it("deduce la región del host sin exponer nada más", () => {
    expect(
      regionFromConnectionString(
        "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require",
      ),
    ).toBe("eu-central-1");
    expect(regionFromConnectionString("postgresql://u:p@ep-x.us-east-2.aws.neon.tech/db")).toBe(
      "us-east-2",
    );
  });

  it("devuelve null en local o con cadenas inválidas", () => {
    expect(regionFromConnectionString("postgresql://u:p@localhost:5432/db")).toBeNull();
    expect(regionFromConnectionString("no es una url")).toBeNull();
  });
});

describe("resolveConnectionString", () => {
  it("prefiere el argumento explícito a la variable de entorno", () => {
    process.env["NETLIFY_DB_URL"] = "postgresql://env";
    expect(resolveConnectionString("postgresql://explicit")).toBe("postgresql://explicit");
    expect(resolveConnectionString()).toBe("postgresql://env");
    delete process.env["NETLIFY_DB_URL"];
  });
});
