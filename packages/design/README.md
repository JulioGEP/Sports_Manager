# @sportsmanager/design

Design system del SaaS, tal cual lo entregó producto (versión 1.0, 20 de octubre de 2026), como paquete del workspace. **`DESIGN.md` es la fuente de verdad**; `AGENTS.md` resume las reglas para quien escribe interfaz.

- `tailwind/theme.css`: tema de Tailwind v4. La web lo importa como hoja principal.
- `src/theme/tokens.css`: variables base, estados del sistema, formas (`data-shape`) y modo oscuro.
- `src/theme/clubTheme.ts`: motor de color del club (`buildClubTheme`, `applyClubTheme`).
- `src/components/`: componentes de referencia (botón, portada del club, confirmación, etiqueta de estado, asistencia).
- `src/i18n/`: voz del club (`createCopy`) y textos por idioma.
- `src/icons/sport.tsx`: iconos de deporte propios como componentes; los SVG originales están en `icons/sport/`.
- `tokens/tokens.json`: tokens fijos en JSON.

Cambios respecto al ZIP original: las fuentes Geist no se cargan desde Google Fonts sino autoalojadas desde `apps/web` (`@fontsource-variable/geist`), para que la interfaz sea idéntica sin red y en las pruebas.
