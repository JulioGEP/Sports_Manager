# 0040. Pizarra animada: arrastrar, grabar el movimiento por capas y la voz

Estado: aceptada. Fecha: 2026-10-22. Amplía la pizarra de la tarea de la 0039: misma pizarra en SVG propio, ahora con movimiento y voz.

## Contexto

La pizarra de la ADR 0039 ponía piezas con un toque y flechas con dos, pero no se podía mover una pieza ya puesta: había que borrarla y volver a ponerla. Producto la probó y pidió tres cosas: mover los elementos arrastrando, grabar los movimientos para enseñarlos después y grabar la voz para que, al reproducir, se oiga la explicación a la vez que se mueven las piezas. Es la forma en que un entrenador explica una jugada en la pista: la mueve con la mano mientras la cuenta.

## Decisión

### Arrastrar

- **Cualquier pieza se arrastra con cualquier herramienta.** Se coge con un margen de 6 unidades de la pizarra alrededor del centro. Un toque sin arrastre sobre una pieza la elige; con una flecha elegida, ese toque es el origen o el destino de la flecha. Fuera de la grabación, la herramienta Borrar no arrastra: borra.
- **Eventos de puntero, como la consola del partido (ADR 0037):** ratón, dedo y lápiz con el mismo código, con captura del puntero y varios a la vez. En una tableta se pueden mover dos jugadores con dos dedos.
- **Teclado y lector de pantalla:** cada pieza de la lista de debajo se elige y se mueve con las flechas (con Mayúsculas, de cinco en cinco).
- Las coordenadas salen de la matriz del SVG (`getScreenCTM`), no del rectángulo: así el toque cae en su sitio aunque la pizarra quede con bandas a los lados.

### Grabar el movimiento

- **Por capas.** "Grabar movimiento" pone en marcha un reloj y registra lo que se arrastra; lo ya grabado se reproduce a la vez. Así primero se mueve un jugador, luego el balón y luego el rival, cada capa encima de las anteriores. Al volver a coger una pieza ya grabada, lo anterior se conserva hasta ese instante y desde ahí manda lo nuevo.
- **Modelo:** el diagrama gana `animation` con su duración y una pista por pieza movida. Cada pista es una lista de puntos `[ms, x, y]` en las coordenadas de siempre (0 a 100). Antes del primer punto la pieza espera; después del último, se queda donde acabó. Las piezas del diagrama son la posición de salida.
- **Límites que valida la API:** dos minutos, 6000 puntos entre todas las pistas (una muestra cada 50 ms por pieza movida, unos 20 por segundo), una pista por pieza, puntos en orden de tiempo y cada pista sobre una pieza que existe. Si una grabación larga se pasa, se aclaran las pistas por igual antes de guardar.
- **Coherencia al editar:** mover una pieza fuera de la grabación desplaza su trayectoria entera; quitar una pieza se lleva su pista y renumera las de detrás; vaciar la pizarra borra el movimiento.
- **Reproducción:** interpolación lineal entre puntos, en el navegador. La ficha de la tarea y el modo pista tienen mandos: reproducir y pausar, volver al principio, línea de tiempo y el tiempo. Parada, la pizarra dibuja las trayectorias en discontinuo; así se ven también en la hoja impresa, en las miniaturas de la biblioteca y en la sesión.
- Las utilidades son puras y están probadas en `packages/shared/src/drill-animation.ts`.

### La voz

- **Se graba con la capa.** "Con voz" pide el micrófono y graba con `MediaRecorder` mientras dura la capa: WebM u Ogg con Opus en Chrome y Firefox, MP4 en Safari. Empieza en el instante 0 de la animación. Una capa nueva con voz sustituye la anterior; una capa sin voz se graba mientras suena la voz guardada, para encajar el movimiento con la explicación.
- **Si no hay micrófono o no hay permiso,** se graba solo el movimiento y se avisa.
- **Al reproducir manda el audio:** si el reloj del movimiento se separa más de una décima, se ajusta a él. Si la voz acaba antes, el movimiento sigue.
- **Almacenamiento:** Netlify Blobs en `eu-central-1`, store `drill-audio`, clave `<club>/<tarea>/<versión>`, igual que las fotos de jugador. La tarea guarda la clave en `drills.audio_blob_key` (migración `20261022140149_drill_audio`) y la API devuelve `audioUrl` en la tarea y en cada tarea de una sesión.
- **API:** `GET`, `PUT` y `DELETE /api/org/drills/{id}/audio`.
  - Oye la voz quien ve la tarea y la graba o la quita quien la edita.
  - Se sube después de guardar la tarea y solo si la pizarra tiene movimiento; sin él, 409.
  - Hasta 4 MB. El tipo se comprueba por los primeros bytes: un "audio" que es una imagen da 415.
  - El `GET` responde por rangos (206): Safari no reproduce audio sin ellos.
  - Quitar el movimiento de la pizarra quita también la voz.
  - Grabar y quitar la voz queda en la auditoría.
- Como con las fotos, el blob anterior solo se borra en producción: las previews comparten el store.

## Consecuencias

- Las tareas ya creadas no cambian: `animation` es opcional y sin ella todo se ve como antes.
- La pizarra pasa a su propio componente (`apps/web/src/components/drill-board.tsx`). `training-ui.tsx` lo reexporta, así que las pantallas existentes no cambian de import.
- Copiar una tarea a las propias copia el movimiento, pero no la voz.
- Las pruebas de interfaz arrancan Chromium con micrófono simulado (`--use-fake-device-for-media-stream`). `pizarra.spec.ts` recorre el flujo entero:
  - Arrastra piezas, graba dos capas (la primera con voz) y reproduce.
  - Guarda y comprueba en la API pistas, duración y voz.
  - Reproduce en la ficha y mueve una pieza con el teclado.
- Queda para después: velocidad de reproducción, bucle, flechas que también se mueven, deshacer una capa y exportar la jugada a vídeo.

## Alternativas descartadas

- **Fotogramas clave en lugar de grabar en tiempo real:** obligan a pensar en pasos y tiempos. Grabar lo que hace la mano es como se explica en la pista y no necesita aprender nada.
- **Guardar la voz dentro del diagrama en base64:** hincha cada lectura de la tarea y de la sesión, y la base no es sitio para binarios. Ya había un patrón para ficheros (logos y fotos).
- **Una librería de arrastre o de animación:** dos gestos y una interpolación lineal no lo justifican. Mismo criterio que en la ADR 0037.
- **Vídeo de la pantalla:** pesa mucho más, no se puede editar y pierde el color del club y la nitidez del SVG.
