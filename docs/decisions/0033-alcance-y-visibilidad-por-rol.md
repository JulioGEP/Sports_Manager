# 0033. Alcance por cargo y visibilidad por rol gestionada desde "Personal"

Estado: aceptada; dónde se gestionan las exclusiones por persona lo concreta la 0035. Fecha: 2026-10-21. Fase 1, Bloque 19.

## Contexto

Hasta el Bloque 18 el cuerpo técnico y todo el personal leían el club entero: cualquier entrenadora veía a todos los deportistas, los socios con su contacto, el personal con su email, las instalaciones y la agenda de todas las secciones y los últimos movimientos del club. Producto fijó tres reglas y una herramienta: el rol de entrenador solo ve lo que compete a su sección y sus equipos (deportistas de sus equipos, instalaciones que usa, inicio filtrado), sin socios ni personal; dirección deportiva y coordinación son de una sección o de varias y solo ven los deportistas de sus secciones, sin socios, personal ni cuotas; fisioterapia solo ve a las personas que han necesitado sus servicios; y la administración tiene en "Personal" una gestión de qué ve cada rol, con un check por área que se incluye o excluye, y exclusiones especiales a determinado personal.

## Decisión

- **Dos piezas, no una.** El *ámbito* (qué parte del club) va con el cargo y vive en código (`PROFILE_SCOPE`): `teams` para el cuerpo técnico (los equipos de los que es cuerpo técnico esta temporada), `sections` para dirección y coordinación (las secciones que coordina más las que la administración le asigna), `attended` para fisioterapia (los deportistas de sus equipos, los que le asignan y aquellos sobre los que dejó una valoración, una anotación, un objetivo o un plan) y `club` para el resto. Las *áreas visibles* (qué pantallas) salen de los permisos del rol y el cargo con las reglas del club aplicadas, y es lo que la administración gestiona.
- **Permisos por defecto nuevos.** El cuerpo técnico y el personal pierden `org.members.read`, `org.club_members.read` y `org.activity.read`; dirección pierde además `org.club_members.write` y `org.fees.read`. Solo la administración lee el personal, los socios y los movimientos del club por defecto. Nada de esto está prohibido: la administración lo incluye por rol cuando quiere.
- **Reglas de acceso** (`access_rules`): por perfil (rol o cargo) y área, `allow` o `deny`; por persona y área, solo `deny` (las exclusiones especiales). Sin regla, manda lo del rol y el cargo. Excluir un área quita todos sus permisos (lectura, escritura y "propio"); incluirla da solo su lectura. Los permisos efectivos de una persona son, por cada pertenencia, los del rol y el cargo con las reglas de su perfil, la unión de todas, y después sus exclusiones. La administración del club nunca pierde nada y no se puede excluir (409). Igualar una regla a lo de por defecto la borra, así la matriz solo guarda desviaciones.
- **Ámbito resuelto por petición** (`accessScopeOf`): `club` o `restricted` con secciones, equipos y deportistas sueltos. Con ámbito restringido la API filtra deportistas (lista, vista de conjunto, alertas y preparación de fichas), secciones, categorías, equipos, agenda (los eventos de sus equipos, los de sus secciones sin equipo y los del club entero sin sección ni equipo) e instalaciones (las que usan sus equipos, por horario o por evento), y las cifras del inicio. Lo que queda fuera del ámbito no existe para esa persona: 404, no 403. El actor que recibe la web lleva un resumen del ámbito para avisar de que ve su parte del club o de que no tiene nada asignado.
- **Secciones a cargo** (`section_staff`): la administración asigna secciones a dirección y coordinación desde los roles de cada persona en "Personal"; las que ya coordina (`sections.coordinator_user_id`) cuentan solas. Sin sección asignada, dirección no ve nada: es una configuración pendiente, no un acceso implícito.
- **Personal asignado a un deportista** (`player_staff`): quien escribe jugadores o el cuerpo técnico del deportista asigna a alguien del personal (fisioterapia, preparación física, psicología) desde su ficha. Es lo que convierte a un deportista en "atendido" sin esperar a la primera valoración; y una valoración o anotación dejada por la fisio mantiene la ficha visible aunque se le quite la asignación.
- **"Personal" gana una pestaña "Acceso"** solo para `org.members.manage`: la matriz de rol o cargo por área con un check cada una, el alcance de cada perfil a la vista, "volver a lo de por defecto" por fila, y la lista de exclusiones por persona. En los roles de cada persona, las secciones a su cargo (dirección y coordinación) y sus exclusiones.
- **Un listado de personal elegible** (`/api/org/eligible-staff`, con `org.structure.read`) para elegir coordinación o responsables sin leer el personal del club: nombres y emails de quien tiene rol de personal, entrenador o administración.
- **Club demo**: la dirección deportiva lleva las cuatro secciones y la fisioterapeuta atiende a Clara y Marc Martí.

## Consecuencias

- Tres tablas nuevas con `organization_id` (ADR 0015), cinco acciones de auditoría y una suite de aislamiento propia (`access.isolation.test.ts`): entrenadora, dirección, coordinación, fisio, matriz, exclusiones y otro club. Las suites anteriores cambian donde el cuerpo técnico veía más de lo suyo: ahora es 404.
- Cada petición al club hace una consulta más (las reglas) y las rutas con ámbito, dos o tres más (secciones, equipos y deportistas de quien pregunta). Se resuelve una vez por petición.
- Una regla por perfil afecta a todas las personas con ese rol o cargo en el club; una exclusión, a una persona. No hay reglas por persona para incluir: quien necesite ver más cambia de rol o de cargo.
- El ámbito no se configura desde la interfaz: es lo que significa cada cargo. Si hiciera falta un cargo con otro ámbito (una delegación por equipos, por ejemplo), es una entrada en `PROFILE_SCOPE` y una línea en esta decisión.
- Queda para bloques siguientes: derivaciones con motivo y fecha (hoy la asignación es una relación sin más), el histórico de quién atendió a quién, y que la fisio pueda buscar por nombre a un deportista que todavía nadie le ha asignado (hoy, a propósito, no puede).

## Alternativas descartadas

- Un rol nuevo por combinación ("entrenador que ve socios"): multiplica roles por áreas; una regla por perfil y área es una fila y una casilla.
- Filtrar en la web y dejar la API como estaba: la API es la única autoridad (ADR 0009 y 0015); lo que la web no pinta pero la API devuelve es una fuga.
- 403 en vez de 404 fuera del ámbito: confirma que el recurso existe. Fuera del ámbito, no existe.
- Que la fisio busque a cualquier deportista por nombre para empezar a atenderle: la lista de nombres ya es dato personal de menores; la asignación la hace el club o el cuerpo técnico del deportista.
- Ámbito configurable por perfil desde la matriz: añade una tabla de ámbitos y una semántica más que explicar; los tres ámbitos que pidió producto siguen al cargo y así se entienden.
