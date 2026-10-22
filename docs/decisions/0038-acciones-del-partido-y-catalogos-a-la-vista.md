# 0038. Acciones del partido: un cuarto ámbito del catálogo, y los catálogos del equipo, del partido y del rival a la vista

Estado: aceptada. Fecha: 2026-10-22. Fase 1, Bloque 20. Amplía la 0034 (catálogo) y ajusta la consola de la 0037.

## Contexto

Al probar la consola a pantalla completa en la banda, producto echó en falta dos cosas. Primera: no había dónde registrar lo que le pasa al partido sin que sea de ningún equipo (el partido se para, el árbitro interrumpe el encuentro, una lesión), y esas cosas deben verse junto a las acciones del equipo, mitad y mitad. Segunda: el registro de últimas acciones ocupaba toda la columna derecha mientras que la tarjeta del rival enseñaba solo tres acciones y escondía el resto tras "Más acciones", igual que la del equipo; en la banda no se quiere depender de dos botones para ver el catálogo.

## Decisión

- **Un cuarto ámbito en el catálogo: `match`.** Una acción del partido no es de un jugador, ni del equipo, ni del rival. No suma al marcador, no cuenta como falta ni lleva tarjeta; solo tiene nombre, tipo (favorable, pérdida o neutra) y peso. La restricción `match_action_types_scope_check` admite el valor nuevo; el evento se guarda con `side = own` como las del equipo (lo registra nuestra banda) y el motor de estadísticas lo trata como una acción más del trabajo del equipo, sin espejo con el rival.
- **El deporte propone tres acciones del partido** en todos los catálogos (`DEFAULT_MATCH_ACTIONS`): partido parado, parón por lesión y decisión arbitral, neutras y en la bandeja rápida. La sección de fútbol sala del club demo las recibe por una migración de datos; una sección ya existente las gana al "volver al deporte" o añadiéndolas en su configuración, donde el desplegable "A quién se aplica" ofrece "Partido".
- **La bandeja de nuestro equipo, partida en dos** cuando no hay nadie seleccionado: a la izquierda las acciones del equipo y a la derecha las del partido, cada mitad con todo su catálogo a la vista (las de la bandeja rápida primero), sin "Más acciones". Si un ámbito no tiene acciones, lo dice en una línea.
- **El rival, entero.** Su tarjeta enseña todo su catálogo, también con las rápidas primero, y crece lo que haga falta; el registro de últimas acciones pasa a una tarjeta pequeña debajo, con las ocho últimas en texto de etiqueta y desplazamiento propio. "Más acciones" queda solo en la bandeja del jugador, donde el catálogo es largo y el toque frecuente.

## Consecuencias

- Una migración de esquema (la restricción del ámbito) y una de datos (las tres acciones del club demo). El contrato de la API no cambia: el ámbito nuevo pasa por los mismos esquemas de Zod.
- Las estadísticas del partido y el histórico listan las acciones del partido dentro del trabajo del equipo (ámbito distinto de rival), como "Partido parado · 3". No entran en la comparativa con el rival ni en las tablas de jugadores.
- La prueba de interfaz del partido registra una decisión arbitral desde la bandeja partida y comprueba que llega al registro.

## Alternativas descartadas

- Registrar lo del partido como acciones del equipo: mezcla lo nuestro con lo que no es de nadie y obliga a leer la columna de "trabajo del equipo" con cuidado; un ámbito propio deja claro en la consola y en las estadísticas de quién es cada cosa.
- Un lado `neutral` en los eventos: añadiría un tercer valor a `side` en el esquema, el motor y las exportaciones para un dato que hoy no se compara con nada; si un día hace falta separar lo del partido en las estadísticas, el ámbito ya lo identifica.
- Dejar "Más acciones" en el rival y el equipo con una bandeja rápida: es lo que estorbaba en la banda; el catálogo del rival y del partido son cortos y caben a la vista.
