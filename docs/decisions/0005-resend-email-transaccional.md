# 0005. Resend como proveedor de email transaccional

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Hacen falta emails de invitación y de recuperación de contraseña en castellano y catalán. Datos que viajan: nombre, email y un enlace con token.

## Decisión

Resend, con dominio verificado y región de envío en la UE (Irlanda). Plantillas propias por idioma. En local y en tests, transporte en memoria.

## Consecuencias

- Buena experiencia de desarrollo, SDK TypeScript, webhooks de entrega.
- Reserva conocida y aceptada por el responsable de producto: según la documentación de Resend, los datos de cuenta, metadatos de email, logs y registros de API se almacenan en Estados Unidos aunque el envío sea desde Irlanda. Si en el futuro se exige residencia UE completa para logs, se cambia a Scaleway Transactional Email o Brevo. El código de envío queda detrás de una interfaz para que el cambio sea local.
- Precios y límites no verificados en el momento de la decisión.

## Alternativas descartadas

- Amazon SES en Irlanda: más barato y residente en UE, pero peor experiencia, acceso a producción por solicitud y más trabajo de plantillas y rebotes.
- Postmark: sin región UE.
- Scaleway y Brevo: residencia UE completa; descartados de momento por experiencia de desarrollo y tooling.
