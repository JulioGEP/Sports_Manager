# 0017. Acceso de soporte del administrador de plataforma a los clubes

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

El responsable de producto decidió que un administrador de plataforma debe poder entrar en el espacio de cualquier club sin pedir permiso, pero sin ver datos privados (nombres de niños, madres y padres, detalles de la organización). Para ver el contenido completo, el club debe autorizarlo.

## Decisión

- Sin pertenencia al club, un administrador de plataforma entra como actor `platform_support` con el único permiso `org.support.read`: estado del club y agregados (miembros por rol, invitaciones pendientes). Ningún endpoint con datos personales o de configuración acepta ese permiso.
- La tabla `support_access_grants` guarda autorizaciones concedidas por el club a un administrador concreto, con caducidad y revocación. Con una autorización vigente, el actor obtiene permisos de lectura completa (`org.settings.read`, `org.members.read`), nunca de escritura.
- Pedir y conceder autorizaciones es parte del Bloque 6 (panel interno) y del flujo del club. En este bloque existen la tabla, la comprobación en la cadena de petición y los tests.

## Consecuencias

- Soporte técnico posible sin exponer menores ni familias.
- Toda ampliación de lo que ve el soporte es una decisión explícita en `packages/shared` (listas `PLATFORM_SUPPORT_PERMISSIONS` y `SUPPORT_GRANT_PERMISSIONS`).
- Las acciones de soporte con escritura (por ejemplo, restaurar un administrador) se diseñarán como operaciones auditadas en el Bloque 6.
