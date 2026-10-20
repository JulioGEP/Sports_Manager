# Marca por defecto (compartida con la API)

Aquí solo queda `tokens.ts`: los dos colores de marca por defecto con los que nace un club y que la API usa para validar y para los emails. **El design system completo vive en `packages/design`** (DESIGN.md, tema de Tailwind, motor de color del club, componentes, voz e iconos) desde el Bloque 10 (ADR 0027).

Cada club sobrescribe su color principal y secundario desde sus ajustes; el motor de color del design system genera todo lo demás y garantiza el contraste.
