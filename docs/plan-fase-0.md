# Plan Fase 0: fundamentos del SaaS

Estado: aprobado el 19 de octubre de 2026 para el Bloque 0. Decisiones del Bloque 1 respondidas abajo, salvo la pregunta 11, pendiente.
Fecha: 19 de octubre de 2026.

## 1. Punto de partida verificado

| Elemento | Estado | Cómo lo he verificado |
|---|---|---|
| Repo | Prototipo de un club, 22 ficheros, sin datos reales. Rama de trabajo `claude/affectionate-goodall-njy41w` limpia | Lectura del repo y `git status` |
| Netlify | Equipo "GEP Group", plan Pro (`nf_team_pro`), tú eres Owner. Proyecto existente `hubsports` (id `459679bd-596d-4905-bec0-c08963da2be6`), URL `hubsports.netlify.app`, con un deploy publicado, sin protección por contraseña. El lector del MCP no muestra dominio personalizado, región de funciones, base de datos ni repositorio conectado; eso lo compruebo en la interfaz al empezar el Bloque 1 | Lectura de tu cuenta vía MCP de Netlify y tu indicación del proyecto |
| Región de Functions | Seleccionable en plan Pro. Códigos UE disponibles: `fra` (Frankfurt), `dub` (Dublín), `lhr` (Londres, fuera de la UE). Por defecto `cmh` (Ohio) | Documentación oficial de Netlify Functions vía MCP |
| Región de Blobs | `eu-central-1` disponible. Los stores de proyecto usan `us-east-2` por defecto y no siguen la región de las funciones: hay que pasar `region` en cada llamada | Documentación oficial de Netlify Blobs vía MCP |
| Región de Netlify DB | No la he podido verificar. La documentación oficial que he podido leer no lista regiones. La API REST acepta un parámetro `region` opcional al crear la base. El anuncio de Netlify dice que la base se crea en la región de las funciones. Neon, el motor subyacente, fija la región al crear el proyecto y no permite cambiarla | Documentación vía MCP, blog de Netlify, documentación de Neon |
| Netlify DB y plan | La documentación dice "disponible solo en planes basados en créditos". Tu plan aparece como "Pro" pero no sé si es la variante basada en créditos | Documentación vía MCP y lectura de la cuenta |
| Subdominios comodín | Según respuestas del personal de Netlify en su foro: plan Pro o superior, lo activa soporte a petición, requiere Netlify DNS para el certificado comodín (o aportar un certificado propio) y no admite alias de dominio en ese proyecto. No he encontrado página oficial de documentación | Foro de Netlify |
| Cookies entre subdominios en previews | Imposible: `netlify.app` está en la Public Suffix List. Las previews solo funcionan con cookies de host único | Documentación oficial vía MCP |
| Better Auth | Existen `emailAndPassword.disableSignUp` y `advanced.crossSubDomainCookies` | Documentación oficial de Better Auth (referencia de opciones y página de cookies) |
| Hono en Netlify | Adaptador oficial `hono/netlify`; la ruta se fija con el `config.path` de Netlify | Documentación de Hono (espejos) y de Netlify Functions |

Dos cosas que no puedo garantizar y que tratan como bloqueo según tu regla:

1. **Región UE de Netlify DB.** Propongo verificarla como primer paso del Bloque 1: fijar la región de funciones del proyecto en `fra`, aprovisionar la base y comprobar la región real en la cadena de conexión y en la interfaz de Netlify. Si no es UE, paro y te aviso antes de escribir una sola migración.
2. **Plan basado en créditos.** Si al aprovisionar sale el error "database feature not available for this account", paro y te aviso. La alternativa sería cambiar el plan en Netlify, no usar otra base.

## 2. Decisiones técnicas que propongo

Cada una irá a `docs/decisions/` como ADR cuando la apruebes.

### 2.1 Framework de la API: Hono

Coincide con tu preferencia. Justificación:

- Trabaja con `Request` y `Response` estándar, que es exactamente el contrato de Netlify Functions moderno. No hace falta un adaptador tipo `serverless-http` como con Express o NestJS.
- Adaptador oficial para Netlify y para Node, así los tests corren sin Netlify.
- Paquete pequeño. En Lambda el arranque en frío pesa, y NestJS o Fastify arrastran mucho más código.
- TypeScript de primera clase. Rutas tipadas y `@hono/zod-openapi` para generar OpenAPI desde los mismos esquemas Zod que viven en `packages/shared`.
- Better Auth documenta su integración con Hono.
- Su modelo de middleware encaja con la cadena subdominio → sesión → pertenencia que pides.

Descartados: NestJS (pesado para Lambda, decoradores, más ceremonia que valor en este tamaño), Fastify (necesita adaptador y no aporta nada aquí), Express (API legacy, sin tipos), Elysia (pensado para Bun).

### 2.2 ORM: Drizzle

- Es el ORM que Netlify DB documenta como primera opción, con adaptador propio y con el formato de migraciones que Netlify aplica en cada deploy.
- Migraciones en SQL plano, versionadas y legibles en la PR.
- Sin binarios de motor. Prisma arrastra engines y no tiene integración documentada con Netlify DB.
- Tipos inferidos del esquema y escape a SQL crudo cuando haga falta.

Aviso: la documentación de Netlify exige `drizzle-orm@beta` para su adaptador nativo. Para no depender de una beta, propongo Drizzle estable con el driver `pg` y `getConnectionString()` de `@netlify/database`, que la documentación también contempla. Lo decido en el Bloque 1 según las versiones publicadas ese día y lo dejo en ADR.

Regla que impone Netlify y que adopto: ningún cambio de esquema se aplica a mano contra una base alojada. Solo ficheros de migración commiteados, aplicados por el deploy. Previews primero, producción al publicar.

### 2.3 Email transaccional: Resend, con una reserva

- Mejor experiencia de desarrollo del mercado, SDK TypeScript, plantillas, webhooks de entrega.
- Envío desde región UE (Irlanda).

Reserva que debes valorar: según la documentación oficial de Resend, los datos de cuenta, metadatos de email, logs y registros de API se almacenan en Estados Unidos aunque envíes desde Irlanda. Los emails de Fase 0 llevan nombre, email y un enlace de invitación. Si quieres residencia UE completa también para logs, las alternativas son Scaleway Transactional Email o Brevo. No he verificado precios ni límites de ninguno.

### 2.4 Topología de despliegue: un solo proyecto Netlify

```
club.sportsmanager.com
├── /api/*   → Netlify Function propia (apps/api, Hono), región fra
└── /*       → Next.js vía adaptador OpenNext de Netlify, funciones en región fra
```

- Base del proyecto: raíz del repo. "Package directory" (ajuste solo de interfaz): `apps/web`. Directorio de funciones: `apps/api/netlify/functions`.
- Mismo host para web y API: cookies de host único, sin CORS.
- Región de funciones fijada a nivel de proyecto en `fra` (cubre las funciones generadas por Next.js, que no admiten configuración en código) y además `region: "fra"` en la función de la API.

Riesgo que no he podido cerrar con documentación: la precedencia entre una función propia con `path: "/api/*"` y la función comodín que genera el adaptador de Next.js. El Bloque 1 incluye una prueba de concepto en deploy preview para confirmarlo. Plan B si falla: dos proyectos Netlify (web y api) con una regla de proxy `/api/*` desde el proyecto web, que mantiene el mismo origen para el navegador. El plan B tiene una pega: la API no recibiría el host original del club de forma documentada, y habría que resolverlo con una cabecera firmada. Prefiero no llegar ahí.

### 2.5 Login único entre clubes: cookie de sesión en el dominio padre

La sesión de Better Auth se emite con `Domain=.sportsmanager.com`. Así una sola sesión vale en todos los subdominios y "cambiar de club" es navegar a otro subdominio. La API comprueba la pertenencia en cada petición, así que compartir la cookie no abre acceso a nada.

Consecuencia que debes conocer: si en el futuro un club usa dominio propio, el login no se compartirá con ese dominio. Se resolverá entonces.

En previews (`*.netlify.app`) y en local la cookie es de host único o del dominio local. Configuración por contexto.

### 2.6 Resolución del club por entorno

| Entorno | Cómo se resuelve la organización |
|---|---|
| Producción | Primera etiqueta del host: `club.sportsmanager.com` → `club` |
| Local | `club.sportsmanager.localhost:8888` → `club`. Chromium acepta cookies de dominio en `*.localhost` siempre que el dominio tenga un punto, por eso el nivel intermedio. Firefox y Safari sin verificar. Alternativa: entradas en `/etc/hosts` con un dominio `.test` |
| Deploy preview | No hay subdominios posibles. La organización se fija con una variable de entorno de servidor del contexto `deploy-preview` (`TENANT_OVERRIDE_SLUG`). Es configuración del servidor, no un dato del cliente, así que no rompe la regla de "nunca confiar en un organization_id del front" |

Subdominios reservados que no son clubes: `www`, `admin`, `api`, `app`, `staging`, `mail`. Lista en código y validada al crear organizaciones.

### 2.7 Aislamiento por código: cadena de la petición

```
Request
  1. resolveOrganization   Host → slug → organización. Reservado o desconocido → 404.
  2. authenticate          cookie → sesión Better Auth → usuario. Falta → 401.
  3. authorize             membership(usuario, organización) → rol. Falta → 403.
  4. handler               recibe un contexto {organization, user, membership, role}.
  5. data layer            única entrada a packages/db. Toda consulta recibe el contexto
                           y añade organization_id. No existe función de consulta sin él.
```

El panel interno (`admin.sportsmanager.com`) usa otra cadena: sesión → `platform_admins` → acceso. No resuelve club.

Guardas automáticas:

- ESLint `no-restricted-imports`: `@sportsmanager/db`, `drizzle-orm` y `pg` prohibidos en `apps/web` y, dentro de `apps/api`, fuera de `src/data/**`.
- `apps/web` no declara `@sportsmanager/db` como dependencia: pnpm y TypeScript fallan también.
- Test de arquitectura en Vitest que recorre los ficheros y falla si encuentra esas importaciones fuera de sitio. Doble barrera por si alguien desactiva una regla de lint.
- Tests de aislamiento con dos organizaciones (detalle en Bloque 3), job obligatorio en CI.

### 2.8 Roles como datos

- Tabla `roles` (`code`, `name`, `scope`): añadir un rol es un `INSERT` en una migración de datos, nunca un cambio de tipo. Semilla: `org_admin`, `coach`, `guardian`.
- `memberships.role_id` referencia `roles`.
- `platform_admin` no es una pertenencia: tabla `platform_admins` (`user_id`, `granted_at`). Solo se escribe por migración de datos o script de operaciones. La API no expone ningún endpoint que la toque.
- Permisos: mapa rol → permisos en `packages/shared` (por ejemplo `org.members.invite`, `org.settings.write`). La API comprueba permisos, no nombres de rol.

### 2.9 Entornos y bases de datos

| Entorno | Base de datos | Migraciones |
|---|---|---|
| Local | Postgres local que arranca `netlify dev` (o `@netlify/database-dev` en tests) | `netlify database migrations apply`, manual |
| Deploy preview | Rama de base de datos por preview, creada por Netlify | Las aplica el deploy antes de publicar la preview. Si fallan, la preview falla y la PR queda bloqueada |
| Producción | Base de producción | Las aplica el deploy justo antes de publicar. Solo los deploys de producción la tocan |

Para que "ningún cambio llegue a producción sin pasar por preview" sea una garantía y no una costumbre: protección de rama en GitHub con checks obligatorios (CI y el check de deploy preview de Netlify). Eso lo configuras tú en GitHub; te doy la lista exacta.

Aviso importante de la documentación: las ramas de preview se crean con una copia de los datos de producción y las URLs de preview son públicas. En Fase 0 no hay datos reales. Antes de la Fase 1, con datos de menores, hay que decidir cómo se protegen las previews (contraseña en deploys no productivos y, si Netlify lo permite, ramas de preview a partir de una rama sin datos personales). Lo dejo en riesgos.

### 2.10 i18n

- Web: `next-intl` con mensajes en `es` y `ca`. Es la librería estándar para App Router, con tipado de claves.
- API y emails: diccionarios `es` y `ca` en `packages/shared/i18n` y un renderizador de plantillas sencillo. Mismo origen de textos para web y email donde tenga sentido.
- Resolución de idioma: `users.locale` → `organizations.default_locale` → `es`.
- La estructura se monta en el Bloque 1, para que todo lo que se construya después ya la use. El Bloque 7 cierra el idioma por usuario y la revisión de textos.

## 3. Bloques, orden y esfuerzo

Esfuerzo en días de trabajo efectivo míos. Es una estimación, no un compromiso. No incluye tu tiempo de revisión, esperas de soporte de Netlify ni imprevistos de las pruebas de concepto. El tiempo de calendario depende de la cadencia de revisión de PRs.

| Orden | Bloque | Entregable principal | Esfuerzo | Depende de |
|---|---|---|---|---|
| 1 | B0 Limpieza | `docs/dominio.md`, tokens extraídos, repo vacío de prototipo y de Firebase | 1 día | Aprobación del plan |
| 2 | B1 Base técnica | Monorepo, tooling, CI, Netlify configurado, prueba de concepto de despliegue y verificación de región | 4 a 5 días | B0, respuestas a preguntas bloqueantes |
| 3 | B2 Modelo de datos | Esquema Drizzle, migraciones iniciales, semillas | 1 a 2 días | B1 |
| 4 | B3 Aislamiento | Cadena de petición, capa de datos, reglas de lint, tests de aislamiento en CI | 3 a 4 días | B2 |
| 5 | B4 Auth e invitaciones | Login, recuperación, invitaciones, emails es/ca | 3 a 4 días | B3 |
| 6 | B5 Multi-tenant y marca | Resolución de subdominio en web, selector de club, marca por CSS, logos en Blobs, guía de DNS | 3 a 4 días | B4 |
| 7 | B6 Admin interno | Crear y listar organizaciones, marca, invitar primer admin | 2 a 3 días | B5 |
| 8 | B7 i18n | Idioma por usuario con fallback, revisión de textos y emails | 1 a 2 días | B6 |
| | **Total** | | **18 a 25 días** | |

Un ajuste de frontera entre bloques que te pido aprobar: el Bloque 3 incluye la instancia de Better Auth y la validación de sesión, porque sus tests necesitan sesiones reales ("acceso con sesión válida a un subdominio sin pertenencia"). El Bloque 4 añade los flujos de usuario: login, recuperación, invitaciones y emails.

## 4. Detalle por bloque

### B0. Limpieza del prototipo

Qué hago:

- `docs/dominio.md`: entidades, campos, flujos y reglas extraídos del prototipo. Flujo invitación → registro → vínculo; varios tutores por jugador; los 11 roles de staff y su mapeo a los 4 roles de Fase 0; el reto por puntos y sus reglas; criterios de completitud de perfil y alertas. Todo marcado como "conocimiento del prototipo", no como requisito.
- `packages/shared/design/tokens.css` y `tokens.ts`: colores, tipografía, espaciado, radios, sombras y movimiento de `src/design/tokens.css`, renombrados sin prefijo de club. Se señalan los tokens que pasarán a ser marca por club.
- `docs/informe-sportsmanager.md`: el informe de auditoría, para que la referencia del prompt exista en el repo.
- `docs/plan-fase-0.md`: este plan, una vez aprobado.
- Borrado: todo `js/`, `src/`, `index.html`, `design-system.html`, `styles.css`, `firestore.rules`, `netlify.toml`, `assets/logo-ae-eixample.png`, documentación en catalán del prototipo. Ninguna referencia a Firebase queda en el repo. Comprobación: `git grep -i firebase` vacío.

Cómo lo pruebas: abres `docs/dominio.md`, compruebas que el repo solo contiene `docs/`, `packages/shared/design/` y el README nuevo, y ejecutas `git grep -il "firebase\|firestore\|eixa\|eixample"` con resultado vacío.

Pendiente al cerrar: nada funcional. Es un bloque de borrado y documentación.

### B1. Base técnica y monorepo

Qué hago:

- `pnpm-workspace.yaml`, `apps/web`, `apps/api`, `packages/shared`, `packages/db`. Node fijado en `.nvmrc` y `engines`.
- TypeScript strict con `tsconfig` base compartido. ESLint (flat config) y Prettier en raíz. Vitest por paquete.
- `apps/api`: Hono con `@hono/zod-openapi`, endpoint `/api/health`, `/api/openapi.json` y `/api/docs`. Función Netlify en `apps/api/netlify/functions/api.mts` con `path: "/api/*"` y `region: "fra"`.
- `apps/web`: Next.js App Router mínimo, con `next-intl` ya montado (es/ca).
- `packages/db`: Drizzle, `drizzle.config.ts` con salida en el directorio de migraciones que Netlify aplica. Verifico si ese directorio es configurable o debe estar en `netlify/database/migrations` relativo a la base del proyecto.
- Proyecto Netlify: se reutiliza `hubsports`. Antes de tocar nada compruebo en la interfaz: repositorio y rama conectados, ajustes de build, región de funciones, si ya existe una base de datos o un dominio personalizado. Si hay una base ya creada fuera de la UE, paro y te aviso.
- `netlify.toml` en raíz: build, directorio de funciones, contextos. Variables de entorno por contexto solo en Netlify, nunca en el toml.
- Un comando: `pnpm dev` arranca `netlify dev`, que levanta Next, la función de la API y la base local.
- `.env.example` documentado. `.gitignore` con `.netlify` y `.env`.
- CI en GitHub Actions: `lint`, `typecheck`, `test`, `isolation` (este último queda definido aquí y se rellena en B3). Postgres en CI con `@netlify/database-dev`; si no funciona en el runner, contenedor de servicio Postgres.
- `docs/deploy.md`: cómo se despliega, por qué un solo proyecto, cómo responde la API en `/api`, qué hay que configurar en la interfaz de Netlify (package directory, región de funciones, variables).
- Prueba de concepto en deploy preview: página Next, `/api/health` servido por Hono desde `fra`, conexión a Netlify DB con comprobación de región, escritura y lectura de un blob en `eu-central-1`.
- ADRs 0001 a 0005.

Paso bloqueante dentro del bloque: verificación de región de la base. Si no es UE, paro.

Cómo lo pruebas: `pnpm install && pnpm dev`, abres la web y `/api/health`; abres la deploy preview de la PR y repites; en Netlify compruebas región de funciones y región de la base; CI en verde.

### B2. Modelo de datos mínimo

Tablas:

| Tabla | Campos |
|---|---|
| `organizations` | `id`, `slug` único, `name`, `default_locale`, `default_sport_id`, `brand_primary_color`, `brand_secondary_color`, `logo_blob_key`, `status`, `created_at`, `updated_at` |
| `sports` | `id`, `code`, `name_es`, `name_ca`, `config` JSON. Semilla: fútbol sala |
| `users`, `sessions`, `accounts`, `verifications` | Las que genera Better Auth, más `users.locale` |
| `roles` | `id`, `code`, `scope`, `name`. Semilla: `org_admin`, `coach`, `guardian` |
| `memberships` | `id`, `user_id`, `organization_id`, `role_id`, `status`, `created_at`. Única por usuario y organización |
| `invitations` | `id`, `organization_id`, `email`, `role_id`, `token_hash`, `expires_at`, `status`, `invited_by`, `accepted_by`, `accepted_at` |
| `platform_admins` | `user_id`, `granted_at` |

Índices por `organization_id` en todo lo que lo lleva. Identificadores UUID. Sin jugadores, equipos ni secciones.

Cómo lo pruebas: `netlify database migrations apply` en local sin errores; `netlify database status` muestra las migraciones aplicadas; la preview de la PR aplica las migraciones en su rama.

### B3. Aislamiento entre clubes

Qué hago:

- Middleware `resolveOrganization`, `authenticate`, `authorize` y el contexto tipado.
- Instancia de Better Auth con adaptador Drizzle y validación de sesión (sin flujos de usuario todavía).
- `apps/api/src/data/`: repositorios que exigen el contexto. Ninguna función acepta `organization_id` como parámetro suelto.
- Reglas de lint y test de arquitectura descritos en 2.7.
- Endpoints mínimos para poder probar: `GET /api/me`, `GET /api/org`, `GET/POST /api/org/members` (solo para tests; la gestión real llega en B4 y B6).
- Asignación de rol: solo `org_admin` de esa organización o `platform_admin`. Intentar asignar `platform_admin` vía API devuelve error siempre.
- Tests de aislamiento en Vitest contra el app de Hono con `app.request()`, cabecera `Host` y cookie de sesión real:
  - Usuario A, admin del club 1. Usuario B, coach del club 2. Usuario C, miembro de ambos. Usuario D, con sesión y sin pertenencias.
  - Lectura cruzada: A pide datos en el host del club 2 → 403.
  - Escritura cruzada: A intenta crear o modificar en el club 2 → 403 y la base no cambia.
  - Escalada: B intenta cambiar su propio rol → 403. A intenta asignar un rol en el club 2 → 403. Cualquiera intenta `platform_admin` → rechazado.
  - Sesión válida sin pertenencia: D entra en cualquier subdominio → 403.
  - C entra en los dos clubes con la misma sesión y obtiene en cada uno solo su rol.
  - Host desconocido o reservado → 404.
- Job `isolation` obligatorio en CI.

Cómo lo pruebas: `pnpm test:isolation` en local; en la PR, el check `isolation` en verde; puedes forzar un fallo cambiando un `403` por `200` y ver que CI bloquea.

### B4. Autenticación e invitaciones

Qué hago:

- Better Auth: email y contraseña, registro abierto desactivado, recuperación de contraseña por email, cookie en dominio padre en producción.
- Invitaciones: `POST /api/org/invitations` (permiso `org.members.invite`), token aleatorio con hash en base, caducidad configurable, estados pendiente, aceptada, caducada, revocada. Reenvío y revocación.
- Aceptación: `GET /api/invitations/:token` muestra club y rol; `POST /api/invitations/:token/accept`. Si el email no tiene usuario, se crea con la contraseña que elija. Si ya existe, inicia sesión y se añade la pertenencia. En ambos casos la invitación pasa a aceptada y el token deja de valer.
- Creación de usuario con registro cerrado: Better Auth lo bloquea en el endpoint público. Lo resuelvo con la API de servidor de Better Auth o con un hook previo que exige token de invitación válido. Elijo según la versión instalada y lo documento en ADR.
- Emails en es y ca: invitación y recuperación. Proveedor según tu decisión (2.3). En local y en tests, transporte en memoria que guarda los emails para asertarlos.
- Pantallas en `apps/web`: login, olvidé mi contraseña, restablecer, aceptar invitación.
- Tests: invitación caducada, reutilizada, email distinto al invitado, usuario existente que acepta una segunda invitación.

Cómo lo pruebas: desde el panel interno (B6) o un script de semilla, invitas un email tuyo; recibes el email; aceptas; entras por el subdominio; cierras sesión; recuperas contraseña.

### B5. Multi-tenant y marca

Qué hago:

- `apps/web` lee el host en el servidor, pide a `GET /api/org/public` nombre, colores y URL del logo, e inyecta variables CSS en el layout raíz. Sin marca si el host es reservado o desconocido.
- Página de selección de club para usuarios con varias pertenencias (`GET /api/me/memberships`), con enlaces a cada subdominio. Si solo tiene una, redirección directa.
- Marca por club: variables CSS derivadas de los tokens extraídos en B0. Validación de colores en el servidor.
- Logos: `POST /api/org/logo` (permiso `org.settings.write`) sube a un store de Blobs con `region: "eu-central-1"` fijado en un único módulo; `GET /api/org/logo/:key` lo sirve con cabeceras de caché. Formatos y tamaño máximo según tu respuesta a las preguntas.
- Local: `*.sportsmanager.localhost`. Verifico cookies en Chrome, Firefox y Safari y documento la alternativa con `/etc/hosts`.
- `docs/dominio-y-dns.md`: qué pedir a soporte de Netlify (activar comodín), qué registro DNS crear (`*` CNAME al proyecto), por qué el DNS debe estar en Netlify DNS o aportar certificado comodín, y la limitación de alias de dominio.

Cómo lo pruebas: con dos clubes creados, entras por cada subdominio y ves su marca; con el usuario C cambias de club desde el selector; subes un logo y aparece.

Dependencia externa: el comodín en producción solo se puede probar cuando tengas el dominio bajo control y soporte de Netlify lo haya activado. Hasta entonces, se prueba en local.

### B6. Admin interno mínimo

Qué hago:

- Host `admin.sportsmanager.com` con cadena de acceso propia (`platform_admins`).
- Endpoints: crear organización (slug validado contra reservados y formato), editar marca, invitar primer `org_admin`, listar organizaciones con estado.
- Interfaz mínima en `apps/web` bajo ese host.
- Primer `platform_admin` por migración de datos con tu email.
- Auditoría mínima: tabla `audit_log` con quién creó qué organización y quién invitó a quién. Es barata ahora y cara después.

Cómo lo pruebas: criterio de terminado del prompt, punto por punto.

### B7. i18n

Qué hago:

- Idioma por usuario editable, fallback al de la organización y luego `es`.
- Revisión de todos los textos de web y emails en es y ca.
- Test que falla si una clave existe en un idioma y no en el otro.

## 5. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Región de Netlify DB no verificable por documentación | Bloqueante por requisito legal | Verificación al aprovisionar en B1; parada si no es UE |
| Plan Pro no basado en créditos y Netlify DB no disponible | Bloqueante | Comprobación en B1; decisión tuya sobre el plan |
| Precedencia de `/api/*` frente al adaptador de Next.js sin documentar | Cambia la topología | Prueba de concepto en B1; plan B con dos proyectos y proxy |
| Previews con copia de datos de producción y URL pública | Datos personales expuestos desde Fase 1 | Sin datos reales en Fase 0; antes de Fase 1, protección de previews y consulta a Netlify sobre ramas sin datos personales |
| Previews no pueden usar subdominios | Menor cobertura de prueba del multi-tenant antes de merge | Override por contexto; tests automáticos cubren el multi-tenant; opción de proyecto de staging con comodín más adelante |
| Comodín de dominio depende de soporte de Netlify y de Netlify DNS | Retraso en B5 y B6 en producción | Pedirlo al inicio de B1; probar en local mientras tanto |
| Cookies de dominio en `*.localhost` en Firefox y Safari | Experiencia local peor | Verificación en B5; alternativa `/etc/hosts` documentada |
| Drizzle: adaptador de Netlify solo en beta | Inestabilidad de dependencias | Drizzle estable con driver `pg` salvo que el adaptador ya sea estable |
| Better Auth: registro cerrado y creación de usuarios desde servidor | Flujo de invitación | Dos vías conocidas; se elige al implementar con la versión instalada |
| Next.js middleware se ejecuta como Edge Function global, fuera de `fra` | Datos personales fuera de la UE si se usa mal | No usar middleware de Next para nada con datos personales; auth solo en la API |
| Logs de Resend en Estados Unidos | Residencia de datos incompleta | Decisión tuya en preguntas; alternativas UE |
| Límite de unos 4 KB en total para variables de entorno de funciones | Fallo de despliegue si crecen los secretos | Pocos secretos, cortos; nada tipo JSON de cuentas de servicio |
| Reglas de lint solo ven importaciones estáticas | Alguien consulta la base saltándose la capa | Test de arquitectura y tests de aislamiento como segunda y tercera barrera |
| Coste de Netlify DB tras el 1 de julio de 2026 | Desconocido | La documentación decía almacenamiento gratis hasta esa fecha; revisa la página de precios de Netlify |
| Una sola persona desarrollando | Calendario depende de tu cadencia de revisión | PRs pequeñas, una por bloque, con lista de comprobación |

## 6. Preguntas

### Bloqueantes antes del Bloque 0

1. **Ramas y merges.** Propongo `fase0/b0-limpieza`, `fase0/b1-base`, etc., una PR por bloque, tú revisas y haces merge. Yo no hago merge. ¿De acuerdo? Nota: mi sesión tiene asignada la rama `claude/affectionate-goodall-njy41w`; tu regla de una rama por bloque prevalece, pero lo confirmo porque tengo instrucción de no empujar a otras ramas sin permiso explícito.
2. **Documentos en el repo.** ¿Commiteo el informe de auditoría y este plan en `docs/` dentro del Bloque 0?
3. **Tokens de diseño.** ¿Te vale `packages/shared/design/` como ubicación?
4. **Hueco entre bloques.** `hubsports.netlify.app` sirve hoy el prototipo. Al hacer merge del Bloque 0 el proyecto publicará un sitio vacío hasta que entre el Bloque 1. ¿Te vale así, o prefieres que el Bloque 0 deje una página mínima de "en construcción"?

### Bloqueantes antes del Bloque 1

5. **Plan de Netlify.** ¿Tu plan Pro es la variante basada en créditos? Si no lo sabes, lo descubro al aprovisionar la base y paro si falla. Prefiero saberlo antes.
6. **Región.** ¿Frankfurt (`fra`) o Dublín (`dub`)? Propongo Frankfurt, por coincidir con la única región UE de Blobs (`eu-central-1`).
7. **Dominio.** ¿Tienes `sportsmanager.com` registrado y bajo tu control? ¿Dónde está el DNS? El comodín exige Netlify DNS o un certificado comodín propio, y ese proyecto no puede tener alias de dominio. Si no tienes el dominio, todo lo de subdominios se prueba solo en local hasta que lo tengas.
8. **Hono, Drizzle y Resend.** ¿Aprobados? Para Resend, ¿aceptas que los logs y metadatos estén en Estados Unidos, o quieres proveedor con residencia UE completa?
9. **Cookie de sesión en `.sportsmanager.com`.** ¿Aprobado el login único por cookie de dominio padre?
10. **Previews.** ¿Aprobado resolver el club en deploy previews con una variable de entorno de servidor? ¿Quieres además un proyecto de staging con `*.staging.sportsmanager.com` ahora? Mi recomendación: no en Fase 0.
11. **Subdominios reservados.** `www`, `admin`, `api`, `app`, `staging`, `mail`. ¿Añades o quitas alguno? ¿El panel interno en `admin.sportsmanager.com`?

### Pueden esperar al bloque correspondiente

12. **Bloque 3.** ¿Aprobado que Better Auth entre en B3 (sesión) y los flujos en B4?
13. **Bloque 3.** ¿Quieres RLS de Postgres como segunda barrera además del código? Mi recomendación: no en Fase 0, revisarlo antes de meter datos de menores en Fase 1.
14. **Bloque 4.** Caducidad de invitaciones: propongo 7 días. Longitud mínima de contraseña: Better Auth trae un mínimo por defecto que confirmaré en su documentación al instalar; ¿lo aceptas o fijas otro? Caducidad del enlace de recuperación: el valor por defecto de Better Auth, salvo que me digas otro.
15. **Bloque 5.** Logos: formatos y tamaño máximo. Propongo PNG, JPG y WebP, sin SVG en Fase 0 (un SVG servido tal cual puede ejecutar scripts). Tamaño: necesito que lo fijes tú; el límite técnico de una función es de unos 6 MB por petición.
16. **Bloque 6.** ¿Tu email como primer `platform_admin`? ¿Alguien más?
17. **Bloque 1.** ¿La documentación OpenAPI (`/api/docs`) pública o solo para `platform_admin`?

### Respuestas recibidas (19 de octubre de 2026)

| Pregunta | Respuesta |
|---|---|
| 1 Ramas y merges | Aprobado. Ramas `fase0/bN-nombre`, una PR por bloque, el responsable de producto hace merge. Cada cierre de bloque incluye instrucciones de prueba lo más concretas posible |
| 2 Documentos en el repo | Aprobado |
| 3 Tokens | Aprobado en `packages/shared/design/`. Aclaración: las variables de entorno de Netlify son por proyecto y sirven para secretos y configuración; la marca por club vive en la base de datos |
| 4 Hueco entre bloques | Aceptado que el proyecto quede vacío entre B0 y B1 |
| 5 Plan de Netlify | Las funciones ya están en Frankfurt. La variante del plan se comprueba al aprovisionar la base |
| 6 Región | Frankfurt |
| 7 Dominio | Provisional y sin decidir. El dominio base se lee de configuración. Nada de DNS en la Fase 0 más allá de la documentación |
| 8 Hono, Drizzle, Resend | Aprobados. Resend con la reserva de residencia aceptada |
| 9 Cookie en dominio padre | Aprobado |
| 10 Previews por variable de entorno y staging | Sin respuesta explícita. Queda como propuesta en el ADR 0011 |
| 11 Subdominios reservados y panel en `admin` | Sin respuesta explícita. Queda como propuesta en el ADR 0011 |

## 7. Qué no he podido verificar y dónde comprobarlo

- Región de Netlify DB y lista de regiones: documentación de datos y almacenamiento de Netlify, https://docs.netlify.com/build/data-and-storage/overview/ y anuncio https://www.netlify.com/blog/netlify-database/. Regiones de Neon: https://neon.com/docs/introduction/regions.
- Región de funciones y plan: https://docs.netlify.com/build/functions/optional-configuration/.
- Regiones de Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/.
- Subdominios comodín (foro, respuestas del personal de Netlify): https://answers.netlify.com/t/multi-tenant-application-is-it-possible-to-have-a-wildcard-domain-in-netlify/79724 y https://answers.netlify.com/t/wildcard-certificate/96388.
- Next.js en Netlify y adaptador OpenNext: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/ y https://opennext.js.org/netlify.
- Monorepos en Netlify: https://www.netlify.com/blog/better-monorepos-on-netlify/ y https://docs.netlify.com/build/configure-builds/file-based-configuration/.
- Better Auth, opciones y cookies: https://better-auth.com/docs/reference/options y https://better-auth.com/docs/concepts/cookies.
- Hono en Netlify: https://hono.dev/docs/getting-started/netlify (no he podido abrir hono.dev desde este entorno; he leído espejos de la documentación).
- Resend, regiones y residencia: https://www.resend.com/docs/dashboard/domains/regions.
- Cookies en subdominios de localhost en Chromium: https://codereview.chromium.org/2127603002.
- Precios de Netlify DB y Blobs: https://www.netlify.com/pricing/ (no verificado desde aquí).

No he verificado precios ni límites de ningún proveedor. No he ejecutado nada en tu cuenta de Netlify; solo he leído equipo y proyectos.
