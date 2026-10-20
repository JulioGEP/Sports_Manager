# 0012. i18n con next-intl y diccionarios compartidos

Estado: propuesta. Fecha: 2026-10-19.

## Contexto

Castellano y catalán desde el día 1, en la interfaz y en los emails. Idioma por usuario, con el de la organización como fallback.

## Decisión propuesta

- `apps/web`: `next-intl`, la librería de referencia para App Router, con mensajes `es` y `ca` y claves tipadas.
- `apps/api` y emails: diccionarios `es` y `ca` en `packages/shared/i18n` con un renderizador de plantillas sencillo.
- Resolución: idioma del usuario, después idioma por defecto de la organización, después `es`.
- Test que falla si una clave existe en un idioma y no en el otro.

## Consecuencias

- Toda cadena visible pasa por un diccionario desde el primer componente.
- Las traducciones se revisan en la misma PR que la funcionalidad.
