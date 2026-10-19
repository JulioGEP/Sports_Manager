# 0003. Drizzle como ORM y migraciones aplicadas por Netlify DB

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

La base de datos es Netlify Database (Postgres). Netlify aplica automáticamente las migraciones commiteadas: en cada deploy preview antes de publicarla y en producción justo antes de publicar. Un cambio de esquema nunca debe llegar a producción sin pasar por preview.

## Decisión

Drizzle ORM en `packages/db`. `drizzle-kit generate` escribe migraciones SQL en el directorio que Netlify aplica. Prefijo de fichero con marca de tiempo. Nadie ejecuta migraciones a mano contra una base alojada: ni `drizzle-kit push`, ni `drizzle-kit migrate`, ni DDL por conexión directa. En local, `netlify database migrations apply`.

Driver: Drizzle estable con `pg` y la cadena de conexión de `@netlify/database`, salvo que en el momento de implementar el adaptador nativo `drizzle-orm/netlify-db` esté publicado en versión estable. Se registra en el ADR de implementación del Bloque 1.

Cambios que rompen (renombrar o borrar columnas) se hacen en tres pasos: expandir, migrar, contraer.

## Consecuencias

- Migraciones legibles en cada PR, en SQL.
- Tipos inferidos del esquema. SQL crudo disponible para casos concretos.
- Sin binarios de motor en la función.
- Las migraciones aplicadas son inmutables: corregir es escribir otra.

## Alternativas descartadas

- Prisma: motor binario, sin integración documentada con Netlify DB, más pesado en Lambda.
- Kysely: solo constructor de consultas; habría que montar migraciones y tipos aparte.

## Nota de implementación (Bloque 1, 2026-10-19)

`drizzle-orm` 0.45.4 estable ya incluye el adaptador `drizzle-orm/netlify-db`, así que no hace falta ninguna versión beta. Aun así, `packages/db` usa el driver `node-postgres` con la cadena de conexión que da `@netlify/database` (`getConnectionString()`), porque el mismo cliente sirve sin cambios en tests con Postgres embebido (`@netlify/database-dev`), en local y en Netlify. Las migraciones se generan con `drizzle-kit` directamente en `netlify/database/migrations` con prefijo de fecha y hora.
