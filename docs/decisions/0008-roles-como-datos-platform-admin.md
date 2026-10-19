# 0008. Roles como datos y platform_admin fuera de la aplicación

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Roles iniciales: `platform_admin`, `org_admin`, `coach`, `guardian`. El modelo debe permitir añadir roles sin migraciones destructivas. Un rol solo lo asigna un `org_admin` de esa organización o un `platform_admin`. `platform_admin` no se puede asignar desde la aplicación.

## Decisión

- Tabla `roles` con código, nombre y ámbito. Añadir un rol es insertar una fila en una migración de datos. Nada de tipos enumerados en la base.
- `memberships` referencia `roles`. Una pertenencia por usuario y organización.
- `platform_admin` no es una pertenencia ni una fila de `roles`: tabla `platform_admins` con el identificador de usuario, escrita solo por migración de datos o script de operaciones. Ningún endpoint la toca.
- Permisos: mapa rol → lista de permisos en `packages/shared`. La API comprueba permisos, nunca nombres de rol. Añadir un rol es una fila más y una entrada en el mapa.

## Consecuencias

- Añadir o renombrar roles no toca el esquema.
- La lista de permisos vive en código y se revisa en PR.
- Dos lugares que mantener alineados: filas de `roles` y mapa de permisos. Un test los compara.

## Alternativas descartadas

- Enum de Postgres: cada rol nuevo es un `ALTER TYPE`.
- `platform_admin` como pertenencia a una organización "plataforma": mezcla dos ámbitos y abre la puerta a asignarlo por la API.
