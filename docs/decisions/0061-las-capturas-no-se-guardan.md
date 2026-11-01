# 0061. Las capturas de interfaz no se guardan

Estado: aceptada. Fecha: 1 de noviembre de 2026. Revisa la ADR 0025, que las guardaba en `docs/capturas/` y luego como artefacto de CI.

## Contexto

Las pruebas de interfaz sacan una captura de cada pantalla, en escritorio y en móvil. Desde el Bloque 8 esas capturas se guardaban en dos sitios, y los dos pesan:

- **En el repositorio.** `docs/capturas/` tenía 269 ficheros y 63 MB. Son binarios: cada revisión de interfaz los sustituía enteros, así que el repositorio crecía en decenas de megas por entrega y nadie podía ver qué había cambiado en un diff.
- **Como artefacto de CI.** Cada ejecución del job `interfaz` subía 54 MB con catorce días de retención. Con varias PR abiertas, eso es media docena de copias de lo mismo ocupando la cuota de la cuenta.

A cambio, nadie las miraba. La revisión de interfaz se hace abriendo la aplicación, y cuando una prueba falla, el log del job ya dice qué prueba y en qué paso.

## Decisión

Las capturas se generan pero no se guardan en ningún sitio.

- Se borra `docs/capturas/` del repositorio.
- Se quita el paso `upload-artifact` del job `interfaz` de CI.
- Las pruebas siguen sacándolas en `apps/web/e2e/screenshots/`, que ya está en `.gitignore`: en local sirven para mirar una pantalla, y en CI se van con el runner.
- La prueba sigue siendo obligatoria antes de subir. Lo que se deja de guardar es la foto, no la prueba. (El job `interfaz` desaparece entero con la ADR 0062, que quita CI; `pnpm test:ui` se pasa en local.)

## Consecuencias

- El repositorio deja de crecer con binarios y la cuota de almacenamiento de CI deja de llenarse sola.
- Ya no hay un registro histórico de cómo se veía cada pantalla en cada entrega. Se asume: ese registro nadie lo consultaba, y la referencia viva es la aplicación.
- Para mirar una captura concreta hay que ejecutar `pnpm test:ui` en local.
- Los 63 MB siguen en el historial de git de las entregas anteriores. Quitarlos de ahí exige reescribir el historial de `main`, que es una decisión aparte y con coste para cualquier rama abierta.

## Alternativas descartadas

- **Dejar el artefacto con menos retención.** Reduce el problema pero no lo quita, y sigue subiendo 54 MB en cada ejecución de cada PR.
- **Guardar solo las capturas que cambian.** Comparar imágenes pide una herramienta de comparación visual y un umbral que afinar. Es trabajo para un problema que no tenemos: nadie estaba usando las capturas.
