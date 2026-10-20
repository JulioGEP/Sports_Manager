import { describe, expect, it } from "vitest";
import ca from "../messages/ca.json";
import es from "../messages/es.json";

function flattenKeys(tree: unknown, prefix = ""): string[] {
  if (typeof tree !== "object" || tree === null) return [prefix];
  return Object.entries(tree).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("mensajes de la interfaz", () => {
  it("castellano y catalán tienen las mismas claves", () => {
    expect(flattenKeys(ca).sort()).toEqual(flattenKeys(es).sort());
  });
});
