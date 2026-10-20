# 0024. Logos de club en Netlify Blobs a través de la API

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

Cada club tiene logo y, con el tiempo, más imágenes. Netlify Blobs es el almacén de ficheros de la plataforma (ADR 0007), pero sus stores de proyecto no siguen la región de las funciones: sin región explícita, los datos irían a Estados Unidos.

## Decisión

- Un único módulo (`apps/api/src/data/logos.ts`) crea el store `logos` con `region: "eu-central-1"`. Nadie más llama a Netlify Blobs.
- Subida y borrado solo por la API con permiso `org.settings.write` en el club del host (`PUT` y `DELETE /api/org/logo`). Formatos PNG, JPEG y WebP, máximo 1 MB (`LOGO_MAX_BYTES`, decisión del Bloque 5). SVG excluido porque puede llevar código. Se comprueba el tipo real por los primeros bytes, no solo la cabecera.
- Servicio público `GET /api/org/logo` con caché de un día y `ETag`. La URL pública lleva solo la parte aleatoria de la clave, nunca el id del club.
- Clave `<id del club>/<uuid>`. Cada subida crea una clave nueva; la anterior se borra solo en el contexto `production`, porque las previews comparten el store con producción y sus claves copiadas apuntan al mismo blob.
- En tests, un almacén en memoria con la misma interfaz. La API no se acopla al SDK fuera de ese módulo.

## Consecuencias

- Residencia en la UE verificable en el código y en el panel de Netlify (`blobs_region: eu-central-1`).
- Quedan blobs huérfanos cuando una preview sustituye un logo. Son pequeños; una limpieza periódica puede llegar más adelante.
- Subir imágenes grandes o muchas (galerías) pedirá subida directa con URL firmada; no es el caso de un logo.

## Alternativas descartadas

- Servir los blobs desde la web o con URLs públicas del store: saltaría la cadena de petición de la API.
- Guardar el logo en la base de datos: engorda filas y copias de la base por nada.
