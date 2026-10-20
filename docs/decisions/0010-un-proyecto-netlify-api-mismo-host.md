# 0010. Un solo proyecto Netlify con la API en /api del mismo host

Estado: aceptada el 2026-10-20 tras la prueba en deploy preview. Fecha: 2026-10-19.

## Contexto

El front consume el back solo por la API, que debe responder en `/api` del mismo subdominio del club para evitar problemas de cookies y CORS.

## Decisión

Un único proyecto Netlify (`hubsports`). Base del proyecto en la raíz del repo, directorio de paquete `apps/web` para el adaptador de Next.js, directorio de funciones `apps/api/netlify/functions`. La función de la API declara `path: "/api/*"` y `region: "fra"`. Next.js no define rutas bajo `/api`.

## Verificación (2026-10-20)

Comprobado en la deploy preview de la PR 5: con el adaptador de Next.js activo (función "Next.js Server Handler" con ruta `/*`) y la función `api` con ruta `/api/*`, una petición a `/api/health` la atiende la función `api`. La ruta más específica gana. No hace falta el plan B (dos proyectos con proxy).

Ajuste respecto a la propuesta: "Package directory" no es necesario. El adaptador se declara en `netlify.toml` y localiza la app por `outputFileTracingRoot` en `apps/web/next.config.ts` (ver docs/deploy.md).

## Consecuencias

- Un solo dominio, un solo certificado, una sola configuración de contextos.
- Las funciones de Next.js y la de la API comparten región y variables de entorno del proyecto.
