# 0013. La API se empaqueta con esbuild en un único fichero

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

La función de Netlify de la API importa paquetes del workspace (`@sportsmanager/shared`, `@sportsmanager/db`) y dependencias de npm. Con pnpm, los paquetes del workspace son enlaces simbólicos dentro de `node_modules`. El empaquetador de Netlify no los incluye en el zip de la función: en producción la función se caía al arrancar con "Cannot find module .../@sportsmanager/shared/src/index.ts", y en desarrollo local resolvía las dependencias desde el paquete equivocado.

## Decisión

`apps/api/scripts/bundle.mjs` empaqueta `src/handler.ts` con esbuild en un único fichero autocontenido, `netlify/functions/api/handler.mjs` (formato ESM, destino Node 22, con mapa de fuentes). La función de Netlify, `netlify/functions/api/api.mts`, solo reexporta ese handler y declara la configuración (`path`, `region`). El bundle no importa nada de `node_modules`; `pg-native`, dependencia opcional de `pg`, se sustituye por un módulo vacío.

- Producción: `pnpm build` genera el bundle antes de que Netlify empaquete la función.
- Local: `pnpm dev` ejecuta esbuild en modo watch junto a Next.js, y `netlify dev` recarga la función al cambiar el bundle.
- CI ejecuta `pnpm build` para detectar errores de empaquetado antes del merge.
- El bundle no se commitea. Un fichero de tipos commiteado (`handler.d.mts`) permite el typecheck sin generar nada.
- El adaptador de Netlify de Hono (`hono/netlify`) está marcado como obsoleto; el handler propio son tres líneas que colocan el contexto de Netlify en `env.context`.

## Consecuencias

- La función no depende de cómo trate Netlify los enlaces de pnpm, ni en local ni en producción.
- Un solo fichero: arranque en frío más corto y zip más pequeño.
- Dos pasos de build en lugar de uno; esbuild tarda menos de un segundo.
- Las dependencias con binarios nativos no se pueden empaquetar así. Hoy no hay ninguna; si aparece una, se marca como externa y se revisa esta decisión.

## Alternativas descartadas

- Confiar en el empaquetador de Netlify: falla con pnpm y paquetes del workspace, en local y en producción.
- `node-linker=hoisted` en pnpm: habría funcionado, pero debilita el aislamiento de dependencias que sostiene la regla "apps/web no puede importar la base de datos".
- Publicar los paquetes del workspace compilados a JavaScript: más pasos de build y peor experiencia de desarrollo que un bundle único.
