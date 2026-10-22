# Propuesta: planificación de entrenamientos, seguimiento y recomendaciones

Estado: aprobada y construida (ADR 0039). Fecha: 22 de octubre de 2026. Punto de partida: Bloque 20 (ADR 0034) y la consola del partido (ADR 0037). Deporte de referencia: fútbol sala; el modelo vale para cualquier deporte de equipo.

Resumen:

- Hoy el producto sabe qué pasa en los partidos y quién es cada jugador. No sabe qué se entrena ni cómo llega cada jugador al entrenamiento. Eso es el 80 % de la semana de un cuerpo técnico.
- Propongo que cada entrenamiento de la agenda sea una **sesión planificada**: tareas de una biblioteca, tiempos, carga prevista, grupos y quién está disponible.
- Propongo medir la carga con lo mínimo que funciona sin hardware: **RPE de sesión** (esfuerzo percibido × minutos) y los minutos de partido, que ya tenemos.
- Propongo separar la **disponibilidad con restricciones**, que ve todo el cuerpo técnico, del **registro de lesiones**, que solo ve fisioterapia. Esa separación es lo que hace viable el RGPD.
- Propongo un **motor de recomendaciones por reglas explicables**. Cruza partidos, carga, disponibilidad, histórico de sesiones y la ficha de cada jugador. Dice qué tener en cuenta, con la cifra que lo justifica y una acción a un toque.
- Seis bloques (21 a 26). Los tres primeros dan sesión, planificación y las primeras recomendaciones desde los partidos en 13 a 16 días de trabajo efectivo.

## 1. Diagnóstico: qué falta hoy

| Lo que hay | Lo que falta para el cuerpo técnico |
| --- | --- |
| Agenda con los entrenamientos generados del horario semanal (`events`, `team_schedules`) | El entrenamiento es una franja horaria vacía: sin objetivo, sin tareas, sin carga |
| Pase de lista (`attendance`) | Sabemos quién vino. No cuánto trabajó ni cómo llegó |
| Partidos con eventos, minutos por jugador, valoración, zonas y acumulados (`match_events`, `match-stats.ts`) | Los datos se miran, pero no vuelven al entrenamiento. Nadie traduce "encajamos en los últimos cinco minutos" en una tarea |
| Ficha con indicadores, objetivo y PDI en seis áreas (ADR 0029) | El PDI dice "mejorar la pierna no dominante", pero no hay dónde ver si se ha trabajado |
| Cargos de fisioterapia, preparación física y psicología con su panel | Los paneles solo leen un indicador de 0 a 100. No hay lesiones, ni carga, ni bienestar |
| Alcance por cargo y matriz de acceso (ADR 0033 y 0036) | No hay áreas para entrenamiento ni para salud |

Tenemos la entrada (partidos y jugadores) y la salida (estadísticas y ficha). Falta el proceso que las une: la semana de trabajo.

## 2. Qué necesita cada perfil

Escrito como lo vive un cuerpo técnico de fútbol sala en competición: partido el sábado, cuatro sesiones entre semana, catorce jugadores, dos porteros.

| Perfil | Su pregunta del día | Lo que necesita de la herramienta |
| --- | --- | --- |
| Primer entrenador | ¿Qué entreno hoy y con quién cuento? | La plantilla disponible del día. Una sesión de 90 minutos en menos de 10 reutilizando tareas. Lo que pasó en el último partido y lo que sabemos del rival |
| Segundo entrenador y entrenador de porteros | ¿Qué parte me toca? | Su bloque dentro de la sesión (porteros, grupo de finalización), editable sin tocar el resto |
| Preparación física | ¿Cuánta carga lleva cada uno y cuánta le doy? | Carga por jugador (sesiones y partidos), la semana actual frente a las cuatro anteriores, bienestar, tests y su bloque de la sesión (activación, preventivo, fuerza) |
| Fisioterapia | ¿Quién no puede hacer qué, y cuándo vuelve? | Registro de lesiones, disponibilidad con restricciones que el entrenador entienda sin diagnóstico, readaptación por fases y molestias reportadas |
| Dirección y coordinación | ¿Se trabaja lo que dice la metodología del club? | La planificación de los equipos de su sección, el cumplimiento (sesiones hechas, contenidos por categoría) y la biblioteca oficial del club |
| Delegación | ¿Quién viene y qué material hace falta? | Asistencia (ya existe) y el material de la sesión |
| Jugador adulto con cuenta | ¿Cómo estoy? | Responder el bienestar en 20 segundos y su RPE después de la sesión, desde el móvil |
| Familia | — | Nada nuevo. La planificación es del cuerpo técnico. Sigue viendo la agenda como hoy |

## 3. Principios

1. **La sesión cuelga de la agenda.** Un entrenamiento de la agenda es una sesión. No hay dos calendarios.
2. **El deporte propone, el club decide.** Contenidos, restricciones y umbrales son catálogos por sección, igual que las acciones del partido (ADR 0034). El fútbol sala trae los suyos.
3. **Lo básico o el máximo detalle.** Un alevín registra objetivo, tareas y asistencia. Un sénior registra además RPE individual, bienestar y tests. Es un ajuste de la sección, no dos productos.
4. **Calcular, no guardar agregados.** Carga aguda y crónica, cumplimiento y recomendaciones salen de los datos con un motor puro en `packages/shared`, como las estadísticas. Nada se desalinea.
5. **El entrenador ve qué puede hacer el jugador, no por qué.** Disponibilidad y restricciones para el cuerpo técnico; diagnóstico solo para fisioterapia. Minimización de datos (RGPD, artículos 5 y 9).
6. **Recomendar con la cifra delante.** Cada recomendación dice qué detecta, con qué dato y qué propone. Si no se puede explicar, no se enseña.
7. **Cada toque cuenta** (DESIGN.md). Pasar el RPE de catorce jugadores es una fila con una escala de 0 a 10 por jugador, como el pase de lista. Sin formularios.

## 4. El modelo

```
Temporada
└── Equipo
    ├── Plan de temporada            pretemporada, primera vuelta, segunda vuelta, fase final
    │   └── Ciclos                   mesociclos de 3 a 6 semanas: foco de contenidos y carga objetivo
    │       └── Semana               calculada desde los partidos: MD-4 … MD, MD+1
    │           └── Sesión           = el entrenamiento de la agenda
    │               ├── Bloques      activación, principal, porteros, readaptación, vuelta a la calma
    │               │   └── Tareas   de la biblioteca, con minutos, series, intensidad y grupo
    │               └── Cierre       asistencia (existe), RPE por jugador, duración real, notas
    ├── Partidos                     existen: minutos, acciones, zonas
    └── Jugadores
        ├── Ficha                    existe: indicadores, objetivo, PDI
        ├── Carga                    sesiones y partidos (RPE × minutos)
        ├── Bienestar                sueño, fatiga, dolor muscular, estrés, ánimo (1 a 5)
        ├── Disponibilidad           disponible, limitado (con restricciones), readaptación, baja
        └── Lesiones                 solo fisioterapia
Biblioteca de tareas                 del club (metodología), de la sección, del equipo y propias
Contenidos                           catálogo por sección: finalización, salida de presión, ABP defensiva, 5x4…
```

El día de partido (MD) no se guarda: se calcula de los partidos del equipo (agenda y `matches`). Si el entrenador lo cambia, por ejemplo con un partido aplazado, la sesión guarda su propia etiqueta.

### Contenidos: el puente entre partido y entrenamiento

Es la pieza clave. Cada contenido del catálogo puede señalar las acciones del partido que lo miden. Así el sistema sabe que, si cae el acierto en el tiro, las tareas útiles son las de finalización. Es el mismo criterio que `mirrorOf` en el catálogo de acciones: dato, no código.

| Contenido (fútbol sala) | Tipo | Acciones del partido que lo miden |
| --- | --- | --- |
| Finalización | Técnico-táctico | `goal`, `shot_on_target`, `shot_off_target` y zonas |
| Salida de presión | Táctico | `turnover` (con zona si se registra) |
| Presión y recuperación | Táctico | `steal`, `opp_shot_on_target` |
| Defensa sin falta, 1x1 defensivo | Táctico | `foul` y faltas acumuladas por periodo |
| ABP ofensiva | Estrategia | `corner` seguido de `goal` |
| ABP defensiva | Estrategia | `opp_goal` tras acción a balón parado, si el club la registra |
| Portero-jugador (5x4) e inferioridad (4x5) | Táctico | Acciones propias del club, si las registra |
| Juego del portero | Específico | `save`, `opp_shot_on_target` |
| Resistencia intermitente, velocidad repetida, fuerza, prevención | Físico | Goles por tramo del partido, minutos, carga |

Un club que no registra una acción simplemente no tiene activa la regla que depende de ella.

## 5. Pantallas

### 5.1 Semana del equipo

La pantalla principal del entrenador.

- Siete columnas con su etiqueta MD (MD-4 … MD+1). Cada sesión: hora, instalación, objetivo, duración y carga prevista con el color de su intensidad. El partido, marcado con el rival.
- Arriba: "Disponibles" (por ejemplo, 12 de 14: un limitado y una baja) y la carga planificada de la semana frente a la media de las cuatro anteriores.
- Columna derecha: **A tener en cuenta** (sección 7), de tres a cinco tarjetas.
- Acciones: "Copiar semana anterior", "Aplicar semana tipo" y "Nueva sesión" (crea el evento en la agenda si no existe).

### 5.2 Editor de sesión

- Cabecera: fecha, hora e instalación (de la agenda), MD, objetivo y contenidos del día.
- **Plantilla del día**: cada jugador con su estado (disponible, limitado con su restricción, readaptación, baja). Se arrastran a grupos: porteros, readaptación, grupo A y B.
- **Bloques** con sus tareas. Se arrastran desde la biblioteca, en un panel lateral con búsqueda por contenido, formato y duración. Cada tarea: minutos, series y repeticiones, recuperación, RPE objetivo y grupo.
- **Totales calculados**: minutos, carga prevista (RPE objetivo × minutos) y reparto por contenido.
- **Conflictos en línea**: "Jorge está limitado sin contacto y el rondo 4x4+2 tiene contacto". Sale del cruce entre las restricciones del jugador y las etiquetas de la tarea.
- **Responsable por bloque**: preparación física edita activación y preventivo; el entrenador de porteros, su bloque; el primer entrenador, todo.
- Salidas: **Modo pista** (tableta, una tarea por pantalla con su diagrama y cronómetro, mismo lenguaje que la consola del partido) y un PDF de una página para el vestuario.

### 5.3 Cierre de sesión

- Asistencia con el `AttendanceToggle` que ya existe, más participación: completa, parcial o readaptación.
- RPE por jugador: una fila de 0 a 10 por jugador, un toque. En formativas, opción de RPE de grupo.
- Duración real (por defecto, la prevista), valoración de la sesión y de cada tarea (funcionó o no), y notas.
- El jugador adulto con cuenta recibe la pregunta del RPE en el móvil 30 minutos después y la responde él. El cuerpo técnico ve quién falta.

### 5.4 Planificación de temporada

- Línea de tiempo con los partidos y los ciclos encima: nombre, foco de contenidos y carga objetivo.
- Barras por semana: carga planificada frente a real. Bandas de pretemporada, competición y parones.
- Semanas tipo reutilizables: "Partido el sábado", "Dos partidos", "Parón".

### 5.5 Biblioteca de tareas

- Lista con filtros: contenido, fase del juego, formato (4x4+2, 3x2…), espacio, duración, intensidad, categoría y ámbito (club, sección, equipo, mías).
- Ficha de tarea: descripción, reglas y variantes, puntos clave, material, diagrama de pista, vídeo por enlace y etiquetas de restricción (contacto, saltos, golpeo, cambios de dirección, alta intensidad).
- Diagrama con un editor propio en SVG: jugadores, porteros, balón, conos y tres flechas (pase, conducción y desplazamiento).
- Uso: en cuántas sesiones está, su valoración media y la última vez que se hizo.
- Semilla del deporte: entre 30 y 40 tareas de fútbol sala para que el primer día no esté vacía.

### 5.6 Ficha del jugador: pestaña "Rendimiento"

Solo para el personal, como los indicadores.

- Disponibilidad y restricciones vigentes.
- Carga: últimos 7 días frente a la media de 28, separando sesiones y partidos.
- Bienestar de las últimas dos semanas.
- Minutos de partido (la tarjeta ya existe) y minutos trabajados en los contenidos de su objetivo y su PDI.
- Las recomendaciones del jugador.
- Lesiones, solo con el permiso de salud.

### 5.7 Panel de fisioterapia: "Enfermería"

Bajas, limitados, readaptaciones con su fase, vueltas previstas esta semana y molestias reportadas en el bienestar (dolor 4 o 5). Sustituye, para quien lleva el seguimiento, la lectura del indicador "cuerpo" del panel actual.

### 5.8 Panel de preparación física

Semáforo del equipo: carga aguda frente a crónica, monotonía, bienestar del día, quién no ha respondido y tests pendientes.

### 5.9 Coordinación: metodología

Por cada equipo de su sección: sesiones planificadas frente a entrenamientos de la agenda, reparto de contenidos frente al objetivo de su categoría (por ejemplo, alevín con un 50 % técnico) y uso de las tareas oficiales del club. Sin ranking de entrenadores: es una herramienta para acompañar, no para vigilar.

### 5.10 Histórico

Todo queda guardado: sesiones con sus tareas, cierre y carga. Se busca por contenido o por tarea ("¿cuándo trabajamos ABP defensiva?"), se comparan semanas y temporadas, se copia una sesión antigua y se exporta a Excel con `apps/web/src/lib/xlsx.ts`.

## 6. Carga, bienestar y disponibilidad

**Carga.** RPE de sesión (método de Foster): esfuerzo percibido de 0 a 10 × minutos, en unidades arbitrarias. Validado, gratuito y sin GPS. En el partido, los minutos en pista del motor de estadísticas (`timeMs`) × el RPE del partido. Quien no jugó suma cero: la regla del compensatorio sale de ahí. Indicadores: carga semanal, aguda (7 días) frente a crónica (28 días), monotonía y tensión. La relación aguda:crónica se enseña como aviso, nunca como predicción de lesión: la literatura no la sostiene como predictor, y el umbral lo ajusta el club.

**Bienestar.** Cinco preguntas de 1 a 5 antes de entrenar: sueño, fatiga, dolor muscular, estrés y ánimo. Lo responde el jugador adulto con cuenta (`people.user_id`). En formativas está apagado por defecto.

**Disponibilidad.** Cuatro estados: disponible, limitado, readaptación y baja. Limitado lleva restricciones de un catálogo (sin contacto, sin saltos, sin golpeo, sin cambios de dirección, minutos máximos) y una fecha prevista. La ponen fisioterapia o preparación física y la ve todo el cuerpo técnico del equipo. Alimenta los conflictos de la sesión.

**Lesiones.** Fecha, contexto (entrenamiento, partido u otro), sesión o partido de origen, zona, lado, tipo, mecanismo (con o sin contacto), si es recaída, días de baja (la gravedad se calcula) y fases de readaptación. Diagnóstico y notas clínicas, solo para fisioterapia.

## 7. Recomendaciones: "A tener en cuenta"

### Cómo funciona

- Un motor puro (`packages/shared/src/training-insights.ts`) recibe los partidos (con `computeMatchStats` y `aggregateMatchStats`), las sesiones y su reparto de contenidos, la carga, el bienestar, la disponibilidad, la ficha (posición, pie dominante, objetivo, PDI, indicadores) y el calendario. Devuelve una lista ordenada por prioridad.
- Cada recomendación lleva nivel (información, atención, alerta), sujeto (equipo o jugador), **evidencia** (las cifras y el enlace al dato), **propuesta** y **acción**: añadir una tarea con ese contenido a la próxima sesión, pasar a un jugador al grupo de readaptación o crear un objetivo.
- Se aplica o se descarta con motivo. El descarte silencia esa regla para ese caso durante un tiempo y queda guardado: es la medida de utilidad de cada regla.
- Umbrales por sección, con los del deporte por defecto.
- Se calculan al abrir la semana, la sesión o la ficha. Solo se guarda la respuesta del cuerpo técnico.

### Catálogo inicial (fútbol sala)

| # | Detecta | Fuente | Propone |
| --- | --- | --- | --- |
| | **Equipo, desde los partidos** | | |
| 1 | Acierto en el tiro de los últimos tres partidos 8 puntos o más por debajo de la media de la temporada | `goal`, `shot_on_target`, `shot_off_target`, zonas | Tareas de finalización, desde la zona con menos acierto si hay mapa |
| 2 | Pérdidas por partido un 30 % por encima de la media en los últimos tres | `turnover` y su zona | Salida de presión, superioridades en inicio |
| 3 | El equipo llega a la quinta falta antes del minuto 15 de una parte en dos de los últimos tres partidos | `foul` por periodo y cronómetro, tope de faltas de la sección | Defensa sin falta y 1x1 defensivo, con el aviso del doble penalti |
| 4 | Más del 40 % de los goles en contra llega en los últimos cinco minutos de cada parte | `opp_goal` y cronómetro | Resistencia intermitente en MD-3 y revisar las rotaciones |
| 5 | Córners a favor sin gol en los diez segundos siguientes, en los últimos cinco partidos | Secuencia `corner` → `goal` | ABP ofensiva |
| 6 | El próximo rival ya se jugó esta temporada o la anterior | `matches.opponent` | Resumen de aquel partido: marcador, comparativa y zonas de tiro del rival |
| | **Calendario y carga del equipo** | | |
| 7 | Sesión de MD+1 | Minutos del último partido y convocatoria | Dos grupos: recuperación para quien jugó más de 25 minutos, compensatorio para quien jugó menos de 15 o no fue convocado |
| 8 | Semana con dos partidos | Agenda y partidos | Semana tipo "dos partidos" con menos volumen |
| 9 | Carga planificada de la semana por encima de 1,3 o por debajo de 0,8 veces la media de las cuatro anteriores | Sesiones | Revisar el volumen |
| 10 | Un contenido del ciclo sin minutos en dos semanas | Sesiones | Añadir una tarea de ese contenido |
| 11 | Una tarea repetida en el ciclo con valoración baja | Cierre de sesiones | Alternativas con el mismo contenido |
| | **Jugador** | | |
| 12 | Una restricción vigente choca con una tarea de la sesión | Disponibilidad y etiquetas de la tarea | Variante de la tarea o grupo de readaptación |
| 13 | Dolor de 4 o 5, o bienestar tres puntos por debajo de su media dos días seguidos | Bienestar | Avisar a fisioterapia y moderar la carga |
| 14 | Carga aguda:crónica fuera del umbral del club | Carga | Ajustar la carga del jugador |
| 15 | Vuelta tras una baja | Lesión y carga | Progresión: no más del 110 % de su carga crónica previa por semana |
| 16 | RPE real dos puntos por encima del previsto en dos sesiones seguidas | Cierre | Revisar con el jugador y con preparación física |
| 17 | El objetivo o un área del PDI tiene contenidos asociados y menos de 20 minutos en tres semanas, o su revisión vence en siete días | Ficha y sesiones | Una tarea o variante. Ejemplo: finalización con la pierna no dominante si el objetivo lo pide |
| 18 | Fortaleza: primer cuartil del equipo en una acción (pases clave, robos, acierto) en los últimos cinco partidos | Acumulados de partido | Usarle de referencia en la tarea, darle un rol (lanzador de ABP) y reconocerlo. Solo para el personal (DESIGN.md 10) |
| 19 | Asistencia por debajo del 70 % en cuatro semanas | Pase de lista | Hablar con el jugador o con la familia |
| 20 | Formativas: un jugador por debajo de la mitad de los minutos medios del equipo en cuatro partidos | Minutos de partido | Repartir minutos como objetivo formativo |

Las reglas 1 a 11 y 17 a 20 funcionan con datos que ya existen o que llegan en los bloques 21 y 22. Las 12 a 16 esperan a disponibilidad, carga individual y bienestar (bloques 24 y 25).

### IA generativa: después, y encima de las reglas

Con seis a ocho semanas de sesiones y una biblioteca con uso, un modelo puede redactar un borrador de sesión a partir de las recomendaciones activas, la plantilla disponible y la biblioteca del club. Va después por tres motivos: sin histórico no tiene con qué trabajar; las reglas son baratas, se prueban y se explican; y la decisión es del entrenador. El modelo propone. Nunca escribe en la ficha ni en salud.

## 8. Roles y permisos

### Permisos nuevos

| Permiso | Para qué |
| --- | --- |
| `org.training.read` | Ver planificación, sesiones, biblioteca, disponibilidad (sin diagnóstico) y recomendaciones de su ámbito |
| `org.training.write` | Planificar en cualquier equipo de su ámbito |
| `org.training.write_own` | Planificar en los equipos propios; en preparación física y fisioterapia, sus bloques si están en el cuerpo técnico del equipo |
| `org.training.library` | Gestionar la biblioteca del club y la metodología |
| `org.load.read` | Ver carga y bienestar |
| `org.load.write_own` | Registrar RPE y bienestar en los equipos propios |
| `org.availability.write` | Poner disponibilidad y restricciones |
| `org.health.read`, `org.health.write` | Lesiones con diagnóstico y readaptación |

Dos áreas nuevas en la matriz de "Personal > Acceso" (ADR 0033): **Entrenamiento** (planificación, biblioteca, carga y disponibilidad) y **Salud** (lesiones). Las excepciones por persona (ADR 0036) funcionan igual: una psicóloga que necesite ver el bienestar se abre por excepción, sin cambiar su cargo.

`team_staff.role_in_team` gana `fitness` y `goalkeeper_coach`, para que la sesión sepa de quién es cada bloque.

### Matriz por defecto

| | Administración | Dirección y coordinación | Entrenador y ayudante | Preparación física | Fisioterapia | Delegación | Jugador adulto | Familia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ver planificación y sesiones | Todo | Sus secciones | Sus equipos | Sí | Sí | Sesión del día | Su sesión del día | No |
| Editar planificación | Sí | Sí | Sus equipos | Sus bloques | Bloque de readaptación | No | No | No |
| Biblioteca del club | Gestiona | Gestiona | Usa y crea propias | Usa y crea propias | Usa | No | No | No |
| Registrar RPE | Sí | Sí | Sus equipos | Sí | No | No | El suyo | No |
| Ver carga y bienestar | Sí | Sí | Sus equipos | Sí | Sí | No | Lo suyo | No |
| Ver disponibilidad | Sí | Sí | Sus equipos | Sí | Sí | Estado, sin restricciones | La suya | No |
| Poner disponibilidad | No | No | No | Sí | Sí | No | No | No |
| Lesiones con diagnóstico | Decisión 2 | No | No | Solo lectura | Sí | No | Lo suyo | No |
| Recomendaciones | Todas | Sus secciones | Sus equipos | Las de carga | Las de salud | No | No | No |

El ámbito sigue al cargo (ADR 0033): el entrenador, sus equipos; dirección y coordinación, sus secciones; fisioterapia, los deportistas que atiende. Preparación física tiene hoy ámbito de club. Si un club tiene un preparador por equipo, se acota a `teams` con una línea en `PROFILE_SCOPE`, como prevé esa ADR.

## 9. Modelo de datos

Misma disciplina que hasta ahora: `organization_id` obligatorio e indexado (ADR 0015), estados con `CHECK` desde las listas de `packages/shared`, migraciones en `netlify/database/migrations/`, semilla del demo idempotente y suite de aislamiento por bloque.

### Tablas nuevas

| Tabla | Para qué | Campos clave |
| --- | --- | --- |
| `training_contents` | Catálogo de contenidos por sección | `section_id`, `code`, `name`, `kind` (`technical`, `tactical`, `physical`, `set_piece`, `goalkeeper`, `psychological`), `related_action_codes`, `sort_order`, `status`. Semilla del deporte |
| `drills` | Tareas de la biblioteca | `scope` (`club`, `section`, `team`, `personal`), `section_id`, `team_id`, `owner_user_id`, `name`, `description`, `rules`, `coaching_points`, `variants`, `format`, `space`, `players_min`, `players_max`, `duration_min`, `target_rpe`, `material`, `diagram` (jsonb), `video_url`, `restriction_tags`, `status` |
| `drill_contents` | Contenidos de una tarea | `drill_id`, `content_id`, `is_primary` |
| `training_plans` | Plan de temporada de un equipo | `team_id`, `season_id`, `name`, `notes`. Único por (equipo, temporada) |
| `training_cycles` | Ciclos del plan | `plan_id`, `name`, `starts_on`, `ends_on`, `focus_content_ids`, `target_weekly_load` |
| `microcycle_templates` | Semanas tipo | `section_id`, `name`, `days` (jsonb: día respecto al partido → sesiones tipo) |
| `training_sessions` | La sesión, una por entrenamiento de la agenda | `event_id` (único), `team_id`, `cycle_id`, `md_label` (nulo: calculado), `objective`, `status` (`draft`, `planned`, `done`, `cancelled`), `actual_minutes`, `rating`, `notes` |
| `training_session_items` | Tareas de una sesión | `session_id`, `drill_id` (nulo: tarea libre), `block` (`warmup`, `main`, `goalkeepers`, `rehab`, `cooldown`), `sort_order`, `minutes`, `sets`, `reps`, `rest_sec`, `target_rpe`, `group_label`, `player_ids` (nulo: todos), `owner_user_id`, `rating` |
| `player_loads` | Carga por jugador | `player_id`, `event_id` o `match_id`, `minutes`, `rpe` (0 a 10), `participation` (`full`, `partial`, `rehab`), `source` (`session`, `match`, `extra`), `recorded_by`. Única por (evento o partido, jugador) |
| `wellness_entries` | Bienestar diario | `player_id`, `on_date`, `sleep`, `fatigue`, `soreness`, `stress`, `mood` (1 a 5), `soreness_area`, `note`, `recorded_by`. Única por (jugador, día) |
| `player_availability` | Disponibilidad, vigente e histórica | `player_id`, `status` (`available`, `limited`, `rehab`, `out`), `restrictions`, `max_minutes`, `from_on`, `until_on`, `injury_id`, `set_by` |
| `injuries` | Lesiones (área Salud) | `player_id`, `occurred_on`, `context`, `event_id`, `match_id`, `body_area`, `side`, `kind`, `mechanism`, `recurrence`, `diagnosis`, `expected_return_on`, `returned_on`, `status` |
| `rehab_phases` | Fases de readaptación | `injury_id`, `phase`, `started_on`, `criteria`, `done_on` |
| `insight_feedback` | Respuesta a una recomendación | `rule_code`, `team_id`, `player_id`, `fingerprint`, `outcome` (`applied`, `dismissed`), `reason`, `snooze_until`, `user_id` |
| `physical_tests`, `physical_test_results` (bloque 26) | Tests físicos | Catálogo (salto con contramovimiento, 10 y 20 m, 30-15 IFT, velocidad repetida) y resultados por jugador y fecha |

### Tablas que cambian

| Tabla | Cambio |
| --- | --- |
| `team_staff` | `role_in_team` gana `fitness` y `goalkeeper_coach` |
| `sections` | `training_settings` (jsonb): nivel de seguimiento (básico o completo), umbrales de las recomendaciones y reparto objetivo de contenidos por categoría |
| `matches` | `rpe` del partido para el equipo. El individual va a `player_loads` |
| `access_rules` | Sin migración: dos áreas nuevas en `ACCESS_AREAS` |

### Club demo

El Alevín A con una semana planificada alrededor de su próximo partido, la biblioteca semilla, un jugador limitado (sin contacto) y otro en readaptación, y las recomendaciones que salen de sus dos partidos jugados. Un equipo sénior con RPE y bienestar de cuatro semanas, para enseñar la carga.

## 10. Datos de salud y RGPD

Lesiones y diagnósticos son datos de salud: categoría especial (artículo 9 del RGPD). Con menores, el cuidado es doble. El informe inicial ya recomendaba dejarlos fuera del MVP. Propongo entrar con estas garantías:

- **Dos niveles.** La disponibilidad con restricciones es un dato operativo y la ve el cuerpo técnico. El diagnóstico es un dato de salud y solo lo ve fisioterapia.
- **Consentimiento explícito** del jugador adulto o del tutor, registrado con fecha y versión del texto. Sin consentimiento, el jugador solo tiene disponibilidad.
- **Auditoría de lecturas.** En el área Salud se audita también quién consulta, no solo quién cambia.
- **Retención.** El diagnóstico se borra un plazo después de la baja del jugador en el club. El plazo lo fija el club con su asesoría.
- **Derecho de acceso.** Exportación de lo que el club guarda de un jugador.

Antes del bloque 24, validación con un delegado de protección de datos. Es una decisión legal, no técnica: por eso ese bloque no bloquea a los demás.

## 11. Plan por bloques

| Bloque | Entregable | Esfuerzo | Depende de |
| --- | --- | --- | --- |
| 21. Sesión y biblioteca | Contenidos por sección con semilla, tareas con diagrama, sesión ligada al entrenamiento de la agenda, editor por bloques, cierre con asistencia, copiar sesión, PDF, permisos y área Entrenamiento | 5 a 6 días | Aprobar esta propuesta |
| 22. Semana, temporada y carga | MD calculado, vista de semana, semanas tipo, plan y ciclos, RPE de sesión y de partido, carga planificada frente a real | 4 a 5 días | 21 |
| 23. Recomendaciones v1 | Motor puro con pruebas, reglas 1 a 11 y 17 a 20, "A tener en cuenta" en la semana, la sesión y la ficha, aplicar y descartar | 4 a 5 días | 22 |
| 24. Disponibilidad y salud | Disponibilidad con restricciones, conflictos en la sesión, lesiones y readaptación, área Salud, consentimiento, auditoría de lecturas, Enfermería | 5 a 6 días | 21 y decisiones 1 y 2 |
| 25. Bienestar y preparación física | Cuestionario y RPE desde el móvil del jugador adulto, carga aguda y crónica, monotonía, panel de preparación física, reglas 12 a 16 | 3 a 4 días | 22 y 24 |
| 26. Metodología y tests | Reparto objetivo de contenidos por categoría, panel de coordinación, biblioteca oficial del club, tests físicos con evolución (DESIGN.md 10) | 4 a 5 días | 21 |

- Ahora: 21, 22 y 23. De 13 a 16 días.
- Después: 24, 25 y 26. De 12 a 15 días.
- Más adelante: borrador de sesión con IA, importación de GPS por CSV, vídeo de tareas, plan de partido con el análisis del rival y plan individual del jugador en su móvil.

Por qué este orden:

- **El 21 primero** porque es donde el entrenador gasta el tiempo cada día y da valor sin histórico. Sin sesiones registradas no hay nada que recomendar.
- **El 23 antes que salud** porque las recomendaciones de partido usan datos que ya existen. Es lo que nos diferencia de una hoja de cálculo o de una app de pizarra, y no espera a ninguna decisión legal.
- **El 24 espera a una decisión legal.** Bloquear todo lo demás por ella sería caro.
- **El 25 y el 26** tienen más valor en equipos sénior y en academias grandes. Conviene validarlos con los clubes piloto antes de construirlos.

## 12. Cómo sabremos que funciona

| Métrica | Objetivo a ocho semanas en los equipos piloto | Por qué |
| --- | --- | --- |
| Entrenamientos de la agenda con sesión planificada | Más del 70 % | Adopción real, no altas |
| Tiempo para crear una sesión (mediana) | Menos de 10 minutos | Si tarda más que el papel, se abandona |
| Sesiones cerradas con RPE (sénior) | Más del 80 % | Sin RPE no hay carga ni reglas de carga |
| Recomendaciones aplicadas sobre mostradas | Más del 25 %. Una regla por debajo del 10 % se revisa o se apaga | Utilidad de cada regla, medida con el propio uso |
| Recomendaciones descartadas como "no aplica" | Menos del 30 % | Ruido |
| Semanas con uso del cuerpo técnico | 4 de cada 5 | Retención |
| Días de baja por lesión sin contacto | Tendencia a la baja frente a la temporada anterior | Resultado a largo plazo; no se atribuye solo a la herramienta |

## 13. Decisiones que te pido

1. **Diagnósticos: guardarlos o solo disponibilidad.** Recomiendo disponibilidad con restricciones para todos los equipos y diagnóstico solo para fisioterapia, con consentimiento y validado por un delegado de protección de datos. En formativas, empezar solo con disponibilidad. Sin diagnóstico, la readaptación y la regla de vuelta pierden precisión. Con diagnóstico sin garantías, el riesgo es una sanción y la confianza de las familias.
2. **La administración no ve Salud por defecto.** Recomiendo que el área Salud sea la única excepción a "la administración nunca pierde nada" (ADR 0033): acceso por necesidad de conocer. Se le abre por excepción si hace falta. Coste: una condición más en el cálculo de permisos.
3. **El jugador adulto responde él su bienestar y su RPE.** Recomiendo sí en sénior y no en formativas. Si depende de que el cuerpo técnico lo pase a mano, se hace una semana y se abandona.
4. **Reglas antes que IA.** Recomiendo reglas en el 23 y la IA como redactora de borradores tras seis a ocho semanas de datos. Las reglas cuestan días, se prueban y se explican. La IA sin datos inventa.
5. **Pizarra propia en SVG o subir una imagen.** Recomiendo un editor propio sencillo, con la opción de subir imagen. Cuesta uno o dos días más. A cambio, las tareas se ven igual en todos los dispositivos, se imprimen bien y llevan el color del club. Mismo criterio que las gráficas propias (ADR 0034).
6. **Biblioteca semilla escrita por un entrenador del club piloto.** Recomiendo entre 30 y 40 tareas reales, no generadas. Una biblioteca vacía frena la adopción; una mala, la confianza.
7. **Relación aguda:crónica visible.** Recomiendo enseñarla como aviso, con el umbral del club y una frase que diga que no predice lesiones. Los preparadores físicos la usan: ocultarla nos resta credibilidad con ellos, y venderla como predictor nos la quita.

## 14. Lo que no toco

Partido en directo, estadísticas e histórico (se leen, no cambian). La ficha del jugador gana una pestaña y nada más. La agenda sigue igual: la sesión cuelga de ella. El pase de lista se reutiliza en el cierre. El alcance por cargo y la matriz de acceso ganan dos áreas. La vista de la familia no cambia.
