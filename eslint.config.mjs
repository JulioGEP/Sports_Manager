// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Paquetes que solo puede importar la capa de datos de apps/api.
 * Barrera de aislamiento: ni apps/web ni el resto de apps/api tocan la base de datos.
 * Las otras dos barreras: dependencias declaradas por paquete y apps/api/src/architecture.test.ts.
 */
const dataLayerOnly = [
  {
    name: "@sportsmanager/db",
    message: "Solo la capa de datos (apps/api/src/data) accede a la base.",
  },
  { name: "drizzle-orm", message: "Solo la capa de datos (apps/api/src/data) accede a la base." },
  { name: "pg", message: "Solo la capa de datos (apps/api/src/data) accede a la base." },
  {
    name: "@netlify/database",
    message: "Solo la capa de datos (apps/api/src/data) accede a la base.",
  },
];
const dataLayerOnlyPatterns = [
  {
    group: ["@sportsmanager/db/*", "drizzle-orm/*", "@netlify/database/*"],
    message: "Solo la capa de datos (apps/api/src/data) accede a la base.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.netlify/**",
      "**/dist/**",
      "**/coverage/**",
      "netlify/database/migrations/**",
      "apps/web/next-env.d.ts",
      "apps/api/netlify/functions/api/handler.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    // apps/web nunca accede a la base de datos.
    files: ["apps/web/**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-imports": ["error", { paths: dataLayerOnly, patterns: dataLayerOnlyPatterns }],
    },
  },
  {
    // Dentro de apps/api, solo src/data toca la base de datos.
    files: ["apps/api/**/*.{ts,mts}"],
    ignores: ["apps/api/src/data/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: dataLayerOnly, patterns: dataLayerOnlyPatterns }],
    },
  },
  prettier,
);
