# 0030. Personal con cargo, permisos por equipo, ficha para la familia, inicio operativo y reto por puntos

Estado: aceptada. Fecha: 2026-10-21. Fase 1, Bloque 13.

## Contexto

Producto comparó el producto con el prototipo (`docs/dominio.md`) y pidió traer lo que faltaba, con el look & feel del producto: el reto por puntos, las alertas operativas del inicio, la preparación de las fichas, los accesos rápidos, la actividad reciente, una ficha de jugador para la familia (con foto que la familia pueda cambiar), los cargos del personal del club con una pantalla pensada para cada uno, la fecha de alta en el club y que la entrenadora gestione lo suyo. Tres decisiones de producto quedaron tomadas antes de construir: las familias solo ven los datos de los suyos y nunca una comparativa con otros menores; los registros del reto los valida el club; la entrenadora gestiona su equipo.

## Decisión

- **Rol `staff` con cargo** (`memberships.position`): director, coordinación, delegación, fisio, preparación física, psicología y scout, los del prototipo. El rol da lectura de todo el club; el cargo añade permisos (`STAFF_POSITION_PERMISSIONS`): dirección y coordinación escriben estructura y jugadores, gestionan el reto y validan, e invitan; fisio, preparación física, psicología y scout valoran a cualquier jugador; la delegación solo consulta. Los permisos del actor son la unión de sus roles más su cargo (`permissionsForMemberships`). Las invitaciones llevan el cargo y, opcionalmente, un equipo al que la persona se une como cuerpo técnico al aceptar.
- **Permisos nuevos y permisos por equipo**: `org.players.assess` (valorar: objetivo, indicadores, PDI, anotaciones) y `org.players.assess_own` (solo los jugadores de los equipos propios); `org.roster.write_own` (la plantilla de los equipos propios); `org.family.write` (la foto de los suyos y los registros del reto); `org.activity.read`; `org.challenges.read`, `manage`, `review` y `review_own`. "Propio" es ser cuerpo técnico, esta temporada, de un equipo donde está el jugador. La API lo comprueba en cada petición; la ficha del jugador y la del equipo devuelven `access` para que la web enseñe solo lo que se puede hacer.
- **Entrenador**: lectura del club, plantilla y valoraciones de sus equipos, gestión del catálogo del reto y validación de los registros de sus jugadores. Sigue sin dar de alta jugadores ni editar equipos.
- **Fecha de alta** (`players.joined_on`): editable; sin ella cuenta la creación de la ficha. De ella salen los años en el club y el último registro del timeline. Imprescindible para migrar un club con historia.
- **Inicio operativo**: el resumen (`/api/org/summary`) añade `operations` (invitaciones pendientes, registros del reto por validar, revisiones vencidas, jugadores sin equipo, objetivo, familia o foto) y `readiness` (siete comprobaciones por jugador activo y un porcentaje), solo para quien lee jugadores. `/api/org/activity` devuelve los últimos movimientos del propio club desde la auditoría. La web los pinta como alertas con atajo, preparación de las fichas, accesos rápidos y últimos movimientos. La lista de jugadores filtra por lo que falta (`missing`) y cuenta las invitaciones de familia pendientes.
- **Panel por cargo**: `/api/org/players/overview` (con `scope=own` para los equipos propios) devuelve por jugador activo sus indicadores, objetivo, plan y última anotación. La web deriva de ahí la lista de trabajo de cada cargo: dirección y coordinación, revisiones vencidas y fichas incompletas; delegación, familias sin acceso en sus equipos; fisio y preparación física, el indicador cuerpo y la altura; psicología, bienestar y el área emocional del PDI; scout, el indicador deporte; entrenador, lo que falta en las fichas de sus equipos. Una cifra baja va en gris, nunca en rojo (DESIGN.md 10).
- **Ficha para la familia** (`/api/org/family/players/{id}`): foto, equipo y cuerpo técnico, objetivo, el PDI solo cuando su estado es `shared`, los movimientos del timeline que no son anotaciones del personal ni cambios de indicadores, y sus puntos del reto. Nunca indicadores. La familia sube y quita la foto de los suyos con `org.family.write`.
- **Reto por puntos** (`challenges`, `challenge_tasks`, `challenge_submissions`): un periodo con mínimo y objetivo, un catálogo de pruebas por área (entrenamiento, técnica, hábitos), tipo (sesiones o valoración de 1 a 5), puntos por unidad y tope en todo el reto; y registros que la familia envía (puntos calculados al registrar, con el tope aplicado sobre lo ya contado de esa prueba) y el club aprueba o rechaza. Solo los aprobados suman. Al cerrar, cada jugador con puntos aprobados recibe un registro `challenge_closed` en su timeline; un reto cerrado no se reabre. Una prueba con registros se archiva en vez de borrarse. El catálogo de ejemplo del prototipo se crea en el idioma del club al pedirlo.
- **Nada de ranking para las familias**: la participación por jugador (`standings`) solo sale al personal, y al cuerpo técnico solo de sus equipos. Una familia ve los puntos de los suyos, por área, con lo aprobado y lo pendiente.
- **Navegación**: "Reto" entra en la barra para el personal y las familias. La barra inferior admite cinco destinos (DESIGN.md 9.10): cuando hay más, los ajustes pasan al menú de persona.
- **Club demo**: dos cuentas de personal (`director@demo.test`, dirección deportiva; `fisio@demo.test`, fisioterapia), fecha de alta de los jugadores y un reto activo con el catálogo de ejemplo y registros de la familia Martí, para ver cada pantalla sin picar datos.

## Consecuencias

- Tres tablas nuevas, tres columnas nuevas y un rol nuevo; todo con `organization_id` (ADR 0015), cubierto por los tests de esquema y por una suite de aislamiento propia (cargos, permisos por equipo, familia, reto y otro club).
- Ocho acciones nuevas en la auditoría y un tipo nuevo de registro del timeline.
- La familia tiene un motivo para entrar: la ficha de los suyos y el reto. El personal tiene un inicio que responde "qué hace falta hoy" según su cargo.
- Queda para bloques siguientes: Scout Live (producto lo aportará), histórico de retos por temporada en la ficha, evolución de los indicadores en el tiempo, y que el cuerpo técnico anote asistencia (eventos).

## Alternativas descartadas

- Un rol por cargo (siete roles nuevos): multiplica la matriz de permisos y la interfaz de roles; el cargo como atributo del rol `staff` mantiene un solo rol para "personal que no entrena".
- Permisos por equipo como filas (usuario, equipo, permiso): el cuerpo técnico ya es la relación persona-equipo; añadir otra tabla duplicaría la pregunta "¿es de mi equipo?".
- Puntos calculados al validar en vez de al registrar: la familia no sabría cuántos puntos pide; calcularlos al registrar y validar después es lo que entendía el prototipo.
- Ranking con nombres para las familias: choca con DESIGN.md 0.10 y 10 y con la decisión de producto; no se construye.
- "Asocia tu jugador" sin invitación y el registro abierto por email del prototipo: descartados en ADR 0028, siguen descartados.
