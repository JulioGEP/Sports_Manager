import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Segunda barrera del aislamiento (ADR 0009), independiente de ESLint:
 * recorre el código fuente y falla si alguien importa la base de datos fuera de la capa de datos.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE_DIRS = ["apps/web", "apps/api"];
const DATA_LAYER = join("apps", "api", "src", "data");
const FORBIDDEN = ["@sportsmanager/db", "drizzle-orm", "pg", "@netlify/database"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".netlify", "dist", "coverage"]);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SOURCE_EXT.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const IMPORT_PATTERN = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((m) => m[1] ?? "");
}

describe("fronteras de importación", () => {
  const files = SOURCE_DIRS.flatMap((dir) => walk(join(REPO_ROOT, dir)));

  it("encuentra código fuente que revisar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("nadie importa la base de datos fuera de apps/api/src/data", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      if (rel.startsWith(DATA_LAYER + sep)) continue;
      for (const spec of importsOf(file)) {
        if (FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`))) {
          violations.push(`${rel} importa ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("apps/web no declara dependencias de acceso a datos", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "apps/web/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((d) => FORBIDDEN.includes(d))).toEqual([]);
  });
});
