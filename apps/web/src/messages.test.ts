import { describe, expect, it } from "vitest";
import ca from "./messages/ca.json";
import en from "./messages/en.json";
import es from "./messages/es.json";

type Nested = { [key: string]: string | Nested };
function keys(input: Nested, prefix = ""): string[] {
  return Object.entries(input).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

describe("diccionarios de la web", () => {
  it("catalán e inglés tienen exactamente las mismas claves que el castellano", () => {
    const base = keys(es).sort();
    expect(keys(ca).sort()).toEqual(base);
    expect(keys(en).sort()).toEqual(base);
  });
});
