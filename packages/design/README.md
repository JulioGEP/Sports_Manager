# @sportsmanager/design

Design system del SaaS, tal cual lo entregó producto (versión 1.0, 20 de octubre de 2026), como paquete del workspace. **`DESIGN.md` es la fuente de verdad**; `AGENTS.md` resume las reglas para quien escribe interfaz.

- `tailwind/theme.css`: tema de Tailwind v4. La web lo importa como hoja principal. Declara `@source "../src"` para que Tailwind genere también las clases de los componentes de este paquete: a la web le llega por `node_modules`, que no explora.
- `src/theme/tokens.css`: variables base, estados del sistema, formas (`data-shape`) y modo oscuro.
- `src/theme/clubTheme.ts`: motor de color del club (`buildClubTheme`, `applyClubTheme`).
- `src/components/`: componentes de referencia (botón, portada del club, confirmación, etiqueta de estado, asistencia).
- `src/i18n/`: voz del club (`createCopy`) y textos por idioma.
- `src/icons/sport.tsx`: iconos de deporte propios como componentes; los SVG originales están en `icons/sport/`.
- `src/icons/actions.tsx`: catálogo de iconos de acción (`DESIGN.md` 8.1) sobre Phosphor: `actionIcons`, `ActionIcon` y el tipo `ActionKind` que usa la prop `action` del botón.
- `tokens/tokens.json`: tokens fijos en JSON.

Cambios respecto al ZIP original: las fuentes Geist no se cargan desde Google Fonts sino autoalojadas desde `apps/web` (`@fontsource-variable/geist`), para que la interfaz sea idéntica sin red y en las pruebas. Versión 1.1 (21 de octubre de 2026): toda acción reconocible lleva su icono, siempre el mismo (regla de oro 10 y sección 8.1), y el botón lo pone solo con `action`. Versión 1.2 (22 de octubre de 2026): la fila es el objeto (se abre tocándola, acciones `ghost` solo con icono), paleta de mandos ⌘K (9.17) y tablero de plantilla por posición (9.18). Versión 1.4 (23 de octubre de 2026): identidad del club (sección 19, ADR 0043): tipografía, botones, iconos, fondo, portada, navegación y esquinas elegibles por club como atributos de la raíz, navegación del club y oscura calculadas por el motor, y la voz del club en toda la web.
