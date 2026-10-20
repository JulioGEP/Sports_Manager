# 0029. Ficha ampliada del jugador: foto, indicadores, objetivo, PDI y timeline

Estado: aceptada. Fecha: 2026-10-20. Fase 1, Bloque 12.

## Contexto

Producto comparó la ficha del jugador con la de la referencia (EIXA Hub, "Resum executiu") y pidió los mismos elementos, no el mismo diseño. Nuestra ficha (ADR 0028) tenía datos, equipos, familia y estado. Faltaban: foto, cabecera con equipo, dorsal, posición y lecturas rápidas (edad, años en el club, pie, accesos familiares), cuatro indicadores con puntuación, un objetivo individual con progreso, acciones prioritarias, timeline, datos deportivos (categoría, altura), acciones rápidas y un plan de desarrollo individual (PDI) en seis áreas. Quedaron fuera a propósito los módulos de accesos, reto de verano y scout en vivo.

## Decisión

- **Foto del jugador** (`players.photo_blob_key`): Netlify Blobs en eu-central-1, store propio `player-photos`, misma política que los logos (ADR 0024): se valida el tipo real por sus bytes, se limpia la anterior solo en producción. La web reduce la imagen antes de subirla (lado mayor de 640 px, JPEG): una foto de móvil pesa decenas de KB y la API no procesa imágenes. La sirve la API con sesión: la ve el personal del club (`org.players.read`) y la propia familia del jugador (`org.family.read` y vínculo). Lleva el club en la query porque un `<img>` no manda cabeceras (ADR 0027).
- **Datos deportivos en el jugador**: pie dominante (`right`, `left`, `both`) y altura en cm. La **categoría no se duplica en el jugador**: es la del equipo de la temporada actual (`teams.category`); una copia en la ficha se quedaría vieja cada temporada. La API la devuelve con cada equipo del jugador.
- **Indicadores** (`player_indicators`): cuatro dimensiones fijas (deporte, cuerpo, bienestar, compromiso), puntuación de 0 a 100 y lectura corta libre. Una fila por jugador y dimensión; se valoran una o varias a la vez. Son lecturas del personal, no se comparan con nadie: las familias no las ven (DESIGN.md 10).
- **Objetivo individual** (`player_objectives`): uno vigente por jugador, con título, progreso de 0 a 100, responsable (miembro del club, comprobado por la API) y fecha de revisión. Guardarlo sustituye al anterior; el timeline conserva el rastro.
- **Plan de desarrollo individual** (`player_development_plans`): una fila por jugador con una línea por área (técnico, táctico, físico, emocional, hábitos, persona), coordinación, próxima revisión y estado (`draft` estructura inicial, `active` en marcha, `shared` compartido con la familia). Las seis áreas son la estructura del producto, no un catálogo por club: por eso son columnas y no filas.
- **Timeline** (`player_events`): registros que la API escribe cuando pasa algo (entrada o salida de plantilla, cambio de estado, objetivo, indicadores, PDI, foto) más anotaciones manuales del personal. Se guarda el tipo y los datos mínimos (nombres y cifras); el texto lo pone la web en cada idioma. El alta en el club no se guarda: sale de `created_at` y cierra siempre la lista. Un fallo al registrar nunca rompe la operación, como la auditoría.
- **Acciones prioritarias**: no se guardan. La web las deduce de lo que falta en la ficha (foto, fecha de nacimiento, datos deportivos, familia, equipo, objetivo, indicadores, PDI) y de las revisiones vencidas. Sin tabla ni API: no hay nada que mantener.
- **Permisos**: todo lo nuevo lee con `org.players.read` y escribe con `org.players.write`. Hoy la entrenadora solo lee; cuando existan permisos por equipo (pendiente del ADR 0028) podrá valorar y anotar a los suyos.
- **Club demo**: Clara Martí llega con la ficha completa por migración idempotente, para ver la pantalla entera sin picar datos.

## Consecuencias

- La ficha responde "quién es, cómo está y qué necesita hoy" sin salir de la pantalla. Las listas de jugadores, la plantilla, la familia y el inicio muestran la foto.
- Siete acciones nuevas en la auditoría y cuatro tablas nuevas, todas con `organization_id` (ADR 0015) y cubiertas por los tests de esquema y de aislamiento.
- Quedan para bloques siguientes: que la familia vea el objetivo y el PDI cuando el club lo comparta, histórico de objetivos, indicadores con evolución en el tiempo (gráfica de evolución de DESIGN.md 10), y las anotaciones de la entrenadora sobre su equipo.

## Alternativas descartadas

- Alimentar el timeline desde `audit_log`: la auditoría apunta a nombres, no a ids, y mezcla acciones de todo el club. Una tabla por jugador es más barata de consultar y no arrastra datos de otros.
- Procesar la foto en la API (sharp en Netlify Functions): más peso en el bundle y tiempo de función por una tarea que el navegador hace gratis.
- Categoría como columna del jugador: redundante con el equipo y fuente de incoherencias cada temporada.
- Áreas del PDI como filas de una tabla aparte: más código para la misma pantalla; las áreas no cambian por club.
