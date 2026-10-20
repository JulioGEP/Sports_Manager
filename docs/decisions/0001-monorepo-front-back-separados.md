# 0001. Monorepo pnpm con front y back separados

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

El SaaS necesita una interfaz web, una API y código compartido entre ambas. Vamos a gestionar datos de menores: la interfaz no debe poder tocar la base de datos ni por error.

## Decisión

Un repositorio con pnpm workspaces:

- `apps/web`: Next.js (App Router). Solo interfaz. No accede nunca a la base de datos.
- `apps/api`: backend TypeScript desplegado como Netlify Functions.
- `packages/shared`: tipos, validaciones Zod, tokens de diseño y diccionarios i18n compartidos.
- `packages/db`: esquema, migraciones y cliente de base de datos. Solo lo usa `apps/api`.

TypeScript estricto en todo. El front consume el back solo por la API REST, documentada con OpenAPI.

## Consecuencias

- Un único `pnpm install`, versiones alineadas, cambios atómicos en una PR.
- La separación se hace cumplir con tres barreras: `apps/web` no declara `packages/db` como dependencia, una regla de lint prohíbe la importación y un test de arquitectura la detecta.
- Más configuración inicial que una app Next.js con rutas de API dentro.

## Alternativas descartadas

- Next.js con rutas de API y acceso directo a la base: más rápido al principio, pero mezcla interfaz y datos y hace imposible garantizar que el front no toque la base.
- Dos repositorios: duplica tooling y desincroniza tipos.
