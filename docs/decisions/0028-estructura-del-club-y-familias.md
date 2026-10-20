# 0028. Estructura del club: temporadas, secciones, equipos, jugadores y familias

Estado: aceptada. Fecha: 2026-10-20. Primera pieza de la Fase 1 (Bloque 11).

## Contexto

Con el front nuevo (ADR 0027) el producto necesitaba contenido real: producto pidió ver "Jugadores y familias, Equipos y plantillas, Secciones y temporadas" sobre el club demo. El prototipo anterior (`docs/dominio.md`) tenía jugadores apuntando a un único equipo, la temporada fija en código y sin secciones; el informe de producto pedía plantilla por temporada para conservar histórico y una capa de secciones entre el club y los equipos.

## Decisión

- **Temporada** (`seasons`): nombre, fechas y una sola actual por club (índice único parcial). La primera que se crea pasa a ser la actual. Los equipos y las plantillas cuelgan de una temporada: cambiar de temporada no borra nada.
- **Sección** (`sections`): la capa entre el club y los equipos, con nombre libre ("Fútbol sala", "Femenino", "Escuela") y estado activa o archivada. Una sección con equipos no se borra.
- **Equipo** (`teams`): sección + temporada + nombre, único por esos tres. La categoría es texto libre: cada federación y club la llama a su manera y no hay catálogo que imponer todavía.
- **Jugador** (`players`): nombre, apellidos y fecha de nacimiento opcional. No es un usuario. Estado activo o de baja: la baja no borra ni saca del historial.
- **Plantilla** (`team_players`): jugador en un equipo con dorsal y posición opcionales; único por equipo y jugador. **Cuerpo técnico** (`team_staff`): miembros del club asignados a un equipo.
- **Familia** (`player_guardians`): una cuenta vinculada a un jugador con una relación (madre, padre, tutor, abuelo, otra; las del prototipo). Una invitación de familia se hace desde la ficha del jugador y lleva `player_id` y relación: al aceptarla, la cuenta entra con el rol de tutor y queda vinculada. Quien ya es miembro se vincula sin invitación.
- **Permisos nuevos** (`packages/shared`): `org.structure.read` y `org.structure.write` (temporadas, secciones, equipos, plantilla, cuerpo técnico); `org.players.read` y `org.players.write` (datos de jugadores y familias); `org.family.read` (lo propio de una familia). Administración: todo. Entrenador: lectura de estructura y jugadores. Tutor: solo su familia. El soporte de plataforma sin autorización solo ve cifras; con autorización, lectura.
- **Toda tabla lleva `organization_id`**, también las de unión, y toda consulta lo filtra (ADR 0015). Un equipo no puede apuntar a una sección o temporada de otro club ni admitir en plantilla a un jugador de otro club: la API lo comprueba antes de escribir y los tests de aislamiento lo cubren.
- **Voz del club** (`organizations.voice`): cercana, profesional o vestuario (DESIGN.md 11), editable en ajustes. Los momentos sensibles (dar de baja) usan siempre el texto profesional del design system.
- **Club demo precargado** por migración idempotente: temporada 2026-27, sección "Fútbol sala", cuatro equipos con 36 jugadores ficticios, una entrenadora (`entrenador@demo.test`) y una familia (`familia@demo.test`), ambas con la contraseña de prueba `123456`.

## Consecuencias

- La portada del club enseña cifras reales (temporada, secciones, equipos, jugadores, familias) y accesos directos; una familia ve a sus jugadores y quién los entrena.
- La vista de soporte añade equipos y jugadores a sus agregados; sigue sin datos personales.
- Las previews de Netlify nacen con copia de producción: con datos de menores reales hay que proteger las previews antes de dar de alta clubes reales (riesgo ya anotado en `docs/plan-fase-0.md`). El club demo solo lleva datos ficticios.
- Queda para bloques siguientes: foto de jugador, documentos, importación CSV, jugadores adultos con cuenta propia, y permisos por equipo para que una entrenadora edite solo su plantilla.

## Alternativas descartadas

- Jugador con `team_id` directo (como el prototipo): pierde el histórico y no admite un jugador en dos equipos.
- Catálogo cerrado de categorías por deporte: cada federación lo define distinto; se deja como texto hasta tener clubes reales que lo pidan.
- Vincular familias por email al registrarse (como el prototipo): sin invitación con token no hay garantía de que quien se registra sea quien el club quería.
