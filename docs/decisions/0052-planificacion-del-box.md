# 0052. Planificación del box: un plan con objetivo, bloques y semanas, y la IA que lo diseña, lo escribe y lo ajusta

Estado: aceptada. Fecha: 2026-10-26. Construye la propuesta `docs/propuesta-planificacion-del-box.md` entera, en una fase y sin módulos de pago. Amplía la 0049 (clubs de fitness, propuesta de WOD con IA), la 0050 (programación rehecha) y la 0044 (generación con IA en segundo plano).

## Contexto

La programación de un box era un calendario de WODs sueltos: cada día bien escrito, pero nada decía hacia dónde iba el box, qué tocaba ese mes ni si la semana tenía sentido. La base ya tenía casi todo lo que necesita un planificador (horario, reservas, resultados con esfuerzo, marcas, biblioteca de ejercicios), pero faltaban el plan, el inventario de la sala, un nivel de entrada y el cerebro que lo une.

Producto aprobó las seis decisiones de la propuesta: cuatro niveles con nombre editable; Clase+ en la primera versión como complemento de tarifa, Competidor después; el atleta ve el bloque y el papel de cada día, no el WOD, configurable; plantillas de la plataforma revisadas por un head coach real o un socio; proyección con rangos y cifras desde el primer día, marcada como orientativa; y la planificación como módulo de pago. Pidió construirlo todo de una vez y **abierto para todos los boxes**: la división en módulos y el escalado de precios se harán cuando esté entero.

## Decisión

### Conceptos

- **Plan**: la estrategia de una disciplina. Plantilla de partida, nombre, objetivo, evento y fecha si los hay, lunes de inicio, semanas, reparto de 100 puntos entre seis capacidades (fuerza, halterofilia, gimnásticos, motor, intensidad, movilidad), frecuencia de referencia, tests, días de cierre, estructura y proyección. Estado borrador, activo, terminado o archivado; **uno activo por disciplina** (índice único parcial).
- **Bloque**: mesociclo de un tipo (test, base, desarrollo, realización, descarga, mantenimiento) con su semana de inicio, sus semanas, su énfasis (el del plan movido por el tipo de bloque) y su objetivo en una frase.
- **Semana**: volumen e intensidad de 0 a 100, el **papel de cada día** (pesado y corto, gimnásticos y motor medio, motor largo, por equipos, test, formato Open, estaciones de HYROX…), los días cerrados y sus etiquetas (test, retest, festivo, evento).
- **Sesión**: el WOD de siempre con el plan y la semana a los que sirve, el papel del día, la **intención** (dominio de tiempo, esfuerzo de 1 a 5 y cómo se tiene que sentir) y su **porqué**, una razón por línea. Cada bloque gana **capacidad**, **minutos previstos**, **pista** (clase o Clase+), **ejercicios enlazados** de la biblioteca y una cuarta versión, **Iniciación**.

### El motor, sin IA

Todo lo que puede hacer el código lo hace el código (`packages/shared`): es exacto, gratis y se puede probar.

- **Estructura**: de la plantilla (o de los bloques del arquitecto) salen los bloques, las semanas, el papel de cada día según los días con clase de la disciplina, los cierres sin desplazar los papeles, la semana de test, la descarga y el retest.
- **Progresiones de fuerza**: series, repeticiones y porcentaje de cada semana por bloque y tipo de día; en semana de test, la 1RM.
- **Borradores**: cada día con clase y sin WOD sale con su papel, su intención, calentamiento, el levantamiento del plan con su progresión, el motor largo con sus minutos, el hueco del WOD con lo que tiene que ser, la vuelta a la calma y los complementos de cobertura como bloques propios. Nunca pisa un día que ya tiene WOD.
- **Validador**: material (existe y funciona), logística (puestos frente al aforo: una oleada, bolsa de máquinas, por parejas, en oleadas o no cabe), tiempo (los bloques y las transiciones caben en la clase), ejercicios enlazados, patrón (no repetir la carga pesada del día anterior), cuatro niveles en los bloques puntuados y progresión del bloque. Límites de la semana: días con hombro por encima de la cabeza, días seguidos de barra pesada, días con carrera y con saltos.
- **Cobertura para quien viene 2 o 3 días**: las combinaciones de días más frecuentes del box (salen de las asistencias) y si tocan lo esencial del bloque; lo que falta se propone como complemento en el día más suave de la combinación.
- **Proyección**: una banda por capacidad y un rango por test (porcentaje, segundos o repeticiones), por énfasis, semanas, frecuencia y reparto de niveles del box, y calibrada con el último ciclo terminado de la disciplina (mejora real entre la prevista, limitada entre 0,5 y 1,5). Siempre un rango y siempre "orientativo".
- **Revisión de la semana**: lo previsto frente a lo que pasó (minutos del WOD por tiempo, esfuerzo, series completas), lo que aprende el box (cuánto se alargan los WODs con carrera o remo, el esfuerzo del motor largo, la asistencia del sábado) y los ajustes para la semana siguiente: time cap, ritmo guiado, repetir porcentaje y complemento de cobertura. Cada ajuste tiene una clave estable y el coach lo acepta o lo descarta; aceptar escribe el cambio en el WOD de la semana que viene.
- **Nivel sugerido por capacidad** (fuerza, halterofilia, gimnásticos, motor): Iniciación los tres primeros meses si no ha hecho nada más exigente; si no, el más alto completado al menos dos veces en 60 días; si no, el que más usa; y Scaled. El atleta lo cambia con un toque.

### La IA

Tres papeles con el mismo trabajo en segundo plano, el mismo modelo y la misma tabla de generaciones que la propuesta de WOD (ADR 0049), con su propio límite: **30 generaciones de planificación por box y semana**, que no gastan la cuota de propuestas de sesión ni de WOD.

- **Arquitecto**: de un objetivo en palabras propone la plantilla, el nombre, las semanas, el énfasis, los bloques con su objetivo y los tests, con su porqué. El asistente la carga en el formulario; el plan se crea cuando el coach lo crea.
- **Programador**: escribe las sesiones de los días sin WOD de una semana dentro de lo que manda el plan (papel, intención, levantamiento tal cual, minutos de motor, complementos), con las cuatro versiones, los ejercicios por su nombre en la biblioteca, el aforo y el material del box, y lo aprendido en la revisión. Opcionalmente, bloques de Clase+.
- **Copiloto**: un cambio en lenguaje normal ("el jueves cerramos") y cambios concretos por día (reescribir, mover, quitar, aviso), solo en fechas del plan desde hoy.

Lo que devuelve el modelo se valida antes de que lo vea el coach: esquema, fechas, ejercicios de la biblioteca, el levantamiento del plan impuesto y cada bloque comprobado con el esquema del editor. El coach elige qué entra; **nada se publica solo** y lo que escribe la IA entra en borrador. **Privacidad** como en las ADR 0044 y 0049: el modelo ve el box en agregados (horario, cuántos hay en cada nivel, frecuencias, combinaciones de días, material, biblioteca), nunca a un atleta.

### Material, niveles y Clase+

- **Inventario del box** (`box_equipment`): tipo (el catálogo de material de los ejercicios, ampliado con GHD, cuerda de trepa, paralelas, yugo, banco y gomas), nombre, unidades, unidades en reparación y hasta cuándo, peso mínimo y máximo, sala y notas.
- **Ajustes de la planificación** (`planning_settings`, una fila por club): el nombre de cada nivel en el box y lo que ve el atleta por adelantado (`none`, `roles` por defecto o `wod`).
- **Clase+**: un plan de cuota la incluye o no (`fee_plans.includes_plus`). El atleta sin Clase+ no ve esos bloques; ve cuántos hay.

### API

- `/api/org/equipment` (material), `/api/org/planning/settings` y `/api/org/planning/context` (lo que el box ya sabe para planificar una disciplina).
- `/api/org/plans` y `/api/org/plans/{id}` (crear, ver, cambiar y borrar; borrar deja los WODs fuera del plan); `/weeks/{n}` (la semana con su validación, logística, equilibrio, cobertura y límites), `/weeks/{n}/drafts` y `/weeks/{n}/publish`; `/review` y `/review/{n}/decide`; `/health`.
- IA: `/api/org/plan-ai/architect`, `/api/org/plans/{id}/weeks/{n}/ai`, `/api/org/plans/{id}/copilot`, `/api/org/plan-ai/{id}` y `/api/org/plan-ai/{id}/apply`.
- Atleta: `/api/org/me/cycle`, `/api/org/me/levels` y `/api/org/me/cycle/summary`. `/api/org/me/workouts` añade sus niveles, el papel de los próximos días y si su tarifa incluye Clase+.

Permisos: los de la programación. Ve quien ve la programación de la disciplina; planifica quien programa en ella (toda la programación, o la de sus clases: un coach sin clases en la disciplina ni la ve). Los ajustes los cambia quien escribe los ajustes del club o toda la programación. El ciclo es del atleta con ficha propia.

### Web

- **Planificación**: el plan activo de cada disciplina con su punto del ciclo y el papel de cada día; el asistente de seis pasos (objetivo con plantillas o arquitecto, calendario con festivos, énfasis repartiendo 100 puntos, tests, lo que ya sabe el box y resumen con el mapa) con la proyección moviéndose a la derecha; el mapa del ciclo; la semana con cada día, su intención, su progresión, su WOD, su validación y su logística, y al lado el equilibrio, la cobertura y los límites; la revisión del domingo; la salud (cumplimiento, marcas, frecuencia, equilibrio real, duraciones, patrones por semana, límites y coste de la IA); el copiloto; y el material.
- **Programación**: la franja del plan encima de la semana y el papel en cada WOD. El editor guarda el plan, la intención y el porqué, y cada bloque su capacidad, minutos, Clase+, ejercicios y las cuatro versiones.
- **Atleta**: en su WOD, el plan, el papel, la intención, el porqué, su versión marcada en cada bloque y lo que viene; "Tu ciclo" (dónde está, hitos, sus marcas con su rango, constancia, lo que le falta esta semana y sus niveles); y "Tu ciclo en cifras" para compartir o imprimir.
- **Tarifas**: Clase+ en el formulario del plan de cuota.

### Demo

El box demo trae inventario, un plan activo de CrossFit con su estructura y su proyección, WODs de las semanas del plan con su papel, intención, porqué y bloques enlazados, borradores y días por escribir, y marcas de partida para calibrar la proyección.

## Consecuencias

- La programación tiene un sentido que se puede ver, medir y explicar en la pizarra.
- El coste variable de la IA queda acotado por el límite semanal y se ve por plan en la salud de la programación.
- Las plantillas son de la plataforma: las revisará un head coach o un socio de programación antes de venderlas como producto.
- Todo está abierto en todos los boxes. Cuando se divida en módulos (por ejemplo, la IA de planificación y Clase+), el corte va en los permisos o en el plan del club, sin tocar las tablas.
