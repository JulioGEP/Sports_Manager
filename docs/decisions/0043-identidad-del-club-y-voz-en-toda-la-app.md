# 0043. Identidad del club: escudo, colores, estilo y voz en una pestaña, y la voz en toda la app

Estado: aceptada. Fecha: 2026-10-23. Amplía la marca por club del Bloque 5 (ADR 0024), el design system de la 0027 y la voz del club de la 0028.

## Contexto

En los ajustes, la voz del club vivía en "General" y la marca y el logo en dos pestañas más. La marca solo cambiaba dos colores: dos clubes con colores parecidos tenían la misma plataforma. Y la voz apenas se oía: un solo texto del design system (dar de baja) la usaba.

Producto pide tres cosas:

- La voz, la marca y el logo en la misma pestaña.
- Que la voz llegue a todos los puntos de la aplicación.
- Poder cambiar tipografía, botones, iconos, fondos y paletas (cinco tipos de cada), y lo que haga falta para que la plataforma de un club sea totalmente distinta a la de otro.

## Decisión

### Una pestaña: "Identidad"

Ajustes pasa a tener General (nombre, idioma, zona horaria), Identidad y el resto de siempre. Identidad reúne, en este orden:

1. Vista previa: la portada y una tarjeta con los componentes de verdad.
2. Escudo: subir y quitar, como antes. Se guarda al momento.
3. Colores: doce paletas de partida (pares clásicos del deporte, por su nombre y nunca por el de un club real) y los dos colores a mano, con los avisos del motor.
4. Tipografía, botones, iconos, fondo, portada, navegación y esquinas: tarjetas con su muestra, de las que se elige una.
5. Lema del club.
6. Voz del club, con cómo suena cada una en tres momentos de verdad.

`?tab=brand` y `?tab=logo` siguen abriendo Identidad. La puesta en marcha enlaza aquí.

### Opciones cerradas del design system, no CSS libre

Cada capa es una lista cerrada (`packages/shared/src/club-style.ts`). Cualquier combinación cumple el contraste y las medidas de `DESIGN.md`: el club elige carácter, no puede romper la legibilidad.

| Capa | Opciones | Qué cambia |
| --- | --- | --- |
| Tipografía | moderna, clásica, deportiva, amable, geométrica | Pareja de títulos y texto: Geist; Fraunces y Source Sans 3; Oswald y Archivo; Nunito; Montserrat. Peso y espaciado de los títulos. Las cifras siguen en Geist Mono |
| Botones | del sistema, píldora, suave, recta, relieve | Radio de botones y controles, peso del verbo y sombra. La altura no cambia (48 y 44 px) |
| Iconos | duotono, línea, fina, gruesa, relleno | Peso de Phosphor en toda la app y trazo y relleno de los iconos de deporte |
| Fondo | liso, neutro, teñido, degradado, trama | Tinte de los neutros (0,6; 0; 1,25) o un degradado o una trama de puntos del color del club |
| Portada | lisa, degradado, rayas, banda, escudo | Capa decorativa detrás del contenido de la portada |
| Navegación | clara, del club, oscura | Barra lateral, cabecera móvil y barra inferior |
| Esquinas | del sistema, redondeadas, rectas | Tarjetas, campos, paneles, etiquetas, filas y portada |

Además, el lema (hasta 80 caracteres) sale en la portada del inicio, en la pantalla de invitación y en el email de invitación. El icono de la pestaña del navegador pasa a ser el escudo del club, o sus iniciales sobre su color; con la navegación del club u oscura, la barra del navegador del móvil toma su color.

Los valores por defecto son el aspecto de siempre: un club que no toca nada se ve igual que ayer.

### Cómo se pinta

- **Atributos en la raíz.** `applyClubLook` pone `data-type`, `data-buttons`, `data-icons`, `data-bg`, `data-hero`, `data-nav` y `data-corners` en `<html>`. `tokens.css` declara, por opción, variables (`--type-*`, `--r-*`, `--btn-*`, `--page-background`, `--nav-*`, `--hero-art*`, `--icon-*`). Los componentes solo leen variables: ninguno sabe qué opción hay.
- **Las variables se declaran en el propio selector de la opción.** Así una muestra con su propio atributo (las tarjetas de los ajustes) se pinta con la suya aunque el club tenga otra.
- **La forma (`data-shape`) sigue mandando** en móvil frente a escritorio: las esquinas y los botones se calculan sobre `--shape-*` (píldora o radio 8 en el sistema; redondeadas suma; rectas fija).
- **El motor de color** calcula la navegación del club y la oscura con contraste: texto de la barra como el de los botones del club, texto secundario a 4,5:1 y el elemento activo invertido (pastilla blanca o tinta con el texto en el color legible del club). En la oscura, el activo va en el color del club aclarado hasta 3:1. Lo prueba `clubTheme.test.ts` con once colores difíciles. El tinte de los neutros admite hasta 2.
- **Iconos.** El catálogo de la web (`ui/icons.tsx`) envuelve cada icono de Phosphor. Las pantallas siguen escribiendo `weight="duotone"` donde el icono decora y nada donde acompaña a un verbo; `IconStyleProvider` traduce los dos huecos al estilo del club, y el `IconContext` de Phosphor llega a los iconos del design system. Los pesos con significado (`fill`, `bold`) no se tocan.
- **Fuentes autoalojadas** con `@fontsource-variable`, como Geist. Solo declaran `@font-face`: el navegador baja una fuente cuando la pantalla la usa.

### Vista previa en directo

Lo que se elige en Identidad es un borrador en el contexto del club (`setDraft`). Mientras existe, toda la app se pinta y habla con él, solo para quien lo edita: la barra lateral, el fondo, la letra y los textos cambian al momento. Una barra fija dice que nadie más lo ve hasta guardar, con "Descartar" y "Guardar identidad". Al guardar, primero llega la marca nueva y luego se suelta el borrador, para que no parpadee la antigua. Al salir de la pestaña sin guardar, el club vuelve a verse como está guardado.

### La voz en toda la app

- **Capas de voz sobre el diccionario.** El diccionario de la web de siempre es la voz `cercana`, la de por defecto. `apps/web/src/messages/voices/{es,ca,en}.json` reescribe encima, para `profesional` y `vestuario`, los momentos de relación: saludo y portada del inicio, pantallas vacías, avisos tras guardar del día a día (lista pasada, deportista dado de alta, convocatoria, sesión cerrada), partidos, retos, agenda, secciones, entrenamiento y descripciones de pantalla.
- **Un `IntlProvider` anidado** dentro del espacio del club (`VoiceProvider`) mezcla el diccionario con la capa de la voz del club. Todo `useT` de dentro habla con ella sin tocar las pantallas. El árbol es siempre el mismo, también en `cercana`: cambiar de voz en la vista previa no desmonta lo que se edita.
- **Los momentos sensibles no tienen capa.** Dinero, salud, errores, accesos, bajas y datos personales suenan igual en todos los clubes (DESIGN.md 11). `messages.test.ts` lo vigila:
  - Solo se reescriben claves de los ámbitos de relación.
  - Nunca una clave de cuotas, pagos, salud, bienestar, errores, bajas o confirmaciones.
  - Cada texto existe en el diccionario y lleva los mismos argumentos ICU.
  - Las dos voces tienen las mismas claves en los tres idiomas y no llevan emojis.
- **El email de invitación** habla con la voz del club y lleva su lema. Restablecer la contraseña es sensible y suena igual en todos.

### Modelo

- `organizations` gana `style_typography`, `style_buttons`, `style_icons`, `style_background`, `style_hero`, `style_nav` y `style_corners` (texto con CHECK contra la lista y el valor de siempre por defecto) y `motto` (nulo o de 1 a 80 caracteres). Migración `20261023215308_club_style`.
- La marca pública (`GET /api/org/branding`) y la vista completa del club devuelven `style` y `motto`: el club se pinta entero antes del login.
- `PATCH /api/org` acepta `style` parcial (solo cambia lo que se manda) y `motto` (vacío es quitarlo). La auditoría apunta cada opción (`style.typography`, `style.nav`…).

## Consecuencias

- Un club puede tener una plataforma muy distinta a la de otro sin salirse del design system: 5 × 5 × 5 × 5 × 5 × 3 × 3 combinaciones visuales sobre sus colores, su escudo, su lema y su voz.
- Los clubes que ya existen no cambian: la migración pone los valores de siempre.
- La hoja de estilos crece con las `@font-face` de seis familias, pero un club solo descarga las que usa.
- Una pantalla nueva no tiene que hacer nada para seguir la identidad: con tokens, se adapta sola. Para que su texto tenga voz, se añaden sus claves a las capas de voz.
- Los textos de voz en catalán e inglés son borrador, como el resto de esos diccionarios (DESIGN.md 12).
- Fuera de un club (acceso general, negocio) manda la marca del producto: `applyProductColors` quita los atributos, el escudo y el icono del club.
- Pendiente: el modo oscuro por club y subir una fuente propia quedan fuera; el motor ya genera el oscuro, pero falta revisar las pantallas con él.
