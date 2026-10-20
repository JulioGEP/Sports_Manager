# Modelo de datos

Estado: Fase 0, Bloque 4. Solo lo necesario para organizaciones, identidad, pertenencias e invitaciones. Jugadores, equipos y secciones llegan en la Fase 1.

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
| `organizations` | Un club. Semilla: `demo`, el club de reserva (ADR 0016) | `slug` único con formato de etiqueta DNS; los subdominios reservados se rechazan en la API. Idioma por defecto, deporte por defecto, dos colores de marca `#rrggbb`, logo (Bloque 5), estado `active`, `suspended` o `archived` |
| `users`, `sessions`, `accounts`, `verifications` | Identidad, Better Auth 1.7 | Generadas con el CLI de Better Auth. `users.locale` es columna propia. Semilla: `admin@demo.test` con contraseña `123456`, administrador del club `demo` (ADR 0020) |
| `roles` | Roles de organización como datos | `code` como clave: `org_admin`, `coach`, `guardian`. Los permisos de cada rol están en `packages/shared` y un test comprueba que ambas listas coinciden |
| `memberships` | Usuario + club + rol | Varias filas por usuario y club, una por rol (ADR 0014). Única por (usuario, club, rol) |
| `invitations` | Invitación a un club con un rol | Solo se guarda el hash del token (ADR 0019). Una sola invitación pendiente por club y email. Estados `pending`, `accepted`, `revoked`; "caducada" se deduce de `expires_at`. Caducidad por defecto 7 días. `locale`: idioma del email, lo elige quien invita |
| `platform_admins` | Administradores de la plataforma | Ningún endpoint la escribe (ADR 0008) |
| `support_access_grants` | Autorización de un club a un administrador de plataforma para ver su contenido completo | Caduca o se revoca. Sin ella, el administrador solo ve agregados (ADR 0017) |
| `email_outbox` | Registro de todos los emails (ADR 0018) | Cada envío se guarda antes de salir: destinatario, idioma, plantilla, cuerpo, transporte y estado `queued`, `sent` o `failed`. Contiene enlaces con tokens vivos: tan sensible como `invitations` |
| `rate_limits` | Contadores del límite de intentos de Better Auth (ADR 0020) | Clave = IP + ruta. Solo los toca Better Auth |
| `app_meta` | Metadatos de la aplicación | Comprueba la cadena de migraciones |

## Borrados en cascada

- Borrar un club borra sus pertenencias e invitaciones; sus emails registrados quedan sin club.
- Borrar un usuario borra sus sesiones, cuentas y pertenencias, y deja en nulo quién invitó o aceptó.
- Un deporte o un rol en uso no se pueden borrar.

## Cómo cambiar el esquema

1. Edita `packages/db/src/schema/`.
2. `pnpm --filter @sportsmanager/db exec drizzle-kit generate --name <nombre>`.
3. Revisa el SQL generado. Los datos de catálogo van en una migración manual aparte.
4. `pnpm db:migrate` en local y `pnpm test` (los tests de `packages/db` aplican todas las migraciones contra un Postgres embebido).
5. Commit de esquema y migración juntos. Netlify aplica la migración en la preview y, al mezclar, en producción.
