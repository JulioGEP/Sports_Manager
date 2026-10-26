# Propuesta: Planificación del box. De la estrategia al WOD del día

Estado: aprobada y construida en una fase, sin módulos de pago (ADR 0053). Fecha: 26 de octubre de 2026. Punto de partida: ADR 0050 (programación rehecha) y ADR 0049 (propuesta de WOD con IA). Referencias: comparativa de GRIT Program 60, 120 y 180 (PDF de GRIT Programming, seis días de programación de muestra); GRIT Programming, 77 Feet Box Planning, ZonaWOD y Fitr Studio Program como modelos de venta de programación. Las webs no se pudieron abrir desde el entorno de trabajo: la propuesta se apoya en el PDF, en la ayuda pública de Fitr sobre programas y pistas, y en la práctica habitual de programación para boxes. Maqueta de las pantallas: https://claude.ai/artifact/UnBGkTKq5ttTRVi7TU2dpu (privada hasta que se comparta).

Resumen:

- Hoy "Programación" es un calendario de WODs sueltos. Cada día está bien escrito, pero nada dice hacia dónde va el box, qué toca este mes ni si la semana tiene sentido.
- Propongo una capa encima: la **Planificación**. Un plan tiene objetivo, fecha, bloques y semanas. Cada WOD sabe a qué parte del plan sirve y por qué existe.
- La IA deja de escribir WODs sueltos. **Diseña el plan** con el material, los niveles, los ejercicios y el horario reales del box, **escribe las sesiones semana a semana** y **las ajusta con lo que pasa de verdad** en la clase. El coach decide siempre: nada se publica sin él.
- Lo que no tiene nadie: programa para quien viene 2 o 3 días, no para quien viene 6; cada sesión cabe en la sala real (aforo y máquinas); cuatro versiones reales por nivel; proyección honesta de resultados antes de empezar, calibrada luego con los datos del box; y el atleta ve hacia dónde va.
- Coste de IA estimado con la tabla de precios del repo: medio dólar por disciplina y semana. Lo que ahorra: las horas de programación del head coach o la suscripción a un programador externo.

## 1. Diagnóstico: qué hay y qué falta

| Lo que hay hoy | Lo que falta |
| --- | --- |
| WOD por disciplina y día, con bloques, formatos, % del 1RM y escalados en texto (ADR 0050) | Un objetivo y un horizonte. No existe "a dónde vamos" ni "en qué semana estamos" |
| Propuesta de un día con IA que mira dos semanas atrás y una adelante para no repetir (ADR 0049) | La IA no sabe qué bloque toca, qué progresión lleva la sentadilla ni cuándo hay test. Equilibra días, no construye nada |
| Material por sección (`section_equipment`), pensado para el club deportivo. El box demo no tiene inventario y la IA asume "material de un box estándar" | Un inventario del box con cantidades y pesos. Sin él no se sabe si un WOD con remo cabe en una clase de 14 con 6 remos |
| Scaled, RX y RX+ como tres líneas de texto por bloque. El atleta elige nivel al apuntar el resultado | Un nivel de entrada (Iniciación). Versiones de verdad por nivel (volumen, variante, carga). Un nivel sugerido a cada atleta |
| Biblioteca de 39 ejercicios con material, puntos clave, errores y escalados (ADR 0050). La IA solo recibe los nombres | Usar el material y los escalados de cada ejercicio. Enlazar cada movimiento del WOD a su ficha |
| Resultado por bloque con esfuerzo de 1 a 5; marcas y benchmarks | Comparar lo previsto con lo que pasó. Test y retest planificados: hoy no existe "el resultado del ciclo" |

En pocas palabras: la base de datos ya tiene casi todo lo que necesita un planificador. Falta el plan y el cerebro que lo une.

## 2. Qué aprendemos de las referencias

- **GRIT Program 60, 120 y 180 (el PDF).** El mismo día en tres volúmenes. GRIT 120 contiene entero el de 60 y añade bloques; GRIT 180 añade una segunda sesión. El esqueleto es común, por eso el plan es coherente en las tres. Cada bloque tiene etiqueta (Warm up, Strength, Weightlifting technique, Gymnastics, Metcon, Endurance), un formato en una línea ("Every 90 seconds for 4:30", "4 alternating sets of") y la intención escrita ("RPE 4-5", "ritmo lento, donde podríamos hablar"). El día 4 es igual para los tres: motor aeróbico largo. Es un día con papel propio dentro de la semana.
- **Fitr Studio Program.** Programas con pistas: un programa y hasta nueve variantes de calendario dentro de él. Se elige el programa, se configura y se entrega solo.
- **GRIT, 77 Feet y ZonaWOD.** Venden programación a boxes y a atletas. Que exista ese mercado dice dos cosas: programar bien cuesta horas que el box no tiene, y el box paga por ello.

Lo que tomamos: el día con papel dentro de la semana, la intención escrita, las pistas de volumen sobre un mismo esqueleto, y el gesto de "elijo un programa, lo configuro y veo qué puedo esperar". Lo que añadimos: que el programa se escribe para este box concreto (su material, su gente, su horario) y aprende de sus resultados.

## 3. Conceptos

| Concepto | Qué es | Ejemplo |
| --- | --- | --- |
| **Plan** | La estrategia. Objetivo, fechas, énfasis, niveles y tests. Uno activo por disciplina | "Camino al Open", CrossFit, 16 semanas, del 2 de noviembre al 21 de febrero |
| **Bloque** | Un mesociclo de 1 a 6 semanas con un tipo y un objetivo en una frase | "Base: fuerza en los básicos y motor aeróbico", 4 semanas |
| **Semana** | El microciclo: el papel de cada día, el volumen y la intensidad que tocan | Lunes pesado, martes gimnásticos y motor, jueves motor largo |
| **Sesión** | El WOD de siempre, con su intención, su plan de pizarra por minutos, sus versiones por nivel, su logística y su porqué | "Pesado y corto: sentadilla 4×3 al 82 % y un sprint de menos de 7 minutos" |
| **Pista de volumen** | El mismo esqueleto con más trabajo, para quien quiere más | Clase (60 min), Clase+ (extra en el Open Box) y Competidor (doble sesión) |

Tipos de bloque: Test, Base (acumulación), Desarrollo (intensificación), Realización (pico), Descarga y Mantenimiento (semanas cortas o festivas).

Por qué esta jerarquía y no otra: es la que usa cualquier programador serio (macro, meso y microciclo), con nombres que un coach entiende sin formación previa. El atleta solo ve dos: el plan y el bloque.

## 4. Lo que alimenta el plan

La regla: **lo que la app ya sabe, no se pregunta.** El asistente llega con todo relleno y enseña de dónde sale cada dato.

### 4.1 Material de las instalaciones

Inventario por sala: tipo (el catálogo de material de los ejercicios, ampliado con GHD, cuerda de trepa, paralelas, yugo y discos), cantidad, rango de pesos (kettlebells de 8 a 32 kg, mancuernas por pares de 5 a 30) y estado (operativo o en reparación).

Para qué sirve:

- **Filtrar**: un ejercicio que pide algo que no hay no se programa. Se dice cuáles quedan fuera y por qué.
- **Logística**: puestos frente a aforo. 14 plazas y 13 máquinas (4 bikes, 6 remos, 3 skis) es una oleada con un atleta corriendo; 14 plazas y 4 bikes son tres oleadas, y eso no cabe en 60 minutos. El validador lo detecta y propone la alternativa: calorías en la máquina que toque, con su equivalencia (21 cal de bike = 25 de remo = 25 de ski).
- **Imprevistos**: marcar un remo en reparación reajusta las sesiones afectadas de los próximos días y avisa al coach.

### 4.2 Niveles

- **Cuatro niveles**: Iniciación, Scaled, RX y RX+. El box les cambia el nombre si quiere ("Base, Intermedio, Avanzado, Competición"). Iniciación es nuevo: el atleta de los primeros tres meses, con menos volumen, variantes más simples y foco en técnica.
- **Versiones de verdad**: cada nivel cambia volumen, variante y carga, no solo los kilos. 21-15-9 en RX puede ser 15-12-9 en Iniciación, con el movimiento escalado que dice la ficha del ejercicio.
- **Nivel sugerido por capacidad**: fuerza, halterofilia, gimnásticos y motor. Un atleta puede ser RX en fuerza y Scaled en gimnásticos. La regla es explicable: RX en una carga si el peso RX es como mucho el 60-65 % de su 1RM de ese movimiento; RX en un gimnástico si lo ha apuntado en RX en los últimos 60 días. El atleta ve la sugerencia y la cambia con un toque.

### 4.3 Ejercicios de la base de datos

- La IA programa **solo con la biblioteca del box y el catálogo de movimientos**. Así cada movimiento del WOD se toca y abre su ficha con vídeo, puntos clave y errores.
- Los **escalados de la ficha** alimentan las versiones por nivel.
- Si la IA necesita un ejercicio que el box no tiene, lo propone como **borrador en Ejercicios**. La biblioteca crece con el uso.

### 4.4 Objetivos

Al crear el plan: objetivo principal (plantilla o propio), evento y fecha si los hay (el Open, una carrera de HYROX, el verano), duración, **énfasis repartiendo 100 puntos** entre seis capacidades (fuerza, halterofilia, gimnásticos, motor, intensidad y movilidad; el mismo gesto que la propuesta de sesión de la ADR 0044) y tests de partida y de llegada.

### 4.5 Lo que la app ya sabe

Horario (días con clase, duración, aforo y coach), frecuencia real de los atletas (tarifas y reservas), resultados y esfuerzo, marcas, festivos y cierres del box.

## 5. Cómo trabaja la IA

Tres papeles y un validador. Cada uno hace lo que hace mejor, y lo que puede hacer el código no lo hace la IA.

| Papel | Qué hace | Cuándo | Coste |
| --- | --- | --- | --- |
| **Arquitecto** | Crea el plan: bloques, semanas, papel de cada día, progresiones y tests | Una vez por plan, y cuando el coach pide un cambio grande | Una llamada |
| **Programador** | Escribe las sesiones de la semana siguiente con sus cuatro versiones, la intención, el plan de pizarra y el porqué. Deja la de dentro de dos semanas en borrador | Una vez por disciplina y semana | Una llamada |
| **Analista** | Compara lo previsto con lo que pasó y propone ajustes | Cada domingo | Reglas en código (gratis); la IA solo redacta |
| **Validador** | Comprueba cada sesión antes de que llegue al coach | Siempre | Código |

Las **progresiones de fuerza** (series, repeticiones y porcentaje de cada semana) las calcula el código desde el bloque. Son exactas, se conocen desde el primer día y el atleta sabe sus kilos de las próximas semanas.

**El validador.** Ninguna sesión llega al coach sin pasar estas comprobaciones:

1. Material: existe y está operativo.
2. Logística: puestos suficientes para el aforo de la franja, o rotación que cabe en el tiempo.
3. Tiempo: los bloques suman como mucho la clase, con transiciones.
4. Ejercicios: de la biblioteca o del catálogo.
5. Patrón: no repetir el patrón dominante dos días seguidos; como mucho dos días seguidos con hombro por encima de la cabeza; carrera y saltos dentro del límite semanal.
6. Niveles: las cuatro versiones existen y tienen sentido.
7. Progresión: respeta la del bloque.
8. Cobertura: las combinaciones de días más frecuentes del box tocan las capacidades del bloque (ver 6.2).

Si una sesión falla, se reintenta una vez. Si vuelve a fallar, llega al coach marcada con el motivo.

**Perfil de coach en datos**, como en la ADR 0044: principios y líneas rojas de programación de box, y encima "cómo programamos aquí", que escribe el box.

**Privacidad**, como en las ADR 0044 y 0049: el modelo no ve a ningún atleta. Recibe agregados (cuántos hay en cada nivel, cómo se reparten las frecuencias, tiempos medianos de un WOD). Las alertas personales (una restricción de hombro) son reglas en código y van al brief del coach.

## 6. Lo diferencial

### 6.1 La sesión cabe en la sala real

Cada sesión enseña su logística para el aforo de la franja: "14 atletas, 13 máquinas: una oleada, uno corre 400 m". Si no cabe, no llega así al coach.

### 6.2 Programar para quien viene 2 o 3 días

El problema de fondo de la programación de grupo: el plan se diseña para seis días y el atleta medio viene 2,7. Si viene martes y jueves y esos días son gimnásticos y motor, en tres meses no toca una barra.

El arquitecto mira las combinaciones de días más frecuentes del box (salen de las reservas) y reparte los estímulos para que cada combinación habitual toque lo esencial del bloque. El validador lo comprueba cada semana. Y al atleta se le dice: "Vienes lunes, miércoles y viernes. Esta semana te falta motor: el sábado es tu día".

### 6.3 Cada WOD sabe por qué existe

Cada sesión y cada bloque llevan su porqué en una línea: "4ª semana de carga del bloque Base: 4×3 al 82 % (la semana pasada, 4×4 al 78 %)". "Corto porque el jueves es el día de motor largo". El coach lo explica en la pizarra en diez segundos; el atleta lo lee en su WOD.

### 6.4 La intención, medida

Cada WOD declara su intención: dominio de tiempo (corto, menos de 7 minutos; medio, de 7 a 15; largo, de 15 a 30; muy largo, más de 30), esfuerzo objetivo de 1 a 5 y cómo se tiene que sentir ("sin parar más de 5 segundos"). Con los resultados se ve si se cumplió: si el WOD previsto para 8-12 minutos sale en 15 de mediana, el estímulo fue otro. El analista aprende el factor del box ("vuestros WODs con remo salen un 18 % más largos") y lo aplica a los siguientes.

### 6.5 La revisión del domingo

Cada domingo el coach recibe una tarjeta: lo previsto frente a lo que pasó, y tres o cuatro ajustes para la semana siguiente, cada uno con su motivo y su "antes y después". Aceptar todos, uno a uno o ninguno. Es el bucle que convierte un calendario en un plan vivo.

### 6.6 El copiloto

Una barra en la Programación (y en la paleta, ⌘K) para pedir cambios en lenguaje normal: "El jueves 8 cerramos", "Mete un benchmark el sábado 12", "Esta semana viene gente de un campeonato: baja el volumen". La respuesta es siempre una diferencia que se acepta o se descarta, nunca un cambio directo.

### 6.7 Proyección honesta

Antes de empezar, el asistente enseña qué se puede esperar: rangos por test ("back squat, +3 a +6 % para quien venga 3 días") y por capacidad ("motor: se mantiene"). Se mueven en vivo al repartir los puntos y al cambiar la frecuencia. Las reglas:

- Siempre un rango, nunca una cifra; siempre "orientativo"; siempre con la frecuencia a la que se refiere.
- La primera vez sale de reglas de entrenamiento (nivel del box, semanas, énfasis, frecuencia).
- Tras el primer retest se calibra con el box: "en vuestro último ciclo, +5,2 % de media; previsto, de 3 a 7 %".

### 6.8 El atleta ve hacia dónde va

- En su WOD: "Camino al Open, semana 5 de 16, bloque Base", la intención del día y su versión (nivel sugerido y kilos).
- En Progreso, "Tu ciclo": dónde está, qué toca, cuándo es el retest y su rango orientativo según su constancia.
- Al acabar: "Tu ciclo en cifras", una tarjeta con la marca del box para compartir en historias. Cada PR que se comparte es publicidad del box.

Por adelantado ve el bloque y el papel de cada día, no el WOD: así nadie elige días según el WOD que le gusta (decisión 3).

## 7. Pantallas

La maqueta tiene once pantallas en tres filas.

**Crear el plan (coach o dueño, escritorio):**

1. **Elige tu programación.** Plantillas como tarjetas: duración, días, niveles, material ("tienes todo" o "falta: GHD, se sustituye") y qué esperar. Filtros por objetivo, duración y disciplina. Y "desde cero con el copiloto".
2. **Tu box.** Material, niveles, aforo y biblioteca, ya rellenos, con lo que significa cada cosa para la programación.
3. **Énfasis y proyección.** Cien puntos entre seis capacidades, frecuencia de referencia y la proyección que se mueve en vivo. Interactiva en la maqueta.
4. **Mapa del ciclo.** Las dieciséis semanas en una franja: bloques por color, la ola de volumen e intensidad, tests, festivos y el Open. Se acerca como un mapa: de la temporada a la semana y de la semana al día. Abajo, el copiloto: una petición en lenguaje normal y los cambios que propone, cada uno con su porqué.

**Del plan al WOD (coach y dueño):**

5. **La semana dentro del plan.** La lista de días de la ADR 0050 con el papel de cada día, la intención, el porqué y el estado (borrador del copiloto, revisado, publicado), el equilibrio de la semana y la cobertura por frecuencia.
6. **La sesión por niveles.** Las cuatro versiones lado a lado, como el PDF de GRIT, con el plan de pizarra por minutos y la logística.
7. **Revisión del domingo.** Previsto frente a real y los ajustes propuestos con su diferencia.
8. **Salud de la programación** (dueño). Equilibrio previsto y real, mapa de variedad por patrón y semana, dominios de tiempo, cobertura, resultados del ciclo y coste de la IA.

**El atleta (móvil):**

9. **El WOD de hoy** con el plan, la intención y su versión.
10. **Tu ciclo** con los tests, su rango orientativo y la semana del box.
11. **Tu ciclo en cifras**, para compartir.

Principios de UX que siguen todas:

- Lo que la app ya sabe, no se pregunta. Cada dato prerrelleno dice de dónde sale.
- Del objetivo al WOD en tres toques: temporada, semana, día.
- La IA propone, el coach decide. Todo cambio llega como diferencia aceptable.
- Se ve antes de hacerse: la proyección y la vista del atleta se mueven mientras se configura.
- Honesto: rangos, motivo y fuente. Nunca una promesa.
- El color nunca va solo: cada capacidad lleva su nombre, cada estado su texto (DESIGN.md, regla 5).

## 8. Plantillas de partida

| Plantilla | Duración | Para qué |
| --- | --- | --- |
| Programación continua | Sin fin, bloques de 4 semanas que rotan el énfasis | El día a día de la mayoría de boxes |
| Camino al Open | 12 a 16 semanas, termina la semana del Open | Gimnásticos bajo fatiga, intensidad, simulacros |
| Base de fuerza | 8 semanas | Básicos (sentadilla, peso muerto, press) con progresión |
| Motor | 6 semanas | Capacidad aeróbica, umbral y ritmo |
| HYROX: tu carrera | 10 a 16 semanas hasta la fecha | Carrera, estaciones y transiciones |
| Halterofilia técnica | 6 semanas | Para el tipo de clase Halterofilia |
| Vuelta al box | 4 semanas | Septiembre y enero: reentrada progresiva |
| Desde cero | La que diga el coach | Con el copiloto |

Un plan terminado se guarda como plantilla del box para el año siguiente.

## 9. Modelo de datos (concepto, sin código)

Nuevo:

| Pieza | Qué guarda |
| --- | --- |
| Inventario del box | Por sala: tipo de material, cantidad, rango de pesos y estado. Sustituye a `section_equipment` en un box |
| Plan | Disciplina, nombre, objetivo, evento y fecha, inicio y fin, énfasis (puntos por capacidad), niveles, tests, estado (borrador, activo, terminado), plantilla de origen |
| Bloque | Plan, orden, tipo, semanas, objetivo en una frase, énfasis propio, progresiones |
| Semana | Bloque, número, inicio, volumen e intensidad objetivo, papel de cada día |
| Nivel por capacidad del atleta | Atleta, capacidad, nivel, si es sugerido o confirmado |
| Revisión semanal | Semana, métricas de previsto y real, ajustes propuestos y qué se hizo con cada uno |

Cambia:

- **WOD**: plan, semana, papel del día, intención (dominio de tiempo, esfuerzo objetivo, cómo se tiene que sentir), porqué y pista (Clase, Clase+, Competidor).
- **Bloque del WOD**: minutos previstos, ejercicios de la biblioteca enlazados y versión de Iniciación.
- **Nivel**: Iniciación como cuarto valor de resultados y benchmarks, y nombre de cada nivel por box.
- **Propuestas de IA**: tres tipos nuevos (plan, semana y ajuste) con su cuota.

## 10. Por qué merece la pena

**Para el box.**

- **Horas.** Programar bien una semana para varios niveles lleva horas de head coach; la hipótesis que hay que validar en entrevistas es de 3 a 6 horas semanales. Con el copiloto la tarea pasa a revisar y ajustar.
- **Consistencia.** Cinco coaches, una sola línea. El porqué viaja con la sesión.
- **Retención.** El atleta que tiene un objetivo, un retest y una cifra que enseñar tiene un motivo para seguir. Es una hipótesis: se mide (sección 11).
- **Ingresos.** Clase+ y Competidor se venden como complemento de tarifa. El plan es argumento de venta en la web y en la clase de prueba ("este trimestre: Camino al Open").
- **Dinero que ya gasta.** Muchos boxes compran la programación fuera (GRIT, 77 Feet y ZonaWOD venden ese servicio). Aquí va hecha para su sala.

**Para la plataforma.** Los programas de gestión de box resuelven reservas, cobros y la pizarra del día. La planificación se hace fuera, en una hoja de cálculo o comprándola. Este módulo convierte la plataforma en el sitio donde se decide el entrenamiento, no solo donde se reserva. Es difícil de copiar porque se apoya en datos que solo tiene quien gestiona el box: horario, reservas, material y resultados.

**Coste de IA** con la tabla de precios del repo (`AI_MODEL_PRICES`, modelo por defecto: 4 $ por millón de tokens de entrada y 20 $ por millón de salida):

| Llamada | Tokens estimados | Coste |
| --- | --- | --- |
| Arquitecto, una por plan | 25.000 de entrada, 8.000 de salida | 0,26 $ |
| Programador, una por disciplina y semana | 35.000 de entrada, 18.000 de salida | 0,50 $ |
| Analista, una por disciplina y semana | 10.000 de entrada, 2.000 de salida | 0,08 $ |
| Copiloto, por petición | 15.000 de entrada, 5.000 de salida | 0,16 $ |

Un box con CrossFit e HYROX: unos 1,2 $ por semana, de 5 a 8 $ al mes con peticiones al copiloto. La caché del contexto fijo (perfil, biblioteca, inventario) lo baja; con el modelo intermedio, a la mitad.

## 11. Cómo sabremos que funciona

| Métrica | Objetivo | Cómo se mide |
| --- | --- | --- |
| Horas del coach programando | -70 % | Entrevista antes y después, y tiempo en el editor |
| Semanas programadas con 7 días de antelación | Más del 90 % | Fecha de publicación frente a fecha del WOD |
| Sesiones del copiloto aceptadas sin cambios grandes | Más del 60 % | Diferencia entre la propuesta y lo publicado |
| WODs dentro de su dominio de tiempo | Más del 70 % | Mediana de tiempos frente a la intención |
| Atletas con alguna marca en el retest | Más del 60 % | Retest frente a test de partida |
| Días por semana por atleta | +0,2 | Reservas |
| Bajas al mes | -1 a -2 puntos | Tarifas |
| Atletas con Clase+ | Más del 10 % | Tarifas |

Un apunte de método: con 40 atletas por box, un test A/B dentro de un box no tiene potencia estadística. Se compara entre boxes, con lanzamiento escalonado, o antes y después contra un grupo de control.

## 12. Decisiones que necesito

1. **Niveles.** Cuatro (Iniciación, Scaled, RX y RX+) con nombre editable por box. Recomiendo sí: el atleta nuevo es el que más se va, y hoy no tiene versión propia.
2. **Pistas de volumen.** Clase+ en la primera versión, vendible como complemento de tarifa; Competidor después. Recomiendo así: Clase+ monetiza el Open Box sin trabajo extra del coach.
3. **Qué ve el atleta por adelantado.** El bloque y el papel de cada día, no el WOD, configurable por box. Recomiendo este punto por defecto: ayuda a elegir días que se complementan sin que se elijan por el WOD.
4. **Plantillas.** De seis a ocho de la plataforma, escritas o revisadas por un head coach real, que la IA adapta a cada box. ¿Hay ese coach en casa o buscamos un socio (un programador de los de la referencia, con reparto de ingresos)? Recomiendo el socio: da credibilidad y canal.
5. **Proyecciones.** Rangos con cifras desde el primer día, marcados como orientativos, o solo cualitativos hasta el primer retest. Recomiendo rangos: es lo que convierte la configuración en una decisión.
6. **Negocio.** Incluido en el plan de fitness o módulo de pago. Recomiendo módulo ("Planificación con IA"): tiene coste variable, el box ya paga por esto fuera y es la pieza de más valor percibido.

## 13. Orden de construcción

Se puede construir de una vez, como la ADR 0049. Si va por partes, este orden entrega valor en cada paso:

1. **Cimientos.** Inventario del box, cuatro niveles, intención y porqué en el WOD, plan con bloques y semanas a mano y mapa del ciclo. Sin IA nueva: el coach ya planifica.
2. **Copiloto.** Arquitecto, programador y validador; plantillas; proyección; "Tu ciclo" del atleta.
3. **Bucle.** Revisión del domingo, calibración de la proyección, copiloto en lenguaje normal, Clase+, salud de la programación y "Tu ciclo en cifras".
