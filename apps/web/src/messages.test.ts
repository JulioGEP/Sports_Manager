import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import ca from "./messages/ca.json";
import en from "./messages/en.json";
import es from "./messages/es.json";

type Nested = { [key: string]: string | Nested };
function flatten(input: Nested, prefix = ""): [string, string][] {
  return Object.entries(input).flatMap(([k, v]) =>
    typeof v === "string"
      ? [[`${prefix}${k}`, v] as [string, string]]
      : flatten(v, `${prefix}${k}.`),
  );
}

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

  it("todos los textos son ICU válido y se pueden formatear en los tres idiomas", () => {
    for (const [locale, dictionary] of [
      ["es", es],
      ["ca", ca],
      ["en", en],
    ] as const) {
      const messages = Object.fromEntries(flatten(dictionary));
      const errors: string[] = [];
      const intl = createIntl(
        { locale, messages, onError: (err) => errors.push(`${locale}: ${err.message}`) },
        createIntlCache(),
      );
      for (const [id, text] of Object.entries(messages)) {
        // Un valor para cada argumento: 1 vale como número (plural), texto y opción (select → other).
        const values: Record<string, number> = {};
        for (const m of text.matchAll(/\{\s*(\w+)/g)) if (m[1]) values[m[1]] = 1;
        intl.formatMessage({ id }, values);
      }
      expect(errors).toEqual([]);
    }
  });
});
