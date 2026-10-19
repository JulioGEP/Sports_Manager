# Conocimiento de dominio extraído del prototipo

Origen: prototipo "EIXA Hub" de un club de fútbol sala (AE Eixample), revisado el 19 de octubre de 2026 antes de borrarlo. El código queda en el historial de git (commit `c38f33b` y anteriores) por si hay que consultarlo.

Este documento recoge lo que el prototipo sabía del negocio. No es una lista de requisitos del SaaS. Cada punto marca si en el prototipo funcionaba de verdad o era solo fachada, para no heredar ideas que nunca se validaron.

Vocabulario del prototipo: estaba en catalán y usaba "família" para los tutores de un jugador y "staff" o "personal del club" para el resto de usuarios internos.

## 1. Entidades

### 1.1 Usuario

Un usuario era una cuenta de acceso con un único rol para todo el club.

| Campo | Significado | Estado en el prototipo |
|---|---|---|
| email, nombre | Identificación | Funcional |
| rol | Uno de los 11 roles de la sección 3 | Funcional |
| activo | Permite desactivar sin borrar | Existía, nunca se ponía a falso desde la interfaz |
| jugadores vinculados | Lista de jugadores de los que es tutor | Funcional. Convivían un campo "jugador" único (antiguo) y una lista (nuevo) |
| equipos vinculados | Equipo de cada jugador vinculado, o equipo asignado al staff | Funcional, derivado |
| relación por jugador | Madre, padre, tutor/a, abuelo/a, otro | Se guardaba en la invitación; en el usuario quedaba un mapa jugador → relación |

### 1.2 Equipo

| Campo | Significado | Estado |
|---|---|---|
| nombre | Por ejemplo "Aleví A" | Funcional |
| categoría | Texto libre, por ejemplo "Aleví" | Funcional, sin catálogo |
| temporada | Fija a "2026-27" en código | Fachada |
| activo | | Existía, sin uso en la interfaz |

No existía el concepto de sección del club ni de plantilla por temporada. Un jugador apuntaba a un equipo y nada más.

### 1.3 Jugador

Datos básicos (todos editables por un administrador desde la ficha):

| Campo | Notas |
|---|---|
| nombre | Obligatorio |
| equipo | Obligatorio al crear |
| dorsal | Número opcional |
| posición | Texto libre |
| año de nacimiento, año de entrada al club | Se mostraban como edad y antigüedad calculadas |
| pie dominante, altura en cm | Opcionales |
| categoría | Normalmente heredada del equipo |
| foto | Ver sección 4.4 |
| tutores | Lista de usuarios vinculados. Convivían un campo único (antiguo) y una lista (nuevo) |
| activo | Sin uso en la interfaz |

Datos del "perfil 360" o "Player Workspace". Se leían y se mostraban, pero ninguna pantalla los escribía. Son una idea de producto, no una funcionalidad:

| Grupo | Campos | Idea |
|---|---|---|
| Indicadores | deporte, cuerpo, bienestar, compromiso; cada uno con puntuación 0 a 100 y un texto de estado | Resumen de cómo está el jugador en cuatro ejes: técnica y táctica; disponibilidad y carga física; motivación y estado emocional; asistencia y participación |
| Objetivo individual | texto, progreso 0 a 100, responsable, fecha de revisión | Prioridad actual del jugador. El texto, el progreso y la fecha sí eran editables |
| Plan de desarrollo individual (PDI) | seis áreas: técnico, táctico, físico, emocional, hábitos, persona; coordinador; próxima revisión | Un objetivo por área |
| Cronología | lista de hitos con fecha, título y tipo | Historial del jugador en el club |

Regla de colores de estado que usaba el prototipo para pintar indicadores: verde si el texto contenía "correcte", "bé", "ok" o "estable"; rojo si contenía "alerta", "risc" o "intervenció"; ámbar si contenía "atenció" o "pendent"; neutro en el resto.

### 1.4 Invitación familiar

Una invitación unía un email con un jugador concreto.

| Campo | Notas |
|---|---|
| email, nombre de la persona | |
| jugador, equipo | Equipo derivado del jugador |
| relación | madre, padre, tutor/a, abuelo/a, otro |
| estado | pendiente o aceptada |
| creada por, fecha, aceptada por, fecha de aceptación | |

Identificador: email más jugador, de modo que una misma persona podía tener una invitación por cada hijo. No se enviaba ningún email: el administrador avisaba a la familia por otro canal y la familia se registraba con ese mismo email.

### 1.5 Invitación de staff

Igual que la familiar pero con rol y equipo opcional en lugar de jugador, y una sola por email.

### 1.6 Reto ("Repte d'estiu")

Un reto era un periodo con un catálogo de pruebas y un registro de actividad por jugador.

| Entidad | Campos |
|---|---|
| Reto | nombre, puntos mínimos, puntos objetivo, activo |
| Prueba | nombre, área (E entrenamiento, T técnica, H hábitos), tipo (sesiones o valoración), puntos por unidad, tope de puntos, activa |
| Registro | prueba, cantidad, puntos calculados, nota o enlace de evidencia opcional, quién lo registró, jugador, equipo, estado |

Catálogo por defecto del prototipo, útil como ejemplo de lo que un club quiere medir:

| Prueba | Área | Tipo | Puntos por unidad | Tope |
|---|---|---|---|---|
| Entrenamiento completo | E | sesiones | 2 | 20 |
| Trabajo exterior extra | E | sesiones | 1 | 10 |
| Reto de 50 toques | T | sesiones | 2 | 20 |
| Reto de 100 toques | T | sesiones | 4 | 40 |
| Árbol de gestos técnicos | T | valoración | 2 | 10 |
| Comer sano | H | valoración | 1 | 5 |
| Dormir bien | H | valoración | 1 | 5 |
| Lectura | H | valoración | 1 | 5 |
| Foto del club por el mundo | H | sesiones | 5 | 10 |
| Ver un partido del club | H | sesiones | 1 | 10 |

Reto por defecto: mínimo 50 puntos, objetivo 150.

## 2. Flujos

### 2.1 Alta de una familia

1. Un administrador abre la ficha de accesos de un jugador y añade un tutor: nombre, email y relación.
2. La familia crea su cuenta con ese email.
3. Al crearse la cuenta, se buscan invitaciones pendientes con ese email. Cada jugador invitado queda vinculado a la cuenta y la invitación pasa a aceptada.
4. La cuenta queda con rol de familia y entra directamente a su panel.

Funcionaba, salvo el envío del email, que no existía.

### 2.2 Alta de staff

Igual, con una invitación de staff. Si el email tenía invitación de staff, la cuenta nacía con ese rol. Si no tenía ninguna invitación, nacía como familia sin jugador.

### 2.3 Familia sin invitación

Una cuenta de familia sin jugador veía una pantalla "asocia tu jugador" con la lista de jugadores sin tutor. Al elegir uno, quedaba vinculada. Según las reglas de seguridad, esta pantalla probablemente fallaba; no se verificó en ejecución. Regla de negocio declarada en pantalla: "cada cuenta familiar solo puede quedar vinculada a un jugador", contradicha por la lista de jugadores que sí admitían las invitaciones.

### 2.4 Gestión del club por un administrador

- Crear equipo: nombre y categoría. Sin editar ni borrar.
- Crear jugador: nombre, dorsal, equipo obligatorio y posición. Sin borrar desde la lista.
- Editar ficha de jugador: los datos básicos de 1.3.
- Gestionar accesos: pestaña de familias (por jugador) y pestaña de staff (listado, invitaciones pendientes, nuevo miembro con nombre, email, rol y equipo).

### 2.5 Foto de jugador

Podían cambiarla un administrador o la familia del propio jugador. La imagen se reducía en el navegador a 640 píxeles de lado mayor, JPEG con calidad 0,78, y se rechazaban ficheros de más de 8 MB o que no fueran imagen. Se guardaba dentro del propio registro del jugador, lo que encarecía cada listado.

### 2.6 Reto

- Administradores y entrenadores: crear, editar y eliminar pruebas. Al abrir el módulo por primera vez se creaban el reto y el catálogo por defecto.
- Resto del staff: solo consultar el catálogo.
- Familias: elegir prueba, indicar cantidad y nota opcional, y enviar. Veían sus puntos totales y por área y la lista de sus registros.
- Cálculo: puntos = mínimo(tope de la prueba, cantidad × puntos por unidad).
- Los registros nacían en estado "enviado" y nunca cambiaban de estado. No había validación por un adulto del club, ranking, cierre del reto ni histórico de retos.

### 2.7 Navegación por rol

| Rol | Secciones |
|---|---|
| Administrador | Inicio, equipos, jugadores, accesos, reto, "Scout Live" (vacío) |
| Staff | Inicio, reto |
| Familia | Inicio, perfil del jugador, reto |

## 3. Roles y permisos

Roles del prototipo y a qué equivalen en la Fase 0 del SaaS:

| Rol del prototipo | Qué podía hacer | Rol en Fase 0 |
|---|---|---|
| superadmin | Todo. No se podía crear desde la aplicación | platform_admin o org_admin, según el caso |
| admin | Todo dentro del club | org_admin |
| coach | Ver equipos y jugadores sin tutor, gestionar el reto | coach |
| family | Ver y editar foto de sus jugadores, registrar actividad del reto | guardian |
| director, coordinator, delegate, physio, fitness, psychologist, scout | Ver equipos y consultar el reto. Sin permisos propios | Fuera de la Fase 0. Previsto como rol "staff" con cargo descriptivo |

Matriz de permisos que aplicaban las reglas de seguridad del prototipo, como referencia del nivel de detalle que ya se había pensado:

| Dato | Lectura | Escritura |
|---|---|---|
| Equipos | Cualquier usuario activo | Administradores |
| Jugadores | Administradores; tutores del jugador; cualquier usuario activo si el jugador no tiene tutor | Crear y borrar: administradores. Foto: tutores. Vínculo de tutor: cualquier usuario activo (para el flujo 2.3) |
| Usuarios | El propio usuario y administradores | Administradores; el propio usuario solo sus vínculos |
| Invitaciones | Administradores y el invitado por su email | Administradores |
| Pruebas del reto | Cualquier usuario activo | Administradores y entrenadores |
| Registros del reto | Administradores, entrenadores y el autor | Crear: el tutor del jugador. Modificar: administradores |

Fallo conocido de esas reglas: cualquier usuario autenticado podía crearse a sí mismo con rol de administrador. Está documentado en `docs/informe-sportsmanager.md`. En el SaaS, el rol lo fija siempre la invitación y nunca el usuario.

## 4. Reglas de negocio y criterios que vale la pena conservar

### 4.1 Varios tutores por jugador y varios jugadores por tutor

Una madre con dos hijos en el club tiene una cuenta y dos vínculos. Un jugador puede tener madre, padre y abuela con acceso. El prototipo llegó a esto por iteraciones y dejó campos duplicados; el SaaS lo modela desde el principio como relación muchos a muchos con la relación familiar como atributo.

### 4.2 Un usuario, un rol por club

El prototipo asignaba un solo rol por cuenta. En el SaaS el rol va en la pertenencia a cada club, así una persona puede ser entrenadora en un club y tutora en otro.

### 4.3 Completitud del perfil del jugador

El panel de administración calculaba un porcentaje de "perfiles preparados" con siete comprobaciones: nombre, equipo, posición, dorsal, año de nacimiento, foto y objetivo actual. Es un buen indicador de calidad de datos para el panel de un club.

### 4.4 Alertas operativas

Tres alertas en el panel del administrador: invitaciones pendientes, jugadores sin objetivo definido, jugadores sin foto. Y en la ficha de jugador, tres acciones prioritarias: añadir foto, definir objetivo, vincular una familia. El patrón "qué hay que hacer hoy" es reutilizable.

### 4.5 Reto por puntos

El reto es una gamificación de hábitos y asistencia, no una prueba física. Lo que lo define: áreas, pruebas con puntos por unidad y tope, registro por la familia, umbral mínimo y objetivo. Lo que le faltaba: validación por el club, ranking, cierre y comparación entre temporadas.

### 4.6 Catálogo de relaciones familiares

Madre, padre, tutor/a, abuelo/a, otro. Suficiente para empezar.

### 4.7 Posiciones y categorías

En el prototipo eran texto libre. En el SaaS las posiciones dependen del deporte (configuración en datos) y las categorías o grupos de edad serán catálogo por club.

## 5. Lo que el prototipo no tenía

Secciones del club, temporadas reales, plantillas por temporada, comunicación con familias, pruebas físicas, eventos y asistencia, multi-club, planes, facturación, panel interno, idiomas, envío de emails, borrado de nada.

## 6. Diseño

El prototipo tenía un sistema de diseño incipiente (tokens y componentes base). Los tokens están extraídos en `packages/shared/design/`. El inventario de componentes y las reglas de interfaz están en el README de esa carpeta.
