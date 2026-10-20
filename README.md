# sportsmanager

SaaS B2B para la gestión de clubes deportivos. Cada club tiene su espacio aislado, su marca y las funciones de su plan. Empieza por fútbol sala; el deporte es configuración en datos, no código.

## Estado

Fase 0, Bloque 7: idioma por persona (cookie y perfil) con el del club como fallback, en web y emails. Bloque 6: admin interno en `/admin` solo para administradores de plataforma (crear clubes, editar marca y logo, invitar al primer administrador, auditoría). Bloque 5: multi-tenant y marca. La web pinta cada club con su nombre, colores y logo según el host, con la API como única autoridad; selector de club para quien pertenece a varios; logos en Netlify Blobs (eu-central-1) servidos por la API; subdominios locales como parche hasta el dominio final (`docs/dominio-y-dns.md`). Bloque 4: autenticación e invitaciones. Login con email y contraseña, recuperación de contraseña, alta solo por invitación con un único login válido en todos los clubes, emails en castellano, catalán e inglés con Resend preparado y sin conectar hasta tener dominio (transporte `outbox`). La suite de aislamiento (dos clubes, invitaciones cruzadas, caducadas y reutilizadas, restablecimiento de contraseña) es un check obligatorio en CI.

## Desarrollo local

Requisitos: Node 22 y pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # web, API y base de datos local en http://localhost:8888 (la primera vez descarga Deno)
```

Comprobaciones: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:isolation`, `pnpm format:check`. Detalle en `docs/deploy.md`.

## Documentación

| Documento                       | Contenido                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `docs/plan-fase-0.md`           | Plan de la Fase 0: bloques, decisiones, riesgos y preguntas con sus respuestas |
| `docs/dominio.md`               | Conocimiento de negocio extraído del prototipo                                 |
| `docs/informe-sportsmanager.md` | Auditoría del prototipo y propuesta de arquitectura                            |
| `docs/dominio-y-dns.md`         | Subdominios por club, parche local y pasos para el dominio definitivo          |
| `docs/decisions/`               | Decisiones de arquitectura (ADR)                                               |
| `packages/shared/design/`       | Design tokens de la plataforma                                                 |

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
