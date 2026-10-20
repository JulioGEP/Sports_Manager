# 0019. Alta de cuentas solo por invitación

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

No hay registro abierto: una persona entra en la plataforma porque un club la invita con un rol. Better Auth, con `disableSignUp`, bloquea el alta tanto en el endpoint público como en su API de servidor (la comprobación vive dentro del propio endpoint; verificado en el código de la versión instalada). Hace falta crear la cuenta al aceptar una invitación sin reabrir el registro.

## Decisión

- Token de invitación de 32 bytes aleatorios en base64url; en base solo su hash SHA-256 (`invitations.token_hash`). Un volcado de la tabla no sirve para aceptar nada. Caducidad de 7 días (`INVITATION_TTL_DAYS`). Una sola invitación pendiente por club y email (índice único parcial). Reenviar genera token y caducidad nuevos y anula el enlace anterior; revocar lo anula sin más.
- Solo quien tiene `org.members.invite` en el club del host invita, reenvía, revoca o lista. Roles invitables: los de la tabla `roles`; `platform_admin` no es un rol (ADR 0008) y el esquema lo rechaza. Invitar a quien ya tiene ese rol en el club devuelve 409.
- El enlace de aceptación vive en el host del club. `GET /api/invitations/{token}` y `POST .../accept` comprueban que el club de la invitación es el del host; en otro club el token no existe (404).
- Aceptar, con el email sin cuenta: nombre y contraseña obligatorios. La cuenta se crea con el adaptador interno de Better Auth (`auth.$context.internalAdapter.createUser` y `linkAccount` con su propio hash de contraseña, origen de alta `invitation`), con el email verificado porque la invitación llegó a ese email. Después se inicia sesión con el endpoint normal de Better Auth y se reenvían sus cookies: la cuenta queda exactamente como si se hubiera registrado por la vía normal.
- Aceptar, con el email ya registrado: exige la sesión de ese mismo email (401 sin sesión, 403 con la sesión de otra persona) y añade el rol al club. Una sesión ajena tampoco puede aceptar una invitación a un email sin cuenta (403).
- La invitación pasa a `accepted` y el token deja de valer. Caducada: 410. Ya aceptada: 409. Revocada o inexistente: 404.

## Consecuencias

- Dependencia de la API interna de Better Auth (`$context`), documentada por el proyecto para estos usos y cubierta por los tests de aislamiento. Al actualizar Better Auth, el test de aceptación avisa si cambia.
- Con transporte `outbox` el administrador ve el enlace y puede dárselo a cualquiera: en ese modo el email no prueba la identidad. Es un modo de pruebas (ADR 0018); con `resend` el enlace solo viaja por email.
- Una persona con cuenta recibe invitaciones de varios clubes y las acepta con un único login (ADR 0006): la pertenencia se suma, la cuenta no se duplica.

## Alternativas descartadas

- Plugin `admin` de Better Auth para crear usuarios: añade un sistema de roles paralelo al de la plataforma.
- Abrir `signUp` y bloquearlo con un hook que exija token: deja el endpoint público expuesto a errores de configuración.
- Enlaces mágicos sin contraseña: la decisión de producto es email y contraseña.
