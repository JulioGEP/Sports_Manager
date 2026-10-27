# 0056. El dinero se lee igual en toda la app: punto de miles, coma decimal y dos decimales

Estado: aceptada. Fecha: 2026-10-27.

## Contexto

Producto pidió que todos los importes del producto se lean igual: **punto para los miles, coma para los decimales y siempre dos decimales** (`1.234,56 €`).

La app no lo cumplía, y no de una sola forma:

- `money()` de la web escribía `2273,00 €`, sin separador de miles.
- El inicio del club deportivo, el código para la web de la tienda y el coste de IA usaban `Intl.NumberFormat`. En castellano, Intl **no agrupa los miles de cuatro cifras** (`1234,56 €`), y en inglés cambia los separadores.
- Los primeros KPIs del box (ADR 0055) quitaban los decimales.
- Los campos de importe enseñaban `69.00` (punto decimal) en unos sitios y `69,00` en otros.
- La exportación a Excel de la tienda sacaba los importes sin formato.

## Decisión

- **Un solo formateador** en `@sportsmanager/shared`: `formatMoney(cents)` → `1.234,56 €`, y `formatAmount(cents)` → `1.234,56` sin símbolo, para los campos. Es igual en todos los idiomas: el formato del dinero es del producto, no del idioma de cada cual. Otra moneda lleva su símbolo (`formatMoney(cents, "$")` → `12,40 $`, para el coste de IA).
- **`parseMoney(texto)`** lee lo que se escribe en un campo de importe: `1.234,56`, `1234,56`, `1234.56`, `12,5`, con o sin `€`. Con coma, los puntos son de miles; sin coma, un punto seguido de grupos de tres cifras también lo es (`1.234`), y si no, es el decimal (`12.50`). Lo que la app escribe en un campo vuelve siempre al mismo importe.
- `money()` de la web, `formatters().money` del design system, los KPIs, el inicio del club, el coste de IA y el código para la web de la tienda usan ese formato. Todos los campos de importe se rellenan con `formatAmount` y se leen con `parseMoney`.
- **Excel:** los importes salen como número con formato de moneda (`#,##0.00 "€"`), así se pueden sumar. Excel pinta los separadores de su idioma; en uno en castellano, `1.234,56 €`.
- **Las APIs no cambian:** Stripe, Holded y la API pública siguen con céntimos o con `centsToAmount` (punto decimal, sin miles), que es lo que esperan.

## Consecuencias

- Un importe se lee igual en el inicio, en los cobros, en la tienda, en los KPIs y en el móvil.
- En inglés, el dinero no sigue la costumbre inglesa (`€1,234.56`). Es a propósito: el club cobra en euros y su gente lee el mismo número en cualquier idioma.
- DESIGN.md (sección 12) lo recoge. Un importe nuevo se pinta con `formatMoney`, nunca con Intl ni a mano.

## Alternativas descartadas

- **`Intl.NumberFormat("es-ES")`:** no agrupa los miles de cuatro cifras, que es justo lo que faltaba.
- **`Intl` con `useGrouping: "always"`:** arregla el castellano, pero cada idioma seguiría con sus separadores.
- **Importes como texto en Excel:** se leerían igual, pero no se podrían sumar.
