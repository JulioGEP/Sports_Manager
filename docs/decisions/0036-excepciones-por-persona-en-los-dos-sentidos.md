# 0036. Excepciones por persona en los dos sentidos: ver de más o de menos que su rol

Estado: aceptada. Fecha: 2026-10-22. Fase 1, Bloque 19. Sustituye la parte de la 0033 que dejaba las reglas por persona solo en `deny` y la hoja de exclusiones de la 0035.

## Contexto

La ADR 0033 solo permitía quitar áreas a una persona concreta ("exclusiones"): quien necesitara ver más tenía que cambiar de rol o de cargo. La 0035 llevó esas exclusiones a la pestaña "Acceso" y la hoja enseñaba lo que su rol ya no ve, marcado y bloqueado. Producto lo corrigió: la administración quiere editarlo todo, porque a veces una persona concreta sí debe ver algo que su rol no ve (una entrenadora que lleva también los socios de su sección) o no ver algo que su rol sí. Cambiar el rol de esa persona arrastra todo lo demás del rol; cambiar la regla del rol arrastra a todas las demás personas con ese rol.

## Decisión

- **Excepciones, no exclusiones.** Una regla por persona puede ser `allow` (ve un área que su rol no ve) o `deny` (no ve un área que su rol sí). La tabla `access_rules` ya admitía las dos: no hay migración.
- **Cómo se aplican.** Los permisos efectivos son los de antes (por cada pertenencia, el rol y el cargo con las reglas de su perfil; la unión de todas) y al final las excepciones de la persona con el mismo criterio que las del perfil: `deny` quita todo lo del área (lectura, escritura y "propio"); `allow` da solo su lectura. La administración ni gana ni pierde nada por reglas.
- **El alcance no cambia.** Ver un área de más no amplía el ámbito: una entrenadora a la que se le abren los deportistas sigue viendo solo los de sus equipos, y una fisio, solo los que atiende.
- **Solo personal y cuerpo técnico.** Tienen excepciones quienes tienen el rol `coach` o `staff` y no administran el club. La administración lo ve todo (409). Quien solo es familia tampoco (409): su ámbito es el club entero, así que abrirle un área le enseñaría todo el club.
- **La API guarda diferencias.** `PUT /api/org/access/members/{userId}` recibe la lista completa de áreas que la persona ve (`visible`). La API calcula lo que ve por su rol (sus pertenencias con las reglas de sus perfiles, sin sus excepciones), guarda `allow` para lo que ve de más y `deny` para lo que ve de menos, y devuelve las dos listas con lo que ve por su rol. Igual que su rol, no guarda nada. `DELETE` en la misma ruta quita todas sus excepciones. La vista de acceso devuelve `people` (persona, lo que ve por su rol, `allow` y `deny`) y la lista de miembros, `accessOverrides`.
- **Una hoja que se edita entera.** La tarjeta pasa a llamarse "Excepciones por persona". La hoja parte de lo que ve la persona hoy (su rol con sus excepciones), tiene un check por área con el nombre del área ("Socios", "Instalaciones"), y debajo de cada una qué hace su rol ("Su rol lo ve", "Su rol no lo ve"). Lo que difiere de su rol lleva la etiqueta "Excepción". En la lista, cada persona enseña "Ve Socios" y "Sin Instalaciones".

## Consecuencias

- La administración resuelve casos de una persona sin tocar su rol ni a sus compañeros de rol.
- Las excepciones guardadas son diferencias respecto al rol en el momento de guardar. Si después cambia la regla del rol, una excepción puede quedar igual que el rol y no cambia nada; al volver a guardar la persona, desaparece.
- Las auditorías de `membership.access_updated` llevan `allow` y `deny` en lugar de la lista de áreas excluidas.

## Alternativas descartadas

- Seguir solo con exclusiones y pedir un cambio de rol para ver más: el rol trae mucho más que un área y afecta a cómo se ve todo lo demás.
- Guardar en cada persona la lista completa de áreas que ve: cualquier cambio posterior de la regla del rol dejaría de llegarle, y la matriz por rol perdería sentido.
- Permitir excepciones a las familias: su ámbito es el club entero y una excepción les abriría datos de otros deportistas.
