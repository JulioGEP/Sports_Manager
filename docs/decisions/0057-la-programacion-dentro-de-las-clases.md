# 0057. La programación dentro de las clases: qué se hace en cada clase y quién viene a hacerlo

Estado: aceptada; trasladada a inthebox (ADR 0058). Fecha: 2026-10-27. Amplía la 0051 (clases en calendario), la 0053 (planificación del box) y la 0054 (planes para quien sea).

## Contexto

Con la 0053 y la 0054 la programación ya tiene plan, semanas, papel de cada día y planes propios. Pero Programación y Clases seguían siendo dos mundos:

- **En la programación no se ve a nadie.** El WOD del lunes sale con sus bloques y su estado, pero no dice en qué clases se hace, cuánta gente viene ni quién de esa gente hace otra cosa porque sigue un plan propio. El día sin WOD solo dice "3 clases ese día", no cuántas personas lo esperan.
- **En las clases no se ve la programación.** El calendario no avisa de qué clases no tienen WOD. La ficha de la clase enseña el WOD, pero no de qué plan sale (semana, bloque, papel del día) ni separa a quien hace el WOD del box de quien hace la sesión de su plan propio; "Plan propio: …" aparecía en la lista, pero no qué sesión le toca ni si ya la ve.
- **Los planes propios solo se ven desde Planificación.** La programación del box, por la 0054, no mezcla sus sesiones, y desde ahí no había forma de saber que el grupo de competición tiene hoy su sesión en borrador y tres de sus cinco atletas apuntados a clase.
- **El brief daba kilos de más.** Las cargas del bloque de fuerza salían para todos los de la clase, también para quien ese día hace la sesión de su plan propio.

Producto lo pidió así: ver en las clases quién viene, si la clase sale de una programación o no, y quién está apuntado con programación concreta (plan propio) o genérica (WOD del box); y llevar la programación dentro de las clases. Y, con la clase llena, que la plaza que deja quien se borra pase a la lista de espera, y poder ampliar el aforo de esa clase para dar plaza a quien espera.

## Decisión

### API

- **La lista de clases trae su programación para el personal** (`ClassSummary.programming`, nulo para el atleta): el WOD del box de la clase en cualquier estado (el de su tipo de clase o, si no hay, el de su disciplina, como `forClass`) y quién tiene plaza (reservada, con check-in o no presentada) con su cara y el plan propio que sigue en esa disciplina. Son tres consultas para toda la semana: los WODs del rango, las reservas de todas las clases (`bookings.attendeesOf`, que ahora usa también `attendees`) y los planes propios activos de esa gente. `hasWorkout` sale del mismo cálculo.
- **La ficha de la clase trae las sesiones de los planes propios** de quien viene ese día (`sessions`, solo para el personal, en cualquier estado) y cada atleta dice el id de su plan propio (`ownPlanId`) para encontrar la suya. El atleta no ve ni las sesiones ni los planes de los demás.
- **El brief solo da kilos a quien hace el WOD del box**: quien tiene publicada y visible la sesión de su plan propio ese día no sale en las cargas.
- **La programación puede pedir también las sesiones propias** (`GET /api/org/workouts?own=1`): las de los planes propios activos de las disciplinas que se ven, marcadas con `specific`. Sin `own`, la respuesta es la de siempre.

### La lista de espera y el aforo de una clase

- **La plaza que se libera ya pasaba a la espera** (0049): al cancelar una reserva antes de empezar, entra el primero de la cola al que le llega su tarifa (quien no tiene tarifa o ya gastó lo suyo se salta y sigue esperando). Ahora el personal sabe quién ha entrado: la respuesta trae su nombre (`promotedName`, nulo para el atleta) y en la lista lleva "Desde la espera" (`fromWaitlist`, solo para el personal).
- **El aforo de una clase concreta se cambia** (`PUT /api/org/classes/{id}/capacity`), no el de su tipo de clase ni el horario: lo guarda la propia clase (`events.capacity`, que ya existía), así que no hay migración. Lo hace quien gestiona la clase, antes de empezar (empezada, se hace check-in a quien venga de la espera) y nunca por debajo de quien ya tiene plaza.
- **Si sube, entran los de la espera por orden de cola**, tantos como plazas nuevas. Lo decide el box, así que entran aunque su tarifa no llegue, igual que cuando el personal reserva por un atleta; si les llega, la reserva gasta de la tarifa que toca. Se audita como `class.capacity_changed` con el aforo de antes, el nuevo y cuántos entraron.
- **En la ficha**: la lista de espera lleva "Dar plaza a N" y la cifra de reservas, su rueda para cambiar el aforo. La hoja sube o baja de una en una, enseña antes de guardar quién entra y en qué orden, y deja dar plaza a toda la espera de un toque.

Quien hace qué se decide igual que lo ve el atleta (0054): hace su sesión si su plan propio tiene sesión ese día y ya está publicada y visible; si está en borrador, programada para más tarde o no hay sesión, hace el WOD del box.

### Web

- **Programación**: cada WOD lleva debajo sus clases (cuántas, cuántas reservas, cuántas con plan propio y las caras) y una pastilla por clase con su hora, sus plazas y quién viene con plan propio, que abre la clase. Debajo del WOD de cada día van **los planes propios del día**: su sesión con su estado, o que no tiene sesión y quien venga hace el WOD, y cuántos de su gente vienen a clase; la fila abre la semana del plan. El hueco sin WOD dice cuántas reservas esperan el WOD, y el resumen de la semana suma reservas y gente con plan propio.
- **Clases**: cada clase avisa junto al nombre si aún no tiene WOD y cuántos vienen con plan propio (con el texto en la etiqueta y el *tooltip*), el resumen enlaza a la programación de la semana cuando hay clases sin WOD, y la vista de día pone al lado **la programación del día** por disciplina: el WOD con su papel, su estado, su plan y sus bloques, quién viene y los planes propios. En el día, cada clase enseña también sus caras si tiene ancho.
- **La ficha de la clase** empieza por **su programación**: el WOD con su papel y su estado, de qué plan sale (semana y bloque, con la semana del plan a un toque) o que es un WOD suelto, y una barra partida con cuántos hacen el WOD del box y cuántos su plan propio. La lista se filtra por lo que hace cada uno hoy, y quien sigue un plan propio dice qué hace: su sesión, o el WOD porque la suya aún no se ve o no tiene ese día. Una tarjeta nueva, **Planes propios**, enseña cada plan con su gente en la clase y su sesión, que se despliega entera.
- **El inicio** (dueño y coach): las clases de hoy enseñan sus caras, si les falta el WOD o lo tienen en borrador, y cuántos vienen con plan propio; la siguiente clase del coach, sus caras.

Piezas comunes en `components/fitness/class-programming.tsx`: la pila de caras (`FacePile`, con aro del color del club para quien sigue un plan propio y apagada para quien no vino), la línea de gente, las clases de un WOD, los planes propios de un día y la barra de quién hace qué. El avatar suma un tamaño `xs` solo para pilas de caras.

## Consecuencias

- El coach y el dueño ven la programación y las clases como una sola cosa: desde el WOD llegan a la clase y desde la clase al plan, y saben antes de entrar quién hace qué.
- Un plan propio con la sesión en borrador se ve a tiempo: su gente está en clase y hoy verá el WOD del box.
- La lista de clases del personal pesa más (las caras de quien viene). Una semana de un box grande son unos pocos cientos de personas: se sigue pidiendo una vez por semana.
- Las sesiones propias se escriben donde siempre, en la semana del plan: la programación las enseña, no las edita.
- Ampliar el aforo de una clase no cambia el de las demás: si una clase se llena cada semana, se cambia en su tipo de clase. Volver a generar el horario de un tipo de clase no toca las clases con reservas; una clase futura sin reservas se rehace con el aforo del horario y pierde el que se le puso a mano.
- Pendiente: avisar al atleta que entra desde la espera (hoy lo ve en su app al abrir la clase).

## Alternativas descartadas

- **Mezclar las sesiones propias con los WODs de la semana** como tarjetas iguales: la 0054 las separó porque se escriben con su plan, su intención y su validación, y en la semana del box confundían qué se publica con "Publicar semana".
- **Una petición por clase para saber quién viene**: con 30 clases por semana son 30 viajes en cada vista; la lista ya trae la semana entera.
- **Dar plaza a una persona concreta de la espera** saltándose la cola: rompe el orden que la lista promete; para eso está "Añadir atleta", que reserva por alguien a mano.
- **Contar con plan propio a todo el que está en un plan**, haga lo que haga ese día: en la ficha de la clase se cuenta lo que hace hoy cada uno (es lo que necesita quien da la clase); en la programación y el calendario se cuenta quién sigue un plan propio, con ese texto.
