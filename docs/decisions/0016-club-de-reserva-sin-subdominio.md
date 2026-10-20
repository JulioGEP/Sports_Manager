# 0016. Club de reserva cuando el host no lleva subdominio

Estado: aceptada. Fecha: 2026-10-20. Complementa al ADR 0011.

## Contexto

Hoy producción vive en `hubsports.netlify.app` y las deploy previews en `deploy-preview-N--hubsports.netlify.app`. Ninguno admite subdominios por club. El dominio propio con subdominios llegará más adelante.

## Decisión

La variable de servidor `TENANT_FALLBACK_SLUG` nombra un club de reserva. La API lo sirve solo cuando no hay subdominio de club que resolver: el host es exactamente el dominio base, o la petición llega en una deploy preview o branch deploy (contexto que Netlify entrega a la función). Nunca sustituye a un subdominio real: con dominio propio, `club.<dominio>` sigue resolviendo a `club`.

Una migración de datos crea la organización `demo` ("Club de demostración") para que esa reserva exista en todos los entornos.

## Consecuencias

- Producción y previews funcionan sin dominio propio sirviendo un club.
- Cuando exista el dominio, basta con cambiar `APP_BASE_DOMAIN` y, si se quiere, retirar la variable de reserva.
- El host `admin` tampoco existe sin dominio: el panel de plataforma (Bloque 6) necesitará su propio mecanismo provisional.
