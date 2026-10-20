# 0021. Subdominios por club, parche local y comodín en Netlify

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

Cada club vive en `<slug>.<dominio base>` (ADR 0011), pero el dominio definitivo no está decidido y `hubsports.netlify.app` no admite subdominios por club. La web necesita pintar la marca del club antes del login y ofrecer un selector de club a quien pertenece a varios.

## Decisión

- La web nunca interpreta el host. Pasa el de cada petición a `GET /api/org/branding` (público) y pinta lo que la API devuelve. La API sigue siendo la única autoridad sobre qué club se sirve (ADR 0015).
- Las direcciones de los clubes también las calcula la API (`url` en `/api/me/memberships`): subdominio del dominio base y, para el club de reserva, el dominio base a secas.
- En local, `*.sportsmanager.localhost:8888`, que Chrome y Firefox resuelven solos; el resto con `/etc/hosts`. Es un parche explícito hasta el dominio final.
- El comodín en producción se documenta en `docs/dominio-y-dns.md` con lo que se sabe (respuestas del personal de Netlify en su foro, no documentación oficial verificada) y los pasos para cuando exista el dominio. Hasta entonces la cookie es de host único y el selector de club enlaza a subdominios que solo resuelven en local.

## Consecuencias

- Una petición por página al servidor de la API para leer la marca, sin caché, para que los cambios de marca se vean al instante. Es barata y la deduplica React dentro de la misma petición.
- El producto se puede ver completo en `hubsports.netlify.app` con el club demo; la experiencia multi-club real llega con el dominio y tres variables de entorno.
- Nada de lo decidido cambia cuando llegue el dominio: solo configuración.

## Alternativas descartadas

- Resolver el club en la web con el host: duplica la lógica de la API y abre la puerta a que web y API discrepen.
- Rutas por club en la URL (`/club-a/...`) mientras no haya dominio: cambiaría el modelo de identidad del club y habría que deshacerlo después.
