# Despliegue y entornos

## Topología

Un solo proyecto Netlify, `hubsports`, sirve la web y la API en el mismo host (ADR 0010):

```
<club>.<dominio-base>
├── /api/*   → función Netlify `api` (apps/api, Hono), región fra
└── /*       → Next.js (apps/web) a través del adaptador OpenNext de Netlify, región fra
```

- La función de la API declara `path: "/api/*"` y `region: "fra"` en `apps/api/netlify/functions/api.mts`.
- Next.js no define ninguna ruta bajo `/api`.
- Mismo host para web y API: cookies de host único y sin CORS.

## Configuración del proyecto en Netlify

`netlify.toml` en la raíz fija el comando de build, el directorio de publicación, el directorio de funciones y el modo de desarrollo local. Lo que `netlify.toml` no puede fijar se configura en la interfaz:

| Dónde                                                                           | Ajuste            | Valor                       |
| ------------------------------------------------------------------------------- | ----------------- | --------------------------- |
| Project configuration → Build & deploy → Continuous deployment → Build settings | Base directory    | vacío (raíz del repo)       |
| Misma pantalla                                                                  | Package directory | `apps/web`                  |
| Misma pantalla                                                                  | Production branch | `main`                      |
| Project configuration → Cloud compute → Functions                               | Region            | Frankfurt (`fra`)           |
| Project configuration → Build & deploy → Deploy Previews                        | Deploy Previews   | activadas para todas las PR |

Notas:

- "Package directory" indica al adaptador de Next.js dónde está la aplicación. Es un ajuste solo de interfaz. El comando `pnpm build` funciona tanto si Netlify lo ejecuta en la raíz como en `apps/web`.
- La región de funciones a nivel de proyecto cubre también las funciones que genera el adaptador de Next.js, que no admiten configuración en código. Tras cambiarla hay que volver a desplegar.
- La versión de Node la toma Netlify de `.nvmrc`.
- No hace falta ninguna variable de entorno para el Bloque 1. Las que lleguen después se crean en Project configuration → Environment variables, por contexto y con ámbito "Functions" cuando las lea la API. Nunca en `netlify.toml`.

## Base de datos y entornos

| Entorno        | Base de datos                                                                             | Quién aplica las migraciones                                              |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Local          | Postgres local que arranca `pnpm dev`                                                     | Tú, con `pnpm db:migrate`                                                 |
| Deploy preview | Rama de base de datos por preview, creada por Netlify a partir de una copia de producción | Netlify, antes de publicar la preview. Si fallan, la preview falla        |
| Producción     | Base de producción                                                                        | Netlify, justo antes de publicar. Solo los deploys de producción la tocan |

Aprovisionamiento: `@netlify/database` está declarado en el `package.json` de la raíz (además de en `packages/db` y `apps/api`) porque Netlify decide si aprovisiona la base mirando las dependencias del proyecto. Si tras un deploy la base no aparece en Data & Storage → Database, se crea desde ahí con el botón de crear base de datos; a partir de entonces el deploy aplica las migraciones. La cadena de conexión llega a las funciones en `NETLIFY_DB_URL`.

Comprobado en la primera deploy preview (19 de octubre de 2026): función `api` desplegada en `/api/*` con región `eu-central-1`, Blobs en `eu-central-1`, sin base de datos aprovisionada todavía.

Reglas de migraciones (ADR 0003):

1. El esquema vive en `packages/db/src/schema.ts`.
2. `pnpm db:generate` escribe una migración SQL en `netlify/database/migrations/` con prefijo de fecha y hora. Nombre descriptivo: `pnpm --filter @sportsmanager/db exec drizzle-kit generate --name <nombre>`.
3. Migraciones de datos (semillas, correcciones) se escriben a mano en el mismo directorio, con el mismo formato de nombre.
4. Se commitean esquema y migración juntos. Nadie aplica migraciones a mano contra una base alojada.
5. Una migración aplicada en cualquier sitio es inmutable. Corregir es escribir otra.
6. Cambios que rompen (renombrar o borrar columnas) en tres deploys: expandir, migrar, contraer.

Para que ningún cambio de esquema llegue a producción sin pasar por preview, en GitHub (Settings → Branches → `main`) hay que exigir estos checks antes de mezclar:

- `lint, typecheck y tests`
- `aislamiento`
- el check de deploy preview de Netlify (`netlify/hubsports/deploy-preview`)

Aviso: las ramas de preview nacen con una copia de los datos de producción y las URLs de preview son públicas. En la Fase 0 no hay datos reales. Antes de la Fase 1 hay que proteger las previews.

## Verificación de región

En cada deploy preview, abre `/api/health`. La respuesta trae:

- `region`: región de la función. Debe ser `fra`.
- `db.region`: región del servidor de base de datos, deducida del host de conexión. Debe ser una región de la UE (`eu-central-1` para Frankfurt).

Si cualquiera de las dos no es UE, se para el trabajo y se revisa la configuración antes de seguir.

## Ficheros (Bloque 5)

Netlify Blobs con `region: "eu-central-1"` en todas las llamadas, centralizado en un único módulo de la API. Los stores de proyecto no siguen la región de las funciones y usarían `us-east-2` por defecto.

## Desarrollo local

Requisitos: Node 22 (ver `.nvmrc`), pnpm 10 (`corepack enable` lo activa) y conexión a internet la primera vez: `netlify dev` descarga el entorno de Edge Functions (Deno) en el primer arranque.

```bash
pnpm install        # instala todo el workspace
pnpm dev            # netlify dev: Next en :3000, la función de la API y la base local, todo en http://localhost:8888
pnpm db:migrate     # aplica las migraciones pendientes a la base local
pnpm db:status      # qué migraciones están aplicadas
```

`pnpm dev` ejecuta `netlify dev --filter @sportsmanager/api`. El filtro es necesario en un monorepo y se apunta a la API, no a la web, porque en desarrollo el CLI no empaqueta las dependencias de la función: las resuelve desde el `node_modules` del paquete filtrado, y es `apps/api` el que las tiene.

Consecuencia para el código: en desarrollo, Node ejecuta `packages/shared` y `packages/db` como TypeScript sin compilar. Por eso los imports relativos de esos paquetes y de `apps/api` llevan extensión explícita (`./locales.ts`) y los diccionarios compartidos son módulos TypeScript, no JSON. En producción Netlify empaqueta todo con esbuild y la regla no haría falta, pero se mantiene para que local y producción se comporten igual.

Comprobaciones que ejecuta CI y que puedes lanzar en local:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:isolation
pnpm format:check
```

Si `netlify dev` no arranca, las dos piezas se pueden levantar por separado:

```bash
pnpm --filter @sportsmanager/web dev                        # Next en http://localhost:3000
pnpm exec netlify functions:serve --filter @sportsmanager/api   # función de la API en http://localhost:9999/api/health
```

En ese modo la web no encuentra `/api` en su mismo origen y el widget de estado marcará error; es normal.

Subdominios locales por club (`<club>.sportsmanager.localhost:8888`) llegan en el Bloque 5.
