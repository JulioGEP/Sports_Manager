# 0015. Cadena de petición y ámbito de organización

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

El aislamiento entre clubes se hace por código (ADR 0009). Hace falta que la regla "club por subdominio, usuario por sesión, permisos por pertenencia" sea mecánica y que ninguna consulta pueda salir sin club.

## Decisión

Toda petición a `/api/org/*` atraviesa, en este orden, los middleware de `apps/api/src/http/`:

1. `resolveTenant`: el host decide el club (función pura `classifyHost`, con tests). Reservado o inexistente: 404. Club no activo: 403.
2. `requireSession`: Better Auth valida la cookie. Sin sesión: 401.
3. `requireActor`: pertenencias activas del usuario en ese club. Sin ninguna: 403, salvo administrador de plataforma, que entra en modo soporte (ADR 0017). El actor lleva roles y permisos (unión, ADR 0014).
4. `requirePermission`: cada ruta exige un permiso, nunca un nombre de rol.

El club resuelto se representa con `OrgScope`, un tipo marcado que solo construye la capa de datos a partir de una fila real de `organizations`. Toda función de la capa de datos sobre datos de un club exige un `OrgScope` y añade `organization_id` a la consulta. No existe variante sin ámbito. La única consulta sin club es `memberships.listForUser(userId)`, filtrada por el usuario de la sesión, que alimenta el selector de clubes.

Grupos de rutas: públicas (`/api/health`, `/api/docs`, `/api/auth/*`), personales (`/api/me/*`, solo sesión), de club (`/api/org/*`, cadena completa) y de plataforma (`/api/platform/*`, solo en el host `admin`, sesión más fila en `platform_admins`).

Barreras: ESLint prohíbe importar la base de datos y Better Auth fuera de `src/data`; el test de arquitectura lo comprueba de forma independiente; la suite de aislamiento (dos clubes, cinco usuarios, sesiones reales) es un check obligatorio en CI.

## Consecuencias

- Un identificador de club enviado por el cliente no tiene ningún efecto: no hay código que lo lea.
- Añadir un endpoint de club es declarar su permiso y usar el `OrgScope` del contexto. Olvidar el ámbito no compila.
- Los tests de aislamiento son la especificación ejecutable de la regla.
