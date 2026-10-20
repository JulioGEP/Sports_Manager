# 0014. Varios roles por usuario y club

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

El plan hablaba de "usuario + organización + rol", una pertenencia por club. En un club real una misma persona puede ser entrenadora y madre de un jugador. Con una sola pertenencia por club haría falta dos cuentas o un rol combinado.

## Decisión

La tabla `memberships` admite varias filas por usuario y club, una por rol: la unicidad es (usuario, organización, rol). Los permisos de una persona en un club son la unión de los permisos de sus roles (`permissionsForRoles` en `packages/shared`). La API comprueba permisos, nunca nombres de rol.

## Consecuencias

- Una cuenta por persona en todos los casos.
- El contexto de cada petición lleva un conjunto de roles, no uno solo. La interfaz puede mostrar el rol "principal" por orden de prioridad de la tabla `roles`.
- Las invitaciones siguen siendo por rol: invitar a alguien que ya es miembro con otro rol añade una pertenencia nueva.

## Alternativas descartadas

- Un rol por club: más simple, pero obliga a dos cuentas en el caso entrenadora y madre.
- Lista de roles en una columna: no permite claves foráneas ni índices por rol.
