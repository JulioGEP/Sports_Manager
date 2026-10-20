# 0027. Front como SPA con Vite, React y Tailwind sobre el design system, y clubes por ruta

Estado: aceptada. Fecha: 2026-10-20. Sustituye a la ADR 0021 en lo que toca a dónde viven los clubes mientras no hay dominio propio.

## Contexto

Tres cosas coincidieron tras el Bloque 9:

1. Producto entregó el design system del SaaS (versión 1.0): tokens, tema de Tailwind v4, motor de color por club con garantía de contraste, componentes de referencia, voz del club e iconos. Toda pantalla debe salir de ahí.
2. La web con Next.js renderizaba cada página en una función de Netlify: cada navegación esperaba un arranque en frío. Producto pidió "lo más rápido, moderno, eficiente y escalable" y un front en React + Tailwind.
3. Sin dominio propio no hay subdominios por club en `hubsports.netlify.app`, así que en producción solo respondía el club demo. Producto decidió que cada club viva en una ruta (`/demo`, `/elnombre`) hasta tener dominio, y entonces pasar a subdominios.

## Decisión

- **SPA estática con Vite + React 19 + TypeScript + Tailwind v4.** Se sirve desde la CDN de Netlify; `/api/*` sigue en la función de Hono en el mismo origen (ADR 0010). Sin renderizado en servidor: la marca del club se carga desde `/api/org/branding` al entrar. Enrutado con React Router, datos con TanStack Query, textos con react-intl (ICU) a partir de los mismos diccionarios es/ca/en.
- **Design system como paquete del workspace** (`packages/design`): `DESIGN.md` es la fuente de verdad; la web importa `tailwind/theme.css` como hoja principal y usa solo clases del tema. Los colores del club los genera `buildClubTheme` y se aplican en la raíz; fuera de un club manda la marca del producto (cobalto). Forma Envolvente en móvil y Precisa en gestión de escritorio y en el panel del negocio. Fuentes Geist autoalojadas (`@fontsource-variable`), sin llamadas a Google Fonts: idénticas en producción, en local y en CI.
- **Clubes por ruta.** La web vive en `/<slug>/...` y declara el club en la cabecera `x-sm-club` de cada petición; los recursos que el navegador pide sin cabeceras (el logo en un `<img>`) llevan `?club=<slug>`. La API acepta siempre las dos señales, subdominio y cabecera, y el subdominio manda si existe. `TENANT_ROUTING` (`path` por defecto, `subdomain` cuando haya dominio con comodín) solo decide cómo construye los enlaces de emails y de la ficha del club. Los nombres de rutas de la web (`admin`, `login`, `clubs`, `invitations`, `api`, `assets`...) quedan reservados y nunca son un club. El club de reserva (ADR 0016) deja de hacer falta en producción.
- **Un único login** en `/login` para todos los clubes; el negocio mantiene su entrada en `/admin/login` (ADR 0026). Una sola cookie de host, sin dominio de cookie hasta tener subdominios.
- **Pruebas de interfaz** igual que en el Bloque 8 (ADR 0025), ahora contra `vite preview` con reenvío de `/api` a la API local en tiempo de ejecución: la web se construye una sola vez, igual que en producción.

## Consecuencias

- Navegar entre pantallas no toca el servidor; solo las llamadas a la API. El primer pintado espera a la marca del club (una petición).
- Netlify ya no necesita el adaptador de Next; `netlify.toml` publica `apps/web/dist` con dos redirecciones: `/api/*` a la función y el resto a `index.html`.
- Cambiar a subdominios con dominio propio es configuración (`TENANT_ROUTING=subdomain`, `SESSION_COOKIE_DOMAIN`) más una revisión de los enlaces internos de la web, que hoy llevan el slug en la ruta.
- Los iconos Phosphor duotono usan el relleno por defecto de la librería (20 % del color), no `--icon-duo`; queda pendiente ajustarlo como pide DESIGN.md, sección 8.
- La voz del club (`cercana`, `profesional`, `vestuario`) y el modo oscuro del design system no se exponen aún en los ajustes: llegan con la Fase 1.

## Alternativas descartadas

- Mantener Next.js y añadir Tailwind: no resuelve la latencia por navegación, que era el problema.
- Clubes por cabecera o cookie sin ruta: una URL que no dice de qué club es no se puede compartir ni enlazar desde un email.
- Clubes por subdominio ya: imposible en `*.netlify.app`; la decisión de dominio se toma al final.
