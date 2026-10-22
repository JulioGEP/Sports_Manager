# Instrucciones para agentes de código

Este repositorio sigue un design system. Antes de crear o cambiar interfaz, lee `DESIGN.md`.

Reglas que no se negocian:

1. Solo clases del tema (`tailwind/theme.css`). Nada de hex sueltos ni colores por defecto de Tailwind.
2. Los colores del club salen del motor (`src/theme/clubTheme.ts`). Nunca se eligen a mano.
3. Zona táctil mínima: 48 px en móvil (`data-shape="envolvente"`), 44 px en gestión (`data-shape="precisa"`).
4. Todo estado lleva texto. El color nunca va solo.
5. Botones con verbo. Nunca "Aceptar" ni "Enviar" a secas.
5b. Toda acción del catálogo (`DESIGN.md` 8.1) lleva su icono por `action`: `add`, `edit` (rueda dentada), `delete` (cubo de basura, en `danger` para que salga rojo), `save`, `open`… Siempre el mismo icono para la misma acción; "Cancelar" y "Cerrar" sin icono. Si una acción se repite y no está en el catálogo, se amplía el catálogo, no se inventa un icono en la pantalla.
5c. Una lista es `DataList` con `href` (la fila se abre tocándola) y `rowActions` (iconos `ghost` solo con icono, verbo como `label`). Nunca un botón "Abrir" ni botones con texto o borde dentro de una fila. En móvil, una acción es un icono y varias un menú "⋯": nunca una segunda línea de botones.
5d. Toda pantalla con ficha propia entra en la paleta de mandos (`DESIGN.md` 9.17). El enlace de volver va dentro de `PageHeader` (`backTo`), no como botón suelto.
5e. Arrastrar y soltar (`apps/web/src/lib/drag.ts`) es un atajo de algo que ya se hace tocando, nunca la única vía: el teclado y el lector de pantalla siguen la de los toques.
6. Acciones delicadas (bajas, borrar, cobros, cuotas, comunicados a todas las familias): siempre `ConfirmDialog`. Marcar asistencia: nunca.
7. Textos visibles siempre desde `src/i18n/`. Respeta la voz del club y el bloqueo de momentos sensibles.
8. Sin emojis. Sin marca del producto dentro de la app de un club.
9. Chat: nunca entre adultos del club y jugadores menores. Las familias solo ven datos de sus hijos.
10. Si algo no está definido en `DESIGN.md`, para y pregunta.
