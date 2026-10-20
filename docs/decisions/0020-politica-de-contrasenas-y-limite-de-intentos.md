# 0020. Política de contraseñas y límite de intentos

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

Better Auth 1.7 trae por defecto contraseñas de 8 a 128 caracteres, sesiones de 7 días, enlace de restablecer válido 1 hora y un límite de intentos en memoria (3 intentos de login por IP cada 10 segundos; 3 peticiones de restablecer por minuto). En Netlify Functions la memoria no se comparte entre instancias, así que ese límite es parcial. El responsable de producto fijó `123456` como contraseña de las cuentas de prueba y demostración.

## Decisión

- Contraseña: mínimo 6 caracteres, máximo 128 (`PASSWORD_MIN_LENGTH` en `packages/shared`). El mínimo baja de 8 a 6 por decisión de producto para que `123456` valga en pruebas. Las personas que aceptan una invitación eligen su contraseña.
- Sesión de 7 días y enlace de restablecer de 1 hora: valores por defecto de Better Auth, sin cambios.
- Al restablecer la contraseña se cierran todas las demás sesiones (`revokeSessionsOnPasswordReset`).
- Límite de intentos con las reglas por defecto de Better Auth, pero con contadores en la tabla `rate_limits` (`storage: "database"`) para que valgan entre instancias. La IP se lee de `x-nf-client-connection-ip` (la que fija Netlify) y, si no está, de `x-forwarded-for`. Desactivado en local y en tests.
- Cuenta de demostración sembrada por migración: `admin@demo.test`, contraseña `123456`, `org_admin` del club `demo`. Solo tiene pertenencia en el club de demostración; el aislamiento (ADR 0015) le impide ver cualquier otro club.

## Consecuencias

- Un mínimo de 6 caracteres es débil. Antes de dar de alta clubes reales conviene subirlo (cambiar una constante) y, si se quiere, exigir más complejidad.
- La cuenta de demostración es una credencial conocida. Antes de tener datos reales hay que cambiarle la contraseña o desactivarla desde el panel interno (Bloque 6). Mientras tanto solo alcanza datos de demostración.
- Cada petición a `/api/auth/*` en producción añade una lectura y una escritura en `rate_limits`. Es el precio de un límite real en un entorno sin memoria compartida.

## Alternativas descartadas

- Límite en memoria: inútil con varias instancias.
- Redis u otro almacén externo: una dependencia más para un problema que Postgres ya resuelve a este volumen.
- Mantener el mínimo de 8: contradice la decisión de producto; queda documentado el riesgo.
