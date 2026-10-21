# 0032. El reto tiene ámbito: de una sección entera o de un solo equipo

Estado: aceptada. Fecha: 2026-10-21. Fase 1, continuación del Bloque 13.

## Contexto

El reto por puntos del Bloque 13 (ADR 0030) era del club entero: un único reto activo que veían todas las familias y gestionaba cualquiera con `org.challenges.manage`. Producto lo corrigió: el reto no es algo tan genérico. Un club completo (ADR 0031) tiene secciones distintas, y dentro de una sección cada equipo puede querer su propio reto. Un reto se crea por sección, para toda la sección, o para un equipo concreto de esa sección, de manera independiente. Un jugador puede estar en los dos a la vez.

## Decisión

- **Ámbito en datos** (`challenges.section_id` obligatorio, `challenges.team_id` opcional): un reto es siempre de una sección; con equipo, es solo de ese equipo, que tiene que ser de esa sección (la API lo comprueba; la base solo guarda las dos claves). Borrar la sección o el equipo arrastra sus retos. No hay retos de todo el club: quien quiera uno para el club entero crea uno por sección.
- **Quién participa**: los jugadores que, esta temporada, están en un equipo de la sección (reto de sección) o en ese equipo (reto de equipo). La familia ve, por cada uno de los suyos, la lista de retos activos en los que participa (`/api/org/family/players/{id}/challenges`), los de toda la sección antes que los de un equipo; registra en uno concreto (`.../challenges/{challengeId}/submissions`). Un reto que no le toca al jugador responde 404, aunque exista. La ficha del jugador para la familia enseña una tarjeta por reto.
- **Quién gestiona**: `org.challenges.manage` sigue siendo el permiso, pero su alcance lo marca el de validación. Quien valida todo el club (`org.challenges.review`: administración, dirección, coordinación) crea y gestiona retos de cualquier sección o equipo. Quien solo valida lo suyo (`org.challenges.review_own`: la entrenadora) crea y gestiona solo retos de equipo de los equipos que lleva; el reto de la sección lo ve pero no lo toca. La lista devuelve ese alcance (`manage`) y la ficha de cada reto lo que se puede hacer con él (`access`), para que la web enseñe solo lo que se puede.
- **El ámbito solo cambia en borrador**: una vez activo, el reto ya tiene participantes y registros; cambiar de sección o de equipo dejaría jugadores fuera con puntos dentro. Se responde 409.
- **Dónde vive**: el reto no tiene entrada en la barra de navegación. Vive en la ficha de cada equipo (tarjeta "Reto": el suyo, el de toda su sección y el histórico, con el seguimiento acotado al equipo) y en la ficha de cada sección (pestaña "Retos": los de toda la sección y los de cada equipo). Desde ahí se crea uno nuevo con el ámbito ya puesto. La familia llega a los retos desde la ficha de cada uno de los suyos (`/family/{id}/challenges`), con una tarjeta por reto. La vista de conjunto (`/challenges`) sigue existiendo sin enlace en la barra: es a donde llevan las alertas de "por validar" del inicio.
- **Seguimiento por equipo**: la validación y la participación admiten `team` para acotarse a un equipo dentro del ámbito de quien pregunta (la intersección con sus equipos, si solo valida lo suyo). Abrir el reto de la sección desde un equipo muestra solo ese equipo y vuelve a él.
- **Orden de la lista**: activos, borradores y cerrados; dentro, por sección (en su orden), los de toda la sección antes que los de un equipo, y los más nuevos primero. Con `section` o `team`, la lista se acota a esa sección o a ese equipo (con los de toda su sección).
- **Migración**: la columna nace vacía, se rellena con la sección donde juegan esta temporada los jugadores con registros de cada reto (si no hay registros, la primera sección activa del club) y después pasa a obligatoria. Un club con retos y sin ninguna sección haría fallar la migración; hoy no existe ninguno.
- **Club demo**: el "Reto de hábitos 2026-27" pasa a ser de la sección de fútbol sala; la entrenadora del Alevín A tiene su "Reto técnico del Alevín A", activo, con tres pruebas técnicas y un registro de Clara Martí pendiente de validar. Clara ve los dos; Marc, solo el de la sección.

## Consecuencias

- Dos columnas, dos claves foráneas y dos índices en `challenges`; la suite de aislamiento del reto cubre el ámbito, la gestión por equipo y que un reto de otro equipo o de otro club no se toca.
- La entrenadora pierde la capacidad de editar el catálogo del reto de la sección, que tenía en ADR 0030. A cambio gana su propio reto de equipo, que era lo que pedía producto.
- La API de la familia cambia de forma: `challenge` (uno o nulo) pasa a `challenges` (lista). Web y API viven en el mismo repo y se despliegan juntas; no hay otros consumidores.
- La barra pierde un destino: en móvil vuelven a caber los ajustes sin pasar por el menú de persona para la mayoría de cargos.
- Queda para después: coordinación de sección como alcance propio (hoy la coordinación valida todo el club), retos de varias secciones a la vez y el histórico de retos por temporada en la ficha del jugador.

## Alternativas descartadas

- Sección opcional (nulo = todo el club): mantiene el caso que producto descartó y obliga a la familia y a la web a tratar tres alcances en vez de dos.
- Retos con varios equipos (tabla de unión): no lo pidió nadie y complica la pregunta "¿participa este jugador?"; si hace falta, es añadir la tabla sin tocar lo demás.
- Un permiso nuevo `org.challenges.manage_own`: los roles ya distinguen "todo el club" de "lo mío" con `review` y `review_own`; añadir un tercer eje multiplica la matriz sin aportar nada.
