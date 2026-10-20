# 0011. Resolución del club por entorno y subdominios reservados

Estado: aceptada el 2026-10-19 por el responsable de producto. Fecha: 2026-10-19.

## Contexto

En producción el club se resuelve por subdominio. En deploy previews no hay subdominios: las URLs son `deploy-preview-N--proyecto.netlify.app`. En local hace falta algo equivalente.

## Decisión

| Entorno | Resolución |
|---|---|
| Producción | Primera etiqueta del host |
| Local | `<club>.<dominio-local>:8888`, con un dominio local de dos niveles para que las cookies de dominio funcionen en Chromium |
| Deploy preview | Variable de entorno de servidor del contexto `deploy-preview` con el slug del club de pruebas. Es configuración del servidor, no un dato del cliente |

Subdominios reservados, que nunca son clubes: `www`, `admin`, `api`, `app`, `staging`, `mail`. El panel interno vive en `admin`.

## Consecuencias

- Las previews prueban un solo club a la vez. El multi-club lo cubren los tests automáticos.
- Si hace falta probar varios clubes en un entorno desplegado, se montará un proyecto de staging con su propio dominio comodín. No en la Fase 0.
