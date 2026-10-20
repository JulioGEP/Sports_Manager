# 0009. Aislamiento entre clubes por código

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Una sola base de datos para todos los clubes. El aislamiento es requisito de diseño.

## Decisión

Toda petición a la API pasa por esta cadena, en este orden:

1. El subdominio identifica la organización. Reservado o desconocido: 404.
2. La cookie de sesión identifica al usuario. Sin sesión: 401.
3. La pertenencia del usuario a esa organización autoriza y fija el rol. Sin pertenencia: 403.
4. El manejador recibe un contexto con organización, usuario, pertenencia y rol.
5. Una única capa de acceso a datos en `apps/api/src/data/`. Toda consulta recibe el contexto y añade el identificador de organización. No existe función de consulta sin él.

La API nunca acepta un identificador de organización enviado por el cliente.

El panel interno usa otra cadena: sesión, comprobación en `platform_admins`, acceso. No resuelve club.

Guardas: `apps/web` no depende de `packages/db`; lint que prohíbe importar `packages/db`, `drizzle-orm` y `pg` fuera de la capa de datos; test de arquitectura que recorre los ficheros; tests de aislamiento con dos organizaciones como check obligatorio en CI.

## Consecuencias

- Una sola forma de consultar. Cualquier atajo falla en lint, en test o en revisión.
- No se usa Row Level Security de Postgres en la Fase 0. Se revisará antes de la Fase 1, cuando entren datos de menores, como posible segunda barrera.

## Alternativas descartadas

- Base de datos o esquema por club: coste operativo y de migraciones que no compensa para clubes pequeños.
- Confiar en un identificador de organización del front: inseguro por definición.
