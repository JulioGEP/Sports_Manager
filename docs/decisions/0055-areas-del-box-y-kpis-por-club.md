# 0055. Áreas del box con portada de KPIs que elige cada club, sin timer, ranking ni métricas

Estado: aceptada. Fecha: 2026-10-27. Revisa la navegación del box de la 0049 y la 0050. Sustituye la pantalla de Métricas (`/metrics`) de la 0049.

## Contexto

Producto revisó la barra lateral del dueño del box demo y pidió:

- **Quitar el timer y el ranking.** El timer (`/timer`) y el ranking de constancia del mes (`/ranking`) no aportan a la gestión del box y ensucian la navegación.
- **Agrupar lo que hace el coach.** Clases, Programación, Atletas y Planificación iban sueltas arriba, sin grupo, y Ejercicios estaba en "El box", lejos de la programación que lo usa.
- **Anuncios, en el negocio.** Es lo que el box cuenta a sus clientes: retención y comunicación, no herramienta de clase.
- **Secciones que se abren.** Que cada grupo de la barra se pueda tocar y enseñe los KPIs principales de sus pantallas.
- **KPIs que elige cada club**, con unos de serie. Lo mismo en Hoy: cada box mira cosas distintas.
- **Sin Métricas.** Si cada área enseña sus cifras, una pantalla aparte de métricas sobra.

## Decisión

### Tres áreas y Hoy

El personal del box navega por **áreas** (en el código, `area`, para no confundirlas con las secciones deportivas):

| Área | Pantallas, en el orden de la barra |
| --- | --- |
| **Entrenamiento** | Clases, Programación, Atletas, Planificación, Ejercicios |
| **Negocio** | Tarifas, Cobros, Leads, Tienda, Anuncios |
| **El box** | Mensajes, Horario, Equipo, Salas, Material, Pantalla del box |

- **Hoy** va arriba, sola. **Ajustes** baja al pie: se usa poco y no es de ningún área.
- "Gestión" desaparece: Horario, Equipo y Salas eran el box como sitio y se unen a El box con Mensajes y Material. Así **cada área tiene cifras que merecen portada**; una de "Gestión" solo podía contar salas y personas.
- Dentro de cada área, primero lo que se usa cada día. La barra del móvil sigue siendo Hoy, Clases, Programación y Atletas.
- **Anuncios** está en Negocio para quien ve el negocio. Para quien no ve nada de él (un coach) se queda en El box, junto a Mensajes: así no aparece un área con una sola pantalla.
- El atleta no cambia, salvo que pierde Timer y Ranking: sus grupos no tienen portada.

### La cabecera de cada área se toca

En escritorio, la cabecera del grupo es un enlace con chevron (`CaretRight`, DESIGN.md 9.7) y la misma zona táctil que el resto de destinos. En el móvil, "Más" se agrupa igual, con la cabecera de cada área arriba de sus pantallas, aunque esas pantallas vayan en la barra inferior. La paleta (⌘K) encuentra "Resumen de Entrenamiento", "Resumen de Negocio" y "Resumen de El box".

La **portada de un área** (`/<club>/areas/training|business|box`) enseña:

1. **Cifras clave:** los KPIs que el club ha elegido para el área. Cada tarjeta lleva a la pantalla donde se resuelve.
2. En El box, la **ocupación por franja** de las cuatro últimas semanas (lo que antes estaba en Métricas).
3. **En esta área:** una tarjeta por pantalla, con una línea que dice para qué sirve.

### Un catálogo cerrado de KPIs y la elección del club

`packages/shared/src/box-dashboards.ts` define **26 KPIs**. Cada uno tiene su área, la pantalla a la que lleva, el permiso que hace falta para verlo y su formato. **El club elige cuáles y en qué orden; nunca la fórmula.** Así "Ocupación" se calcula igual en todos los boxes y siempre se puede explicar en una frase.

- **Entrenamiento:** clases hoy, ocupación de la semana frente a la anterior, días con WOD publicado, atletas activos, atletas que no vienen, asistencia media, PRs de la semana, planes activos y ejercicios de la biblioteca.
- **Negocio:** recurrente al mes, altas netas, bonos por renovar, tarifas en pausa, pendiente de cobro, cobrado este mes, leads abiertos, pruebas de la semana, conversión de leads, ventas de la tienda y anuncios publicados.
- **El box:** clases de la semana, franja más llena, franja con más hueco, clases sin coach, conversaciones por contestar y material fuera de servicio.

Reglas:

- Cada cuadro (Hoy, Entrenamiento, Negocio y El box) admite **hasta ocho**: dos filas de cuatro. En Hoy se elige de cualquier área; en un área, solo de las suyas.
- **Los de serie de Hoy** son los cuatro que el inicio del dueño ya enseñaba: atletas activos, ocupación, recurrente y pruebas. Un club que no toca nada no nota el cambio.
- La elección se guarda en `organizations.dashboards` (jsonb), por cuadro. **Un cuadro sin entrada enseña los de serie**; una lista vacía es una elección (el club no quiere cifras ahí). Se lee con cuidado: lo que no existe o no cabe en ese cuadro se descarta.
- **La elige quien lleva los ajustes del club** (`org.settings.write`) y vale para todo el equipo. Queda en la actividad (`organization.dashboards_updated`).
- **Cada persona ve solo lo que su permiso le deja ver.** Un coach ve las cifras de Entrenamiento y de El box que le tocan y ninguna de dinero. Las cifras de atletas siguen su ámbito: un coach con ámbito restringido cuenta a los suyos.
- Un KPI que el club tenía y quien guarda no puede ver se conserva al guardar: no lo ha quitado él.

### El selector

"Elegir KPIs", junto al título del cuadro, abre un panel con dos listas. Arriba, **los que salen**, numerados, con subir, bajar y quitar. Abajo, **los que se pueden añadir**, agrupados por área en Hoy, cada uno con la frase que lo define y **su cifra de ahora**, para elegir con datos. Con ocho, avisa de que hay que quitar uno. "Volver a los de serie" aparece cuando el club ha cambiado algo.

### La tarjeta de un KPI

Nombre, icono de su pantalla, la cifra en Geist Mono y una línea que la explica. Si algo pide atención, esa línea lo dice con palabras y un icono, y el color solo acompaña: ámbar para revisar, rojo para lo urgente (cobros vencidos, un WOD que falta para hoy o mañana) y verde cuando está al día. La ocupación lleva su barra y la diferencia con la semana anterior, en puntos. Si hay nombres que ayudan ("Olga Marín"), van debajo, como mucho tres. Toda la tarjeta es un enlace a donde se resuelve. Si quien mira no abre esa pantalla, no enlaza. En el móvil van de dos en dos.

### API

- `GET /api/org/dashboards/{today|training|business|box}`, para el personal (`org.events.read`): la elección del club que esa persona puede ver, sus cifras, lo que podría elegir, si el club ha cambiado los de serie y si puede editarlos. En El box, además, la ocupación por franja. Con `?preview=all`, las cifras de todo lo que se puede elegir (para el selector).
- `PUT` de la misma ruta (`org.settings.write`): `{ kpis: [...] }` en orden, o `{ kpis: null }` para volver a los de serie.
- Cada consulta que comparten varios KPIs se hace una sola vez por petición, y solo si algún KPI la pide.

### Lo que se quita

- **Timer** y **ranking**: pantallas, rutas, enlaces, textos y la ruta `GET /api/org/fitness/ranking`. La clasificación de cada WOD (`/leaderboard/:id`) sigue: es otra cosa. Los enlaces viejos llevan al inicio del club.
- **Métricas** (`/metrics`): lo que enseñaba vive ahora en las portadas, y `/metrics` lleva a Negocio. `GET /api/org/fitness/metrics` se queda: el inicio del dueño sigue sacando de ahí los avisos y la programación de la semana.
- Cualquier ruta desconocida dentro de un club lleva a su inicio, no a la portada del producto.

## Consecuencias

- Cada box mira lo que le importa, sin pedirlo a producto, y el equipo entero mira lo mismo.
- La barra del personal es más corta de leer: tres grupos con nombre y una portada por grupo.
- Las cifras son del catálogo. Un KPI nuevo es un cambio de producto (catálogo, cálculo y textos en tres idiomas), no un ajuste del club. Es a propósito.
- Una columna nueva en `organizations` (`dashboards`, jsonb, `'{}'` por defecto). La aplica Netlify Database en el deploy, como el resto (ADR 0003).
- El timer se pierde. Si un box lo echa de menos, la Pantalla del box es el sitio natural para un reloj de clase.

## Alternativas descartadas

- **KPIs con fórmula libre por club:** cada box acabaría con cifras que nadie más entiende y que no se pueden comparar ni explicar. Lo que cambia de un box a otro es qué mira, no cómo se cuenta.
- **KPIs por persona en vez de por club:** el pedido es por club, y que el equipo mire lo mismo es parte del valor. Cada persona ya ve solo lo que su rol le deja.
- **Mantener Métricas como pantalla aparte:** duplicaría lo que enseñan las portadas y obligaría a decidir dónde vive cada cifra.
- **Anuncios en un área "Comunidad" con Mensajes:** dejaba un área de dos pantallas con poco que contar. Para el dueño, anunciar es retener clientes. Para el coach, que no ve el negocio, Anuncios sigue al lado de Mensajes.
- **Mantener "Gestión" como cuarta área:** su portada solo podía contar salas y personas. Unida a El box, el horario y la ocupación por franja le dan cifras que sirven para decidir.
