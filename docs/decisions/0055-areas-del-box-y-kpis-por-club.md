# 0055. Áreas del box con portada de KPIs que personaliza cada club, sin timer, ranking ni métricas

Estado: aceptada. Fecha: 2026-10-27. Revisa la navegación del box de la 0049 y la 0050. Sustituye la pantalla de Métricas (`/metrics`) de la 0049.

## Contexto

Producto revisó la barra lateral del dueño del box demo y pidió:

- **Quitar el timer y el ranking.** El timer (`/timer`) y el ranking de constancia del mes (`/ranking`) no aportan a la gestión del box y ensucian la navegación.
- **Agrupar lo que hace el coach.** Clases, Programación, Atletas y Planificación iban sueltas arriba, sin grupo, y Ejercicios estaba en "El box", lejos de la programación que lo usa.
- **Anuncios, en el negocio.** Es lo que el box cuenta a sus clientes: retención y comunicación, no herramienta de clase.
- **Secciones que se abren.** Que cada grupo de la barra se pueda tocar y enseñe los KPIs principales de sus pantallas.
- **KPIs que elige cada club**, con unos de serie. Lo mismo en Hoy: cada box mira cosas distintas.
- **Que cada KPI se vea como haga falta** (número, línea, barras o radial, si la métrica se presta), **con el sitio que el club decida** y **ordenado arrastrando**.
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

`packages/shared/src/box-dashboards.ts` define **26 KPIs**. Cada uno tiene su área, la pantalla a la que lleva, el permiso que hace falta para verlo, su formato, **las vistas que admite** y, si lo tiene, **su histórico**. **El club elige cuáles, cómo se ven, qué sitio ocupan y en qué orden; nunca la fórmula.** Así "Ocupación" se calcula igual en todos los boxes y siempre se puede explicar en una frase.

- **Entrenamiento:** clases hoy, ocupación de la semana frente a la anterior, días con WOD publicado, atletas activos, atletas que no vienen, asistencia media, PRs de la semana, planes activos y ejercicios de la biblioteca.
- **Negocio:** recurrente al mes, altas netas, bonos por renovar, tarifas en pausa, pendiente de cobro, cobrado este mes, leads abiertos, pruebas de la semana, conversión de leads, ventas de la tienda y anuncios publicados.
- **El box:** clases de la semana, franja más llena, franja con más hueco, clases sin coach, conversaciones por contestar y material fuera de servicio.

### Piezas: KPI, vista y tamaño

Un cuadro es una lista de **piezas** (`{ kpi, view, size }`), hasta **doce** (tres filas de cuatro).

- **Vistas:** número, línea, barras y radial. **Cada KPI ofrece solo las que lo cuentan bien:** línea y barras, si tiene histórico real; radial, si la cifra es una proporción (ocupación, conversión, días con WOD, una franja). El número, siempre; es la vista de serie de todos. Un KPI sin histórico ni proporción (clases sin coach, atletas que no vienen) solo se ve como número, y el selector no ofrece lo que no tiene.
- **Tamaños:** pequeño (1×1), ancho (2×1), grande (2×2) y todo el ancho. La rejilla tiene cuatro columnas cuando hay sitio y dos en el móvil, donde lo ancho ocupa la fila. Una pieza nueva llega con el tamaño de su vista: la cifra y el anillo, 1×1; las gráficas, 2×1.
- **Históricos** (`trend`): ocupación, clases y pruebas, por semana (las ocho últimas); PRs, en semanas de siete días que acaban hoy; cobrado, ventas de la tienda, anuncios y conversión de leads (por mes de entrada), por mes (los seis últimos); asistencia media, en ventanas de 30 días; y las franjas, la ocupación de cada hora de inicio de las cuatro últimas semanas, con la franja del KPI resaltada. El último punto es el periodo en curso y coincide con la cifra.
- **Estimados:** atletas activos, recurrente, altas netas y asistencia media reconstruyen los meses pasados con las fechas de inicio y fin de cada tarifa (una cancelada sin fecha de fin no se puede situar). Su etiqueta lleva un asterisco y lo explica al pasar por encima; el punto de este mes es el exacto.
- Una cifra 1×1 se queda en la cifra. Con más sitio, debajo lleva su tendencia en pequeño.

Reglas de la elección:

- En Hoy se elige de cualquier área; en un área, solo de las suyas.
- **Los de serie** dan un cuadro completo desde el primer día: Hoy con atletas activos, ocupación en anillo, recurrente en línea y pruebas y cobrado en barras; cada área con sus gráficas donde cuentan algo; El box con la franja más llena a todo el ancho, que es la ocupación por franja que antes vivía en Métricas.
- La elección se guarda en `organizations.dashboards` (jsonb), por cuadro. **Un cuadro sin entrada enseña los de serie**; una lista vacía es una elección (el club no quiere cifras ahí). Se lee con cuidado: lo que no existe o no cabe se descarta, una vista que el KPI no admite vuelve a la de serie, y lo guardado antes de las vistas (solo el nombre del KPI) se sigue leyendo.
- **Lo personaliza quien lleva los ajustes del club** (`org.settings.write`) y vale para todo el equipo. Queda en la actividad (`organization.dashboards_updated`).
- **Cada persona ve solo lo que su permiso le deja ver.** Un coach ve las cifras de Entrenamiento y de El box que le tocan y ninguna de dinero. Las cifras de atletas siguen su ámbito: un coach con ámbito restringido cuenta a los suyos.
- Una pieza que el club tenía y quien guarda no puede ver se conserva al guardar: no la ha quitado él.

### Personalizar en el propio cuadro

"Personalizar", junto al título del cuadro, lo pone en edición **ahí mismo**, sin paneles: lo que se cambia se ve como quedará.

- Cada pieza lleva **un asa para arrastrarla** a otro sitio (puntero, dedo o lápiz; la pieza de destino se marca y lo arrastrado sigue al dedo con su nombre). Arrastrar es un atajo (DESIGN.md 5e): el menú "⋯" de cada pieza también la **mueve antes o después**, y es la vía del teclado y del lector de pantalla, que anuncia la nueva posición.
- Debajo del nombre, **la vista**, como control segmentado de iconos con solo las que admite ese KPI.
- En "⋯", **el tamaño** (marcado el actual), mover y **quitar**.
- Al final, **"Añadir KPI"** abre la lista de lo que falta, con la frase que define cada KPI, su cifra de ahora y las vistas que admite; en Hoy, agrupada por área. Con doce piezas, avisa.
- Una barra fija abajo dice si hay cambios sin guardar y lleva "Volver a los de serie" (si el club cambió algo), "Cancelar" y "Guardar cuadro". Cancelar con cambios pide confirmación.

### Las gráficas

SVG propio, sin librerías (DESIGN.md 10), dibujado al tamaño real de su hueco para que nada se estire: una serie por gráfica en el color del club, una sola escala, marcas finas (línea de 2,5 px con su área al 10 %; columnas de 24 px como mucho con la punta redondeada; el anillo con su pista en el tono suave del club). La línea marca el punto de ahora; las barras resaltan la de ahora (o, en las franjas, la del KPI) con su cifra en la punta, y las demás van más suaves. Al pasar el puntero, o con las flechas del teclado sobre la gráfica, una cruceta y un aviso dan cada punto. Cada gráfica tiene su resumen en una frase y su tabla para el lector de pantalla.

### La pieza en el cuadro

Nombre (enlace a la pantalla donde se resuelve, si quien mira la abre), icono de su pantalla y la cifra en Geist Mono. Si algo pide atención, la línea que la explica lo dice con palabras y un icono, y el color solo acompaña: ámbar para revisar, rojo para lo urgente (cobros vencidos, un WOD que falta para hoy o mañana) y verde cuando está al día. La ocupación lleva la diferencia con la semana anterior, en puntos. Si hay nombres que ayudan ("Olga Marín"), van debajo, como mucho tres.

### API

- `GET /api/org/dashboards/{today|training|business|box}`, para el personal (`org.events.read`): las piezas que esa persona puede ver, sus cifras y el histórico de las que lo dibujan, lo que podría añadir, si el club ha cambiado los de serie y si puede personalizarlo. Con `?preview=all`, las cifras e históricos de todo lo que se puede elegir: es lo que usa la edición para cambiar de vista al momento.
- `PUT` de la misma ruta (`org.settings.write`): `{ widgets: [{ kpi, view, size }, …] }` en orden, o `{ widgets: null }` para volver a los de serie.
- Cada consulta que comparten varios KPIs se hace una sola vez por petición, y solo si algún KPI la pide. Un histórico solo se calcula si alguna pieza lo dibuja.

### Lo que se quita

- **Timer** y **ranking**: pantallas, rutas, enlaces, textos y la ruta `GET /api/org/fitness/ranking`. La clasificación de cada WOD (`/leaderboard/:id`) sigue: es otra cosa. Los enlaces viejos llevan al inicio del club.
- **Métricas** (`/metrics`): lo que enseñaba vive ahora en las portadas, y `/metrics` lleva a Negocio. `GET /api/org/fitness/metrics` se queda: el inicio del dueño sigue sacando de ahí los avisos y la programación de la semana.
- Cualquier ruta desconocida dentro de un club lleva a su inicio, no a la portada del producto.
- El aviso de cobros vencidos del inicio cuenta todos los cargos vencidos, como la pantalla de Cobros a la que lleva y como el KPI "Pendiente de cobro"; antes dejaba fuera los de la tienda.

## Consecuencias

- Cada box mira lo que le importa, sin pedirlo a producto, y el equipo entero mira lo mismo.
- La barra del personal es más corta de leer: tres grupos con nombre y una portada por grupo.
- Las cifras son del catálogo. Un KPI nuevo es un cambio de producto (catálogo, cálculo, histórico y textos en tres idiomas), no un ajuste del club. Es a propósito.
- Los históricos de tarifas son estimados mientras no se guarde cuándo se cancela cada una; se dice en la propia pieza. Guardar esa fecha los haría exactos.
- Una columna nueva en `organizations` (`dashboards`, jsonb, `'{}'` por defecto). La aplica Netlify Database en el deploy, como el resto (ADR 0003).
- El timer se pierde. Si un box lo echa de menos, la Pantalla del box es el sitio natural para un reloj de clase.

## Alternativas descartadas

- **KPIs con fórmula libre por club:** cada box acabaría con cifras que nadie más entiende y que no se pueden comparar ni explicar. Lo que cambia de un box a otro es qué mira, no cómo se cuenta.
- **KPIs por persona en vez de por club:** el pedido es por club, y que el equipo mire lo mismo es parte del valor. Cada persona ya ve solo lo que su rol le deja.
- **Mantener Métricas como pantalla aparte:** duplicaría lo que enseñan las portadas y obligaría a decidir dónde vive cada cifra.
- **Cualquier vista para cualquier KPI:** una línea de "clases sin coach" o un anillo de "recurrente" no dicen nada o mienten (un anillo pide un total). Cada KPI ofrece las que lo cuentan bien.
- **Una librería de gráficas:** pesa más que todo el cuadro y obliga a pelearse con sus estilos para cumplir el sistema de diseño. Tres gráficas de una serie se dibujan en SVG con lo que ya usa el producto.
- **Un panel aparte para personalizar:** obliga a imaginar el resultado. En el propio cuadro se ve como quedará.
- **Solo arrastrar para ordenar:** deja fuera a quien usa el teclado o un lector de pantalla. Mover desde el menú es la otra vía.
- **Anuncios en un área "Comunidad" con Mensajes:** dejaba un área de dos pantallas con poco que contar. Para el dueño, anunciar es retener clientes. Para el coach, que no ve el negocio, Anuncios sigue al lado de Mensajes.
- **Mantener "Gestión" como cuarta área:** su portada solo podía contar salas y personas. Unida a El box, el horario y la ocupación por franja le dan cifras que sirven para decidir.
