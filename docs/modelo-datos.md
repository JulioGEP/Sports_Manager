# Modelo de datos

Estado: Fase 1, Bloque 12. Organizaciones, identidad, pertenencias e invitaciones (Fase 0), la estructura del club: temporadas, secciones, equipos con plantilla y cuerpo técnico, jugadores y familias (ADR 0028), y la ficha ampliada del jugador: foto, datos deportivos, objetivo, indicadores, plan de desarrollo y registros (ADR 0029).

Fuente de verdad: `packages/db/src/schema/`. Las migraciones están en `netlify/database/migrations/` y las aplica Netlify en cada deploy (ADR 0003).

## Convenciones

- Identificadores UUID generados por Postgres. Fechas con zona horaria; `created_at` y `updated_at` en todas las tablas, la segunda mantenida por la aplicación.
- Estados e idiomas como texto con restricción `CHECK` construida desde las listas de `packages/shared`. Añadir un valor cambia la restricción; nunca es una migración destructiva. Sin tipos enumerados de Postgres.
- Toda tabla con datos de un club lleva `organization_id` obligatorio e indexado.
- Emails en minúsculas, exigido por restricción en base y normalizado en la API.
- Textos traducibles de catálogo (nombres de deportes y roles) en JSON por idioma `{es, ca, en}`.
- Tablas en plural, columnas en `snake_case`. Las de Better Auth siguen la misma convención por mapeo.

## Tablas

| Tabla | Para qué | Reglas |
|---|---|---|
| `sports` | Catálogo de deportes | `code` único. `config` guarda la configuración por deporte (vacía en Fase 0). Semilla: `futsal` |
| `organizations` | Un club. Semilla: `demo`, el club de reserva (ADR 0016) | `slug` único con formato de etiqueta DNS; los subdominios reservados se rechazan en la API. Idioma por defecto, deporte por defecto, dos colores de marca `#rrggbb`, logo (Bloque 5), estado `active`, `suspended` o `archived`, voz del club `cercana`, `profesional` o `vestuario` (Bloque 11) |
| `users`, `sessions`, `accounts`, `verifications` | Identidad, Better Auth 1.7 | Generadas con el CLI de Better Auth. `users.locale` es columna propia. Semilla: `admin@demo.test` con contraseña `123456`, administrador del club `demo` (ADR 0020) |
| `roles` | Roles de organización como datos | `code` como clave: `org_admin`, `coach`, `guardian`. Los permisos de cada rol están en `packages/shared` y un test comprueba que ambas listas coinciden |
| `memberships` | Usuario + club + rol | Varias filas por usuario y club, una por rol (ADR 0014). Única por (usuario, club, rol) |
| `invitations` | Invitación a un club con un rol | Solo se guarda el hash del token (ADR 0019). Una sola invitación pendiente por club y email. Estados `pending`, `accepted`, `revoked`; "caducada" se deduce de `expires_at`. Caducidad por defecto 7 días. `locale`: idioma del email, lo elige quien invita. `player_id` y `relationship` (Bloque 11): invitación de familia hecha desde la ficha de un jugador; al aceptarla, la cuenta queda vinculada |
| `platform_admins` | Administradores de la plataforma | Ningún endpoint la escribe (ADR 0008). Además, los emails de `PLATFORM_ADMIN_EMAILS` cuentan como administradores (ADR 0023) |
| `support_access_grants` | Autorización de un club a un administrador de plataforma para ver su contenido completo | Caduca o se revoca. Sin ella, el administrador solo ve agregados (ADR 0017) |
| `email_outbox` | Registro de todos los emails (ADR 0018) | Cada envío se guarda antes de salir: destinatario, idioma, plantilla, cuerpo, transporte y estado `queued`, `sent` o `failed`. Contiene enlaces con tokens vivos: tan sensible como `invitations` |
| `rate_limits` | Contadores del límite de intentos de Better Auth (ADR 0020) | Clave = IP + ruta. Solo los toca Better Auth |
| `audit_log` | Quién hizo qué, sobre qué club y a quién (Bloque 6) | Solo se escribe. Acciones en `AUDIT_ACTIONS` de `packages/shared`. Lo lee el admin interno |
| `app_meta` | Metadatos de la aplicación | Comprueba la cadena de migraciones |
| `seasons` | Temporada de un club ("2026-27") | Nombre único por club. Fechas de inicio y fin (`ends_on > starts_on`). Una sola actual por club (índice único parcial sobre `is_current`). Semilla del demo: 2026-27 |
| `sections` | Sección del club, la capa entre el club y sus equipos | Nombre único por club, orden y estado `active` o `archived`. Con equipos no se borra. Semilla del demo: "Fútbol sala" |
| `teams` | Equipo de una sección en una temporada | Único por (temporada, sección, nombre). Categoría como texto libre. Estado `active` o `archived`. Semilla del demo: cuatro equipos |
| `players` | Jugador del club. No es un usuario | Nombre, apellidos, fecha de nacimiento opcional, estado `active` o `inactive`. Índice por club y apellidos. Ficha ampliada (Bloque 12): clave de la foto en Netlify Blobs (store `player-photos`), pie dominante `right`, `left` o `both`, altura en cm entre 50 y 250. Semilla del demo: 36 jugadores ficticios; Clara Martí con la ficha completa |
| `team_players` | Plantilla: jugador en un equipo | Único por (equipo, jugador). Dorsal opcional (no negativo) y posición como texto. Borrar el equipo o el jugador la arrastra |
| `team_staff` | Cuerpo técnico de un equipo | Único por (equipo, usuario). Solo miembros activos del club, comprobado en la API |
| `player_guardians` | Familia: cuenta vinculada a un jugador | Único por (jugador, usuario). Relación `mother`, `father`, `guardian`, `grandparent` u `other`. Nace al aceptar una invitación de familia o al vincular a un miembro desde la ficha |
| `player_objectives` | Objetivo individual vigente del jugador (Bloque 12) | Uno por jugador (único por `player_id`); guardarlo sustituye al anterior. Título, progreso de 0 a 100, responsable (usuario del club, en nulo si se borra su cuenta) y fecha de revisión |
| `player_indicators` | Indicadores del jugador: deporte, cuerpo, bienestar y compromiso | Único por (jugador, dimensión). Puntuación de 0 a 100 y lectura corta opcional. Quién valoró, en nulo si se borra su cuenta |
| `player_development_plans` | Plan de desarrollo individual (PDI) | Uno por jugador. Una línea por área: técnico, táctico, físico, emocional, hábitos y persona. Coordinación (usuario del club), próxima revisión y estado `draft`, `active` o `shared` |
| `player_events` | Registros del timeline del jugador | Solo se escriben. Tipo en `PLAYER_EVENT_KINDS` de `packages/shared` (plantilla, estado, objetivo, indicadores, PDI, foto, anotación); `details` lleva nombres y cifras para el texto, que la web pone en cada idioma. El alta en el club no se guarda: sale de `players.created_at` |

## Borrados en cascada

- Borrar un club borra sus pertenencias e invitaciones; sus emails registrados quedan sin club. También borra temporadas, secciones, equipos, jugadores, plantillas, cuerpo técnico y familias.
- Borrar un jugador borra su plantilla, sus familias, su objetivo, sus indicadores, su plan de desarrollo y sus registros, y deja sin jugador las invitaciones de familia que lo apuntaban. Su foto queda en Blobs hasta el siguiente cambio (misma política que los logos). Una temporada o una sección con equipos no se puede borrar.
- Borrar un usuario deja sin responsable el objetivo, sin coordinación el plan y sin autor los indicadores y registros que firmó.
- Borrar un usuario borra sus sesiones, cuentas y pertenencias, y deja en nulo quién invitó o aceptó.
- Un deporte o un rol en uso no se pueden borrar.

## Cómo cambiar el esquema

1. Edita `packages/db/src/schema/`.
2. `pnpm --filter @sportsmanager/db exec drizzle-kit generate --name <nombre>`.
3. Revisa el SQL generado. Los datos de catálogo van en una migración manual aparte.
4. `pnpm db:migrate` en local y `pnpm test` (los tests de `packages/db` aplican todas las migraciones contra un Postgres embebido).
5. Commit de esquema y migración juntos. Netlify aplica la migración en la preview y, al mezclar, en producción.
