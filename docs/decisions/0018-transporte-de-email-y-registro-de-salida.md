# 0018. Transporte de email y registro de salida

Estado: aceptada. Fecha: 2026-10-20. Amplía la ADR 0005 (Resend como proveedor).

## Contexto

El Bloque 4 necesita dos emails: invitación y restablecer contraseña, en castellano, catalán e inglés. El proveedor es Resend (ADR 0005), pero Resend exige verificar el dominio remitente por DNS y la plataforma todavía no tiene dominio propio. Hay que construir el envío completo ahora y conectarlo más tarde sin tocar código.

## Decisión

- Un puerto de envío único en la capa de datos (`apps/api/src/data/email/`) con dos transportes, elegido por la variable `EMAIL_TRANSPORT`:
  - `outbox` (por defecto): el email se guarda en la tabla `email_outbox` con estado `queued` y no sale.
  - `resend`: el email se guarda y se envía con el SDK oficial de Resend; queda `sent` con el identificador del proveedor o `failed` con el motivo. Exige `RESEND_API_KEY` y `EMAIL_FROM`.
- Todo email pasa por `email_outbox` antes de salir, con transporte, estado, idioma, plantilla y cuerpo. Es el registro de lo enviado y la base para reenviar o inspeccionar desde el panel interno (Bloque 6).
- Un fallo de envío nunca deshace la operación que lo originó (la invitación o la petición de restablecer existen igual) ni lanza error al cliente: la respuesta lleva `emailStatus`.
- Mientras el transporte sea `outbox`, la respuesta de crear o reenviar una invitación incluye `acceptUrl` y la página Miembros muestra el enlace con un botón de copiar. Con `resend` el enlace nunca sale de la API. Con `EMAIL_DEBUG_LOG=true` (solo deploy previews y local) cada email se escribe además en el log de la función, para probar el restablecimiento de contraseña sin proveedor.
- Plantillas en texto plano y HTML sencillo con el nombre y el color del club; los textos viven en los diccionarios compartidos (`packages/shared/src/i18n`) y un test exige las mismas claves en los tres idiomas. Idioma del email de invitación: lo elige quien invita, por defecto el del club. Idioma del restablecimiento: el del usuario y, si no tiene, el del club del host.
- Los enlaces se construyen con el host de la petición solo si ese host resuelve a un club o a la plataforma (`publicOrigin`); cualquier otro host cae al dominio base. Un `Host` ajeno no puede envenenar el enlace de restablecer contraseña.

## Consecuencias

- Conectar Resend es verificar el dominio, crear dos variables en Netlify y cambiar `EMAIL_TRANSPORT` a `resend`. Ningún cambio de código.
- `email_outbox` contiene enlaces con tokens vivos: es tan sensible como `invitations` y nunca se expone por la API sin un permiso explícito.
- Con `outbox` nadie recibe nada: el administrador comparte el enlace a mano. Es un modo de pruebas y lo deja claro la interfaz.
- No se ha podido verificar desde este entorno dónde aloja Resend los datos ni los límites de su plan gratuito. Antes de conectar: https://resend.com/docs y https://resend.com/pricing.

## Alternativas descartadas

- Enviar sin registro: sin rastro de qué salió y sin reenvío.
- Cola con reintentos y webhooks de rebote: útil, pero no para la Fase 0. El registro ya deja el camino hecho.
- Amazon SES, Postmark, Brevo: más fricción de alta o más coste para el volumen previsto; decisión tomada en la ADR 0005.
