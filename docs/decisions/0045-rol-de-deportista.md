# 0045. Rol de deportista: el adulto con cuenta entra a su propia ficha

Estado: aceptada. Fecha: 2026-10-26. Amplía la 0028 (familias), la 0033 (alcance por rol) y la 0039 (deportista adulto con cuenta).

## Contexto

El club tenía cuatro roles: administración, personal, entrenador y tutor. El deportista adulto con cuenta propia (ADR 0039) entraba como "tutor de sí mismo": un rol de familia y un vínculo con su ficha con la relación "otra". Funcionaba para el bienestar y la tienda, pero en "Ver como" y en "Personal" aparecía como Tutor, su navegación decía "Mi familia" y no había forma de darle acceso sin pasar por el formulario de familia.

En atletismo, CrossFit, yoga, natación máster o un sénior, la persona que entrena es la que usa la app. Producto pidió un rol de "Deportista" y que vea lo que le toca.

## Decisión

### Un rol, y su ficha como puerta

- **Rol `athlete` ("Deportista")** en `ROLE_CODES` y en la tabla `roles`. Sus permisos son los de la familia: `org.settings.read`, `org.family.read` y `org.family.write`. No lee nada del club: ni deportistas, ni agenda entera, ni entrenamiento, ni carga, ni salud. Una prueba lo vigila.
- **Lo suyo es su ficha.** Su cuenta es la de su persona (`people.user_id`) y queda vinculada a su ficha con una relación nueva, `self`. Así todo lo que una familia ya ve de los suyos (ficha, agenda, partidos, retos, tests, cuotas, tienda) le llega sin código nuevo ni permisos nuevos: el ámbito lo pone el vínculo, como en la 0028.
- **Por qué reutilizar `org.family.*` y no crear `org.self.*`.** Las seis rutas "de lo propio" ya comprueban el vínculo con el jugador; con permisos nuevos habría que tocar cada una para aceptar los dos y probarlas otra vez. El permiso pasa a leerse como "lo propio": los menores de una familia o la ficha del deportista. La interfaz distingue por el rol.
- **`self` solo lo pone el alta del deportista.** El formulario de familia elige entre `FAMILY_RELATIONSHIPS` (todas menos `self`) y la API rechaza vincular a alguien como familia de su propia ficha.
- **Una ficha tiene una sola cuenta y una cuenta es de una sola persona del club** (el índice único que ya existía en `people`). Una madre que también entrena es tutora de su hija y deportista en su ficha: ve las dos en "Mi familia".

### Alta y baja, desde la ficha

- **Dar acceso** desde la tarjeta "Acceso del deportista" de la ficha: por email (invitación con el rol `athlete`, la relación `self` y el jugador) o con la cuenta de un miembro que ya existe. Al aceptar, la cuenta pasa a ser la de su ficha.
- **No se invita a un deportista desde "Personal"** ni se le da el rol a mano: sin ficha no tendría nada que ver. La API responde 400 y la web no lo ofrece. "Personal" no lista a quien solo es familia o deportista.
- **Quitar el acceso** desvincula la cuenta de su persona y le quita el rol. Su ficha y su historial se quedan en el club.
- **Migración de lo que había:** todo vínculo de una cuenta con la ficha de su propia persona pasa a `self`, esa cuenta gana el rol de deportista y deja de ser tutora si no tiene a nadie más a su cargo.

### Lo que ve

- **Inicio:** su día (bienestar de hoy y entrenamientos pendientes de esfuerzo), su próxima sesión con el plan y, si el cuerpo técnico le ha puesto restricciones, el aviso.
- **Mi ficha:** la ficha de la familia en primera persona: foto, equipo o grupo y quién le entrena, partidos con su línea, tests, retos, objetivo, PDI si el club lo comparte, datos y movimientos. Nunca indicadores, anotaciones del personal ni comparativas.
- **Mi plan** (nuevo, `/api/org/me/athlete/plan`): los entrenamientos y clases de sus equipos o grupos de la última semana y la siguiente, con el plan que ha publicado el cuerpo técnico. Nunca un borrador. Solo las tareas que le tocan: las de todo el grupo y las que le asignan a él; la readaptación, solo si es suya. Sin notas ni valoraciones del cuerpo técnico. Con una restricción abierta, cada tarea que pide lo que no puede hacer lleva el aviso de consultarlo; la nota del fisio no le llega. Los bloques se llaman como en su deporte ("Fuerza / técnica y WOD" en CrossFit, ADR 0044).
- **Mi bienestar** (ADR 0039), **Agenda**, **Mis cuotas** y **Tienda**, como ya estaban.

## Consecuencias

- Migraciones `20261026105307_athlete_role` (los checks de relación y de perfil de acceso admiten `self` y `athlete`) y `20261026105308_seed_athlete_role` (el rol como dato, la conversión de lo que había y una deportista de yoga en el demo).
- Club demo: `jugador@demo.test` (Miguel Lozano, Sénior A) pasa a deportista y entra `deportista@demo.test` (Carme Segura, Yoga suave lunes).
- Suite de aislamiento propia (`athlete.isolation.test.ts`): invitación y aceptación, lo que ve y lo que no, vincular a una familia que también entrena, una cuenta por ficha, quitar el acceso y el club B sin llegar al A. La de entrenamiento comprueba el plan: sin borradores, sin readaptación ajena, sin notas y con los choques de su restricción.
- **Pendiente: las clases de una actividad no se planifican.** La sesión planificada cuelga solo de los entrenamientos (`kind = training`); las clases de yoga o CrossFit son `activity`. El deportista las ve como "Clase", sin plan. Para que un box publique el WOD del día hay que dejar planificar también las actividades (sesión, semana y propuesta con IA). Es el siguiente paso con más valor para estos deportes.
- Fuera de alcance: que el deportista registre sus marcas en los tests o su asistencia, y avisos por email o notificación cuando se publica el plan.

## Alternativas descartadas

- Seguir con el "tutor de sí mismo": en la interfaz es un tutor, y cada pantalla tendría que adivinar si lo es.
- Permisos propios `org.self.*`: el mismo ámbito con el doble de rutas que comprobar.
- Resolver lo propio por `people.user_id` en cada consulta en vez del vínculo `self`: más cambios en siete consultas de familia, cuotas, tienda y contabilidad, para el mismo resultado.
- Ver la plantilla del equipo o la carga del grupo: datos de otros deportistas que no le corresponden (DESIGN.md 0.10).
