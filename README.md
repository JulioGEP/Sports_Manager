# sportsmanager

SaaS B2B para la gestión de clubes deportivos. Cada club tiene su espacio aislado, su marca y las funciones de su plan. Empieza por fútbol sala; el deporte es configuración en datos, no código.

## Estado

Fase 0, Bloque 0 completado: el prototipo de un solo club se ha retirado y su conocimiento de negocio está documentado. Todavía no hay código de aplicación. El Bloque 1 monta el monorepo, el tooling, la integración continua y el despliegue.

## Documentación

| Documento | Contenido |
|---|---|
| `docs/plan-fase-0.md` | Plan de la Fase 0: bloques, decisiones, riesgos y preguntas con sus respuestas |
| `docs/dominio.md` | Conocimiento de negocio extraído del prototipo |
| `docs/informe-sportsmanager.md` | Auditoría del prototipo y propuesta de arquitectura |
| `docs/decisions/` | Decisiones de arquitectura (ADR) |
| `packages/shared/design/` | Design tokens de la plataforma |

## Arquitectura prevista

Monorepo con pnpm workspaces: `apps/web` (Next.js, solo interfaz), `apps/api` (Hono en Netlify Functions, única puerta a los datos), `packages/shared` (tipos, validaciones, tokens, i18n) y `packages/db` (esquema y migraciones, solo para la API). Base de datos Netlify Database (Postgres) en Frankfurt. Autenticación con Better Auth dentro de la API. Un subdominio por club. Castellano y catalán desde el inicio.

Las decisiones y su justificación están en `docs/decisions/`.

## Cómo contribuir

Una rama y una PR por bloque de trabajo. Nada directo a `main`. Cada decisión técnica relevante va a `docs/decisions/` como ADR corto. Las instrucciones para levantar el entorno local llegan con el Bloque 1.
