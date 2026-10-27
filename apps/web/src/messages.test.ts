import { AUDIT_ACTIONS } from "@sportsmanager/shared";
import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import ca from "./messages/ca.json";
import en from "./messages/en.json";
import es from "./messages/es.json";
import caVoices from "./messages/voices/ca.json";
import enVoices from "./messages/voices/en.json";
import esVoices from "./messages/voices/es.json";

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

/**
 * Voz del club (ADR 0043, DESIGN.md 11): las capas de `profesional` y `vestuario` solo reescriben
 * momentos de relación. Nada de dinero, salud, errores, accesos, bajas ni datos personales.
 */
const VOICE_NAMESPACES = new Set([
  "home",
  "team",
  "players",
  "player",
  "family",
  "familyPlayer",
  "challenges",
  "challengesCard",
  "familyChallenge",
  "challenge",
  "sections",
  "section",
  "attendance",
  "clubMembers",
  "agenda",
  "facilities",
  "matches",
  "match",
  "session",
  "training",
  "drills",
]);
const SENSITIVE_KEY =
  /(remove|delete|deactivate|archive|revoke|confirm|error|fail|payment|consent|health|injur|password|privacy|wellness|rpe)/i;
/** Cuotas: `fee`, `fees`, `feeStatus`… pero no `feedEmpty` (el registro del partido). */
const FEE_KEY = /(^|\.)fees?(?![a-z])|Fees?(?![a-z])/;

/** Nombres de los argumentos ICU de un texto: los de la capa tienen que ser los mismos. */
function argumentsOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\s*(\w+)/g)].map((m) => m[1]!))].sort();
}

describe("voz del club en la web", () => {
  const layers = { es: esVoices, ca: caVoices, en: enVoices } as const;
  const base = {
    es: Object.fromEntries(flatten(es)),
    ca: Object.fromEntries(flatten(ca)),
    en: Object.fromEntries(flatten(en)),
  };

  it("las dos voces tienen las mismas claves en los tres idiomas", () => {
    for (const voice of ["profesional", "vestuario"] as const) {
      const keysOf = (locale: keyof typeof layers) => Object.keys(layers[locale][voice]).sort();
      expect(keysOf("ca")).toEqual(keysOf("es"));
      expect(keysOf("en")).toEqual(keysOf("es"));
    }
  });

  it("cada texto de voz reescribe uno que existe, con los mismos argumentos y en ICU válido", () => {
    for (const locale of ["es", "ca", "en"] as const) {
      for (const [voice, layer] of Object.entries(layers[locale])) {
        const errors: string[] = [];
        const intl = createIntl(
          {
            locale,
            messages: { ...base[locale], ...layer },
            onError: (err) => errors.push(`${locale}/${voice}: ${err.message}`),
          },
          createIntlCache(),
        );
        for (const [id, text] of Object.entries(layer)) {
          expect(base[locale][id], `${locale}/${voice}: ${id} no existe`).toBeDefined();
          expect(argumentsOf(text), `${locale}/${voice}: ${id}`).toEqual(
            argumentsOf(base[locale][id]!),
          );
          const values: Record<string, number> = {};
          for (const name of argumentsOf(text)) values[name] = 1;
          intl.formatMessage({ id }, values);
        }
        expect(errors).toEqual([]);
      }
    }
  });

  it("ninguna voz toca un momento sensible", () => {
    for (const voice of ["profesional", "vestuario"] as const) {
      for (const id of Object.keys(esVoices[voice])) {
        expect(VOICE_NAMESPACES.has(id.split(".")[0]!), `${voice}: ${id}`).toBe(true);
        expect(SENSITIVE_KEY.test(id) || FEE_KEY.test(id), `${voice}: ${id}`).toBe(false);
      }
    }
  });

  it("sin emojis en ninguna voz", () => {
    for (const layer of Object.values(layers))
      for (const texts of Object.values(layer))
        for (const text of Object.values(texts))
          expect(/\p{Extended_Pictographic}/u.test(text), text).toBe(false);
  });
});

/** La pestaña Actividad de Ajustes traduce cada acción de la auditoría: ninguna sale en crudo. */
describe("acciones de la actividad", () => {
  it("cada acción de la auditoría tiene su texto en los tres idiomas", () => {
    for (const [locale, dictionary] of [
      ["es", es],
      ["ca", ca],
      ["en", en],
    ] as const) {
      const messages = Object.fromEntries(flatten(dictionary));
      const missing = AUDIT_ACTIONS.filter((action) => !messages[`audit.${action}`]);
      expect(missing, locale).toEqual([]);
    }
  });
});
