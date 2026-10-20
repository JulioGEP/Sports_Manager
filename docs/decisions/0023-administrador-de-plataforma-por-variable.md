# 0023. Primer administrador de plataforma por variable de entorno

Estado: aceptada. Fecha: 2026-10-20. Amplía la ADR 0008.

## Contexto

`platform_admins` es una tabla que ningún endpoint escribe (ADR 0008). Hacía falta un primer administrador para usar el admin interno sin sembrar contraseñas conocidas con poder de plataforma ni editar la base a mano.

## Decisión

- La variable `PLATFORM_ADMIN_EMAILS` (lista separada por comas) nombra emails que cuentan como administradores de plataforma, además de las filas de `platform_admins`. La comprobación es en cada petición: tabla o lista.
- La cuenta con ese email nace como cualquier otra: por invitación a un club (hoy, desde el administrador del club demo). Al entrar, ya es administradora de plataforma.
- Quitar a alguien es quitar su email de la variable y redesplegar. Añadir administradores desde el propio admin queda para más adelante, como operación auditada.

## Consecuencias

- Ningún secreto ni contraseña de plataforma en migraciones. La cuenta demo (ADR 0020) no es administradora de plataforma.
- La variable vive en Netlify, con ámbito de funciones; cambiarla exige un deploy. Es el precio de no tener un endpoint que otorgue el poder máximo.

## Alternativas descartadas

- Migración de datos con el email: cada alta o baja sería una migración.
- Que el administrador del club demo sea también de plataforma: una contraseña conocida con poder sobre todos los clubes.
