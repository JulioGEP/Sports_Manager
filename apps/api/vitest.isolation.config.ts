import { defineConfig } from "vitest/config";

/**
 * Tests de aislamiento: corren como job obligatorio en CI, separado del resto.
 * Incluyen el test de arquitectura (fronteras de importación) y los tests contra
 * una base de datos real embebida. En el Bloque 3 se añaden los tests de dos organizaciones.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.isolation.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
