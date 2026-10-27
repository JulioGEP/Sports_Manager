# 0050. Revisión del box: sin restos de club deportivo, ejercicios propios y programación rehecha

Estado: aceptada; trasladada a inthebox (ADR 0058). Fecha: 2026-10-26. Revisa la 0049 tras probarla en producción.

## Contexto

Con el box demo en producción, producto encontró tres cosas que no pueden ir así en un club de fitness:

- **Ajustes** enseñaba "Temporadas y socios", con temporadas y equipos que en un box no existen.
- **"Movimientos"** abría la biblioteca de tareas del club deportivo: la pizarra de fútbol sala y campos de deporte de equipo (jugadores, espacio, contenidos tácticos, contacto, golpeo).
- **La programación** era un formulario largo e igual para todos los bloques. Producto pidió rehacerla con criterio de UX.

Una auditoría de todo lo que ve cada rol del box encontró más restos:
- textos con familias, socios, cuotas, deportistas, entrenadores y tareas;
- la pestaña "Planes" de Cobros, que duplicaba Tarifas;
- columnas de secciones en Equipo;
- tipos de instalación de pista y piscina en Salas;
- acciones de socios, retos y temporadas en la paleta de mandos;
- acciones sin traducir en Actividad;
- y ninguna forma de dar de alta a un atleta sin pasar por un lead.

## Decisión

### En un box, cada pantalla deportiva lleva a su equivalente

Secciones y equipos llevan al Horario; deportistas, socios y fichas, a Atletas; la agenda, a Clases; el entrenamiento y sus sesiones, a la Programación; la biblioteca de tareas, a Ejercicios; el bienestar del deportista, al Progreso. El enlace de siempre sigue valiendo y nadie cae en una pantalla de club deportivo. En un club deportivo nada cambia.

### Temporada invisible y continua

Un box no gestiona temporadas. Cuando a la temporada actual le quedan menos de dos meses, se alarga hasta dentro de un año. Cada tipo de clase con horario crea las clases que le faltan solo añadiendo: no borra ni rehace las que ya hay, aunque se hayan cambiado a mano. Se comprueba al consultar las clases o el horario, una vez al día por club. Ajustes no enseña "Temporadas y socios" en un box, y su puesta en marcha es la de un box: identidad, horario, tarifas y primer coach.

### Ejercicios en lugar de tareas

Una biblioteca de ejercicios propia (`exercises`), sin pizarra. Cada ejercicio lleva:
- categoría: halterofilia, fuerza, gimnásticos, cardio, kettlebell, accesorios o movilidad;
- equipamiento;
- un movimiento del catálogo opcional, para las máximas y los kilos por porcentaje;
- cómo se hace, puntos clave, errores comunes, escalados y vídeo.

La ve todo el box, el atleta incluido. La escriben el dueño y los coaches. El box demo llega con una treintena de ejercicios.

### Programación con criterio de UX

**La semana** es una lista con un día por fila. Arriba, la semana con flechas ("Esta semana", "La semana que viene") y la disciplina. Cada WOD dice su estado en palabras (borrador, publicado, se publica a tal hora) y enseña sus bloques en una línea legible. Desde él se edita, se duplica o se mueve a otro día, y se publica ya.

Los días con clase y sin WOD salen como un hueco con "Programar" y tres atajos: un benchmark, la propuesta con IA o copiar otro día. "Publicar semana" publica todos los borradores de una vez. Con la semana vacía, "Copiar la semana anterior" pasa a ser el botón visible.

**El editor** tiene dos columnas: editar a un lado y "Así lo ve el atleta" al otro. En móvil, dos pestañas. El día se cambia con flechas y la disciplina ya viene elegida. Cada bloque se define por su tipo y su formato, y el formato decide el marcador:
- **WOD y accesorios:** por tiempo con cap en minutos, AMRAP, EMOM, repeticiones, distancia, calorías o sin marcador.
- **Fuerza:** series al porcentaje del 1RM, buscar una máxima o sin marcador.

Los escalados van plegados y un bloque se puede rellenar desde un benchmark. Abajo, una barra fija: guardar borrador, publicar o programar para una hora. Salir con cambios sin guardar pide confirmación.

**En la API**, dos rutas nuevas con los permisos de guardar un WOD y su registro en la actividad: publicar un rango de días y copiar días. Copiar crea borradores y nunca pisa un día que ya tiene WOD.

### El resto

- **Textos:** la capa de léxico del box (ADR 0049) cubre todas las pantallas compartidas, con unos trescientos textos en tres idiomas.
- **Cobros:** sin "Planes"; "Generar cargos" lleva a los cargos del mes de Tarifas.
- **Equipo:** sin columna de secciones, sin invitar familias, y solo fisioterapia como cargo.
- **Salas:** tipos de gimnasio.
- **Paleta de mandos:** acciones de box (nuevo atleta, nuevo tipo de clase, programar un WOD, ejercicios, tarifas, leads).
- **Disciplinas:** se crean y se renombran desde el Horario.
- **Atletas:** se dan de alta desde Atletas, con su tarifa, su primer cargo y la invitación a la app.
- **Web del club:** trae el código del horario y de la clase de prueba listo para pegar.
- **Actividad:** traduce todas las acciones, y una prueba lo vigila.

## Consecuencias

- Un box no ve nada de un club deportivo y un club deportivo no cambia.
- La temporada sigue existiendo en los datos: los tipos de clase cuelgan de ella. Que sea invisible evita una migración y mantiene un solo modelo.
- La voz del club no se ofrece en un box: sus frases son de pantallas deportivas que un box no ve. Darle voz a las pantallas del box queda pendiente.
- Recepción como cargo con permisos de reservar y cobrar queda pendiente: es un cambio de permisos, no de pantalla.

## Alternativas descartadas

- **Reutilizar la biblioteca de tareas escondiendo campos:** la tarea es un objeto de deporte de equipo (pizarra, jugadores, contenidos tácticos). Un ejercicio de box es otra cosa, y se busca y se filtra de otra manera.
- **Regenerar el horario entero cada cierto tiempo:** desharía los cambios a mano de una clase sin reservas. Alargar solo añadiendo no toca nada.
- **Una temporada nueva cada año en un box:** obligaría a recrear los tipos de clase y su horario. Para un box es un trámite sin sentido.
