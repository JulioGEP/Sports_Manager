# Informe técnico: repo `sportsmanager` (EIXA Hub) y plan hacia SaaS multi-club

Fecha: 19 de octubre de 2026. Revisión en modo lectura, sin cambios en el repo.

## Resumen ejecutivo

- El repo es una app web de un solo club (AE Eixample, fútbol sala) escrita en JavaScript sin framework, sin backend propio y con Firebase como base de datos y autenticación. Son 22 ficheros y unas 1.160 líneas. Toda la lógica vive en `js/app.js` (570 líneas).
- Lo que funciona de verdad: login y registro por invitación, alta y listado de equipos y jugadores, foto de jugador, invitaciones a familias y staff, y el "Repte d'estiu" (reto de hábitos por puntos).
- Lo que es prototipo o fachada: el perfil 360 (sus KPIs, PDI y timeline se leen de campos que ninguna pantalla escribe), el dashboard "premium" (datos decorativos), el panel de staff y Scout Live (placeholder).
- No existe nada de: secciones del club, comunicación con familias, pruebas físicas, multi-tenancy, planes, facturación ni panel interno.
- Hallazgo crítico: las reglas de Firestore permiten que cualquier usuario registrado se cree a sí mismo con rol `admin`. Si la app está en producción con familias reales, esto va primero.
- Recomendación: reutilizar el conocimiento de dominio, los design tokens y los datos; reescribir aplicación y capa de datos sobre Postgres con aislamiento por organización. La inversión actual es pequeña y no soporta lo que quieres construir.

## 0. Qué hay hoy

### Stack

| Capa | Qué hay | Observación |
|---|---|---|
| Frontend | HTML + CSS + JavaScript vanilla con ES modules | Sin framework, sin bundler, sin npm, sin TypeScript |
| Backend | Ninguno | El navegador habla directo con Firebase |
| Base de datos | Cloud Firestore (8 colecciones) | Proyecto `ae-eixample-reptes` |
| Autenticación | Firebase Auth, email y contraseña | Reset por email |
| SDK | Firebase 10.12.5 cargado desde CDN de Google | Sin gestión de dependencias |
| Hosting | Netlify, publica la raíz tal cual | Dos cabeceras de seguridad en `netlify.toml` |
| CSS | Design system DS-001 (tokens + componentes) y `styles.css` legacy minificado en una línea | Dos sistemas conviviendo |
| Tests, CI, lint | No hay | CONTRIBUTING pide 7 comprobaciones manuales antes de publicar |
| Entornos | Uno solo | Dev y producción comparten proyecto Firebase |
| Idioma | UI 100% en catalán hardcoded, código en inglés | Sin i18n |

Historial git: 5 commits. Dos son volcados completos de un ZIP externo ("EIXA-Hub-main"). No hay historial de desarrollo real en este repo. El CHANGELOG habla de v1.5 a v1.8.0 y de sprints DS-001 y PW-002.1, pero esas versiones no existen como commits aquí.

### Estructura

```
index.html              entrada; carga src/design/index.css, styles.css y js/app.js
js/app.js               570 líneas: auth, shell, enrutado por if/else, 9 vistas, acceso a datos
js/core/firebase.js     inicializa Firebase y reexporta el SDK
js/core/state.js        objeto global de estado (6 campos)
js/core/utils.js        esc(), fmtDate(), initials(), statusTone()
js/services/media.js    compresión de imagen a JPEG base64 (640 px, calidad 0,78)
js/firebase-config.js   configuración pública de Firebase
src/design/*.css        design system: tokens, foundation, components, utilities
styles.css              CSS legacy (16 KB, minificado)
design-system.html      catálogo visual del design system
firestore.rules         reglas de seguridad
netlify.toml            despliegue estático
*.md, README_PAS_A_PAS  documentación en catalán
assets/logo-ae-eixample.png
```

Colecciones Firestore usadas: `users`, `teams`, `players`, `invitations`, `staffInvitations`, `challenges`, `challengeTasks`, `challengeSubmissions`.

### Módulos y estado

| Módulo | Qué hace | Estado | Evidencia |
|---|---|---|---|
| Autenticación | Login, registro, reset. Al registrarse busca invitaciones de familia (por email) y de staff (doc con id = email), crea `users/{uid}` con el rol y vincula jugadores | Funcional | `app.js` 18-91 |
| Roles y permisos | 11 roles como string en `users.role`. Tres helpers en cliente (`isAdmin`, `isStaff`, `canManageChallenges`) y reglas Firestore | Básico. Agujero de seguridad, ver hallazgo 1 | `app.js` 12-14, `firestore.rules` |
| Dashboard admin | KPIs de equipos, jugadores y accesos. Porcentaje de completitud de perfiles. Alertas. Accesos rápidos | Funcional con partes decorativas: temporada "2026–27" fija, "actividad reciente" es el primer jugador y equipo de la colección, panel "Milestone PW-002.1", nombre por defecto "Dani" | `app.js` 149-268 |
| Dashboard familia | Tarjeta del jugador vinculado y acceso al reto | Funcional, mínimo | `app.js` 269-288 |
| Dashboard staff no admin | Un botón al reto | Casi vacío | `app.js` 150-154 |
| Equipos | Crear (nombre, categoría) y listar | Prototipo: sin editar, sin borrar, sin temporada real, sin ver jugadores del equipo | `app.js` 414-419 |
| Jugadores | Crear (nombre, dorsal, equipo, posición), listar con número de tutores, abrir perfil y accesos | Funcional básico: sin borrar, sin filtros, sin paginación. Cada listado descarga todas las fotos en base64 | `app.js` 421-429 |
| Perfil 360 / Player Workspace | Ficha visual: hero, 4 KPIs (deporte, cuerpo, bienestar, compromiso), objetivo con progreso, timeline, PDI en 6 áreas, datos deportivos. Edición de 10 campos básicos y foto | Prototipo visual. Los KPIs, el PDI, la timeline y el responsable del objetivo se leen de campos que ninguna pantalla escribe. Siempre muestran "Sense dades" u "Objectiu pendent" salvo que alguien los rellene en la consola de Firestore | 0 escrituras de `sportScore`, `bodyScore`, `wellbeingScore`, `commitmentScore`, `development`, `timeline`, `pdiCoordinator` |
| Foto de jugador | Subida, compresión en cliente, guardado como base64 dentro del documento del jugador | Funcional | `media.js`, `app.js` 364-376 |
| Accesos de familias | Invitación por jugador (email y relación), varios tutores por jugador, estado pendiente o aceptada. La familia se registra con el mismo email y queda vinculada. Pantalla "asociar jugador" para familias sin invitación | Invitación funcional. No envía email: el admin avisa por otro canal. Sin revocar, borrar ni reenviar. La pantalla "asociar jugador" probablemente falla por reglas (hallazgo 7) | `app.js` 468-495 y 126-147 |
| Accesos de staff | Invitación por email con rol y equipo. Listado de miembros y pendientes | Funcional básico. Sin edición ni baja | `app.js` 431-466 |
| Repte d'estiu | Reto por puntos. Admin y coach crean, editan y borran pruebas en 3 áreas (entrenamiento, técnica, hábitos). Las familias registran actividad con cantidad y nota. Totales por área | Funcional como gamificación de hábitos. Fijado a `summer-2026`, 10 pruebas por defecto, mínimo 50 y objetivo 150. Sin validación de registros (el estado `submitted` nunca cambia), sin ranking, sin cierre ni histórico de retos | `app.js` 484-558 |
| Design system DS-001 | Tokens CSS, componentes base, catálogo HTML | Terminado como base. Migración parcial: dashboard, equipos, jugadores y accesos usan clases legacy; el perfil usa `eixa-*` | `src/design/*`, `styles.css` |
| Scout Live | Placeholder "Properament" | No existe | `app.js` 123, 560 |
| Secciones del club | Nada. Solo equipos con un campo texto "categoría" | No existe | |
| Comunicación con familias | Nada. Solo invitaciones | No existe | |
| Pruebas físicas | Nada. El reto mide hábitos y sesiones, no rendimiento físico | No existe | |
| Multi-tenant, planes, facturación, panel interno | Nada. `clubId:'ae-eixample'` hardcoded en 5 sitios | No existe | grep |

### Hallazgos técnicos

Verificados leyendo el código salvo donde se indica.

1. **Escalada de privilegios en las reglas (crítico).** `firestore.rules` líneas 28-31: cualquier usuario autenticado puede crear su propio documento `users/{uid}` con `role: 'admin'`. La regla acepta cualquier rol de una lista que incluye `admin` y no comprueba que exista invitación. Con rol admin se leen todos los jugadores, menores incluidos, y todos los usuarios. La app no lo hace, pero la configuración de Firebase es pública (está en el repo) y basta la consola del navegador. Solo `superadmin` queda fuera de la lista. Arreglo mínimo propuesto más abajo. No lo aplico porque pediste no tocar nada.
2. **Fotos en base64 dentro del documento del jugador.** Cada lectura del listado de jugadores descarga todas las fotos. Firestore cobra por documento leído y por tráfico de salida. Con 200 jugadores cada listado mueve varios MB. Debe ir a almacenamiento de ficheros con URL.
3. **Todas las vistas leen colecciones completas.** `users`, `players`, `teams`, `invitations`, sin filtros ni paginación. Vale para un club. Para N clubes el coste es lineal y, con reglas por tenant, inviable.
4. **Campos duplicados por migraciones sin cerrar.** `guardianUid` y `guardianUids`, `guardianEmail` y `guardianEmails`, `playerId` y `playerIds`, `teamId` y `teamIds`, `photoData` y `photoUrl`, `bodyScore` y `healthScore`. Hay que decidir fuente de verdad antes de migrar datos.
5. **Sin herramientas de desarrollo.** No hay `package.json`, tests, lint, CI ni separación de entornos.
6. **Hardcodes de negocio.** Club, temporada, id del reto, textos en catalán, marca AE Eixample en logo, título y meta.
7. **Probable error en "asociar jugador" (no reproducido).** `renderPlayerClaim` lee toda la colección `players` como usuario familia. La regla de lectura depende de `guardianUid == null` y Firestore rechaza consultas que no garanticen esa condición. Impacto bajo: solo afecta a familias registradas sin invitación.
8. **Mantenibilidad.** HTML construido con strings, manejadores reasignados en cada render, estado global mutable, emojis en la navegación. Legible para una persona, no para un equipo.

Arreglo mínimo propuesto para el hallazgo 1 (sustituye la regla `allow create` de `users`):

```
allow create: if signedIn() && request.auth.uid == uid
  && request.resource.data.active == true
  && request.resource.data.email == authEmail()
  && (
    request.resource.data.role == 'family'
    || (
      exists(/databases/$(database)/documents/staffInvitations/$(authEmail()))
      && get(/databases/$(database)/documents/staffInvitations/$(authEmail())).data.status == 'pending'
      && get(/databases/$(database)/documents/staffInvitations/$(authEmail())).data.role == request.resource.data.role
    )
  );
```

Nota: la app guarda el id de `staffInvitations` con el email en minúsculas. Conviene normalizar también `authEmail()` o aceptar ambas formas.

## 1. Qué reutilizar y qué reescribir

### Reutilizar

| Qué | Por qué |
|---|---|
| Conocimiento de dominio codificado: flujo invitación → registro → vínculo familia y jugador, varios tutores por jugador, catálogo de 11 roles de staff, reto por puntos con áreas y topes | Es la especificación del MVP. Vale más que el código |
| Design tokens (`src/design/tokens.css`) y componentes `eixa-*` | Portables a cualquier stack. Los tokens son justo el mecanismo para marca por club: variables CSS por tenant |
| Compresión de imagen en cliente (`js/services/media.js`) | 30 líneas correctas. Se copia |
| Reglas Firestore | Como documentación de la matriz de permisos actual, no como código |
| Criterios de completitud de perfil y alertas del dashboard | Buena idea de producto, barata de rehacer |
| Datos reales de AE Eixample | Se exportan de Firestore y se migran |

### Reescribir

| Qué | Por qué |
|---|---|
| `js/app.js` entero | Sin router, sin componentes, estado global mutable, HTML por strings. Añadir tenant, permisos finos y tres módulos nuevos encima multiplica el coste de cada cambio. Son 570 líneas: reescribir cuesta menos que adaptar |
| Capa de datos (cliente → Firestore sin backend) | Facturación, planes y panel interno exigen lógica de servidor con secretos. El aislamiento por tenant en Firestore se hace con reglas por documento, difíciles de auditar y de testear. Pruebas físicas y reporting son consultas relacionales (evolución por jugador, comparativa por equipo y edad) que Firestore hace mal y caro. Ya hay un agujero de permisos con un solo club |
| Autenticación y roles | Pasar de un string en el documento a pertenencia por organización con permisos explícitos |

### Justificación económica

El valor de lo construido equivale a unas pocas semanas de trabajo visible. No puedo verificar el esfuerzo real invertido. Arrastrarlo para no "perder" esa inversión sale más caro que rehacerlo: cada módulo nuevo sobre esta base cuesta más y cada incidente de seguridad con datos de menores cuesta reputación.

Opción descartada: mantener Firebase y "añadir" multi-tenant. Es posible (campo `clubId` en cada documento y reglas por tenant), pero facturación, planes y panel interno necesitarían Cloud Functions igualmente, el reporting seguiría siendo débil y la base de código actual no aguanta. Si prefieres quedarte en Google por otros motivos, la alternativa B funciona con Cloud SQL. Firestore no debería ser la base de datos principal de este producto.

## 2. Arquitectura propuesta

### Común a las dos alternativas

- **Multi-tenancy por fila.** Una sola base de datos Postgres. Columna `organization_id` en toda tabla de negocio. Aislamiento con Row Level Security (RLS) y comprobación adicional en la aplicación. Un solo despliegue para todos los clubes. Es el modelo estándar para SaaS B2B con muchos tenants pequeños. Una instancia por club solo compensa en contratos enterprise.
- **Identificación del tenant.** Subdominio `club.tudominio.com` por defecto. Dominio propio como característica de plan alto.
- **Marca por club.** Tabla `organization_settings` (logo, colores, nombre, idioma) inyectada como variables CSS. Es lo que ya hacen los tokens actuales.
- **Planes y entitlements.** `plans` → `features` con límites (jugadores, equipos, módulos). Se comprueba en servidor, no solo en interfaz.
- **Autenticación.** Email y contraseña, enlace mágico. Invitaciones con token firmado y caducidad. Un usuario puede pertenecer a varias organizaciones: entrenador en dos clubes, madre con hijos en clubes distintos.
- **Facturación.** Stripe Billing con Checkout, Customer Portal y webhooks. Stripe genera las facturas. La adecuación legal en España la revisas con tu gestoría (ver riesgos).
- **Email transaccional.** Resend o Postmark para invitaciones y avisos.
- **Ficheros.** Bucket compatible S3 con URLs firmadas. Nunca base64 en base de datos.
- **Región UE** para todos los datos. Hay menores.
- **Observabilidad.** Sentry y los logs del proveedor.
- **Panel interno.** Misma aplicación, rol `platform_admin`, impersonación auditada.

### Alternativa A: Next.js + Supabase

- Next.js (App Router, TypeScript), Tailwind, shadcn/ui. Desplegado en Vercel o Netlify.
- Supabase: Postgres gestionado con RLS, Auth, Storage y Edge Functions. Región Frankfurt.
- Drizzle o Prisma para esquema y migraciones.
- Stripe y Resend.

Pros: tiempo a MVP más corto. RLS da multi-tenancy real desde el día 1. Postgres estándar, puedes irte. El panel de Supabase sirve como panel interno provisional.

Contras: los permisos quedan repartidos entre RLS y código, hay que disciplinarse. Auth acoplada a Supabase. El coste crece por proyecto y cómputo.

### Alternativa B: backend propio

- Monorepo: `web` en Next.js, `api` en NestJS o Fastify con Prisma, Postgres gestionado (Neon o RDS), Auth.js o Clerk, Redis para colas y caché, workers para emails y tareas.
- Despliegue: Vercel para web, Railway, Fly o Render para API y workers. O todo en AWS.

Pros: control total. Dominio y permisos centralizados en código, más fáciles de testear y auditar. Integraciones futuras (federaciones, cobro de cuotas) más limpias. Sin dependencia de un BaaS.

Contras: más trabajo inicial. Más superficie operativa: migraciones, auth, storage, colas. Necesitas un perfil backend sólido.

### Coste de infraestructura

Aviso: no he podido abrir las páginas oficiales de precios desde este entorno (DNS bloqueado). Las cifras salen de guías de terceros de 2026 localizadas por búsqueda. Confírmalas en la página oficial antes de presupuestar. Dólares salvo Stripe.

Alternativa A, fase MVP (1 a 10 clubes):

| Partida | Plan | Coste mensual según fuentes | Verificación |
|---|---|---|---|
| Supabase | Pro | 25 $ base, incluye 10 $ de cómputo; proyecto extra unos 10 $ | Terceros, coinciden entre sí |
| Vercel | Pro | 20 $ por asiento de desarrollador | Terceros, coinciden entre sí |
| Resend | Free, luego Pro | Sin verificar | No verificado |
| Stripe | Por uso | 1,5 % + 0,25 € tarjetas EEE estándar; 2,8 % + 0,25 € premium EEE | Fragmento de la página oficial en resultados de búsqueda; algunas fuentes dan 1,9 % para premium |
| Sentry | Free o Team | Sin verificar | No verificado |
| Dominio y DNS | | Sin verificar | No verificado |

Orden de magnitud con esas cifras: entre 50 y 100 $ al mes hasta decenas de clubes. Es una estimación mía, no un presupuesto.

Alternativa B, fase MVP:

| Partida | Plan | Coste mensual según fuentes | Verificación |
|---|---|---|---|
| Vercel | Pro | 20 $ por asiento | Terceros |
| Neon Postgres | Launch | Por uso: 0,106 $ por CU-hora y 0,35 $ por GB-mes; las fuentes discrepan sobre si hay mínimo mensual | Terceros, con contradicciones |
| API y workers (Railway, Fly, Render) | Hobby o Pro | Sin verificar | No verificado |
| Clerk (si no usas Auth.js) | Free hasta 50.000 usuarios retenidos al mes según fuentes de 2026; Pro 25 $ | Terceros, con cambio de precios en febrero de 2026 |
| Redis (Upstash) | Free | Sin verificar | No verificado |
| Stripe, Resend, Sentry | Igual que A | | |

Orden de magnitud con esas cifras: entre 80 y 200 $ al mes. Estimación mía.

Firebase actual, para comparar: las fuentes coinciden en cuota gratuita diaria de 50.000 lecturas, 20.000 escrituras y 1 GiB almacenado. La app de hoy probablemente cuesta cero. No lo puedo verificar sin acceso a la consola.

Conclusión sobre infraestructura: no es el coste relevante en ninguna alternativa. El coste es desarrollo.

### Coste de desarrollo

No conozco tu equipo ni tus tarifas, así que no puedo dar euros. Doy esfuerzo estimado con supuestos explícitos. Son estimaciones mías, no verificables.

Supuestos: una persona senior full-stack a tiempo completo, con herramientas de IA, y tú como product owner con dedicación parcial. Sin diseño de interfaz externo (se parte de shadcn y los tokens actuales).

| Fase | Alternativa A | Alternativa B |
|---|---|---|
| Fase 0, fundamentos | 3 a 4 semanas | 5 a 6 semanas |
| Fase 1, MVP vendible | 6 a 8 semanas | 8 a 11 semanas |
| Total a primer cliente de pago | 9 a 12 semanas | 13 a 17 semanas |

Multiplica por tu coste semanal. Con dos personas no se divide por dos: la fase 0 tiene poca paralelización.

Recomendación: alternativa A, salvo que tengas un backend senior interno y un plan de integraciones a corto plazo. La razón es económica: tiempo hasta el primer cliente de pago. Postgres estándar mantiene abierta la salida a B más adelante.

## 3. Modelo de datos inicial, agnóstico al deporte

Principios:

- Toda tabla de negocio lleva `organization_id` y política RLS sobre esa columna.
- Identificadores UUID. `created_at`, `updated_at`, `deleted_at` (borrado lógico) en todas.
- Persona, jugador y usuario son entidades distintas. Una persona puede ser jugador. Un usuario es un login. La tutela une usuario y jugador.
- La pertenencia a equipo es por temporada, para conservar histórico.
- El deporte es configuración en datos (posiciones, métricas por defecto), no código.
- Las secciones son la capa entre organización y equipo (fútbol sala, fútbol 7, baloncesto, o masculino y femenino, según el club).

### Plataforma

| Tabla | Campos clave |
|---|---|
| `organizations` | `slug`, `name`, `default_sport_id`, `locale`, `timezone`, `status`, `trial_ends_at` |
| `organization_settings` | `organization_id`, `logo_path`, `primary_color`, `secondary_color`, `custom_domain`, `features_json` |
| `plans` | `code`, `name`, `price_monthly`, `price_yearly`, `stripe_price_id` |
| `plan_features` | `plan_id`, `feature_code`, `limit_value` (nulo = ilimitado) |
| `subscriptions` | `organization_id`, `plan_id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end` |
| `platform_admins` | `user_id` |
| `audit_log` | `organization_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `impersonated_by` |

### Identidad y permisos

| Tabla | Campos clave |
|---|---|
| `users` | `email`, `name`, `locale`, `auth_provider_id` |
| `memberships` | `user_id`, `organization_id`, `role_id`, `status` |
| `roles` | `organization_id` (nulo = rol de sistema), `code`, `name` |
| `role_permissions` | `role_id`, `permission_code` |
| `invitations` | `organization_id`, `email`, `role_id`, `target_type` (team, player), `target_id`, `token_hash`, `expires_at`, `status`, `invited_by` |
| `guardianships` | `user_id`, `player_id`, `relationship`, `is_primary`, `consent_given_at` |

Roles de sistema iniciales: `owner`, `admin`, `coordinator`, `coach`, `staff`, `guardian`, `player` (para jugadores adultos). Los 11 roles actuales se mapean a `staff` con un campo `job_title`, salvo que un rol necesite permisos distintos.

### Estructura deportiva

| Tabla | Campos clave |
|---|---|
| `sports` | `code`, `name`, `config_json` (posiciones, duración, métricas por defecto) |
| `seasons` | `organization_id`, `name`, `start_date`, `end_date`, `is_current` |
| `sections` | `organization_id`, `sport_id`, `name`, `sort_order` |
| `teams` | `organization_id`, `section_id`, `season_id`, `name`, `age_group`, `gender`, `status` |
| `people` | `organization_id`, `first_name`, `last_name`, `birth_date`, `gender`, `photo_path`, `email`, `phone` |
| `players` | `organization_id`, `person_id`, `status`, `joined_at`, `external_ref` (licencia federativa) |
| `team_memberships` | `team_id`, `player_id`, `season_id`, `number`, `position_code`, `joined_at`, `left_at` |
| `staff_assignments` | `membership_id`, `team_id`, `season_id`, `role_in_team` |

### Comunicación

| Tabla | Campos clave |
|---|---|
| `announcements` | `organization_id`, `author_user_id`, `scope_type` (organization, section, team, player), `scope_id`, `title`, `body`, `published_at`, `requires_ack` |
| `announcement_recipients` | `announcement_id`, `user_id`, `delivered_at`, `read_at`, `acknowledged_at` |
| `notification_preferences` | `user_id`, `channel` (email, push), `enabled` |
| `attachments` | `organization_id`, `entity_type`, `entity_id`, `storage_path`, `mime_type` |

Hilos bidireccionales (`message_threads`, `messages`) quedan para fase 2.

### Evaluación y rendimiento

| Tabla | Campos clave |
|---|---|
| `test_definitions` | `organization_id` (nulo = catálogo global), `sport_id` (nulo = cualquier deporte), `code`, `name`, `unit`, `higher_is_better`, `protocol_text` |
| `test_sessions` | `organization_id`, `team_id`, `season_id`, `date`, `conducted_by`, `notes` |
| `test_results` | `test_session_id`, `player_id`, `test_definition_id`, `value`, `notes` |
| `challenges` | `organization_id`, `name`, `season_id`, `starts_at`, `ends_at`, `min_points`, `target_points`, `status` |
| `challenge_tasks` | `challenge_id`, `name`, `area`, `points_per_unit`, `max_points`, `entry_type` (count, rating) |
| `challenge_entries` | `challenge_id`, `task_id`, `player_id`, `submitted_by`, `quantity`, `points`, `note`, `status` (submitted, approved, rejected), `reviewed_by` |
| `objectives` | `player_id`, `season_id`, `text`, `owner_user_id`, `due_date`, `progress`, `status` |
| `assessments` | `player_id`, `season_id`, `author_user_id`, `area`, `score`, `comment` (fase 2) |

### Actividad (fase 2)

| Tabla | Campos clave |
|---|---|
| `events` | `organization_id`, `team_id`, `type` (training, match, other), `starts_at`, `ends_at`, `location` |
| `attendance` | `event_id`, `player_id`, `status`, `recorded_by` |

### Mapeo desde Firestore

| Firestore | Postgres |
|---|---|
| `users` | `users` + `memberships` + `guardianships` (de `playerIds`, fuente de verdad sobre `playerId`) |
| `teams` | `sections` (una por defecto) + `teams` + `seasons` (una, "2026-27") |
| `players` | `people` + `players` + `team_memberships`; `photoData` a storage; `currentObjective` y `objectiveProgress` a `objectives` |
| `invitations`, `staffInvitations` | `invitations` |
| `challenges`, `challengeTasks`, `challengeSubmissions` | `challenges`, `challenge_tasks`, `challenge_entries` |

## 4. Roadmap por fases

Principio: el MVP vende con cuatro cosas. Estructura del club (secciones, equipos, jugadores, familias), comunicación básica, pruebas físicas y cobro de un plan. Todo lo demás, después.

Lo que no entra en el MVP, aunque sea donde más esfuerzo tiene el repo actual: KPIs del perfil 360, PDI, dashboard "premium", Scout Live. No venden sin datos que los alimenten.

### Fase 0: fundamentos

Alcance: repositorio nuevo con CI, Next.js y Supabase (si eliges A), esquema inicial con RLS y tests de aislamiento, autenticación e invitaciones por email real, organizaciones con subdominio y marca básica, roles de sistema, semilla de deportes, entornos staging y producción, Sentry.

Criterio de salida: un club de prueba con usuarios de tres roles entrando por su subdominio y sin poder ver datos de otro club. Tests de RLS en verde.

### Fase 1: MVP vendible

Alcance:
- Secciones, temporadas, equipos, jugadores con plantilla por temporada. Importación CSV.
- Familias: invitación por email, varios tutores, consentimiento de datos del menor.
- Comunicación: anuncios por organización, sección, equipo o jugador, con email y confirmación de lectura.
- Pruebas físicas v1: catálogo de tests (global y propio), sesión de medición por equipo, resultados por jugador, evolución individual y comparativa por equipo.
- Stripe con un plan y periodo de prueba. Portal de cliente de Stripe para tarjeta y facturas.
- Panel interno mínimo: listado de organizaciones, estado de suscripción, impersonación auditada.
- Migración de datos de AE Eixample.

Criterio de salida: AE Eixample en producción sobre la nueva plataforma y uno o dos clubes externos en piloto o pagando.

### Fase 2: retención

Alcance: retos (generalización del Repte d'estiu con aprobación de registros, ranking y cierre), objetivos individuales, eventos y asistencia, dos o tres planes con entitlements, exportaciones, notificaciones push con PWA, mensajería bidireccional si los pilotos la piden.

Criterio de salida: segundo cobro recurrente de los clubes piloto y uso semanal de familias medido.

### Fase 3: escala

Alcance: configuración completa por deporte, dominio propio, API pública, integraciones (federación, cobro de cuotas a familias), estadísticas de partido (lo que hoy es Scout Live), app nativa si el mercado la pide.

## 5. Riesgos y decisiones

### Decisiones que son tuyas

1. **Alternativa A o B.** Mi recomendación es A por tiempo al primer cliente. Cambia si tienes backend senior interno y plan de integraciones a corto.
2. **Quién desarrolla y con qué dedicación.** Todas las estimaciones dependen de esto.
3. **Qué hacer con la app actual.** Opción recomendada: corregir la regla de seguridad ya, congelar funcionalidades y migrar datos en fase 1. Evolucionarla en paralelo duplica coste.
4. **Unidad de precio.** Por club con límites de jugadores y equipos, o por jugador. Cambia el modelo de entitlements y el discurso comercial.
5. **Idiomas desde el MVP.** Catalán y castellano como mínimo. Montar i18n el día 1 es barato. Añadirlo después es caro.
6. **Alcance de comunicación.** Anuncios unidireccionales con lectura y email, o chat bidireccional. Recomiendo lo primero. El chat es un producto en sí mismo.
7. **Datos de menores.** Qué guardas. Lesiones y salud son categoría especial en RGPD. Recomiendo dejarlos fuera del MVP.
8. **Usuario en varios clubes.** Recomiendo que sí desde el modelo. Cuesta poco ahora y mucho después.
9. **Subdominio o ruta** para identificar el club. Recomiendo subdominio.
10. **Facturación legal en España.** Según las fuentes consultadas, el Real Decreto-ley 15/2025 fija Verifactu el 1 de enero de 2027 para sociedades y el 1 de julio de 2027 para el resto. Las fuentes son de diciembre de 2025 y no he podido confirmar cambios posteriores. Confírmalo con tu gestoría y decide si las facturas salen de Stripe o de una herramienta española.

### Riesgos

- **Seguridad hoy.** La regla de `users` permite autoasignarse `admin`. Si hay familias reales, es riesgo reputacional inmediato.
- **Menores y fotos.** Consentimiento de tutores, retención y borrado. Es parte del producto, no un trámite.
- **Deriva de alcance.** El repo actual ya muestra el sesgo: mucho esfuerzo en perfil 360 y dashboard, poco en lo que vende.
- **Bus factor.** Una persona y sin tests. Mitigación: CI y tests de RLS desde la fase 0.
- **Dependencia del proveedor en A.** Moderada, sobre todo en Auth. Mitigación: Postgres estándar, sin funciones propietarias sin necesidad.
- **Costes variables.** Vercel y Supabase crecen por uso. Revisar a partir de 100 clubes.
- **Migración de datos.** Campos duplicados en Firestore. Hay que fijar fuente de verdad antes de exportar.
- **Abstracción excesiva.** Agnóstico al deporte en el modelo y en la configuración, pero la interfaz se diseña primero para fútbol sala. Si abstraes la UI antes de tener dos deportes reales, pagas dos veces.

## Qué no he podido verificar

- No he ejecutado la app ni he accedido a Firestore. No sé cuántos usuarios y datos reales hay, ni si está en producción.
- No he visto la cuenta de Netlify ni la consola de Firebase.
- Los precios proceden de guías de terceros, no de las páginas oficiales.
- Las estimaciones de esfuerzo son mías, sin conocer al equipo.
- El error de "asociar jugador" está inferido de las reglas, no reproducido.
- El calendario de Verifactu procede de fuentes de diciembre de 2025.

## Fuentes consultadas

Precios (terceros, 2026):
- Supabase: [uibakery](https://uibakery.io/blog/supabase-pricing), [makerkit](https://makerkit.dev/blog/saas/supabase-pricing), [jetadmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- Vercel: [flexprice](https://flexprice.io/blog/vercel-pricing-breakdown), [livemy](https://livemy.app/blog/vercel-pricing), [usagepricing](https://www.usagepricing.com/blueprint/vercel)
- Neon: [jetadmin](https://www.jetadmin.io/blog/neon-pricing/), [comparedge](https://comparedge.com/tools/neon-db/pricing)
- Clerk: [supertokens](https://supertokens.com/blog/clerk-pricing-the-complete-guide), [dev.to](https://dev.to/thiago_alvarez_a7561753aa/clerk-vs-better-auth-2026-we-verified-every-price-so-you-dont-have-to-13pk)
- Stripe: [página oficial España](https://stripe.com/en-es/pricing), [laguiaemprendedor](https://laguiaemprendedor.com/comision-stripe)
- Firestore: [Google Cloud quotas](https://docs.cloud.google.com/firestore/quotas), [magora](https://magora-systems.com/firebase-pricing/)

Verifactu:
- [Quipu](https://getquipu.com/blog/verifactu-se-retrasa/), [Holded](https://www.holded.com/es/blog/hacienda-retrasa-entrada-vigor-verifactu), [Billin](https://www.billin.net/verifactu/)
