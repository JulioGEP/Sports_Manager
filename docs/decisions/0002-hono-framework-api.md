# 0002. Hono como framework de la API

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

La API se despliega como Netlify Functions, cuyo contrato moderno es `Request` y `Response` estándar. Cada arranque en frío cuenta. Hace falta OpenAPI y una cadena de middleware para el aislamiento entre clubes.

## Decisión

Hono, con `@hono/zod-openapi` para generar la especificación OpenAPI desde los esquemas Zod de `packages/shared`.

## Consecuencias

- Sin adaptadores intermedios: Hono habla el contrato de Netlify Functions y tiene adaptador oficial.
- Paquete pequeño, arranque en frío corto.
- Rutas tipadas y validación de entrada en el mismo sitio que la documentación.
- Better Auth documenta su integración con Hono.
- Comunidad más pequeña que Express; menos ejemplos para casos raros.

## Alternativas descartadas

- NestJS: pesado para Lambda, decoradores y ceremonia que no aportan en este tamaño, necesita adaptador.
- Fastify: necesita adaptador para funciones y no añade nada frente a Hono aquí.
- Express: contrato antiguo, sin tipos, necesita `serverless-http`.
- Elysia: pensado para Bun.
