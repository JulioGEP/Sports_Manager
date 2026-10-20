# Despliegue y entornos

## Topología

Un solo proyecto Netlify, `hubsports`, sirve la web y la API en el mismo host (ADR 0010):

```
<club>.<dominio-base>
├── /api/*   → función Netlify `api` (apps/api, Hono), región fra
└── /*       → Next.js (apps/web) a través del adaptador OpenNext de Netlify, región fra
```

- La función de la API declara `path: "/api/*"` y `region: "fra"` en `apps/api/netlify/functions/api/api.mts`, y reexporta el bundle que genera esbuild (ADR 0013). Verificado: con el adaptador activo, `/api/*` lo atiende la función de la API y no Next.js.
- Next.js no define ninguna ruta bajo `/api`.
- Mismo host para web y API: cookies de host único y sin CORS.

## Configuración del proyecto en Netlify

Toda la configuración de build vive en `netlify.toml`, en la raíz del repo: comando de build, directorio de publicación, adaptador de Next.js, directorio de funciones y modo de desarrollo local. No hace falta ningún ajuste de build en la interfaz.

Cómo encaja el monorepo:

- Netlify no detecta Next.js en la raíz de un monorepo, así que el adaptador `@netlify/plugin-nextjs` se declara explícitamente en `[[plugins]]`. Netlify lo instala en cada build y lo mantiene actualizado; no se fija versión.
- El adaptador localiza la app por el manifiesto que genera `next build` (`relativeAppDir`), no por ajustes de interfaz. Para eso `apps/web/next.config.ts` fija `outputFileTracingRoot` en la raíz del repo.
- "Package directory" en la interfaz queda vacío. Si algún día se rellena con `apps/web`, el adaptador también funciona.

Ajustes que sí son de interfaz, una sola vez:

| Dónde | Ajuste | Valor |
|---|---|---|
| Project configuration → Cloud compute → Functions | Region | Frankfurt (`fra`) |
| Project configuration → Developer settings → Continuous deployment → Deploy Previews | Deploy Previews | activadas para todas las PR |

Notas:

- La región de funciones a nivel de proyecto cubre también las funciones que genera el adaptador de Next.js, que no admiten configuración en código. Tras cambiarla hay que volver a desplegar.
- La versión de Node la toma Netlify de `.nvmrc`.
- Variables de entorno de la API (Project configuration → Environment variables, ámbito "Functions", nunca en `netlify.toml`):

| Variable | Producción | Deploy preview | Notas |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | secreto propio | secreto propio, distinto | Marcada como secreto. Rotarla cierra todas las sesiones |
| `APP_BASE_DOMAIN` | `hubsports.netlify.app` | igual | Cambiará al dominio propio |
| `TENANT_FALLBACK_SLUG` | `demo` | `demo` | Club de reserva (ADR 0016) |
| `SESSION_COOKIE_DOMAIN` | vacía | vacía | Solo con dominio propio (ADR 0006) |
| `EMAIL_TRANSPORT` | `outbox` | `outbox` | Pasa a `resend` cuando haya dominio verificado (ADR 0018) |
| `RESEND_API_KEY` | pendiente | no | Marcada como secreto. Solo con transporte `resend` |
| `EMAIL_FROM` | pendiente | no | Remitente con el dominio verificado, por ejemplo `Sports Manager <no-reply@dominio>` |
| `EMAIL_DEBUG_LOG` | no definida | `true` | Escribe los emails en el log de la función. Nunca en producción |
| `PLATFORM_ADMIN_EMAILS` | emails separados por comas | igual | Administradores de plataforma además de la tabla (ADR 0023). Hoy: el email del responsable de producto |
| `LOGO_STORE` | no definida | no definida | Solo local: `memory` sustituye Netlify Blobs (servidor local y pruebas de interfaz, ADR 0025). Fuera de local la API se niega a arrancar con ese valor |

### Primer administrador de plataforma (ADR 0026)

1. Comprueba que tu email está en `PLATFORM_ADMIN_EMAILS` (contexto Production).
2. Abre `https://hubsports.netlify.app/admin/setup`, pon nombre, ese email y una contraseña, y pulsa **Crear cuenta y entrar**. Entras directamente en `/admin`.
3. A partir de ahí, la entrada del negocio es `https://hubsports.netlify.app/admin/login`. Las cuentas de club (por ejemplo `admin@demo.test`) no entran ahí.

Hazlo nada más desplegar: mientras la cuenta no exista, cualquiera que conozca un email autorizado podría crearla.

## Base de datos y entornos

| Entorno        | Base de datos                                                                             | Quién aplica las migraciones                                              |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Local          | Postgres local que arranca `pnpm dev`                                                     | Tú, con `pnpm db:migrate`                                                 |
| Deploy preview | Rama de base de datos por preview, creada por Netlify a partir de una copia de producción | Netlify, antes de publicar la preview. Si fallan, la preview falla        |
| Producción     | Base de producción                                                                        | Netlify, justo antes de publicar. Solo los deploys de producción la tocan |

Aprovisionamiento: `@netlify/database` está declarado en el `package.json` de la raíz (además de en `packages/db` y `apps/api`) porque Netlify decide si aprovisiona la base mirando las dependencias del proyecto. Si tras un deploy la base no aparece en Data & Storage → Database, se crea desde ahí con el botón de crear base de datos; a partir de entonces el deploy aplica las migraciones. La cadena de conexión llega a las funciones en `NETLIFY_DB_URL`.

Comprobado en el primer deploy de producción (20 de octubre de 2026): función `api` desplegada en `/api/*` con región `eu-central-1`, Blobs en `eu-central-1`, base aprovisionada y las dos migraciones aplicadas con snapshot al publicar.

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

Verificado el 20 de octubre de 2026 en producción tras mezclar la PR 6: `region` y `db.region` devuelven `eu-central-1` (Frankfurt).

## Emails (Bloque 4)

Hoy ningún email sale de la plataforma: el transporte es `outbox` (ADR 0018) y cada email queda guardado en la tabla `email_outbox`. Para probar:

- Invitaciones: la página Miembros muestra el enlace de aceptación con un botón de copiar mientras el transporte sea `outbox`. Compártelo con la persona invitada.
- Restablecer contraseña: en un deploy preview, el email completo (con el enlace) sale en el log de la función `api`. En Netlify: proyecto `hubsports` → Logs → Functions → `api`, con el deploy preview seleccionado. En producción nunca se escribe.
- Cuenta de demostración (ADR 0020): `admin@demo.test`, contraseña `123456`, administradora del club `demo`, que es el que se sirve en `hubsports.netlify.app` y en las previews. Cámbiale la contraseña o desactívala antes de tener datos reales.

Conectar Resend cuando exista el dominio propio (pasos según la documentación de Resend, https://resend.com/docs; compruébalos allí porque su interfaz cambia):

1. Crear la cuenta en Resend y añadir el dominio remitente en la sección de dominios. Resend da los registros DNS (SPF y DKIM) que hay que crear en el proveedor del dominio. Esperar a que marque el dominio como verificado.
2. Crear una clave de API con permiso de envío y copiarla una sola vez.
3. En Netlify, proyecto `hubsports` → Project configuration → Environment variables → Add a variable: `RESEND_API_KEY` (marcar como secreto, ámbito Functions, contexto Production) y `EMAIL_FROM` con el remitente del dominio verificado. Cambiar `EMAIL_TRANSPORT` de `outbox` a `resend` en el contexto Production.
4. Volver a desplegar: Deploys → Trigger deploy → Deploy project.
5. Probar con "Recuperar contraseña" desde el login y comprobar en Resend que el email aparece como entregado.

Las previews pueden seguir con `outbox` el tiempo que haga falta.

## Ficheros (Bloque 5)

Netlify Blobs con `region: "eu-central-1"` fijada en un único módulo de la API (`apps/api/src/data/logos.ts`, ADR 0024). Los stores de proyecto no siguen la región de las funciones y usarían Estados Unidos por defecto. Hoy solo hay un store, `logos`, compartido por producción y previews; las claves llevan el id del club. En `netlify dev`, Netlify CLI sirve un store local; en tests se usa uno en memoria.

Subdominios por club, parche local y pasos para el dominio definitivo: `docs/dominio-y-dns.md`.

## Desarrollo local

Requisitos: Node 22 (ver `.nvmrc`), pnpm 10 (`corepack enable` lo activa) y conexión a internet la primera vez: `netlify dev` descarga el entorno de Edge Functions (Deno) en el primer arranque.

```bash
pnpm install        # instala todo el workspace
pnpm dev            # netlify dev: Next en :3000, la función de la API y la base local, todo en http://localhost:8888
pnpm db:migrate     # aplica las migraciones pendientes a la base local
pnpm db:status      # qué migraciones están aplicadas
```

`pnpm dev` ejecuta `netlify dev --filter @sportsmanager/api` (el filtro es obligatorio en un monorepo). Dentro, `netlify.toml` lanza `pnpm run dev:servers`: esbuild en modo watch para la API y Next.js para la web. La API se empaqueta en un único fichero (ADR 0013), así que la función no depende de `node_modules` ni en local ni en producción.

Convención de código heredada de esa decisión: los imports relativos de `packages/shared`, `packages/db` y `apps/api` llevan extensión explícita (`./locales.ts`) y los diccionarios compartidos son módulos TypeScript, no JSON. Así los paquetes se pueden ejecutar también sin empaquetar.

Comprobaciones que ejecuta CI y que puedes lanzar en local:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:isolation
pnpm format:check
```

Si `netlify dev` no arranca, la API se puede servir sin Netlify CLI con Postgres embebido y las migraciones del repo, y la web con el reenvío de `/api` hacia ella:

```bash
pnpm --filter @sportsmanager/api build                                   # genera el bundle de la API
pnpm --filter @sportsmanager/api serve:local                             # API en http://127.0.0.1:9999/api/health (base embebida, emails en outbox, logos en memoria)
API_PROXY_TARGET=http://127.0.0.1:9999 pnpm --filter @sportsmanager/web dev   # Next en http://localhost:3000 reenviando /api a la API local
```

`API_PROXY_TARGET` se lee al construir o arrancar Next; en producción no existe y `/api` lo sirve la función en el mismo origen. El servidor local reconstruye el `Host` real a partir de `x-forwarded-host`, que es lo que envía el reenvío de Next, así que los subdominios de club (`http://<club>.sportsmanager.localhost:3000`) resuelven igual que en Netlify. Cuenta demo: `admin@demo.test` / `123456`; `PLATFORM_ADMIN_EMAILS=admin@demo.test` la convierte además en administradora de plataforma.

### Pruebas de interfaz (Bloque 8)

Playwright levanta esas dos piezas solo, en escritorio (1280x800) y móvil (Pixel 7), y guarda una captura de cada pantalla en `apps/web/e2e/screenshots`:

```bash
pnpm --filter @sportsmanager/api build
API_PROXY_TARGET=http://127.0.0.1:9999 pnpm --filter @sportsmanager/web build
pnpm exec playwright install chromium --with-deps   # una vez, desde apps/web
pnpm test:ui                                        # o `pnpm test:ui --project=escritorio`
```

En CI es el job `interfaz`; las capturas y el informe quedan en el artefacto `capturas-interfaz` de cada ejecución. Si Chromium ya está instalado en otra ruta, `PW_CHROMIUM_PATH` apunta al binario. Las pruebas no tocan ninguna base externa: cada ejecución arranca con una base vacía más las migraciones y el club demo.

Subdominios locales por club: `http://<club>.sportsmanager.localhost:8888` con `netlify dev`, o `:3000` con el servidor local (ver `docs/dominio-y-dns.md`).
