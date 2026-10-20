# 0004. Better Auth dentro de apps/api

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Autenticación con email y contraseña, recuperación de contraseña, un único login por persona válido en varios clubes, alta solo por invitación. Sin servicios externos de identidad. Sin implementar a mano cifrado de contraseñas ni sesiones.

## Decisión

Better Auth, ejecutándose dentro de `apps/api` con el adaptador de Drizzle sobre la misma base de datos. Las tablas de usuarios, sesiones, cuentas y verificaciones son las que genera Better Auth. El registro público queda desactivado; los usuarios se crean al aceptar una invitación.

Las pertenencias a clubes, los roles y las invitaciones son tablas propias, no el plugin de organizaciones de Better Auth, para que el modelo de tenancy, los permisos y el panel interno estén bajo control del dominio.

## Consecuencias

- Hashing, sesiones, tokens de recuperación y protección CSRF los aporta una librería mantenida.
- Los datos de identidad no salen de nuestra base de datos ni de la región elegida.
- Hay que mantener la librería actualizada y revisar sus avisos de seguridad.
- Si Better Auth cambia su esquema entre versiones, las migraciones son nuestras.

## Alternativas descartadas

- Clerk, Auth0, Supabase Auth: identidad en un tercero, fuera del control de residencia de datos.
- Auth.js: orientado a OAuth y a Next.js; peor encaje en una API separada.
- Implementación propia: prohibida por la decisión de producto y por riesgo.
