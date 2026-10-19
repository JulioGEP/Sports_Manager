import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandTokens, tokens } from "./tokens.ts";

function flattenValues(tree: unknown): string[] {
  if (typeof tree === "string" || typeof tree === "number") return [String(tree)];
  if (typeof tree !== "object" || tree === null) return [];
  return Object.values(tree).flatMap(flattenValues);
}

describe("design tokens", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  const cssEntries = [...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2]?.trim(),
  ]);

  it("todos los valores de tokens.css existen en tokens.ts", () => {
    const tsValues = new Set(flattenValues(tokens));
    for (const [name, value] of cssEntries) {
      expect(tsValues.has(String(value)), `${name}: ${value}`).toBe(true);
    }
  });

  it("los tokens de marca coinciden entre CSS y TS", () => {
    for (const [name, value] of Object.entries(brandTokens)) {
      const inCss = cssEntries.find(([n]) => n === name)?.[1];
      expect(inCss, name).toBe(value);
    }
  });
});
