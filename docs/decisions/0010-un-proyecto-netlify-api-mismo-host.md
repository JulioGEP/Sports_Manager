# 0010. Un solo proyecto Netlify con la API en /api del mismo host

Estado: propuesta, pendiente de la prueba de concepto del Bloque 1. Fecha: 2026-10-19.

## Contexto

El front consume el back solo por la API, que debe responder en `/api` del mismo subdominio del club para evitar problemas de cookies y CORS.

## Decisión propuesta

Un único proyecto Netlify (`hubsports`). Base del proyecto en la raíz del repo, directorio de paquete `apps/web` para el adaptador de Next.js, directorio de funciones `apps/api/netlify/functions`. La función de la API declara `path: "/api/*"` y `region: "fra"`. Next.js no define rutas bajo `/api`.

## Lo que falta verificar

La precedencia entre una función propia con `path: "/api/*"` y la función comodín que genera el adaptador de Next.js no está documentada. El Bloque 1 lo comprueba en un deploy preview.

Plan B si falla: dos proyectos Netlify (web y api) y una regla de proxy `/api/*` en el proyecto web. Mantiene el mismo origen para el navegador, pero la API no recibiría el host original del club de forma documentada y habría que transportarlo en una cabecera firmada.

## Consecuencias

- Un solo dominio, un solo certificado, una sola configuración de contextos.
- Las funciones de Next.js y la de la API comparten región y variables de entorno del proyecto.
