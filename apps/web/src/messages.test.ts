import { LOCALES } from "@sportsmanager/shared";
import { describe, expect, it } from "vitest";
import ca from "../messages/ca.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

const messages = { es, ca, en } as const satisfies Record<(typeof LOCALES)[number], unknown>;

function flattenKeys(tree: unknown, prefix = ""): string[] {
  if (typeof tree !== "object" || tree === null) return [prefix];
  return Object.entries(tree).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("mensajes de la interfaz", () => {
  it("todos los idiomas tienen las mismas claves que el castellano", () => {
    const reference = flattenKeys(es).sort();
    for (const locale of LOCALES) {
      expect(flattenKeys(messages[locale]).sort(), locale).toEqual(reference);
    }
  });
});
