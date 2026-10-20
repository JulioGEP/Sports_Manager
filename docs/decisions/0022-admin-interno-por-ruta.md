# 0022. Admin interno en `/admin` del dominio base

Estado: aceptada. Fecha: 2026-10-20. Sustituye la parte de la ADR 0011 que situaba el panel interno en el subdominio `admin`.

## Contexto

La ADR 0011 reservó `admin.<dominio>` para el panel interno. Sin dominio propio no existe ese host, y el responsable de producto quiere ver el admin funcionando ya. Además, un administrador de plataforma tiene la misma sesión en cualquier host (ADR 0006): la restricción por host no añadía seguridad real.

## Decisión

- El admin interno vive en la ruta `/admin` de la web y en `/api/platform/*` de la API, en cualquier host. La cadena de acceso es sesión → administrador de plataforma (ADR 0023); quien no lo es recibe 403 y la web muestra un aviso.
- Las rutas de plataforma no resuelven club por host: cada una nombra el club por su slug y la capa de datos acuña el ámbito desde la fila real (ADR 0015). El administrador de plataforma, dentro de un club, sigue en modo soporte (ADR 0017): el admin interno le permite crear y configurar clubes, no leer sus datos personales.
- El subdominio `admin` sigue reservado: nadie puede registrar un club con ese nombre.

## Consecuencias

- El admin funciona hoy en `hubsports.netlify.app/admin` y no cambia cuando llegue el dominio.
- Toda acción del admin queda en `audit_log` con quién, qué, sobre qué club y a quién.
- Los clubes creados desde el admin solo son accesibles por subdominio: hasta el dominio con comodín (ADR 0021), en producción solo el club de reserva responde. La interfaz lo avisa.

## Alternativas descartadas

- Esperar al dominio para tener admin: bloquea el alta de clubes y las pruebas de producto.
- Alias temporal `admin--hubsports.netlify.app`: Netlify no lo ofrece para proyectos sin dominio; sería otra pieza que deshacer.
