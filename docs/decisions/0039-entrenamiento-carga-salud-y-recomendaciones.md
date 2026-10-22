# 0039. Entrenamiento, carga, salud y recomendaciones explicables

Estado: aceptada. Fecha: 2026-10-22. Fase 1, bloques 21 a 26. Construye la [propuesta de planificación de entrenamientos](../propuesta-planificacion-entrenamientos.md) entera, en una sola entrega. Amplía la 0033 y la 0036 con dos áreas nuevas (Entrenamiento y Salud) y la única excepción a "la administración lo ve todo".

## Contexto

El producto sabía qué pasa en los partidos (ADR 0034) y quién es cada jugador (objetivos, indicadores, plan), pero no qué se entrena ni cómo llega cada jugador a la sesión. Eso es la mayor parte de la semana de un cuerpo técnico. La propuesta planteó seis bloques y siete decisiones. Producto pidió construirlo todo a la vez y no contestó las decisiones, así que se aplican las recomendaciones de la propuesta, con una desviación que se explica abajo.

## Decisión

### Modelo

- **La sesión cuelga del entrenamiento de la agenda.** Una sesión por evento (`training_sessions.event_id` único). Planificar un entrenamiento que no existe crea el evento y la sesión a la vez. La etiqueta MD (MD-3, MD+1) se calcula de los partidos de la semana y se puede fijar a mano.
- **Contenidos por sección como puente con el partido.** `training_contents` lleva `related_action_codes`: las acciones del motor del partido que ese contenido trabaja. Así una regla que detecta muchas pérdidas propone tareas de salida de presión sin texto libre de por medio. Semilla de fútbol sala con 17 contenidos.
- **Biblioteca con cuatro ámbitos**: club, sección, equipo y personal. La pizarra es un SVG propio (decisión 5): piezas y flechas en coordenadas de 0 a 100, guardadas como JSON validado, que se ven igual en pantalla, en el modo pista y en papel.
- **Bloques con dueño.** La sesión tiene cinco bloques (activación, principal, porteros, readaptación, vuelta a la calma). Quien planifica el equipo edita todo; dentro del cuerpo técnico, el preparador físico edita activación y vuelta a la calma, el de porteros su bloque y fisioterapia la readaptación (`BLOCKS_BY_TEAM_ROLE`). `team_staff.role_in_team` gana `goalkeeper_coach` y `fitness`.
- **Carga sin hardware.** RPE de sesión de Foster (RPE de 0 a 10 por minutos) por jugador en `player_loads`, con origen sesión, partido o extra. Aguda de 7 días, crónica como media semanal de 28, relación aguda:crónica, monotonía y strain en `packages/shared` (`training-load.ts`), probados.
- **Bienestar de 1 a 5, donde 5 es lo mejor** en las cinco preguntas (sueño, fatiga, dolor, estrés, ánimo), para que la suma (5 a 25) se lea siempre igual.
- **Disponibilidad separada de la lesión.** `player_availability` guarda periodos (limitado, readaptación, baja) con restricciones (sin contacto, sin saltos, sin golpeo, sin cambios de dirección, sin alta intensidad) y minutos máximos. "Disponible" es no tener un periodo abierto. La ve todo el cuerpo técnico; el diagnóstico, no.
- **Ajustes por sección** (`sections.training_settings`): nivel de seguimiento básico o completo, umbrales de las recomendaciones, si es formativa y el reparto objetivo de contenidos por categoría. El deporte propone; la sección cambia lo que quiera.

### Recomendaciones: reglas antes que IA (decisión 4)

- Veinte reglas puras en `packages/shared/src/training-insights.ts`, con pruebas: rendimiento en partido (acierto, pérdidas, faltas pronto, goles al final, córners), contexto (rival conocido, MD+1, semana de dos partidos), planificación (carga semanal, contenidos sin trabajar, tareas que no funcionan), jugador (restricciones que chocan con la sesión, bienestar, carga aguda, vuelta de baja, RPE por encima de lo previsto, objetivo sin trabajar, fortalezas, asistencia y reparto de minutos).
- **Se calculan al pedirlas**, no se guardan. Solo se guarda la respuesta (`insight_feedback`): aplicada o descartada, con la huella de la situación y un silencio de 14 días por defecto. La misma situación no vuelve a salir; una distinta, sí.
- **Cada recomendación es explicable**: regla, nivel, valores con la cifra que la justifica y contenidos relacionados. La web compone el texto en el idioma de quien lee. Nada se aplica solo: el cuerpo técnico decide.
- **La relación aguda:crónica se enseña como aviso** (decisión 7), con el umbral del club y la frase "es un aviso, no una predicción de lesión".

### Permisos y acceso

- Permisos nuevos: `org.training.read|write|write_own|library`, `org.load.read|write|write_own`, `org.availability.write`, `org.health.read|write`. El ámbito sigue al cargo (ADR 0033) y fuera de él la API responde 404.
- Dos áreas nuevas en "Personal > Acceso": **Entrenamiento** y **Salud**. Las excepciones por persona (ADR 0036) valen igual.
- **La administración no ve Salud por defecto** (decisión 2). Es la única área en la que la administración pierde algo y la única en la que admite excepción: se le abre a una persona concreta si lo necesita (`ADMIN_EXCEPTION_AREAS`, `overridableAreas`). La API rechaza con 409 cualquier otra excepción a la administración.
- **Desviación de la propuesta: la administración puede poner disponibilidad** (`org.availability.write`). La matriz de la propuesta la reservaba a fisioterapia y preparación física. Muchos clubes no tienen fisio y alguien tiene que poder marcar que un jugador está de baja; la disponibilidad no lleva diagnóstico, así que no toca datos de salud.

### Salud y RGPD (decisión 1)

- Diagnóstico solo con **consentimiento explícito** del deportista adulto o de su tutor, guardado con fecha, nombre y versión del texto. Sin consentimiento no se registran lesiones; el jugador solo tiene disponibilidad.
- **Se audita también la lectura** del área Salud (`health.viewed`), no solo los cambios.
- Lo ve y lo escribe fisioterapia; preparación física lo lee; la administración, solo por excepción. La enfermería enseña la lesión solo a quien tiene Salud; al resto, la disponibilidad.
- Retención y exportación quedan en manos del club con su asesoría, como decía la propuesta. Antes de activarlo en un club real conviene validarlo con su delegado de protección de datos.

### Deportista adulto (decisión 3)

El jugador con cuenta propia (su persona tiene usuario) ve "Mi bienestar": responde el cuestionario del día y el RPE de los entrenamientos de los dos últimos días desde el móvil. En formativas no hay cuenta del jugador, así que no aplica.

### Pantallas

Portada de entrenamiento; semana del equipo con "A tener en cuenta", copiar semana y semana tipo; temporada con plan, ciclos y barras de carga; histórico con exportación a Excel; editor de sesión por bloques con cierre (asistencia, RPE, participación y valoración de cada tarea); modo pista a pantalla completa; hoja para imprimir; biblioteca y ficha de tarea con su pizarra; carga del equipo; tests físicos; rendimiento del jugador con su salud; enfermería; ajustes y metodología de la sección; "Mi bienestar". La ficha del equipo, la del jugador, la agenda y los paneles del inicio enlazan con todo ello.

## Consecuencias

- Migración `20261022114435_training_planning` con 19 tablas, `sections.training_settings` y `matches.rpe`; semilla idempotente del club demo: contenidos, 14 tareas, 2 semanas tipo, un Sénior A con cuatro partidos, 18 sesiones, cargas y bienestar de cuatro semanas, un jugador limitado, uno en readaptación con lesión y fases, y tests físicos.
- Cuentas nuevas en el demo: `senior@demo.test` (entrenador del Sénior A), `preparador@demo.test` (preparación física) y `jugador@demo.test` (deportista adulto con cuenta propia). `fisio@demo.test` atiende también al Sénior A.
- Suite de aislamiento propia (`training.isolation.test.ts`): ámbito por equipo, bloques por rol, Salud fuera del alcance de la administración y del entrenador, consentimiento y auditoría de lecturas.
- La biblioteca semilla son 14 tareas escritas para el demo, no las 30 a 40 de un entrenador del club piloto que pedía la decisión 6. Queda pendiente que las escriba ese entrenador.
- Queda para después: borrador de sesión con IA sobre las reglas (tras seis a ocho semanas de datos), subir una imagen como pizarra, importar GPS por CSV, vídeo de tareas, plan de partido con el análisis del rival y el plan individual del jugador en su móvil.

## Alternativas descartadas

- Guardar las recomendaciones calculadas: obliga a recalcular o invalidar cuando cambia cualquier dato. Calcularlas al pedirlas cuesta milisegundos y siempre está al día.
- Un modelo de IA desde el principio: sin histórico inventa, y no se puede explicar ni probar.
- Un registro de lesiones visible para todo el cuerpo técnico: mezcla un dato operativo con uno de salud de categoría especial.
- Subir una imagen como única pizarra: no se ve igual en todos los dispositivos, no lleva el color del club y no se puede editar.
