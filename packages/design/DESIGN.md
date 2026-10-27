# Design System · [NOMBRE DEL PRODUCTO]

SaaS de gestión de clubes deportivos · Versión 1.4 · 23 de octubre de 2026

Este documento es la fuente de verdad del diseño. Todo lo que se construya en la app debe salir de aquí. Si algo no está definido, se pregunta antes de inventarlo.

---

## 0. Reglas de oro

1. **El club es el protagonista.** Dentro de la app de un club no aparece la marca del producto.
2. **Nunca un color a mano.** Todo color sale de un token o del motor del club. Nada de hex sueltos en componentes.
3. **Móvil primero.** Las familias y los entrenadores usan el móvil. El escritorio es para gestión.
4. **Todo lo que se toca mide al menos 48 px en móvil y 44 px en escritorio.**
5. **El color nunca va solo.** Todo estado lleva texto, y si cabe, icono.
6. **Una acción principal por pantalla.** En color del club.
7. **Las acciones delicadas se confirman siempre.** Las demás, nunca.
8. **Las cifras van en Geist Mono o con números tabulares.**
9. **Los botones dicen un verbo.** "Pagar", "Guardar asistencia". Nunca "Aceptar".
10. **Toda acción reconocible lleva su icono, y siempre el mismo.** Editar es una rueda dentada, eliminar un cubo de basura en rojo, añadir un más. El catálogo está en 8.1.
11. **La fila es el objeto.** Se abre tocándola en cualquier punto. Sus acciones son iconos silenciosos que no compiten con el contenido; en una fila nunca hay un botón con texto.
12. **Dos letras y una tecla.** Desde cualquier pantalla, ⌘K abre la paleta: una persona, un equipo, una pantalla o una acción sin pasar por menús.
13. **Cuidamos al menor.** Ningún chat privado entre adultos del club y jugadores menores. Las familias solo ven los datos de sus hijos.

---

## 1. Principios

**El club es el protagonista.** Cada club personaliza su app con su escudo, su color principal y su secundario, y elige cómo se ve y cómo habla su plataforma: letra, botones, iconos, fondo, portada, navegación, esquinas, lema y voz (sección 19). Siempre entre opciones del sistema: ninguna combinación rompe el contraste ni las medidas. El producto se reconoce por su comportamiento, no por su logo.

**Móvil primero, gestión en escritorio.** Hay dos contextos de uso con dos formas distintas (sección 6). La app de familias y entrenadores es redonda y envolvente. El panel de gestión es preciso y denso.

**Claridad antes que adorno.** Un padre en la grada, con una mano y al sol, tiene que entender la pantalla en dos segundos.

**Cada toque cuenta.** Un entrenador que pasa lista a catorce jugadores no debería confirmar nada. Equivocarse en lo cotidiano cuesta un toque. Equivocarse en lo delicado cuesta una confirmación.

**Cuidar al menor.** La protección de la infancia condiciona el chat, las gráficas y los datos que ve cada rol.

**El contenido manda; el cromo se aparta.** Lo que se mira (nombres, cifras, estados) tiene peso y color; lo que se hace (editar, quitar, abrir) espera en gris hasta que hace falta. Si al mirar una pantalla lo primero que se ve son botones, la pantalla está mal.

**Se usa, no se navega.** Quien gestiona 80 deportistas no debería recorrer tres menús para llegar a uno. La paleta (⌘K), las filas que se abren y los tableros que se leen de un vistazo convierten la gestión en gestos, no en rutas.

---

## 2. Arquitectura del tema

El tema se construye en cuatro capas que se aplican en el elemento raíz.

| Capa | Qué define | Dónde vive |
| --- | --- | --- |
| Base | Tipografía, estados del sistema, medidas, neutros de respaldo | `src/theme/tokens.css`, `tokens/tokens.json` |
| Club | Color principal y secundario, escala, neutros teñidos, portada, iconos | `src/theme/clubTheme.ts` (en tiempo de ejecución) |
| Modo | Claro (por defecto) u oscuro (opcional, lo elige el usuario) | `data-theme="light"` o `"dark"` |
| Forma | Envolvente (app móvil) o Precisa (gestión en escritorio) | `data-shape="envolvente"` o `"precisa"` |
| Identidad | Letra, botones, iconos, fondo, portada, navegación y esquinas del club (sección 19) | `data-type`, `data-buttons`, `data-icons`, `data-bg`, `data-hero`, `data-nav`, `data-corners` |

```html
<html data-theme="light" data-shape="envolvente">
```

**Marca del producto.** Solo existe fuera de un club: acceso, alta del club, facturación del SaaS y web pública. Usa el cobalto `#2F5BFF` (`bg-brand`). Dentro de la app de un club, nunca.

---

## 3. Color

### 3.1 Motor de color del club

Cada club introduce dos colores: **principal** y **secundario**. El motor (`buildClubTheme`) genera todo lo demás y garantiza el contraste. Nadie elige tonos a mano.

**Cómo funciona.** Convierte el principal a OKLCH y genera una escala de 11 tonos (50 a 950) con luminosidad fija y croma proporcional al del club. Si un tono se sale de la gama sRGB, reduce croma hasta que entra.

| Tono | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luminosidad OKLCH | 0,975 | 0,94 | 0,88 | 0,80 | 0,71 | 0,62 | 0,53 | 0,45 | 0,37 | 0,29 | 0,21 |
| Factor de croma | 0,10 | 0,22 | 0,45 | 0,70 | 0,88 | 1 | 1 | 0,92 | 0,80 | 0,66 | 0,52 |

**Roles que genera.**

| Variable CSS | Clase Tailwind | Uso | Garantía |
| --- | --- | --- | --- |
| `--club-fill` | `bg-club` | Botón principal, escudo, portada, selección | Color exacto del club (en oscuro se aclara si no llega a 3:1) |
| `--club-on-fill` | `text-on-club` | Texto e iconos sobre el relleno | Blanco o tinta, el de más contraste |
| `--club-edge` | `border-club-edge` | Borde del relleno cuando el club es casi blanco | Visible sobre blanco |
| `--club-text` | `text-club-text` | Enlaces, cifras destacadas, pestaña activa | 4,5:1 sobre la superficie |
| `--club-soft` | `bg-club-soft` | Fondos de selección y etiquetas del club | Tono 100 |
| `--club-soft-text` | `text-club-soft-text` | Texto sobre `club-soft` | 4,5:1 |
| `--club-deep` | `bg-club-deep` | Fondos profundos, portada en modo oscuro | Tono 900 |
| `--club-second` | `bg-club-second` | Secundario: franja y aro del escudo | Ver 3.3 |
| `--icon-duo` | — | Relleno duotono de iconos | `club-text` al 16 % (20 % en oscuro) |
| `--icon-duo-active` | — | Relleno del icono activo | 28 % (32 % en oscuro) |
| `--club-50` … `--club-950` | — | Escala completa, para gráficas o casos especiales | — |

Probado con verde, granate, amarillo, marino, blanco, negro, celeste y naranja, en claro y en oscuro: todos los pares de texto cumplen 4,5:1.

### 3.2 Cuando el principal es blanco

Muchos clubes son blancos. Si el principal es casi blanco (croma OKLCH menor de 0,03 y luminosidad mayor de 0,8), **el secundario toma las acciones** y el blanco pasa a la franja. El motor lo hace solo y devuelve `swapped: true`.

### 3.3 El color secundario

Solo decora la identidad:

- La franja de 6 px bajo la portada.
- El aro del escudo.

Nunca se usa en botones ni en texto, salvo en el caso de 3.2. Motivo: las acciones tienen que estar siempre en el mismo color para que se encuentren sin pensar.

### 3.4 Neutros

Los neutros se tiñen ligeramente con el matiz del club (intensidad 0,6). Así toda la app respira el club sin gritar. El fondo del club (sección 19) cambia la intensidad: 0 en "Neutro" (grises puros) y 1,25 en "Teñido". El texto secundario cumple 4,5:1 con cualquiera.

| Variable | Clase | Uso |
| --- | --- | --- |
| `--surface-page` | `bg-page` | Fondo de la página |
| `--surface` | `bg-surface` | Tarjetas, paneles, tablas |
| `--surface-raised` | `bg-raised` | Avatares, controles segmentados, chips neutros |
| `--border` | `border-border` | Bordes de tarjetas y campos |
| `--line` | `border-line` | Separadores finos |
| `--control-border` | `border-control` | Borde de botones secundarios y campos |
| `--text` | `text-ink` | Texto principal (`#0B0D12` en claro) |
| `--text-muted` | `text-muted` | Texto secundario. Cumple 4,5:1 sobre página y superficie |

### 3.5 Estados del sistema

Son iguales en todos los clubes y nunca dependen de su color. Siempre con texto.

| Estado | Fondo · texto (claro) | Fondo · texto (oscuro) | Clases | Uso |
| --- | --- | --- | --- | --- |
| Éxito | `#E6F4EC` · `#116A3E` | `#123524` · `#7FD8A8` | `bg-success-soft text-success` | Pagado, al día, documento válido |
| Aviso | `#FFF1DB` · `#8A4B00` | `#3A2A12` · `#F5C26B` | `bg-warning-soft text-warning` | Pendiente, caduca pronto, duda |
| Peligro | `#FDECEC` · `#B4232A` | `#3B1416` · `#FF9A9F` | `bg-danger-soft text-danger` | Falta, pago rechazado, error |
| Información | `#EEF2FF` · `#2448D8` | `#18224A` · `#9DB2FF` | `bg-info-soft text-info` | Programado, novedades |
| Neutro | `#EEF0F3` · `#5B6271` | `#22252B` · `#A3AAB5` | `bg-neutral-soft text-neutral` | Baja temporal, inactivo |

Rojo sólido para el botón de confirmar acciones delicadas: `#B4232A` en claro y `#C9343B` en oscuro, con texto blanco.

**Club frente a sistema.** "Confirmado" o "Convocado" son estados del club y van en su color. "Pagado" o "Pendiente" son del sistema. En un club verde los dos verdes se parecen: por eso siempre llevan texto.

### 3.6 Modo oscuro

Es opcional y lo elige cada usuario. El motor genera neutros oscuros teñidos, aclara el color del club si no llega a 3:1 sobre la superficie y pasa la portada a `club-deep`. No hay que diseñar nada aparte: si un componente usa tokens, funciona en oscuro.

### 3.7 Avisos al configurar los colores

El alta es autosuficiente: el club elige sus colores sin ayuda. El motor devuelve `warnings` para mostrárselos con vista previa en directo:

- El principal es casi blanco y el secundario tomará las acciones.
- El secundario apenas se distingue del principal: la franja no se verá.
- En modo oscuro el color se aclarará para que los botones se vean.

---

## 4. Tipografía

Por defecto, una sola familia: **Geist** para todo y **Geist Mono** para cifras. Cada club puede elegir otra pareja de títulos y texto (sección 19); la escala, los tamaños y las cifras en Geist Mono no cambian. Todas con licencia abierta y autoalojadas. Texto base de 16 px.

| Estilo | Móvil | Escritorio (≥ 1024 px) | Clase Tailwind | Uso |
| --- | --- | --- | --- | --- |
| Display | 28/34 · 600 · −0,035em | 40/44 · 600 · −0,04em | `text-display lg:text-display-lg` | Nombre del club en portada |
| Título 1 | 22/28 · 600 · −0,025em | 28/34 · 600 · −0,03em | `text-title1 lg:text-title1-lg` | Título de pantalla |
| Título 2 | 18/24 · 600 · −0,01em | 20/28 · 600 · −0,02em | `text-title2 lg:text-title2-lg` | Título de tarjeta o sección |
| Cuerpo | 16/24 · 400 | 16/24 · 400 | `text-body` | Texto de lectura, botones |
| Secundario | 14/20 · 400 | 14/20 · 400 | `text-secondary` | Metadatos, ayudas |
| Etiqueta | 12/16 · 500 | 12/16 · 500 | `text-label` | Barra inferior, cabeceras de tabla |
| Cifras | Geist Mono 16/24 · 500 | Igual | `font-mono` | Importes, tiempos, dorsales, porcentajes |

Reglas:

- Nada por debajo de 12 px. Texto que se lee, nunca por debajo de 14 px.
- Las cifras siempre en Geist Mono o con `tabular-nums`, alineadas a la derecha en tablas.
- Sin mayúsculas sostenidas, salvo las etiquetas de sección del contexto Precisa.
- La paleta y la escala de texto por defecto de Tailwind están desactivadas: solo existen las del sistema.

---

## 5. Espaciado y medidas

Rejilla de 4 px. Se usa la escala por defecto de Tailwind, que ya es múltiplo de 4.

| Medida | Valor | Clase |
| --- | --- | --- |
| Margen de pantalla móvil | 20 px | `px-5` |
| Margen de pantalla escritorio | 32 px | `px-8` |
| Separación entre bloques | 16–24 px | `gap-4`, `gap-6` |
| Zona táctil mínima | 48 px móvil, 44 px escritorio | `h-(--h-control)` |
| Botón | 48 px móvil, 44 px escritorio | `h-(--h-control)` |
| Acción fija inferior | 52 px | `h-13` |
| Fila de lista | 64 px móvil, 52 px tabla | `min-h-16`, `min-h-13` |
| Barra inferior | 64 px | `h-16` |
| Botón del control segmentado | 44 px (grupo de 48 px) | `h-11` |
| Franja de portada | 6 px | `h-1.5` |

---

## 6. Forma

Dos contextos, dos formas. La forma se decide por **contexto de uso**, no solo por el ancho de pantalla.

| | Envolvente | Precisa |
| --- | --- | --- |
| Dónde | App de familias y entrenadores, móvil y tableta | Panel de gestión en escritorio: coordinación y administración |
| Atributo | `data-shape="envolvente"` | `data-shape="precisa"` |
| Tarjeta | radio 24 px, sombra suave | radio 10 px, sin sombra, borde fino |
| Botón | píldora (999 px), 48 px | radio 8 px, 44 px |
| Campo | radio 16 px, 48 px | radio 8 px, 44 px |
| Etiqueta | píldora | radio 6 px |
| Fila | cápsula con sombra | fila de tabla con línea fina |
| Panel inferior | radio 28 px arriba | diálogo centrado, radio 12 px |
| Portada | esquinas inferiores de 32 px | radio 16 px dentro del contenido |
| Barra inferior | flotante, radio 28 px | no existe: navegación lateral |

Clases: `rounded-card`, `rounded-control`, `rounded-field`, `rounded-chip`, `rounded-row`, `rounded-sheet`, `rounded-tabbar`, `shadow-card`, `shadow-row`, `shadow-float`. Cambian solas según `data-shape` y según los botones y las esquinas que elige el club (sección 19): la forma pone la base (`--shape-*`) y el club la ajusta. La altura de botones y campos nunca cambia.

**Disciplina con la píldora.** Si todo es píldora, la app se vuelve infantil. Píldora solo en botones, etiquetas, controles segmentados, filas de lista y barra inferior. Tarjetas y campos, nunca.

---

## 7. Portada del club

Es el patrón donde el club manda. Componente: `ClubHero`.

**Anatomía.** Fondo en color principal (`bg-hero`), escudo de 48 px (72 px en escritorio) con aro de 2 px del secundario, nombre del club en Display, el lema del club si tiene, una línea de equipo y temporada, una línea de contexto (próximo partido), hasta dos acciones y franja de 6 px del secundario abajo.

**Estilo de portada.** El club elige una capa decorativa detrás del contenido (`.club-hero-art`): lisa, degradado (un velo hacia el color que más contraste da al texto, `--hero-shade`), rayas verticales del secundario que se desvanecen hacia el texto, banda diagonal del secundario o el escudo en grande de fondo. El texto nunca va sobre la parte más cargada.

**Dónde va.** En el inicio del club y en la vista de familia. No se repite en pantallas internas.

**Acciones dentro de la portada.** Principal: fondo `hero-btn` y texto `hero-btn-ink`. Secundaria: borde `hero-ghost`. Los calcula el motor para cualquier color de club.

---

## 8. Iconografía

- **Estilo:** duotono de club por defecto. Trazo neutro y relleno suave con el color del club (`--icon-duo`). Cada club puede elegir línea, fina, gruesa o relleno (sección 19); las pantallas siguen escribiendo `weight="duotone"` donde el icono decora y nada donde acompaña a un verbo, y el catálogo de la web lo traduce.
- **Librería base:** Phosphor (licencia MIT), peso duotone. Hay que configurar el color de la capa de relleno a `var(--icon-duo)`. Verificad la propiedad exacta en la versión de la librería que instaléis.
- **Iconos de deporte propios:** en `icons/sport/` (balón, silbato, cronómetro, trofeo, camiseta, pista, pesa, prueba física). Rejilla de 24 px, trazo de 1,75. Si hace falta uno nuevo, se dibuja en la misma rejilla.
- **Tamaños:** 16 px en línea, 22 px por defecto, 26 px en listas, 36 px en estados vacíos.
- **Estado activo en la barra inferior:** relleno `--icon-duo-active`, color `club-text` y una píldora `bg-club-soft` detrás del icono.
- **Botones solo con icono:** siempre con `aria-label`. Iconos decorativos con `aria-hidden="true"`.
- **Nunca emojis.**
- **Clubes con colores muy claros** (amarillo, celeste): el motor usa el tono legible del club para el relleno, así el duotono se sigue viendo.

### 8.1 Iconos de acción

Un botón se reconoce antes de leerse. Por eso **toda acción que tenga icono en este catálogo lo lleva**, junto al verbo, y **la misma acción se ve igual en toda la app**: en la cabecera de la pantalla, en la fila de una tabla, en el pie de un panel y en el botón de confirmar. Un icono no sustituye al verbo: el texto sigue siendo obligatorio (regla de oro 9).

| Acción | Verbos | Icono Phosphor | `action` |
| --- | --- | --- | --- |
| Añadir | Añadir, Nuevo, Crear, Dar de alta | `Plus` | `add` |
| Añadir a alguien | Añadir al cuerpo técnico, Añadir al grupo | `UserPlus` | `addPerson` |
| Invitar | Invitar, Invitar familia | `UserPlus` | `invite` |
| Editar | Editar, Renombrar, Fijar horario, Roles | `Gear` (rueda dentada) | `edit` |
| Eliminar | Eliminar, Quitar, Borrar, Revocar, Retirar | `Trash`, siempre en rojo | `delete` |
| Dar de baja | Dar de baja (reversible) | `UserMinus` | `deactivate` |
| Archivar | Archivar (reversible) | `Archive` | `archive` |
| Recuperar | Recuperar, Restaurar, Reactivar | `ArrowCounterClockwise` | `restore` |
| Guardar | Guardar, Guardar horario | `FloppyDisk` | `save` |
| Enviar | Enviar invitación, Reenviar, Enviar enlace | `PaperPlaneTilt` | `send` |
| Copiar | Copiar enlace | `Copy` | `copy` |
| Vincular | Vincular miembro | `LinkSimple` | `link` |
| Desvincular | Desvincular | `LinkBreak` | `unlink` |
| Cobrar | Pagar, Cobrar, Registrar pago | `Coins` | `pay` |
| Aprobar | Aprobar, Validar | `ThumbsUp` | `approve` |
| Rechazar | Rechazar | `ThumbsDown` | `reject` |
| Activar | Activar | `Play` | `activate` |
| Terminar | Cerrar reto, cerrar temporada | `FlagCheckered` | `finish` |
| Suspender | Suspender, Anular (reversible) | `Prohibit` | `suspend` |
| Foto | Cambiar foto, Hacer foto | `Camera` | `photo` |
| Subir | Subir logo, Subir archivo | `UploadSimple` | `upload` |
| Mostrar | Ver archivadas | `Eye` | `show` |
| Ocultar | Ocultar archivadas | `EyeSlash` | `hide` |
| Volver | Volver, Volver a instalaciones | `ArrowLeft` | `back` |
| Abrir | Abrir, Ver, Ir, Entrar en un club | `ArrowRight`, detrás del verbo | `open` |
| Entrar | Iniciar sesión, Entrar, Unirme | `SignIn` | `signIn` |
| Salir | Cerrar sesión | `SignOut` | `signOut` |
| Proponer | Proponer con IA, Proponer la semana | `Sparkle` | `propose` |
| Votar | Votar, Quitar mi voto (una mejora de la hoja de ruta) | `ArrowFatUp` | `vote` |

Reglas:

- **El icono va delante del verbo**, a 18 px (16 px en el botón compacto de 40 px). Solo `open` lo lleva detrás: la flecha señala hacia dónde se va.
- **En una fila, solo el icono y sin borde.** Las acciones de fila (tablas, listas, tarjetas de un tablero, filas de un formulario) son botones `ghost` cuadrados y solo con icono: gris en reposo, con fondo al pasar el ratón, rojo (`ghost-danger`) si eliminan. Nunca "Editar" y "Quitar" escritos nueve veces, nunca nueve bordes. El verbo sigue existiendo como nombre accesible y como `title`, así el lector de pantalla y el tooltip dicen lo mismo que antes. Cabeceras de pantalla y de tarjeta, pies de panel y portada llevan icono y verbo: ahí hay sitio y el verbo da el contexto.
- **El icono hereda el color del botón.** Eliminar, quitar y archivar van en la variante `danger` (o `danger-solid` en la confirmación), y así el cubo de basura sale en rojo sin configurar nada. Un botón que solo lleva el icono de eliminar (franja de un horario) lleva `text-danger`.
- **Cancelar y Cerrar no llevan icono.** Son la salida de un panel o un diálogo, no una acción, y la X ya está en la cabecera del panel. Tampoco llevan icono los botones de fecha ("Hoy", semana anterior y siguiente) ni los atajos de un formulario ("De lunes a viernes").
- **El icono de una acción es decorativo** (`aria-hidden="true"`): el verbo ya dice qué hace. Un botón solo con icono sigue llevando `aria-label`.
- **Un icono, un significado.** Como la rueda dentada es editar, el destino "Ajustes" de la navegación usa `SlidersHorizontal`.
- **Si una acción nueva se repite** en dos pantallas, entra en el catálogo (`src/icons/actions.tsx`) y en esta tabla. No se elige un icono suelto en una pantalla. Una acción propia de una sola pantalla ("Pasar lista", "Gestionar accesos") puede llevar un icono propio por `icon`, siempre el mismo si se repite.

---

## 9. Componentes

Referencia de implementación en `src/components/`. Los que no tienen código aún siguen esta especificación.

### 9.1 Botón · `Button`

| Variante | Aspecto | Uso |
| --- | --- | --- |
| `primary` | `bg-club text-on-club` | La acción principal. Una por pantalla |
| `secondary` | `bg-surface border-control text-ink` | Alternativas |
| `tertiary` | Solo texto `text-club-text` | Acciones de poco peso |
| `danger` | `border-danger-border text-danger` | Primer paso de una acción delicada |
| `danger-solid` | `bg-danger-solid text-white` | Solo dentro de la confirmación |
| `ghost` | Sin borde ni fondo; `text-muted`, `bg-raised` al pasar | Acciones de fila, siempre solo con icono |
| `ghost-danger` | Sin borde; `text-danger`, `bg-danger-soft` al pasar | Eliminar en una fila |

Deshabilitado: `bg-raised text-muted`. El texto es siempre un verbo.

Props: `action` pone el icono del catálogo (8.1) y es obligatoria cuando la acción está en él; `icon` admite un icono propio para una acción que no está; `size="sm"` es el botón compacto de 40 px para filas de tabla y cabeceras de tarjeta; `iconOnly` deja solo el icono en las acciones de fila, con el verbo como nombre accesible y `title`; `cta` es la acción fija inferior (9.2). `buttonClassName` y `ButtonContent` sirven para dar aspecto de botón a un enlace sin duplicar estilos.

```tsx
<Button action="add">Añadir jugador</Button>
<Button action="edit" variant="secondary" size="sm">Editar</Button>
<Button action="delete" variant="danger" size="sm">Quitar</Button>
<Button action="delete" variant="ghost-danger" size="sm" iconOnly>Quitar</Button> // en una fila
```

En una lista no se escriben los botones a mano: `DataList` recibe `rowActions` (verbo, acción del catálogo y tono) y los pinta como toca en cada forma (9.8).

### 9.2 Acción fija inferior

Botón a todo el ancho, 52 px, pegado abajo con 12 px por encima y 24 px por debajo. En Envolvente lleva sombra flotante. Ejemplo: "Guardar asistencia".

### 9.3 Asistencia · `AttendanceToggle`

Dos botones: **Presente** y **Falta**, dentro de un grupo `bg-raised`. Presente seleccionado: `bg-club text-on-club`. Falta seleccionada: `bg-surface text-danger` con sombra. La falta se reconoce por posición, texto y color.

Marcar asistencia **no pide confirmación**. Al guardar, aviso tras la acción (9.13).

### 9.4 Campos de texto

Etiqueta arriba (14 px, 500), campo de 48 px (44 en escritorio), ayuda debajo (14 px, `text-muted`).

- Foco: borde de 2 px `club-fill` y halo de 4 px `club-soft`.
- Error: borde de 2 px `danger`, mensaje con icono debajo, en lenguaje llano y diciendo qué hacer. `aria-invalid` y `aria-describedby`.
- Importes: unidad incorporada a la derecha (`€`) y cifra en Geist Mono.
- Nunca el placeholder como etiqueta.

### 9.5 Etiquetas de estado · `StatusChip`

Tipos `club`, `success`, `warning`, `danger`, `info`, `neutral`. Siempre con texto. Píldora en Envolvente, radio 6 en Precisa.

### 9.6 Filtros

Botones de 44 px con `aria-pressed`. Seleccionado: `bg-ink text-white`. Sin seleccionar: `bg-surface border-control`.

### 9.7 Filas y listas (móvil)

Fila cápsula de 64 px: avatar de 40 px, nombre (16 px, 500), dato secundario (14 px), estado y chevron a la derecha. Separación de 10 px entre filas. Mensajes no leídos: punto de 8 px en `club-fill`.

- **La fila entera se toca** y abre la ficha; el chevron `CaretRight` de 16 px lo anuncia. El nombre sigue siendo un enlace para el teclado y el lector de pantalla.
- **Una acción, un icono; varias, un menú "⋯".** Nunca una segunda línea de botones debajo de la fila.
- Las acciones a medida con verbo visible (un "Continuar" en un partido en directo) son la excepción y van solas.

### 9.8 Gestión en escritorio

- **Pestañas:** subrayado de 2 px en `club-fill` y recuento en Geist Mono.
- **Barra de filtros:** búsqueda (280 px), desplegables con etiqueta incluida ("Equipo: Todos"), y a la derecha "Exportar" (secundario) y la acción principal.
- **Tabla:** filas de 52 px, línea fina `line`, cabecera de 44 px en `text-label`. Casilla de selección a la izquierda. Cifras alineadas a la derecha en Geist Mono. **La fila se abre tocándola** (`href`), con fondo `page` al pasar el ratón y un chevron al final si no tiene acciones. **Acciones de fila** (`rowActions`): iconos `ghost` solo con icono (8.1), rueda dentada para editar, cubo rojo para quitar, estrella para hacer actual; el verbo en el nombre accesible y el `title`; con más de tres, menú. Nunca un botón "Abrir": abrir es tocar la fila. Fila seleccionada con fondo `club-soft`. Tablas anchas con desplazamiento horizontal dentro de su caja.
- **Paginación:** texto de rango a la izquierda ("1–6 de 128") y botones anterior y siguiente.

### 9.9 Tarjeta de evento

Etiqueta del tipo de evento (`club`), fecha a la derecha, título (18 px, 600) con hora y rival, lugar, y si toca, pregunta de asistencia con dos botones a partes iguales ("Sí, viene" / "No puede").

### 9.10 Barra inferior

Flotante, 64 px, radio 28 px, margen de 16 px y sombra `float`. Máximo cinco destinos: Inicio, Calendario, Equipo, Mensajes, Perfil. Icono de 22 px con etiqueta de 12 px. El contenido de la pantalla deja 96 px libres abajo para que la barra no lo tape.

### 9.11 Cabecera de pantalla · `PageHeader`

Enlace de vuelta discreto (`BackLink`: flecha de 16 px y texto secundario en `text-muted`, dentro de la cabecera, nunca un botón flotando encima), línea de contexto, título (Título 1) con sus etiquetas, descripción de una frase y las acciones a la derecha: una principal en color del club y las demás secundarias. En móvil, fondo `surface` y línea inferior.

### 9.12 Confirmación · `ConfirmDialog`

Se usa **siempre** para acciones delicadas:

- Dar de baja a un miembro.
- Borrar cualquier cosa.
- Cobrar o cambiar una cuota.
- Enviar un comunicado a todas las familias.

No se usa para marcar asistencia, confirmar un partido ni guardar cambios normales: si todo pide confirmación, la gente deja de leerlas.

Texto: el título es la pregunta con el nombre, el cuerpo explica qué pasará y si se puede deshacer, y el botón repite el verbo y el icono de la acción (`confirmAction`): "Quitar" con el cubo de basura, "Archivar" con la caja. "Cancelar" va sin icono. En móvil es un panel inferior; en escritorio, un diálogo centrado.

### 9.13 Aviso tras una acción

Píldora oscura (`bg-ink text-white`), 56 px, abajo, 4 segundos, `role="status"`. Puede llevar una acción ("Deshacer") cuando la acción no es delicada.

### 9.14 Selector de fecha y hora

Panel inferior. Semana en tira de siete días con flechas, hoy marcado con borde, día elegido en `club-fill`. Horas como botones de media en media hora en Geist Mono (supuesto: los entrenos empiezan en punto o y media; si un club necesita otra hora, opción "Otra hora"). Duración como control segmentado. Interruptor "Repetir cada semana" (`role="switch"`). Acción fija "Guardar entreno".

### 9.15 Subida de documentos

Lista por jugador: DNI o NIE, ficha federativa, certificado médico, autorización de imagen. Cada fila con su estado: al día (éxito), caduca pronto (aviso, con días restantes), pendiente (botón "Subir").

Zona de subida con borde discontinuo: "Haz una foto o elige un archivo", formatos y tamaño máximo, y dos botones: "Hacer foto" (principal) y "Elegir archivo". Progreso en fila cápsula con porcentaje y botón de cancelar.

### 9.16 Chat

- **Canales de equipo** con las familias. La coordinación del club está incluida.
- **Conversaciones 1:1** solo entre la familia (tutor legal) y el entrenador. Nunca con el jugador menor.
- Todas las conversaciones son **visibles para la coordinación** y lo dicen con un aviso fijo arriba (texto `chat.visibility`).
- Acceso directo al **delegado de protección** del club desde el aviso.
- Mensajes propios a la derecha en `club-fill`. Del resto, a la izquierda en `surface`, con nombre y rol ("Entrenador").
- Confirmación de lectura en Geist Mono ("leído por 12").

Contexto legal: la Ley Orgánica 8/2021, de 4 de junio (LOPIVI), artículo 48, obliga a las entidades que realizan actividades deportivas con menores de forma habitual a designar un delegado o delegada de protección. Validad con asesoría legal cómo encaja el chat en el protocolo de cada club.

### 9.17 Paleta de mandos · `CommandPalette`

"Buscar o hacer". Se abre con ⌘K (Ctrl K fuera de Mac), con el campo de la barra lateral en escritorio o con la lupa de la cabecera en móvil. Es la forma rápida de usar el club; la navegación queda para descubrir.

- **Qué encuentra:** deportistas, equipos, secciones, personal, socios, instalaciones y, para una familia, sus hijos; las pantallas a las que esa persona tiene acceso; y las acciones directas ("Nuevo deportista", "Invitar a alguien", "Nueva temporada"), solo las que sus permisos permiten.
- **Cómo busca:** sin acentos ni mayúsculas ("pivot" encuentra "Pívot"); cada palabra tiene que aparecer; manda el principio del nombre, luego el principio de una palabra, luego cualquier parte, y por último el subtítulo. Seis resultados por grupo.
- **Vacía** muestra los recientes de esa persona en ese club (seis, en el navegador), las acciones y las pantallas.
- **Teclado:** flechas para moverse, retorno para abrir, escape para cerrar. El pie lo recuerda en escritorio con teclas `kbd`.
- **Aspecto:** diálogo de 36 rem como máximo a un 12 % de la parte superior en escritorio (6 % en móvil), campo de 56 px sin borde, grupos en `text-label`, resultado activo en `club-soft`. `role="combobox"` en el campo y `role="listbox"` con `aria-activedescendant`.

### 9.18 Tablero de plantilla · `RosterBoard`

La plantilla de un equipo como la piensa su entrenador: **por posición y con el dorsal a la vista**, no como una tabla. Las posiciones siguen el orden del deporte (portero, cierre, ala, pívot); las que el club haya escrito a su manera van después, por orden alfabético, y "Sin posición" al final.

- Ficha de 72 px: foto o iniciales de 56 px con el dorsal en una insignia `bg-club` de 24 px en Geist Mono, nombre (16 px, 500), edad y familia en secundario, y etiqueta de estado si no está activo.
- La ficha entera se toca y abre al jugador. Editar y quitar son `ghost` solo con icono que aparecen al pasar el ratón; en pantallas táctiles están siempre.
- Dos o tres columnas en escritorio, una en móvil. Un control segmentado (9.3) alterna **Tablero** y **Lista**; la elección se recuerda en el navegador. Tablero por defecto.

### 9.19 Consola del partido · `MatchLivePage`

La única pantalla a pantalla completa del producto: en la banda el partido está vivo y cada toque cuenta. Se pinta sobre toda la ventana, sin navegación del club, y se sale con la flecha de volver de la franja del partido.

- **Tres zonas, y solo tres.** La franja oscura de arriba (`bg-club-deep`) es **el partido**: marcador, faltas, cronómetro y periodo, deshacer y el menú "⋯" (convocatoria, ajustes, estadísticas, pantalla completa, acabar o reabrir). La tarjeta grande es **nuestro equipo**: la pista con el sistema de juego, el banquillo al lado y la bandeja de acciones debajo. La columna de la derecha es **el rival** (nombre y acciones) y, debajo, **las últimas acciones**. Cada tarjeta lleva su etiqueta en `text-label` mayúsculas; nada del rival se mezcla con lo nuestro.
- **Un toque, una acción.** Tocar a alguien de la pista abre su bandeja, que está siempre en el mismo sitio y con la misma altura mínima; la persona se queda seleccionada para encadenar. Sin nadie seleccionado, la bandeja se parte en dos mitades: las acciones del equipo (tiempo muerto, saques) y las del partido (partido parado, decisión arbitral), con todo el catálogo a la vista y las rápidas primero. Las del rival están siempre a la vista, enteras; el registro de últimas acciones es pequeño y queda debajo. "Más acciones" solo existe en la bandeja del jugador. Los botones de acción llevan el color de su categoría (favorable, pérdida, neutra) y siempre texto.
- **La zona, sobre la pista.** Una acción que pide zona divide la mitad de ataque en nueve y oscurece la propia: un toque donde ha sido. "Registrar sin zona" y "Cancelar" esperan en la bandeja.
- **Arrastrar y soltar como atajo, nunca como única vía.** Del banquillo a un hueco (entra), del banquillo sobre alguien de la pista (cambio), de la pista a la pista (posiciones). Todo se puede hacer también en dos toques, que es la vía del teclado y del lector de pantalla. Eventos de puntero (`apps/web/src/lib/drag.ts`), un fantasma que sigue al dedo y el destino resaltado con un aro blanco.
- **La orientación decide la forma.** Apaisado (escritorio, tableta o móvil girado): rejilla de dos columnas sin desplazamiento de página, pista y banquillo lado a lado. Vertical: una sola columna que se desplaza, el banquillo bajo la pista y, en un móvil, un aviso de una línea para girarlo con el botón de pantalla completa. Con poca altura (`compact`: apaisado y menos de 520 px) franja, piezas y botones se encogen.
- **Piezas.** Dorsal en círculo `bg-club` (tinta con aro blanco para el portero), nombre de pila y minutos en Geist Mono. Seleccionada: `bg-surface` con aro del club. En la pista, sobre `bg-black/35`; en el banquillo, sobre `bg-page` con borde.
- **Convocatoria.** Tocar la fila decide quién sale de inicio; "Portero" es un botón de alternar (9.6), en tinta y con check cuando está marcado, nunca en el color del club, que es el de "Guardar convocatoria". Puede haber varios porteros convocados, pero en pista solo uno: marcar a un titular desmarca a los demás titulares, y el aviso dice cuántos hay cuando sobran.

### 9.20 Recorrido guiado · `Tour`

Enseña una pantalla de verdad paso a paso (ADR 0059): la pantalla en sombra y, a la luz, lo que se explica, con una tarjeta al lado. Hoy, la puesta en marcha de un club por estrenar. No sustituye a una pantalla vacía bien explicada: se usa para enseñar dónde está todo, una vez.

- **Sombra:** la del fondo de los diálogos, algo más densa (60 %). El hueco iluminado lleva 6 px de aire y el radio de las tarjetas, y sigue a su elemento si la pantalla se mueve. Sin elemento, o si no está en pantalla, todo en sombra y la tarjeta al centro.
- **Tarjeta:** `bg-surface rounded-card shadow-float`, 360 px como mucho. Arriba "Paso n de N" en `text-label` y `text-club-text`; el título en `text-title2`; el cuerpo en `text-body text-muted`, dos o tres frases que dicen para qué sirve, no cómo se usa. Va debajo de lo iluminado si cabe, si no encima, si no a su derecha (la barra lateral) y, si nada cabe, abajo. Lo iluminado se desplaza para dejarle sitio, nunca por debajo de la cabecera fija del móvil.
- **Botones:** "Saltar" (`tertiary`; "Cerrar" en el último paso), "Volver" (`back`) desde el segundo y "Seguir" (`open`). El último paso acaba en una acción real: su botón principal es el verbo y el icono de esa acción ("Subir logo" con `upload`).
- **Teclado y lectores:** `<dialog>` modal nativo: el resto de la página queda inerte, el foco va al botón principal y ESC cierra. Las flechas pasan de paso. El título y el cuerpo dan nombre y descripción al diálogo.
- **Movimiento:** el hueco va de un paso a otro en 250 ms; con movimiento reducido, salta sin animar y el desplazamiento es instantáneo.
- **Marcas:** lo que se ilumina lleva `data-tour` (`setup`, `setup-<paso>`, `settings-tabs`, `nav`, `palette`). Si hay varios, se ilumina el primero que se ve: la navegación del escritorio o la del móvil.

---

## 10. Gráficas de rendimiento

| Quién | Gráfica | Qué responde |
| --- | --- | --- |
| Familias | **Evolución** (líneas) | ¿Mi hijo mejora? Lo compara consigo mismo |
| Entrenadores | **Comparativa** (barras de percentil frente a la mediana) | ¿Dónde está cada jugador dentro del equipo? |

Reglas:

- **Las familias solo ven la evolución de su hijo.** Nunca comparativas con el equipo ni datos de otros menores.
- En pruebas de tiempo (menos es mejor) se invierte el eje: **arriba siempre es mejor**, y se indica en la leyenda.
- Línea del jugador: `club-fill`, 2,5 px, área con relleno suave. Referencia del equipo: discontinua `chart-reference`.
- Por debajo de la mediana: **gris, nunca rojo.** Son niños.
- Cifra principal arriba, en Geist Mono, con la variación en etiqueta de éxito.
- Cada gráfica lleva un `aria-label` que resume los datos en una frase.
- **Prohibido el radar:** el área engaña y la forma cambia según el orden de los ejes.

---

## 11. Voz y tono

Cada club elige su voz en la configuración (Ajustes, Identidad). Los textos del design system están en `src/i18n/*.json`; los de la web, en `apps/web/src/messages`: el diccionario es la voz `cercana` y `messages/voices/*.json` reescribe encima, para `profesional` y `vestuario`, los momentos de relación de toda la app (saludos, pantallas vacías, avisos tras guardar, partidos, retos, agenda). La invitación por email también habla con la voz del club.

| Voz | Así suena | Para quién encaja |
| --- | --- | --- |
| `cercana` | Una buena coordinadora de club: cálida, clara, explica el porqué | Clubes de base, escuelas |
| `profesional` | Un banco moderno: el dato primero, cero adornos | Clubes grandes, gimnasios |
| `vestuario` | Un entrenador motivador: energía y jerga de juego | Clubes de competición, crossfit |

**La voz del club no llega a los momentos sensibles.** Con `lockSensitive` activado (por defecto y recomendado), dinero, errores, datos personales, protección del menor y bajas usan siempre la voz profesional. Si un club lo desactiva, usan su voz, salvo `vestuario`, que pasa a `cercana`: nunca hay bromas cuando falla un pago. En la web, esas claves no tienen capa de voz y una prueba lo vigila (cuotas, pagos, salud, bienestar, errores, bajas, confirmaciones).

| Momento | Tipo | Cercana | Profesional | Vestuario |
| --- | --- | --- | --- | --- |
| Convocatoria | Relación | {player} tiene convocatoria para el {day} | Convocatoria · {team} · {date} | ¡Convocatoria para {player}! |
| Asistencia guardada | Relación | Hecho. Asistencia guardada para 12 de 14. | Asistencia guardada · 12/14 | ¡Lista pasada! 12 de 14 en pista. |
| Semana vacía | Relación | Semana tranquila | Sin eventos esta semana | Semana de descanso |
| Pago rechazado | Sensible | — | Pago rechazado | — |
| Aviso de chat | Sensible | — | Conversación visible para la coordinación del club, según su protocolo de protección. | — |

Reglas comunes a cualquier voz:

- Tuteo.
- Botones con verbo.
- Lenguaje neutro: "la plantilla", "cada familia", "{player} tiene convocatoria". Ni desdoblamientos ni masculino genérico: hay equipos femeninos y mixtos.
- Sin emojis.
- Sin jerga técnica ni códigos de error.
- Los errores dicen qué ha pasado y qué hacer. No piden perdón.
- La misma acción se llama igual en todo el flujo: el botón "Guardar asistencia" produce el aviso "Asistencia guardada".

---

## 12. Idiomas

Castellano (base), catalán, inglés, euskera y gallego.

| Idioma | Estado |
| --- | --- |
| Castellano | Base, revisado en el canvas |
| Catalán | Borrador, pendiente de revisión nativa |
| Inglés | Borrador, pendiente de revisión nativa |
| Euskera | Pendiente de traducción. Se muestra el castellano |
| Gallego | Pendiente de traducción. Se muestra el castellano |

Reglas:

- Diseñad para textos más largos que el castellano: nada de anchos fijos en botones ni etiquetas.
- Nunca concatenar frases. Una clave por frase completa, con variables (`{player}`).
- Plurales y género con una librería ICU (por ejemplo, FormatJS).
- Fechas y horas siempre con `Intl` (`formatters()` en `voice.ts`). **El dinero, igual en toda la app y en todos los idiomas: punto de miles, coma decimal y siempre dos decimales (`1.234,56 €`)**, con `formatMoney` de `@sportsmanager/shared` (o `formatters().money` en el design system). Intl no sirve: en castellano no agrupa los miles de cuatro cifras. Los campos de importe se leen con `parseMoney`, que acepta `1.234,56`, `1234,56` y `1234.56`.
- Nada de texto dentro de imágenes.

---

## 13. Accesibilidad

- Texto: 4,5:1. Texto grande (24 px o más) y elementos de interfaz: 3:1. En claro y en oscuro.
- Zona táctil: 48 px en móvil, 44 px en escritorio.
- El color nunca es la única señal.
- Foco visible: contorno de 2 px en `club-text` con 2 px de separación.
- Elementos reales: `<button>`, `<a href>`, `<input>` con `<label>`. Nunca `onClick` en un `div`.
- `aria-pressed` en botones de alternar, `role="switch"` en interruptores, `role="status"` en avisos.
- Respetar `prefers-reduced-motion`.
- Las gráficas llevan un resumen en texto.

---

## 14. Movimiento

**Propuesta pendiente de validar.** No se diseñó en el canvas.

- Duraciones: 150 ms (cambios de estado), 250 ms (aparición de elementos), 300 ms (paneles inferiores).
- Curva de salida `cubic-bezier(0.2, 0, 0, 1)`.
- Movimiento solo como respuesta a una acción: abrir, cerrar, confirmar. Sin animaciones decorativas de entrada.
- Con movimiento reducido: solo fundidos de 150 ms.

---

## 15. Implementación · React + Tailwind

### Archivos

| Ruta | Qué es |
| --- | --- |
| `DESIGN.md` | Este documento |
| `AGENTS.md` | Instrucciones cortas para agentes de código |
| `tokens/tokens.json` | Tokens fijos en JSON |
| `src/theme/tokens.css` | Variables CSS base, estados, formas y modo oscuro |
| `src/theme/clubTheme.ts` | Motor de color del club |
| `tailwind/theme.css` | Tema para Tailwind v4 |
| `tailwind/preset.cjs` | Preset para Tailwind v3 |
| `src/components/*.tsx` | Componentes de referencia |
| `src/icons/actions.tsx` | Catálogo de iconos de acción (8.1): `actionIcons`, `ActionIcon` |
| `apps/web/src/ui/data-list.tsx` | Lista de datos con fila que se abre y acciones de fila (9.7 y 9.8) |
| `apps/web/src/components/command-palette.tsx` | Paleta de mandos (9.17) |
| `apps/web/src/ui/tour.tsx` | Recorrido guiado (9.20) |
| `apps/web/src/routes/club/roster-board.tsx` | Tablero de plantilla (9.18) |
| `apps/web/src/routes/club/match-live.tsx` · `apps/web/src/lib/drag.ts` | Consola del partido y arrastrar y soltar (9.19) |
| `src/i18n/voice.ts` · `*.json` | Voz del club, textos e idiomas |
| `icons/sport/*.svg` | Iconos de deporte propios |

### Puesta en marcha

1. Copiad la carpeta en el repositorio del front.
2. Tailwind v4: en la hoja principal, `@import "./tailwind/theme.css";`. Tailwind v3: añadid el preset y importad `src/theme/tokens.css`.
3. Al cargar un club, aplicad su tema:

```ts
import { buildClubTheme, applyClubTheme } from './src/theme/clubTheme';

const theme = buildClubTheme({
  primary: club.colors.primary,   // '#0B6E4F'
  secondary: club.colors.secondary, // '#F2C200'
  mode: user.prefersDark ? 'dark' : 'light',
});
applyClubTheme(document.documentElement, theme);
document.documentElement.dataset.shape = isAdminPanel ? 'precisa' : 'envolvente';
```

4. Textos con la voz del club:

```ts
import { createCopy } from './src/i18n/voice';
import es from './src/i18n/es.json';
import ca from './src/i18n/ca.json';

const t = createCopy({ es, ca });
t('ca', 'callup.title', { voice: club.voice, vars: { player: 'Marc', day: 'dissabte' } });
```

### Chuleta de clases

| Necesito | Clase |
| --- | --- |
| Acción principal | `bg-club text-on-club rounded-control h-(--h-control)` |
| Botón con icono de acción | `<Button action="edit">`, `<Button action="delete" variant="danger">` |
| Texto en color del club | `text-club-text` |
| Fondo de selección | `bg-club-soft text-club-soft-text` |
| Tarjeta | `bg-surface rounded-card shadow-card` (+ `border border-border` en Precisa) |
| Texto secundario | `text-secondary text-muted` |
| Cifra | `font-mono` |
| Estado de pago correcto | `bg-success-soft text-success rounded-chip` |

---

## 16. Para agentes de código

Antes de crear o cambiar cualquier interfaz:

1. Lee este documento entero la primera vez y la sección del componente cada vez.
2. Usa solo clases del tema. Si necesitas un color, tamaño o radio que no existe, para y pregunta.
3. Si un componente ya existe en `src/components/`, úsalo. No crees uno parecido.
3b. Todo botón cuya acción esté en el catálogo (8.1) lleva `action`: `add`, `edit`, `delete`, `save`… Nunca un icono distinto para la misma acción. Si la acción se repite y no está, amplía el catálogo.
3c. Una lista es un `DataList` con `href` (la fila se abre) y `rowActions` (iconos silenciosos). Nunca un botón "Abrir" ni botones con texto dentro de una fila. Toda ficha nueva entra en la paleta (9.17) si tiene pantalla propia.
4. Todo texto visible sale de `src/i18n/`. Si falta una clave, créala en castellano en la voz que toque y márcala para traducir.
5. Comprueba zona táctil, contraste y foco antes de dar algo por terminado.
6. No pongas la marca del producto dentro de la app de un club.

---

## 17. Registro de decisiones

| Paso | Decisión | Descartado | Motivo |
| --- | --- | --- | --- |
| 1. Línea | Precisión: neutra, profesional | Marcador (editorial atlético), Rendimiento (oscura, lima) | Usabilidad en gestión intensiva y espacio para el color del club |
| 2. Color | El club tiñe toda la app con la estrategia Portada | Marco (barra lateral del club), Atmósfera (todo teñido) | Mucha carga emocional en la portada y gestión limpia en el resto |
| 2. Color | Cada club define principal y secundario | Un solo color | Identidad real de los clubes y solución para clubes blancos |
| 2. Color | Sin marca del producto dentro del club | Sello discreto | El club es el protagonista |
| 3. Tipografía | Geist y Geist Mono | Barlow Condensed, Archivo expandida | Coherencia y una sola familia que mantener |
| 3. Tipografía | Cinco parejas elegibles por club (1.4), cifras siempre en Geist Mono | Fuente subida por el club | Plataformas distintas sin perder legibilidad ni las cifras alineadas |
| 4. Identidad | Siete capas cerradas (letra, botones, iconos, fondo, portada, navegación, esquinas) con vista previa en directo en toda la app | CSS o colores libres por club | Cada club, una plataforma propia; ninguna combinación rompe contraste ni medidas |
| 3. Tipografía | Texto base de 16 px, móvil primero | 14 y 15 px | Público principal: familias y entrenadores en el móvil |
| 4. Forma | Envolvente en móvil, Precisa en gestión | Suave | Firma reconocible donde se ve y orden donde se trabaja |
| 4. Forma | Asistencia con dos botones | Un toque alterna; todos presentes por defecto | Claridad del estado en cada fila |
| 5. Iconos | Duotono de club | Lineal fino, relleno al activar | Identidad del club también en los iconos |
| 8. Iconos | Icono fijo por acción en todos los botones: rueda dentada para editar, cubo de basura en rojo para eliminar, más para añadir | Botones solo con texto; icono a gusto de cada pantalla | Se reconocen sin leer y la misma acción se ve igual en toda la app |
| 9. Filas | La fila es el objeto: se abre tocándola; acciones `ghost` solo con icono, menú "⋯" en móvil | Botón "Abrir" por fila; "Editar" y "Quitar" con borde y texto en cada fila | El contenido manda y el cromo se aparta; nueve filas no son dieciocho botones |
| 9. Uso | Paleta de mandos ⌘K con personas, equipos, pantallas y acciones | Solo navegación por menús | Gestionar 80 deportistas son gestos, no rutas; es lo que no tiene ninguna otra plataforma de clubes |
| 9. Plantilla | Tablero por posición con el dorsal a la vista, lista como alternativa | Solo tabla | Es como un entrenador piensa su equipo; una tabla es como lo piensa una base de datos |
| 12. Dinero | Punto de miles, coma decimal y dos decimales en toda la app y en todos los idiomas (`formatMoney`) | Intl del idioma de cada cual | Intl no agrupa los miles de cuatro cifras en castellano; el mismo importe se lee igual en todas partes |
| 9. Partido | Consola a pantalla completa en tres zonas (partido, nuestro equipo, rival), la zona del tiro sobre la pista y el banquillo arrastrable; la orientación decide la forma | Tarjetas apiladas dentro del espacio del club; la zona en un panel aparte | En la banda cada toque cuenta: lo nuestro y lo del rival no se mezclan y el dedo no persigue botones |
| 9. Primera entrada | Recorrido en sombra sobre la puesta en marcha real, una vez y que se puede saltar; acaba en la primera acción pendiente | Asistente de alta a pantalla completa; librería de recorridos | Se aprende sobre las pantallas de verdad y se sale haciendo el primer paso |
| 5. Interacción | Confirmar siempre las acciones delicadas | Deshacer siempre | Seguridad en dinero, bajas y comunicados |
| 6. Gráficas | Evolución para familias, comparativa para entrenadores | Radar | Lectura honesta y protección del menor |
| 6. Chat | Canales de equipo y 1:1 familia-entrenador, visibles para la coordinación | Sin chat | Comunicación real con protección del menor |
| 6. Datos | Las familias solo ven la evolución de su hijo | Comparativa con el equipo | Privacidad de los demás menores |
| 7. Voz | Tres voces elegibles por cada club | Una voz única | Clubes muy distintos, de escuelas a crossfit |
| 7. Idiomas | Castellano, catalán, inglés, euskera y gallego | — | Mercado nacional e internacional |
| 7. Front | React y Tailwind | — | Stack del equipo |

---

## 18. Pendiente

- Nombre del producto y logotipo (solo para acceso, alta, facturación y web).
- Flujo de alta del club: reutilizar la pestaña Identidad (colores, escudo, estilo y voz con vista previa en directo y los avisos del motor).
- Modo oscuro por club: el motor ya lo genera; falta revisar las pantallas con él.
- Navegación lateral del panel de gestión en escritorio.
- Validar la propuesta de movimiento.
- Revisión nativa de catalán e inglés. Traducción de euskera y gallego.
- Validación legal del chat dentro del protocolo de protección de cada club.
- Comprobar en la versión instalada de Phosphor cómo se asigna el color del relleno duotono.
- Tableros de referencia: canvas del design system en claude.ai.

---

## 19. Identidad del club

Además de sus colores y su escudo, cada club elige una opción de cada capa (ADR 0043). Las opciones viven en `packages/shared/src/club-style.ts`; la web las pone como atributos en la raíz y `src/theme/tokens.css` declara, por opción, las variables que leen los componentes. Un componente nunca pregunta qué opción hay: lee variables.

| Capa | Atributo | Opciones | Qué cambia |
| --- | --- | --- | --- |
| Tipografía | `data-type` | moderna (Geist), clásica (Fraunces y Source Sans 3), deportiva (Oswald y Archivo), amable (Nunito), geométrica (Montserrat) | `--type-body`, `--type-display`, peso y espaciado de los títulos (`--type-display-weight`, `--type-tracking`) |
| Botones | `data-buttons` | sistema, píldora, suave, recta, relieve | `--r-control`, `--btn-weight`, `--btn-tracking`, sombra del principal y del secundario |
| Iconos | `data-icons` | duotono, línea, fina, gruesa, relleno | Peso de Phosphor (`IconStyleProvider`), `--icon-stroke` y `--icon-sport-fill` de los iconos de deporte |
| Fondo | `data-bg` | liso, neutro, teñido, degradado, trama | Tinte de los neutros en el motor y `--page-background` |
| Portada | `data-hero` | lisa, degradado, rayas, banda, escudo | `--hero-art`, `--hero-art-mask`, `--hero-art-opacity` (sección 7) |
| Navegación | `data-nav` | clara, del club, oscura | `--nav-*` y las clases `bg-nav`, `text-nav-ink`, `text-nav-muted`, `bg-nav-active`… |
| Esquinas | `data-corners` | sistema, redondeadas, rectas | `--r-card`, `--r-field`, `--r-sheet`, `--r-chip`, `--r-row`, `--r-hero` |

Reglas:

- **Los valores por defecto son el aspecto de siempre.** Un club que no toca nada se ve como antes de la 1.4.
- **La navegación del club y la oscura las calcula el motor** (`--navc-*`, `--navd-*`): texto de la barra con el mismo contraste que el de los botones del club, texto secundario a 4,5:1 y el elemento activo invertido para que se lea en cualquier color. Lo prueba `clubTheme.test.ts`.
- **La altura y la zona táctil no cambian** con ningún estilo de botón.
- **Las cifras siguen en Geist Mono** con cualquier tipografía.
- **Las muestras de los ajustes** llevan su propio atributo y se pintan con su opción, porque cada variable se declara en el selector de la opción.
- **El lema** (hasta 80 caracteres) sale bajo el nombre en la portada y en la invitación.
- **El icono de la pestaña** es el escudo del club o sus iniciales sobre su color.

