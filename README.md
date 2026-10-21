# sportsmanager

SaaS B2B para la gestión de clubes deportivos. Cada club tiene su espacio aislado, su marca y las funciones de su plan. Empieza por fútbol sala; el deporte es configuración en datos, no código.

## Estado

Reto por sección o equipo (ADR 0032): un reto ya no es del club entero; es de una sección (para toda ella) o de un solo equipo de esa sección, de manera independiente. La familia ve, por cada jugador, los retos activos de su sección y de su equipo y registra en cada uno; la entrenadora crea y gestiona solo retos de sus equipos, y la administración, dirección y coordinación los de cualquier sección o equipo. El club demo suma el "Reto técnico del Alevín A". Bloques 14 a 18 (ADR 0031): el panel del administrador replanteado como un club completo (`docs/propuesta-club-completo.md`). Personas como base de todo (deportista, familia, socio y personal son papeles de la misma persona); secciones por deporte y tipo (competición con equipos por categoría, o actividad con grupos con horario y plazas) con coordinación y catálogo de quince deportes con categorías sugeridas; categorías como tabla; socios con tipos y número; instalaciones con horario de apertura; agenda del club (semana y día) generada desde el horario semanal de cada equipo, con partidos y reuniones y aviso de solapes; pase de lista por el cuerpo técnico; cuotas con planes, cargos por periodo y pagos a mano, y Stripe preparado como Resend (Checkout en la cuenta del club y webhook firmado, sin conectar hasta tener claves); "ver como" para que la administración mire el club con los ojos de cualquier persona sin volver a entrar, con la auditoría a su nombre real; "Equipos" pasa a "Secciones", "Miembros" a "Personal", entran Socios, Agenda, Instalaciones, Cuotas y Mis cuotas, y el inicio se rehace (hoy en el club, recuentos, tarjetas de sección, alertas, preparación de fichas). Club demo con baloncesto, natación y yoga, socios, instalaciones, agenda y cuotas. Bloque 13 (ADR 0030): lo que faltaba del prototipo con el look & feel del producto. Rol de personal del club con cargo (dirección, coordinación, delegación, fisio, preparación física, psicología, scout) y permisos que siguen al cargo; permisos por equipo para que la entrenadora gestione su plantilla, valore a sus jugadores y valide sus registros; inicio operativo con alertas, preparación de las fichas, accesos rápidos, últimos movimientos y un panel por cargo; ficha de jugador para la familia (foto que puede cambiar, equipo, objetivo, PDI compartido, movimientos y puntos del reto, nunca indicadores ni comparativas); fecha de alta en el club; reto por puntos con catálogo de pruebas, registro de la familia, validación del club, participación solo para el personal y cierre con rastro en el timeline; miembros con cargo y equipos, invitaciones con cargo y equipo; club demo con `director@demo.test`, `fisio@demo.test` y un reto activo. Fase 1, Bloque 12: ficha ampliada del jugador (ADR 0029), al nivel de la referencia de producto: foto (Netlify Blobs, reducida en el navegador), pie dominante y altura, cuatro indicadores de 0 a 100 con lectura corta, objetivo individual con progreso, responsable y revisión, acciones prioritarias deducidas de lo que falta, timeline de registros (plantilla, estado, objetivo, PDI, foto y anotaciones), datos deportivos y plan de desarrollo individual en seis áreas; la familia ve la foto de sus jugadores y Clara Martí llega sembrada en el club demo. Bloque 11: estructura del club (ADR 0028): temporadas con una actual, secciones, equipos con plantilla (dorsal y posición) y cuerpo técnico, jugadores con ficha y estado, y familias vinculadas por invitación desde la ficha del jugador; permisos nuevos por rol, voz del club en ajustes y club demo precargado con cuatro equipos, una entrenadora (`entrenador@demo.test`) y una familia (`familia@demo.test`). Bloque 10: front nuevo como SPA con Vite + React + Tailwind sobre el design system del producto (`packages/design`, ADR 0027); cada club vive en una ruta del mismo dominio (`/demo`) hasta tener dominio propio; API con el club en la cabecera `x-sm-club`. Fase 0, Bloque 9: entrada propia del negocio en `/admin/login` y alta del primer administrador de plataforma en `/admin/setup`, sin pasar por ningún club (ADR 0026). Bloque 8: interfaz rehecha con dos espacios claramente separados (el del club, con su marca, y el panel del negocio en `/admin`), sistema de componentes propio, marca y logo gestionados solo por cada club, y pruebas de interfaz en escritorio y móvil contra la API real con captura de cada pantalla (`docs/capturas/`, job `interfaz` en CI). Bloque 7: idioma por persona (cookie y perfil) con el del club como fallback, en web y emails. Bloque 6: admin interno en `/admin` solo para administradores de plataforma (crear clubes, editar marca y logo, invitar al primer administrador, auditoría). Bloque 5: multi-tenant y marca. La web pinta cada club con su nombre, colores y logo según el host, con la API como única autoridad; selector de club para quien pertenece a varios; logos en Netlify Blobs (eu-central-1) servidos por la API; subdominios locales como parche hasta el dominio final (`docs/dominio-y-dns.md`). Bloque 4: autenticación e invitaciones. Login con email y contraseña, recuperación de contraseña, alta solo por invitación con un único login válido en todos los clubes, emails en castellano, catalán e inglés con Resend preparado y sin conectar hasta tener dominio (transporte `outbox`). La suite de aislamiento (dos clubes, invitaciones cruzadas, caducadas y reutilizadas, restablecimiento de contraseña) es un check obligatorio en CI.

## Desarrollo local

Requisitos: Node 22 y pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # web, API y base de datos local en http://localhost:8888 (la primera vez descarga Deno); el club demo en /demo
```

Comprobaciones: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:isolation`, `pnpm format:check` y `pnpm test:ui` (pruebas de interfaz con capturas; necesita construir antes la API y la web). Detalle en `docs/deploy.md`.

## Documentación

| Documento                       | Contenido                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `docs/plan-fase-0.md`           | Plan de la Fase 0: bloques, decisiones, riesgos y preguntas con sus respuestas |
| `docs/propuesta-club-completo.md` | Propuesta de replanteo del panel del administrador: secciones, personas, agenda e instalaciones (bloques 14 a 18) |
| `docs/dominio.md`               | Conocimiento de negocio extraído del prototipo                                 |
| `docs/informe-sportsmanager.md` | Auditoría del prototipo y propuesta de arquitectura                            |
| `docs/dominio-y-dns.md`         | Subdominios por club, parche local y pasos para el dominio definitivo          |
| `docs/capturas/`                | Capturas de cada pantalla (escritorio y móvil) de la última revisión de interfaz |
| `packages/design/DESIGN.md`     | Design system del producto: fuente de verdad de toda la interfaz              |
| `docs/decisions/`               | Decisiones de arquitectura (ADR)                                               |
| `packages/shared/design/`       | Marca por defecto de un club nuevo (compartida con la API)                     |

## Arquitectura prevista

Monorepo con pnpm workspaces: `apps/web` (Next.js, solo interfaz), `apps/api` (Hono en Netlify Functions, única puerta a los datos), `packages/shared` (tipos, validaciones, tokens, i18n) y `packages/db` (esquema y migraciones, solo para la API). Base de datos Netlify Database (Postgres) en Frankfurt. Autenticación con Better Auth dentro de la API. Un subdominio por club. Castellano y catalán desde el inicio.

Las decisiones y su justificación están en `docs/decisions/`.

## Estructura

```
apps/web          Next.js (App Router). Solo interfaz. Nunca accede a la base de datos.
apps/api          Hono desplegado como Netlify Function en /api/*. Única puerta a los datos.
packages/shared   Tipos, validaciones Zod, tokens de diseño, diccionarios es/ca/en.
packages/db       Esquema Drizzle y cliente. Solo lo usa apps/api.
netlify/database  Migraciones SQL que Netlify aplica en cada deploy.
docs              Plan, dominio, decisiones (ADR) y despliegue.
```

## Cómo contribuir

Una rama y una PR por bloque de trabajo. Nada directo a `main`. Cada decisión técnica relevante va a `docs/decisions/` como ADR corto. CI exige lint, typecheck, tests y tests de aislamiento en verde.
