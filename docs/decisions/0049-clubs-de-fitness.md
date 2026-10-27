# 0049. Clubs de fitness: un modelo de club y una segunda interfaz sobre la misma base

Estado: aceptada; trasladada a inthebox (ADR 0058). Fecha: 2026-10-26. Construye la propuesta `docs/propuesta-clubs-de-fitness.md` entera, sin fases. Amplía la 0046 (rol de deportista), la 0041 (tienda y API pública), la 0042 (Stripe) y la 0044 (propuesta con IA).

## Contexto

La base de la plataforma sirve para un box de CrossFit, HYROX o entrenamiento funcional: personas, estructura, agenda, asistencia, cuotas con Stripe, tienda, identidad, IA, aislamiento por club. La interfaz no: habla de secciones, equipos, partidos, jugadores, familias y socios, y un box la abre y la ve "adaptada". Además faltan tres piezas que en un box son el día a día: clases abiertas que el atleta reserva, el WOD publicado con su resultado y su clasificación, y las marcas personales.

Producto aprobó las seis decisiones de la propuesta: modelo a nivel de club; atleta único, sin ficha de socio aparte; marca comercial propia para fitness (nombre por decidir); lista de la clase y clasificación visibles por defecto, con opción de no salir; sin chat entre atletas (anuncios y mensajes coach-atleta); cobro recurrente incluido. Y pidió construirlo todo de una vez.

## Decisión

### Modelo de club

- `organizations.club_model`, `sports` (por defecto) o `fitness`. Lo fija la plataforma al crear el club y lo cambia desde la ficha del club en el panel del negocio. Viaja en la marca (`/api/org/branding`), así que la web lo sabe antes de entrar.
- Cambia la experiencia, no los datos: navegación, inicio de cada rol, vocabulario y pantallas propias. La API, los permisos y las tablas son las mismas para los dos modelos; las rutas de fitness funcionan en cualquier club, y la web solo las enseña en uno de fitness.

### Clases abiertas y reservas

- Un **tipo de clase** es un equipo con `booking_mode = 'open'` en una disciplina (sección de actividad): WOD, Open Box, Halterofilia, HYROX. Sin plantilla: cualquier atleta del club puede reservar. Su horario semanal es el de siempre (ADR 0031) con **coach, sala y aforo por franja**, y las clases son eventos con `capacity` y `coach_user_id`. Quien da una franja entra en el cuerpo técnico del tipo de clase, para verla en su ámbito.
- Regenerar el horario ya no duplica: las franjas se comparan y conservan su id, las clases futuras de una franja quitada se borran si no tienen reservas ni asistencia, y las que tienen reservas no se tocan.
- **Reserva** (`bookings`): reservada, en espera, cancelada, cancelación tardía, no presentado, asistió. La plaza se da con la fila del evento bloqueada (`SELECT … FOR UPDATE`): dos atletas a la vez por la última plaza no entran los dos. Al cancelar, sube el primero de la espera que tenga tarifa que le cubra.
- **Política de reservas** del club: abre X días antes, cierra X minutos antes, cancelación gratis hasta X horas, si la tardía y el no presentado gastan sesión, máximo por día, lista de espera, lista de asistentes y clasificaciones visibles. Una regla pura compartida (`checkBooking`) decide si se puede reservar y por qué no; la API la aplica y la web la explica.
- El **coach** hace check-in (con reserva o sin ella, también escribe en el pase de lista) y cierra la clase: quien reservó y no vino queda como no presentado. El pase de lista general enseña también a quien tiene asistencia en una clase abierta, que no tiene plantilla. El coach ve el **brief** de la clase: quién viene por primera vez, quién tiene una restricción, quién vuelve tras días fuera y los kilos de cada uno si el WOD va por porcentaje.

### Tarifas y bonos

- Un plan de cuota gana **derecho de uso**: ninguno, ilimitado, X por semana, X al mes o bono de X sesiones con caducidad, y los tipos de clase que incluye. La **tarifa de un atleta** (`subscriptions`) une atleta y plan con su alta, fin, pausa y estado; caduca y se reactiva al leerla, sin cron.
- Los cargos del mes se generan para todas las tarifas recurrentes activas que aún no lo tienen. El atleta puede **domiciliar** su tarifa por Stripe (Checkout en modo suscripción, tarjeta o SEPA, en la cuenta conectada del club); el webhook da de alta la domiciliación, apunta cada factura cobrada una sola vez como cargo del periodo con su pago, marca las fallidas y da de baja.
- El atleta es una sola ficha (persona + deportista con cuenta, ADR 0046), sin ficha de socio aparte.

### Programación, resultados y marcas

- **WOD** por disciplina y día (y, si se quiere, por tipo de clase): borrador o publicado, ya o a una hora, con hasta diez bloques (calentamiento, fuerza, técnica, WOD, accesorios, vuelta a la calma), cada uno con su pizarra, su marcador (tiempo, rondas y reps, kilos, reps, distancia, calorías), time cap, movimiento del catálogo con porcentaje o RM, y textos Scaled, RX y RX+. Corregir un WOD actualiza los bloques en su sitio y conserva los resultados.
- El atleta apunta su **resultado** por bloque (nivel, marcador, si acabó en el cap, esfuerzo de 1 a 5, nota) y ve la **clasificación** por nivel, de todo el box o de su clase. Si el bloque busca una máxima y la supera, entra en sus marcas como PR.
- **Marcas**: máximas por movimiento (1, 2, 3, 5 y 10 RM) con su 1RM real o estimada (Epley) y los kilos de cada porcentaje; **benchmarks** (Girls, Heroes y pruebas de HYROX); **medidas corporales** privadas, que el coach ve solo si el atleta las comparte; racha de semanas y calendario de días entrenados.
- **Privacidad**: el atleta decide si sale en la lista de la clase y en las clasificaciones. Por defecto sale (decisión 4), y en ninguna pantalla se le ve si ha dicho que no; se cuenta como "N prefieren no salir".

### Comunidad, captación y negocio

- **Anuncios** del box (a todos o a una disciplina, fijados, con quién los ha leído) y **mensajes** entre el box y cada atleta adulto. Sin chat entre atletas.
- **Leads** con su embudo (nuevo, prueba reservada, prueba hecha, convertido, perdido) y conversión en atleta con tarifa y primer cargo. La web del box pide una clase de prueba con la **API pública** y la misma clave publicable de la tienda: `GET /api/public/v1/classes` (horario con plazas libres, sin nombres) y `POST /api/public/v1/trials` (con consentimiento; la misma persona no deja dos en un día).
- **Métricas** del dueño: atletas activos, altas y bajas del mes, ocupación de esta semana y la anterior, por franja, ingresos recurrentes, pruebas y conversión, visitas por atleta, la semana de programación y avisos (inactivos, bonos que acaban, pruebas pendientes, días sin WOD, cobros fallidos, pausas que terminan). **Ranking** del mes por constancia.
- **Tienda**: precio de socio por producto, que pagan los socios y los atletas con tarifa activa.
- **Propuesta de WOD con IA**: el coach la pide para un día con su foco y su duración; se genera en segundo plano con la misma cuota semanal que la propuesta de sesión (ADR 0044), sin datos personales, mirando la programación de las dos semanas de alrededor para no repetir. Llega al editor y solo se guarda cuando el coach la guarda.

### Web

- **Léxico**: en un club de fitness, las pantallas que se comparten (deportistas, secciones, instalaciones, cuotas, biblioteca, tienda) hablan de atletas, disciplinas, salas, cobros y movimientos. Es una capa de textos encima del diccionario y de la voz del club, en castellano, catalán e inglés, vigilada por una prueba.
- **Navegación por rol**. Atleta: Hoy, Reservar, WOD, Progreso y, en "Más", Mi tarifa, Mensajes, Anuncios, Ranking, Timer, Movimientos, Mis pagos y Tienda. Coach: Hoy, Clases, Programación, Atletas, y Mensajes, Anuncios, Ranking, Timer, Movimientos y la Pantalla del box. Dueño: lo del coach más Tarifas, Leads, Métricas, Cobros, Tienda, Horario, Equipo, Salas y Ajustes.
- **Pantallas propias**: inicio del atleta, del coach y del dueño; reservar con la tira de días; la clase (del atleta y del coach con check-in); el WOD con el resultado y su clasificación; progreso con marcas, benchmarks, medidas y privacidad; mi tarifa con domiciliar; mensajes y anuncios; timer (por tiempo, AMRAP, EMOM y Tabata); movimientos; programación semanal y editor del WOD; atletas y su ficha; tipos de clase, horario y política; tarifas y bonos con quién tiene cada una y los cargos del mes; leads; métricas; ranking; y la pantalla del box para la tele.
- **Identidad**: cuatro looks de box de partida (industrial, híbrido, nocturno y estudio) en Ajustes, Identidad.

### Permisos

Un permiso nuevo, `org.community.write` (anuncios y mensajes en nombre del club), para la administración y el coach. El resto se apoya en los de siempre: la reserva propia en `org.family.read` con la ficha propia (ADR 0046); el horario y la política en `org.structure.write` y `org.settings.write`; las tarifas en `org.fees.*`; los leads en `org.club_members.*`; la programación en `org.training.*` con el ámbito del cargo (el coach programa en las disciplinas de sus clases).

### Demo

Un segundo club demo, `demo-box` ("Box de demostración"), modelo fitness, con CrossFit (WOD, Open Box, Halterofilia) e HYROX, su horario, 40 atletas con tarifa, cuatro semanas de reservas, asistencias y resultados, WODs publicados, uno programado y otro en borrador, marcas y benchmarks, anuncios, mensajes, leads, cobros del mes y tienda con precio de socio. Cuentas: `box@demo.test` (dueña), `coach@demo.test` (coach) y `atleta@demo.test` (atleta), contraseña `123456`; `admin@demo.test` también administra el box. Una prueba de aislamiento comprueba que la semilla deja el box usable.

## Consecuencias

- Un box ve una aplicación de box: su vocabulario, su navegación y sus pantallas. Un club deportivo no cambia en nada.
- Una sola API y un solo esquema: lo que se mejora para un modelo (identidad, tienda, Stripe, IA) llega al otro.
- Las clases abiertas conviven con los grupos de siempre: un club deportivo puede tener una actividad con reserva sin pasar a fitness.
- La base de pruebas embebida (PGlite) atiende todas las conexiones en una sola sesión: el bloqueo de la última plaza no se puede probar en paralelo allí; se prueba la regla en serie y el bloqueo es el de Postgres en producción.
- Quedan fuera: chat entre atletas, nombre de la marca comercial de fitness, app nativa y avisos push (la web es instalable), pagos por clase suelta, y competiciones internas con jueces.

## Alternativas descartadas

- **Modelo por sección**: un club con una sección de fitness y otras de deporte vería dos aplicaciones mezcladas. El modelo es del club (decisión 1).
- **Renombrar las pantallas deportivas**: "Reservar", "WOD" o "la clase del coach" no son "agenda", "sesión" o "pase de lista" con otro nombre; tienen otra forma. Solo se renombran las que son iguales.
- **Tablas propias para clases**: un tipo de clase es un equipo abierto y una clase es un evento. Así la agenda, la asistencia, las salas, la carga y la IA funcionan sin duplicar nada.
- **Reservar con un contador en el evento**: la reserva es una fila por atleta, que guarda su historia (espera, cancelación, no presentado) y lo que gasta de su tarifa.
