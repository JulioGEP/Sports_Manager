import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales.ts";
import { messages, t } from "./index.ts";

function flattenKeys(tree: unknown, prefix = ""): string[] {
  if (typeof tree !== "object" || tree === null) return [prefix];
  return Object.entries(tree).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("diccionarios compartidos", () => {
  it("tienen exactamente las mismas claves en todos los idiomas", () => {
    const reference = flattenKeys(messages.es).sort();
    for (const locale of LOCALES) {
      expect(flattenKeys(messages[locale]).sort(), `idioma ${locale}`).toEqual(reference);
    }
  });

  it("no tienen textos vacíos", () => {
    for (const locale of LOCALES) {
      for (const key of flattenKeys(messages[locale])) {
        expect(t(locale, key as never).trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("traduce y sustituye parámetros", () => {
    expect(t("ca", "errors.not_found")).toBe("No s'ha trobat el que busques.");
    expect(t("es", "errors.internal")).toBe("Ha ocurrido un error inesperado.");
  });
});
