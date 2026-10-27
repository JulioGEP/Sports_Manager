# 0054. Planes para quien sea: todo el box, un nivel, un grupo o una persona

Estado: aceptada; trasladada a inthebox (ADR 0058). Fecha: 2026-10-27. Amplía la 0053 (planificación del box). Abierto para todos los boxes, como el resto de la planificación: la división en módulos de pago se hará después.

## Contexto

La 0053 dejó un plan por disciplina para todo el box. En un box real conviven más cosas: el grupo de competición que entrena cuatro días con más volumen, los RX que quieren otra progresión, la atleta que paga por una programación solo para ella. Producto pidió que un plan pueda ser para todo el box, para un nivel, para un grupo o para una persona; que la frecuencia sea variable de verdad; que nadie quede en dos planes propios a la vez sin que el box lo decida; que al aplicar un plan a un grupo se vea a toda su gente y se pueda quitar a cualquiera; y, si el box cobra una cuota por la programación propia, saber quién la paga.

## Decisión

### Para quién es un plan

- **Todo el box** (`audience = section`): lo de la 0053. Sigue habiendo **uno activo por disciplina** (el índice único parcial ahora mira solo estos). Al crear uno nuevo con otro activo, se puede **sustituir** (el activo pasa a terminado) o dejarlo en borrador.
- **Un nivel** (`level`, con `audience_level`): el asistente arranca con todos los atletas de ese nivel (el que más usa cada uno en sus resultados de 60 días) y se quita o se añade a quien sea.
- **Un grupo** (`group`, con `audience_name`): un nombre ("Competición", "Mañanas") y su gente, elegida una a una.
- **Una persona** (`athlete`): un plan para un solo atleta.

Los tres últimos son **planes propios**. Puede haber tantos como se quiera, en paralelo al de todo el box. Su gente vive en `box_plan_members` (plan, atleta, quién lo añadió); el plan guarda sus **días de entreno** (`weekdays`) y la estructura pone papel solo en esos días.

### Nadie sigue dos planes propios

Un atleta está como mucho en **un plan propio activo**. Al crear o activar un plan propio, o al añadirle gente, quien ya tiene otro se avisa (con el nombre de su plan) y la API responde 409 salvo que venga en `replace`: entonces **se le anula el suyo** (sale de él) y entra en el nuevo. Un plan individual que se queda sin nadie se archiva. La web no deja seguir hasta decidir, por persona o para todos: "Anular el suyo" o "Dejar fuera".

El plan de todo el box no cuenta como solapamiento: es lo que sigue quien no tiene plan propio.

### Sesiones propias

Un plan propio escribe **sus sesiones** (`workouts.specific`, siempre con su plan; una por plan y día), aparte del WOD del box (uno por disciplina y día, o por tipo de clase, como antes). Borradores, IA, publicación, revisión y salud de un plan propio trabajan con sus sesiones y con las asistencias y marcas de su gente.

- **El atleta** con plan propio ve, el día que su plan tiene sesión, **su sesión en vez del WOD del box** de esa disciplina: en su WOD del día y en la clase en la que se apunta. Los días sin sesión propia ve el del box. Su ciclo es el de su plan propio. Al salir del plan vuelve al del box.
- **El coach** ve en la lista de la clase quién sigue un plan propio en esa disciplina ("Plan propio: …"): ese día hace otra sesión.
- La programación del box (la lista de WODs) no mezcla las sesiones propias; se escriben desde la semana del plan.
- Solo la gente del plan ve sus sesiones y apunta resultados en ellas.

### Frecuencia variable

La frecuencia de referencia va de **1 a 7 días** por semana, con rendimientos decrecientes a partir de 4 (factor 0,35 · 0,6 · 1 · 1,25 · 1,4 · 1,5 · 1,55). En un plan propio, los días de entreno son su frecuencia. La del atleta en su ciclo sale de lo que viene de verdad, también de 1 a 7. Los días de entreno y la frecuencia se cambian después desde el plan; cambiar los días rehace el papel de cada día con los mismos bloques.

### La cuota de programación

Una tarifa puede **incluir programación propia** (`fee_plans.includes_programming`), normalmente como complemento sin clases. Si el box tiene alguna, cada atleta de un plan propio (y cada candidato) lleva su estado: **al día** (último cargo pagado), **pendiente**, **vencida** (cargo vencido o fuera de plazo) o **sin cuota** (no tiene la tarifa). Si el box no tiene ninguna, no se enseña nada.

### API

- `POST /api/org/plans` acepta `audience`, `audienceLevel`, `audienceName`, `weekdays`, `members`, `replace` y `replaceActive`; `PUT /api/org/plans/{id}` acepta `audienceName` y `weekdays`, y comprueba el solapamiento al activar.
- `GET /api/org/planning/candidates?section=&plan=`: los atletas del box con su nivel, el plan propio que ya siguen y su cuota.
- `PUT /api/org/plans/{id}/members`: añadir, quitar y anular (`add`, `remove`, `replace`); nunca deja un plan propio vacío ni un individual con más de una persona.
- La vista de un plan suma sus días, su gente (nivel y cuota) y si el box sigue la cuota. Un WOD dice si es una sesión propia (`specific`). En la lista de una clase, el personal ve el plan propio de cada atleta.

### Web

- El asistente tiene un paso nuevo, el primero: **Para quién** (cuatro tarjetas; el nivel con cuántos hay en cada uno; el nombre del grupo; la lista con nivel y cuota, quitar, buscar y añadir; los avisos de quien ya tiene plan propio). El nombre del plan lleva para quién es. El calendario suma los días de entreno; la frecuencia de referencia va de 1 a 7; la proyección de un plan propio usa los niveles de su gente; el resumen dice para quién es, cuántos y a cuántos se les anula su plan, y en todo el box ofrece sustituir el activo.
- La página del plan propio enseña **sus atletas** con nivel y cuota y el resumen de la cuota, y deja cambiarlos con el mismo editor; editar el plan cambia los días y la frecuencia.
- Planificación lista los **planes propios** activos con para quién son y cuántos atletas tienen.
- Tarifas: "Incluye programación propia".

## Consecuencias

- Un box puede vender y seguir programación personalizada sin salir de la app, y el coach sabe en clase quién hace otra cosa.
- La regla de un plan propio por atleta evita que alguien reciba dos sesiones el mismo día; el plan de todo el box sigue siendo la red de seguridad.
- La demo trae un plan solo para Carla y otro para el grupo de competición (cinco atletas, cuatro días), con sus sesiones de la semana y la cuota al día, pendiente, vencida y sin cuota.
- Pendiente: notificar al atleta cuando entra o sale de un plan propio, y cobrar la cuota automáticamente al añadirlo.
