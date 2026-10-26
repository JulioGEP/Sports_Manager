# 0048. Mejoras de la plataforma dentro de Ajustes, en una pestaña

Estado: aceptada. Fecha: 2026-10-26. Sustituye la parte de pantallas del club de la ADR 0047 (la entrada "Mejoras" en la navegación) y añade una séptima pestaña a los ajustes de la ADR 0045.

## Contexto

La ADR 0047 puso las mejoras de la plataforma en una entrada propia de la navegación del club, en el grupo Gestión (`/<club>/roadmap`). Producto pidió que no tengan sección propia y que vivan dentro de Ajustes, en una pestaña nueva.

Tiene sentido por lo mismo que ordenó los ajustes en la 0045: la navegación es para el trabajo del día a día del club (deportistas, agenda, entrenamiento, cuotas). Sugerir mejoras y mirar la hoja de ruta es algo que la administración hace de vez en cuando, como mirar la actividad o la web del club. Una entrada fija en la barra le daba un peso que no tiene, y en móvil empujaba a "Más" a otros destinos.

## Decisión

- **Una pestaña "Mejoras" en Ajustes** (`?tab=improvements`), la última, detrás de Actividad. Se ve solo con `org.suggestions`, como cada pestaña se ve con el permiso de lo que lleva dentro (ADR 0045). Ajustes ya es solo de la administración, así que no cambia quién lo ve.
- **Una página, sin subpestañas.** La 0045 descartó las pestañas dentro de pestañas. Arriba, la tarjeta "Sugerencias del club" con el botón "Sugerir una mejora" en su cabecera: es lo propio del club y su acción. Debajo, el bloque "Hoja de ruta de la plataforma" (con su nombre encima, como "Pasarela de pago" y "Contabilidad" en Cobros y contabilidad) con lo que viene, lo que está en estudio y lo ya disponible.
- **Los paneles siguen yendo en la dirección**, ahora detrás de la pestaña: `?tab=improvements&item=`, `&mine=` y `&new=1`.
- **El enlace de antes sigue valiendo.** `/<club>/roadmap` lleva a la pestaña y conserva el panel que abría (`item`, `mine`, `new`).
- **La paleta de mandos** gana "Hoja de ruta de la plataforma", que abre la pestaña, y "Sugerir una mejora" abre el formulario dentro de ella. Sin entrada en la barra, la paleta es el atajo.
- `SettingsGroup`, el encabezado de bloque de una pestaña, pasa a su propio fichero para que lo use también la pestaña nueva.

Nada cambia en la API, los datos ni los permisos de la 0047.

## Consecuencias

- La barra del club vuelve a lo que tenía antes de la 0047.
- Ajustes pasa de seis a siete pestañas; en móvil se desplazan, como ya hacían.
- Quien buscaba "Mejoras" en la barra la encuentra en Ajustes o con la paleta.

## Alternativas descartadas

- **Dos pestañas en Ajustes ("Hoja de ruta" y "Sugerencias del club"):** parte en dos lo mismo, que es justo lo que la 0045 deshizo con cobros y contabilidad.
- **Subpestañas dentro de "Mejoras":** pestañas con otro nombre, descartadas en la 0045.
- **Llevarla al menú de persona:** ese menú es de la cuenta (clubes, idioma, salir), no del club.
