# 0051. Workouts en la biblioteca del box y más ejercicios en el box demo

Estado: aceptada. Fecha: 2026-10-26. Amplía la 0050.

## Contexto

Producto pidió más ejercicios y workouts en la biblioteca del box (`/<box>/exercises`), con ideas de los catálogos públicos de CrossFit.

La 0050 dejó una biblioteca solo de ejercicios, con 39 en el box demo. Los workouts con nombre ya existían como catálogo de benchmarks (Girls, Heroes y pruebas híbridas, 15 en total), pero solo se veían al programar, desde "Usar un benchmark". Un atleta no tenía dónde repasarlos, y la familia del Open estaba declarada sin ningún WOD.

Además, al usar un benchmark AMRAP como Cindy, el bloque quedaba sin minutos y el editor pedía la duración a mano.

## Decisión

### Dos pestañas en la biblioteca

`/exercises` tiene dos pestañas: **Ejercicios**, como hasta ahora, y **Workouts**. La pestaña va en la dirección (`?tab=workouts`) para poder enlazarla.

Workouts enseña el catálogo de benchmarks, el mismo del editor del WOD. Se busca por nombre o movimiento y se filtra por familia. Cada tarjeta lleva la pizarra y el formato en palabras: "Por tiempo · cap 15 min", "AMRAP 20 min".

La ve todo el box. Quien puede programar (`org.training.write` o `write_own`) tiene "Programar" en cada workout. Abre el editor de un WOD nuevo con el bloque ya lleno (`/programming/new?benchmark=<código>`). `?benchmark=1` sigue abriendo el selector como antes.

### Un catálogo de workouts más completo

De 15 a 44 workouts:
- **Las chicas:** Amanda, Angie, Barbara, Candy, Eva, Kelly, Linda, Lynne, Mary, Nancy y Nicole.
- **Héroes:** JT, Michael, Badger, Nate, Randy, Ryan, Josh y Kalsu.
- **Open:** 12.1, 14.1, 15.5, 16.5, 17.1, 20.1 y 24.1.
- **Híbridos:** 500 m de remo, 1 km de SkiErg y 1 km de carrera.

Cada benchmark puede llevar sus **minutos**: la duración del AMRAP o el time cap. Al usarlo, llenan los minutos del bloque. Todo AMRAP del catálogo los trae.

### Más ejercicios en el box demo

Una migración de semilla añade 47 ejercicios al box demo (86 en total). Son los movimientos que piden esos workouts y los de siempre en un box:
- derivados de halterofilia y movimientos con mancuerna;
- fuerza accesoria;
- gimnásticos: anillas, cuerda, pino, pistol y sit-ups;
- el sled pull de HYROX;
- core y movilidad.

Peso muerto sumo, hip thrust, dominada lastrada y fondo lastrado van enlazados a su movimiento del catálogo. Es idempotente, como la de la 0050.

## Consecuencias

- El atleta prepara el benchmark del día, o el que quiere repetir, desde la misma pantalla en la que repasa los ejercicios.
- Programar un benchmark son dos toques desde la biblioteca, y el bloque llega con su formato y sus minutos.
- El catálogo de workouts sigue siendo común a todos los boxes y vive en el código. Un box no puede añadir los suyos. Si lo pide, será una tabla propia, como `exercises`.
- La IA del WOD ve los 44 workouts en su contexto: más opciones para citar un benchmark.

## Alternativas descartadas

- **Una pantalla de Workouts aparte:** otra entrada en la navegación del box para algo que se consulta junto a los ejercicios.
- **Workouts propios por box desde ya:** una tabla, una API y un formulario nuevos sin que ningún box lo haya pedido. El catálogo común cubre los benchmarks, que son iguales en todas partes.
- **Copiar los workouts del día de crossfit.com:** son de un día. La biblioteca guarda lo que se repite para medir el progreso.
