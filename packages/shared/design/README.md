# Design tokens

Ficheros:

- `tokens.css`: variables CSS. Es la fuente que cargará `apps/web`.
- `tokens.ts`: los mismos valores como objeto tipado, para validaciones en la API y para generar CSS por club.

El `package.json` de `packages/shared` y la configuración de build llegan en el Bloque 1. Hasta entonces esta carpeta solo contiene los ficheros.

## Marca por club

Cada organización puede sobrescribir únicamente `--color-brand-primary` y `--color-brand-secondary`. El resto de tokens son de plataforma y no cambian entre clubes, para que la interfaz siga siendo coherente y accesible con cualquier marca.

Mecanismo previsto (Bloque 5): la API devuelve los colores de la organización, `apps/web` los inyecta como variables CSS en el elemento raíz, y los componentes solo usan tokens. Validación de contraste en la API antes de aceptar un color.

Los valores actuales de marca (rojo y dorado) vienen del prototipo y actúan como marca por defecto de la plataforma hasta tener una propia.

## Inventario de componentes del prototipo

El prototipo tenía estos componentes base. No se ha conservado su CSS porque se reconstruirán en `apps/web` con los tokens de arriba. Sirven como lista de partida:

| Componente | Variantes |
|---|---|
| Botón | primario, secundario, fantasma, peligro, éxito; estado deshabilitado |
| Tarjeta | base, interactiva, oscura, destacada |
| Etiqueta (badge) | neutra, éxito, aviso, peligro, oro |
| Avatar | base, grande, extra grande; iniciales si no hay foto |
| Barra de progreso | |
| Métrica | icono, etiqueta, valor, ayuda |
| Alerta | con punto de color y texto |
| Estado vacío | |
| Sección | cabecera con título, descripción y acciones |
| Cronología | lista de hitos con marcador |

## Reglas de interfaz heredadas

1. Sin colores en hexadecimal fuera de `tokens.css`.
2. No crear un botón o tarjeta nuevos si una variante existente sirve.
3. Todo control interactivo tiene estado de foco visible y altura táctil mínima de 44 px.
4. Un componente no está terminado hasta que funciona en móvil.
