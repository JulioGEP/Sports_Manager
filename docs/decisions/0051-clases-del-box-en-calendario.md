# 0051. Clases del box en calendario: la semana en rejilla horaria y el color según lo que puedes hacer

Estado: aceptada. Fecha: 2026-10-26. Revisa la pantalla de Clases de la 0049.

## Contexto

`/classes` (Reservar para el atleta, Clases para el coach y el dueño) era una lista de un día: una tira de días arriba y una fila por clase. Copiaba la vista de las apps de reservas de box y producto la descartó:

- **No se ve la semana.** Para saber qué días hay HYROX o cuándo entrena un coach hay que ir día a día.
- **No se ve el tiempo.** Una clase de dos horas y una de una ocupan lo mismo. Dos clases a la misma hora en salas distintas salen una debajo de otra, como si fueran seguidas.
- **Todo pesa igual.** Una clase reservada, una abierta, una completa y una ya pasada solo se distinguían por una etiqueta pequeña.
- **El dueño no ve el box de un vistazo**: 33 clases son 33 filas en siete pantallas.

## Decisión

**Calendario con rejilla horaria**, como en un calendario de verdad: una columna por día y las horas en vertical. Cada clase ocupa su hueco según su hora y su duración. Las que coinciden van una al lado de otra. Una línea marca el ahora y su hora sale en el canal de horas.

- **Escritorio: la semana**, con un cambio a **Día**. Tocar la cabecera de un día lo abre en la vista de día.
- **Móvil: el día**, con la semana en una tira fija arriba que cabe entera sin desplazarse. Siete columnas no caben en 375 px. La tira marca con un punto los días en que el atleta tiene algo.
- **Los huecos sin clases se pliegan.** Dos horas seguidas o más sin ninguna clase (en un box, de 14:00 a 18:00) pasan a ser una franja fina, "De 14:00 a 18:00, sin clases". La mitad de la rejilla eran horas vacías; plegadas, la semana cabe en una pantalla de portátil. En la semana se pliega lo vacío de los siete días; en el día, lo de ese día.
- **El color dice qué puedes hacer, no qué tipo de clase es.** Hay tres niveles que funcionan con cualquier color de club, también blanco o negro:
  - **rellena** en el color del club: la tuya;
  - **blanca con borde**: abierta, puedes reservar;
  - **gris y plana**: pasada, cerrada o aún sin abrir.

  La espera va en aviso; la asistencia y la falta, en éxito y peligro. Siempre con su texto ("11 libres", "Reservada", "Límite diario") y una leyenda debajo (DESIGN.md 0.5). Para el personal: abierta antes de empezar, con las plazas; gris al terminar, con el check-in y su icono.
- **El atleta reserva desde el calendario.** Tocar una clase abre un panel: plazas, coach, sala, disciplina, WOD, hasta cuándo cancela gratis y el botón de reservar, cancelar o la espera. "Ver la clase" lleva a la ficha completa. El coach y el dueño van directos a la ficha para pasar lista: la fila es el objeto (DESIGN.md 0.11).
- **A última hora, mañana.** Sin un día elegido, si hoy ya no queda ninguna clase por terminar, se abre el siguiente día con clases de la semana. Hoy sigue marcado en la tira.
- **Lo que se mira va en la URL** (`day`, `view`, `scope`, `section`). Al volver de una clase se vuelve a la misma semana y la misma vista.
- **Filtros.** El personal elige "Mis clases" o "Todo el box": el coach empieza por las suyas y el dueño por todo. La disciplina se filtra en escritorio, donde la semana entera se ve de golpe; en el móvil, el día cabe en una pantalla.
- **El bloque se adapta a su ancho** con *container queries*. Sin ancho, nombre, hora y cifra. Con ancho, también el coach y el detalle ("check-in", "· 2 en espera"). El texto completo va en la etiqueta para lector de pantalla y en el *tooltip*.

La geometría (rejilla, huecos plegados, columnas de las que coinciden) vive en `apps/web/src/lib/class-calendar.ts`, sin React ni zona horaria y con pruebas. La pantalla está en `components/fitness/class-calendar.tsx`. La API no cambia: `/api/org/classes` ya aceptaba la semana entera.

## Consecuencias

- Una sola petición por semana. Cambiar de día dentro de la semana no vuelve a pedir nada.
- El atleta reserva en dos toques (clase y botón) sin perder la semana de vista.
- Un nombre largo en una clase que comparte hora con otra se corta en la semana ("Halte…"). Se lee entero en la vista de día, en el panel y en el *tooltip*.
- Una clase que cruce la medianoche se corta a las 24:00. En un box no pasa.
- `ClassRow` y `DayStrip` se quedan: los usan el inicio, Mi tarifa, el WOD y la ficha del atleta.

## Alternativas descartadas

- **Seguir con la lista por día** y retocarla: no resuelve ni la semana ni el tiempo.
- **Color por tipo de clase** (WOD, HYROX, Halterofilia): el design system no tiene paleta categórica y el tipo ya se lee en el nombre. Lo que decide la reserva es si puedes reservar, y eso es lo que pinta el color.
- **Horas a escala de principio a fin**, como un calendario de oficina: media rejilla vacía en un box.
- **Semana en el móvil** con columnas estrechas o desplazamiento horizontal: ilegible a 375 px.
- **Reservar con un botón dentro del bloque**: en la semana no cabe y con clases a la misma hora se toca la que no es.
