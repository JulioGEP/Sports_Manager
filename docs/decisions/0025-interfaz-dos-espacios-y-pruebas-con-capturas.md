# 0025. Interfaz: dos espacios, sistema de componentes y pruebas de interfaz con capturas

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

La interfaz de los Bloques 4 a 7 no servía: no se distinguía el espacio de un club del panel del negocio, la marca y el logo de cada club se editaban desde el panel del negocio, había botones ilegibles y nadie miraba las pantallas antes de desplegar. El responsable de producto la puntuó con un 0 y pidió que cada club gestionara su propia marca y que el administrador de un club viera producto nada más entrar.

## Decisión

- **Dos espacios con aspecto distinto.** El espacio del club (`/`, `/members`, `/settings`, `/clubs`) lleva barra superior con el nombre, el logo y los colores del club del host, navegación por permisos y menú de persona. El panel del negocio (`/admin/*`) lleva barra lateral oscura con la marca neutra de la plataforma y nunca los colores de un club. Las pantallas de acceso (login, recuperación, invitación) van centradas con la marca del club del host.
- **La marca es del club.** Colores y logo se configuran solo desde los ajustes del club por quien tiene `org.settings.write`. El panel del negocio da de alta clubes (nombre, subdominio, idioma, deporte), invita al primer administrador y cambia el estado; muestra la marca que el club haya configurado, sin editarla.
- **Sistema de componentes propio.** `apps/web/src/ui` (botón, campo, tarjeta, cabecera de página, pestañas, panel lateral, tabla, avisos, toasts, estado vacío) y una sola hoja `apps/web/src/styles/app.css` sobre los tokens compartidos. Sin hexadecimales fuera de los tokens. Cada variante de botón fija texto y fondo a la vez, para que no vuelvan a aparecer botones blancos sobre blanco. Formularios cortos en panel lateral; tablas que se apilan en móvil.
- **Estados explícitos.** `ClubProvider` carga sesión, club y pertenencias una vez por página y expone cargando, error, sin pertenencia y listo. Cada página decide qué enseñar en cada estado; no hay pantallas en blanco.
- **Pruebas de interfaz contra la aplicación real.** Playwright arranca la API con Postgres embebido y las migraciones del repo (`apps/api/scripts/serve-local.mjs`) y la web de Next ya construida con el reenvío `/api` hacia esa API. Escritorio y móvil. Cada pantalla se captura en `apps/web/e2e/screenshots` y CI las publica como artefacto (`capturas-interfaz`). Una comprobación recorre todos los botones y falla si el color del texto coincide con el fondo.
- **Entorno de pruebas fiel a producción.** Chromium resuelve `*.localhost` sin DNS, así que las pruebas usan `sportsmanager.localhost` como dominio base, con el club demo de reserva y cada club nuevo en su subdominio; la cookie de sesión lleva dominio para que un único login valga en todos los clubes, como pasará con el dominio definitivo. El servidor local reconstruye el `Host` real a partir de `x-forwarded-host`, que es lo que la función recibe en Netlify. `LOGO_STORE=memory` sustituye Netlify Blobs solo en local y se rechaza fuera.

## Consecuencias

- Cualquier cambio de pantalla se revisa viendo las capturas en la PR, no leyendo código. El job `interfaz` tarda unos minutos más que el resto de CI.
- La web se construye dos veces de forma distinta: para producción sin reenvío y para las pruebas con `API_PROXY_TARGET`. Está documentado en `docs/deploy.md`.
- Las capturas del Bloque 8 se guardan en `docs/capturas/` para esta revisión; a partir de ahora la fuente viva es el artefacto de CI.

## Alternativas descartadas

- Tailwind o un kit de componentes externo: añade dependencia y duplica los tokens; la hoja propia es pequeña y la marca por club se resuelve con variables CSS.
- Storybook: útil cuando el catálogo crezca; hoy las capturas de pantallas completas cubren la revisión.
- Comparación de capturas píxel a píxel: frágil con fuentes y fechas; se revisan a ojo en la PR.
