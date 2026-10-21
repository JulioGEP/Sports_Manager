# Propuesta: el panel del administrador como gestión de un club completo

Estado: propuesta, pendiente de aprobación. Fecha: 21 de octubre de 2026. Punto de partida: Bloque 13 (ADR 0030). No cambia código: es el plan de los bloques 14 a 18.

Resumen:

- Hoy el producto mira el club desde la ficha del jugador de fútbol sala. El administrador necesita mirarlo desde el club: secciones, personas, instalaciones, agenda y dinero.
- Propongo invertir la jerarquía de la navegación. "Secciones" sustituye a "Equipos" como entrada, y aparece la categoría entre la sección y el equipo.
- Propongo una entidad Persona única de la que cuelgan socio, deportista, familia y personal.
- Propongo un inicio nuevo que responde, en este orden: qué pasa hoy, qué hace falta hoy, cómo está cada sección.
- Cinco bloques. Los tres primeros (secciones e inicio, personas y socios, agenda e instalaciones) enseñan el club completo en 11 a 14 días de trabajo efectivo.

## 1. Diagnóstico: qué falla hoy

| Lo que hay | Por qué molesta al administrador |
| --- | --- |
| "Equipos" es la entrada del menú; secciones y temporadas son pestañas dentro | La jerarquía está invertida. Un club se piensa club → sección → categoría → equipo. La categoría ni siquiera existe: es un texto libre en el equipo |
| La sección no tiene deporte: el deporte está en el club (`default_sport_id`) | Un club con fútbol sala y baloncesto no puede decirlo. Posiciones, categorías sugeridas e icono dependen de la sección, no del club |
| Solo existen jugadores con familia | No hay socios, ni deportistas adultos con cuenta propia, ni personal como entidad (es un usuario con rol). Un box de CrossFit, un estudio de yoga o un club con piscina no caben |
| No hay agenda, instalaciones ni dinero | Lo que un administrador consulta cada día (qué hay hoy, qué pista está libre, quién no ha pagado) no está |
| El inicio no tiene jerarquía | Cinco cifras del mismo peso, "Tu rol en el club" (ya lo sabe), "Primeros pasos" que ya están hechos, "Estructura del club" que repite las cifras y "Últimos movimientos" casi siempre vacío. Lo bueno (alertas y preparación de fichas) queda enterrado |
| "Miembros" mezcla cuentas de familia y personal | Son dos preguntas distintas: quién trabaja en el club y quién tiene acceso a la ficha de un menor |

Lo que funciona y se conserva: la ficha ampliada del jugador (Bloque 12), el reto (Bloque 13), los paneles por cargo, las alertas operativas, la vista de la familia, el admin del negocio y todo el aislamiento por club.

## 2. Principios del replanteo

1. **Desde el club, no desde el jugador.** La unidad de gestión es la sección. Todo cuelga de una sección o de una persona.
2. **Una persona, un registro.** Socio, deportista, familiar y personal son papeles de la misma persona. Hoy un padre socio con un hijo jugador serían dos registros sin relación; en un club real es lo primero que rompe.
3. **Competición y actividad, mismo árbol.** Un equipo de baloncesto y un grupo de yoga son lo mismo para el sistema: sección → categoría → equipo o grupo → participantes. Cambian las palabras y las columnas, no las tablas.
4. **El inicio responde tres preguntas, en orden:** qué pasa hoy, qué hace falta hoy, cómo está cada sección. Lo que no responde a ninguna sale del inicio.
5. **La configuración sale del flujo diario.** Temporadas, deportes, tipos de socio e instalaciones se tocan pocas veces al año: van a Ajustes, no al menú principal.

## 3. El modelo del club

```
Club
├── Secciones              deporte, tipo (competición o actividad), coordinación
│   └── Categorías         Sénior masculino, Sénior femenino, Alevín, Adultos, Iniciación…
│       └── Equipos o grupos        Alevín A, Yoga lunes 19:00 (con aforo)
│           ├── Plantilla o inscritos   deportistas, con dorsal y posición si compiten
│           └── Cuerpo técnico          entrenadora, delegado, fisio del equipo
├── Personas               un registro por persona física
│   ├── Socio              número, tipo, desde, estado, cuota
│   ├── Deportista         la ficha que hoy es "jugador": indicadores, objetivo, PDI, timeline
│   ├── Familia            vínculo con un deportista menor y cuenta de acceso
│   └── Personal           cuenta, rol y cargo
├── Instalaciones          piscina, pistas, salas; franjas de apertura y ocupación
├── Agenda                 entrenamientos, partidos, actividades, reuniones, reservas
├── Retos                  como hoy
└── Economía               cuotas y cobros (bloque 18)
```

Vocabulario por tipo de sección. El árbol es el mismo; la voz cambia:

| Nivel | Sección de competición | Sección de actividad |
| --- | --- | --- |
| Categoría | Sénior masculino, Alevín | Adultos, Iniciación, Máster |
| Equipo o grupo | Alevín A | Yoga lunes 19:00, Natación perfeccionamiento |
| Participantes | Plantilla: jugadores con dorsal y posición | Inscritos: deportistas, con aforo del grupo |
| Agenda | Entrenamientos y partidos | Sesiones |

## 4. Navegación del administrador

| Hoy | Propuesta | Por qué |
| --- | --- | --- |
| Inicio | Inicio | Rehecho (sección 5) |
| Equipos (pestañas Equipos, Secciones, Temporadas) | **Secciones** (lista de secciones; dentro, categorías y equipos) | La entrada es la sección. Las temporadas pasan a Ajustes y un selector de temporada vive en la cabecera |
| Jugadores | **Deportistas** | Vale para yoga, natación y CrossFit. Dentro de una sección de competición, la voz dice "jugadores" |
| — | **Socios** | No existe. Es el argumento comercial de un club con piscina o de un box |
| Miembros | **Personal** | Solo quien trabaja en el club. Las cuentas de familia salen de aquí y se gestionan desde la ficha del deportista |
| — | **Agenda** | No existe. "Qué pasa hoy" es la primera pregunta del administrador |
| — | **Instalaciones** | No existe. La piscina, las pistas y las salas con su ocupación |
| Reto | Retos | Sin cambios; se agrupa con la actividad |
| — | Cuotas | Bloque 18. Hasta entonces, el hueco en el menú no se enseña |
| Ajustes | Ajustes | Gana Temporadas, Tipos de socio, Puesta en marcha y Actividad |

Escritorio, barra lateral con grupos (DESIGN.md 18 lo deja pendiente; esta es la propuesta):

```
Inicio
EL CLUB         Secciones · Deportistas · Socios · Personal
ACTIVIDAD       Agenda · Instalaciones · Retos
GESTIÓN         Cuotas (b18) · Ajustes
```

Móvil, barra inferior de cinco destinos (DESIGN.md 9.10): Inicio, Secciones, Deportistas, Agenda y Más. "Más" abre una hoja con Socios, Personal, Instalaciones, Retos y Ajustes. El administrador trabaja en escritorio; el móvil le sirve para consultar.

Lo que desaparece: la entrada "Equipos", la entrada "Miembros", las pestañas Secciones y Temporadas dentro de Equipos, y el desplegable de temporada en la lista de equipos (pasa a la cabecera de Secciones, una sola vez).

## 5. El inicio

Orden de lectura de arriba abajo. Cada bloque dice de dónde sale y qué sustituye.

| # | Bloque | Qué enseña | De dónde sale | Sustituye a |
| --- | --- | --- | --- | --- |
| 1 | Portada | Nombre del club, temporada actual y una línea de contexto: el siguiente evento. Acciones: "Nueva alta" (deportista, socio o personal) y "Agenda" | `seasons`, `events` | La portada actual (misma pieza, contexto nuevo) |
| 2 | Hoy en el club | Los eventos de hoy: hora, qué, equipo o grupo, instalación. Si no hay nada, lo dice y ofrece planificar la semana | `events` | Nuevo |
| 3 | Cifras del club | Socios activos (con las altas del mes), deportistas, equipos y grupos, personal y cuotas pendientes (b18). Cada cifra abre su lista | `club_members`, `players`, `teams`, `memberships`, `fee_charges` | Las cinco tarjetas actuales. Salen "Invitaciones pendientes" (es una alerta) y "Tu rol" |
| 4 | Secciones | Una tarjeta por sección: deporte, categorías, equipos o grupos, deportistas, coordinación y un aviso si hay equipos sin cuerpo técnico. Última tarjeta: "Nueva sección" | `sections`, `categories`, `teams`, `team_staff` | "Estructura del club" |
| 5 | Qué hace falta hoy | Las alertas actuales más: equipos sin cuerpo técnico, deportistas sin ficha de socio, socios con la cuota vencida (b18), instalaciones sin franjas (b16) | `summary.operations` | Las alertas actuales (se conservan) |
| 6 | Salud de las fichas | Como hoy, más compacto. Al pulsar, el desglose por sección | `summary.readiness` | Preparación de las fichas (se conserva) |
| 7 | Últimos movimientos | Plegado, cinco entradas, al final de la página. La lista completa, en Ajustes > Actividad | `audit_log` | Últimos movimientos (se degrada) |

Lo que sale del inicio:

- "Primeros pasos": pasa a Ajustes > Puesta en marcha. En el inicio queda un aviso de una línea solo mientras falten el logo o los colores y el club tenga menos de 30 días.
- "Tu rol en el club": fuera.
- "Estructura del club": la sustituyen las tarjetas de sección.
- "Accesos rápidos": los absorben "Nueva alta" en la portada y las tarjetas de sección.

Los paneles por cargo (dirección, coordinación, fisio, entrenadora) no cambian. Son para quien no administra y ya responden a su "qué hago hoy".

## 6. Pantallas

### 6.1 Secciones

Lista: la misma tarjeta de sección del inicio, en rejilla, con el selector de temporada en la cabecera y el botón "Nueva sección" (nombre, deporte, tipo, coordinación). Al elegir el deporte, el sistema propone las categorías habituales de ese deporte (de `sports.config`) y el club marca las que quiere. Un club de fútbol sala no tiene que escribir "Prebenjamín, Benjamín, Alevín…" a mano.

Ficha de sección (`/:club/sections/:id`):

- Cabecera: nombre, chip del deporte, coordinación, temporada. Acciones: "Nueva categoría", "Nuevo equipo", "Editar".
- Pestaña Equipos (por defecto): las categorías en orden, cada una con su tabla de equipos (equipo, jugadores, cuerpo técnico, siguiente evento, estado) y "Añadir equipo".
- Pestaña Deportistas: la lista de deportistas filtrada por la sección.
- Pestaña Cuerpo técnico: quién entrena qué, y quién falta.
- Pestaña Agenda (b16): la semana de la sección.
- Pestaña Ajustes: categorías, posiciones del deporte, nombre y tipo.
- Columna lateral: resumen (deportistas, familias con acceso, preparación de fichas, personal) y avisos de la sección.

Una sección de actividad (yoga, CrossFit, natación libre) usa la misma ficha con otras palabras: "Grupos" por "Equipos", "Inscritos" por "Plantilla", y cada grupo lleva aforo y horario semanal.

### 6.2 Equipo o grupo

Como hoy (plantilla y cuerpo técnico), más la categoría y la sección en la cabecera, el horario semanal (b16) y una pestaña Agenda con el pase de lista (b17). Un grupo añade aforo; la lista de espera queda para después.

### 6.3 Deportistas

La lista actual con filtros por sección, categoría, equipo, estado y "qué falta". La ficha del Bloque 12 no cambia de fondo: gana una pestaña Persona (contacto, documento, socio vinculado, familia) y, si es adulto, acceso propio con su cuenta. Las cuentas de familia se listan en una pestaña Familias de esta pantalla.

### 6.4 Socios

Lista: número, persona, tipo de socio, desde, estado (al día, pendiente, suspendido, baja) y cuota (b18). Alta desde una persona que ya existe (un familiar, un deportista adulto) o nueva. Ficha: datos de la persona, tipo, altas y bajas, cuotas y pagos (b18) y personas vinculadas (sus deportistas).

### 6.5 Personal

Lo que hoy es Miembros, sin las familias. Pestañas: Personal (rol, cargo, equipos que lleva) e Invitaciones. Invitar sigue igual: rol, cargo y equipo.

### 6.6 Agenda

Vista de semana y lista. Filtros por sección, equipo e instalación. Tipos: entrenamiento, partido, actividad, reunión y reserva. Crear con repetición semanal hasta una fecha (genera filas; sin motor de recurrencia). Un evento puede ocupar una instalación; si se solapa con otro, avisa antes de guardar. La familia ve la agenda de los suyos; el cuerpo técnico, la de sus equipos.

### 6.7 Instalaciones

Lista: nombre, tipo (piscina, pista, campo, sala, gimnasio, otra), aforo y estado. Ficha: ocupación semanal (rejilla de siete días por horas con los eventos que la usan) y franjas de apertura. La piscina es esto: una instalación con sus franjas y los grupos de natación que la ocupan.

### 6.8 Retos

Sin cambios. Se mueven al grupo Actividad del menú.

### 6.9 Ajustes

Pestañas: General, Marca, Logo (como hoy), Temporadas (lo que hoy está en Equipos), Tipos de socio, Puesta en marcha (los primeros pasos) y Actividad (los últimos movimientos completos).

## 7. Modelo de datos

Misma disciplina que hasta ahora: `organization_id` obligatorio e indexado en toda tabla (ADR 0015), estados como texto con `CHECK` desde las listas de `packages/shared`, migraciones en `netlify/database/migrations/`, semilla del demo idempotente.

### Tablas nuevas

| Tabla | Para qué | Campos clave y reglas |
| --- | --- | --- |
| `categories` | Categoría de una sección | `section_id`, `name`, `gender` (`male`, `female`, `mixed`, nulo), `birth_year_from` y `birth_year_to` opcionales, `sort_order`, `status`. Única por (sección, nombre). Con equipos no se borra |
| `people` | Persona física del club | `first_name`, `last_name`, `birth_date`, `gender`, `email`, `phone`, `national_id`, `photo_blob_key`, `user_id` (nulo: sin cuenta), `status`, `notes`. Única (club, `user_id`) parcial. Índice por club y apellidos |
| `member_types` | Tipos de socio por club | `name`, `sort_order`, `status`. Semilla al crear un club: "Socio" |
| `club_members` | Socio | `person_id`, `member_number` (único por club), `member_type_id`, `joined_on`, `left_on`, `status` (`active`, `pending`, `suspended`, `left`). Única (club, persona) |
| `facilities` | Instalación | `name`, `kind` (`pool`, `court`, `field`, `room`, `gym`, `other`), `capacity`, `sort_order`, `status` |
| `facility_hours` | Franjas de apertura | `facility_id`, `weekday`, `opens_at`, `closes_at` |
| `events` | Agenda | `kind` (`training`, `match`, `activity`, `meeting`, `booking`, `other`), `title`, `section_id`, `team_id`, `facility_id` (los tres opcionales), `starts_at`, `ends_at`, `location`, `opponent`, `home_away`, `notes`, `series_id`, `created_by`. Índice (club, `starts_at`). `ends_at > starts_at` |
| `team_schedules` | Horario semanal de un equipo o grupo | `team_id`, `weekday`, `starts_at`, `ends_at`, `facility_id`. Genera los eventos de la temporada |
| `attendance` (b17) | Pase de lista | `event_id`, `player_id`, `status` (`present`, `absent`, `excused`), `recorded_by`. Única (evento, deportista) |
| `fee_plans`, `fee_charges`, `payments` (b18) | Cuotas y cobros | Plan por tipo de socio o sección con importe y periodicidad; cargo por persona y periodo con vencimiento y estado; pago manual con importe, método y fecha |

### Tablas que cambian

| Tabla | Cambio | Migración del demo |
| --- | --- | --- |
| `sections` | `sport_id` obligatorio, `kind` (`competition`, `activity`), `coordinator_user_id`, `description` | El deporte del club pasa a la sección existente |
| `teams` | `category_id` obligatorio. Desaparece `category` (texto). `capacity` opcional para grupos | Una categoría por cada texto distinto dentro de la sección |
| `players` | `person_id` obligatorio. Salen `first_name`, `last_name`, `birth_date` y `photo_blob_key`: viven en `people`. Se quedan `joined_on`, `status`, `dominant_foot`, `height_cm` | Una persona por jugador |
| `player_guardians` | `guardian_person_id`. La cuenta (`user_id`) sigue dando el acceso; la persona sirve para socio y cuotas | Una persona por cuenta de familia |
| `team_staff` | `role_in_team` (`head_coach`, `assistant`, `delegate`, `physio`, `other`) | `head_coach` para los actuales |
| `sports` | Semilla ampliada: fútbol, fútbol sala, baloncesto, balonmano, voleibol, natación, atletismo, pádel, tenis, yoga, crossfit, gimnasia, otro. `config` con posiciones y categorías sugeridas | Solo inserta |
| `organizations` | `timezone` (la agenda lo necesita). `default_sport_id` pasa a ser opcional: el deporte vive en la sección | `Europe/Madrid` |
| `memberships` | Sin cambios. El personal sigue siendo cuenta más rol y cargo; su persona sale de `people.user_id` | — |

### Permisos nuevos

`org.club_members.read` y `write`; `org.facilities.read` y `write`; `org.events.read`, `write` y `write_own`; `org.attendance.read` y `write_own` (b17); `org.fees.read` y `write` (b18).

Por rol: administración, todo. Dirección y coordinación: socios, agenda e instalaciones. Entrenadora: agenda y pase de lista de sus equipos. Delegación: pase de lista de sus equipos. Familia: agenda de los suyos, solo lectura.

### Club demo

Semilla ampliada para ver el concepto sin picar datos: cuatro secciones (Fútbol sala con los cuatro equipos actuales bajo sus categorías; Baloncesto con sénior masculino y sénior femenino; Natación con tres grupos en la piscina; Yoga como actividad con dos grupos), unas 120 personas (las familias y jugadores actuales más socios adultos), cuatro instalaciones (pabellón pista 1, pista 2, piscina de 25 m, sala polivalente) y la agenda de una semana.

## 8. Plan por bloques

| Bloque | Entregable | Esfuerzo | Depende de |
| --- | --- | --- | --- |
| 14. Secciones e inicio | `categories`, deporte y tipo en la sección, ficha de sección, navegación nueva, inicio nuevo (con los huecos de agenda y socios preparados), temporadas a Ajustes, catálogo de deportes, demo con cuatro secciones | 3 a 4 días | Aprobar esta propuesta |
| 15. Personas y socios | `people`, migración de jugadores y familias, `club_members` y tipos, pantalla Socios, Personal (lo que era Miembros), alta unificada, cifras del inicio | 4 a 5 días | 14 |
| 16. Agenda e instalaciones | `facilities`, `events`, `team_schedules`, Agenda, Instalaciones con ocupación, "Hoy en el club", agenda en sección, equipo y familia | 4 a 5 días | 14 |
| 17. Asistencia | `attendance`, pase de lista por evento con el `AttendanceToggle` del design system, resumen por deportista y equipo | 2 a 3 días | 16 |
| 18. Cuotas y cobros | `fee_plans`, `fee_charges`, `payments`, cuota en el socio, cobro manual, pendientes en el inicio. Stripe y domiciliación, después | 4 a 5 días | 15 |

- Ahora (el club completo a la vista): 14, 15 y 16. 11 a 14 días.
- Después: 17 y 18. 6 a 8 días.
- Más adelante: comunicación (anuncios con confirmación de lectura), documentos y consentimientos, licencias federativas, importación CSV, reservas de instalaciones por los socios, listas de espera, Stripe.

Por qué este orden. El 14 cambia la percepción con el menor coste: casi todo es interfaz sobre tablas que ya existen. El 15 va antes que el 16 porque socios y cuotas son el argumento comercial y porque un grupo de yoga necesita inscritos antes que agenda. El 16 cierra el "qué pasa hoy" del inicio. Cada bloque sigue siendo una rama, una PR, un ADR, migraciones idempotentes, pruebas de aislamiento y capturas.

## 9. Decisiones que te pido

1. **Persona única (`people`).** Recomiendo sí, ahora. Coste: 4 a 5 días dentro del bloque 15. Si se deja para después, cada bloque siguiente (socios, cuotas, asistencia, comunicación) nace duplicando datos y la migración se encarece con cada uno.
2. **Etiqueta del menú: "Deportistas" o "Jugadores".** Recomiendo "Deportistas", con "jugadores" dentro de las secciones de competición. Cambiarlo cuesta cero.
3. **Secciones de actividad (yoga, CrossFit, natación libre): en el 14 o después.** Recomiendo modelar el tipo en el 14 (una columna y las etiquetas) y dejar aforo, horarios y reservas para el 16. El demo enseña un club mixto desde el primer bloque.
4. **Cuotas con cobro manual antes que Stripe.** Recomiendo sí. El prototipo tiene que enseñar quién debe, no cobrar. Stripe cuando haya un club real.
5. **La cifra de dinero en el inicio: desde el 18, o un hueco "próximamente" desde el 14.** Recomiendo el hueco. La pantalla cuenta la historia completa aunque la cifra llegue después.

## 10. Lo que no toco

La ficha ampliada del jugador, el reto, los paneles por cargo, la vista de la familia, el admin del negocio en `/admin`, la autenticación, las invitaciones y el aislamiento por club. Esta propuesta reordena cómo se entra a todo eso y añade lo que falta alrededor; no reescribe lo que ya funciona.
