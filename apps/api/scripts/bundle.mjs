// Empaqueta la API en un único fichero autocontenido para la función de Netlify.
// Motivo: el empaquetador de Netlify no incluye los paquetes del workspace con pnpm
// (ni en local ni en producción). Con el bundle, la función no importa nada de node_modules.
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** `pg` carga `pg-native` de forma opcional y perezosa. Se sustituye por un módulo vacío. */
const stubPgNative = {
  name: "stub-pg-native",
  setup(b) {
    b.onResolve({ filter: /^pg-native$/ }, () => ({ path: "pg-native", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "module.exports = null;",
      loader: "js",
    }));
  },
};

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/handler.ts"],
  outfile: "netlify/functions/api/handler.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  minify: false,
  legalComments: "none",
  logLevel: "info",
  plugins: [stubPgNative],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[api] esbuild en modo watch");
} else {
  await build(options);
}
