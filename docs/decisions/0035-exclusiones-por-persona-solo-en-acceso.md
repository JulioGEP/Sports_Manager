# 0035. Las exclusiones por persona se gestionan solo en la pestaña "Acceso"

Estado: aceptada; la 0036 cambia la hoja y la API a excepciones en los dos sentidos (sigue en un solo sitio). Fecha: 2026-10-22. Fase 1, Bloque 19. Concreta la 0033.

## Contexto

La ADR 0033 puso la lista de exclusiones por persona en la pestaña "Acceso" de "Personal", pero las exclusiones se fijaban desde la hoja de roles de cada persona. Producto lo corrigió: una misma acción no puede vivir en dos sitios. Quien administra el club entra en "Acceso" para decidir qué ve cada rol y, en la misma pantalla, a quién se le quita algo en concreto.

## Decisión

- **Un solo sitio.** Las exclusiones por persona se añaden, se cambian y se quitan en la tarjeta "Exclusiones por persona" de la pestaña "Acceso": un botón para añadir, una hoja con la persona y un check por área ("No ve Instalaciones"), y en cada fila editar y quitar con confirmación.
- **La hoja de roles deja de llevarlas.** Sigue con los roles, el cargo y, para dirección y coordinación, las secciones a su cargo: eso es el ámbito, no una exclusión.
- **A quién se puede excluir:** a quien trabaja en el club y no lo administra. La administración no aparece (la API ya respondía 409) y quien solo es familia tampoco: ya ve solo lo suyo.
- **La API no cambia.** `PUT /api/org/access/members/{userId}` con la lista de áreas sustituye las exclusiones; con la lista vacía, las quita.

## Consecuencias

- Una pantalla responde entera a "qué ve cada uno": la matriz por rol arriba y las excepciones por persona debajo.
- Para excluir a alguien ya no se parte de su fila en "Personal", sino de la pestaña "Acceso". La hoja de roles es más corta.

## Alternativas descartadas

- Mantener los dos sitios sincronizados: dos caminos para lo mismo confunden a quien administra y duplican interfaz que mantener.
- Dejar las exclusiones solo en la hoja de roles y quitar la lista de "Acceso": obliga a abrir persona por persona para saber a quién se le ha quitado algo.
