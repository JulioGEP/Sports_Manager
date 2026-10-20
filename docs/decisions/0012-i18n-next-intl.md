# 0012. i18n con next-intl y diccionarios compartidos

Estado: aceptada (Bloque 7, 2026-10-20). Fecha: 2026-10-19.

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

## Cierre (Bloque 7)

Resolución del idioma, en este orden: preferencia de la persona (`users.locale`, editable con `PATCH /api/me` y sincronizada con la cookie `locale`), idioma por defecto del club del host, castellano. La web y los emails siguen la misma regla. Zona horaria fija `Europe/Madrid` para fechas y horas. Un test exige las mismas claves en castellano, catalán e inglés tanto en la web como en los diccionarios compartidos.
