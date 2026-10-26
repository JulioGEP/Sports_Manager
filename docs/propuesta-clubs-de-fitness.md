# Propuesta: dos interfaces sobre una base. Clubs deportivos y clubs de fitness

Estado: aprobada y construida entera, sin fases, en la ADR 0049 (las seis decisiones de la sección final, aceptadas tal cual). Fecha: 26 de octubre de 2026. Punto de partida: ADR 0048. Referencia: 18 capturas de la app del atleta de AimHarder (octubre de 2026). Maqueta navegable de las dos interfaces, una al lado de la otra: atleta, coach y dueño (https://claude.ai/artifact/TFJi66qrZZZ1TbhMF7ux3C, privada hasta que se comparta).

Resumen:

- La base sirve para un box de CrossFit, HYROX o entrenamiento funcional. La interfaz no: habla de secciones, equipos, partidos, jugadores, familias y socios. Un box la abre y huele a "adaptado".
- Propongo un **modelo de club** como dato: `deportivo` o `fitness`. El modelo decide vocabulario, navegación, inicio de cada rol, módulos visibles, semilla del demo y presets de identidad. Mismo motor, misma API y las mismas tablas donde se pueda.
- Las pantallas que en un box son otra cosa (Reservar, WOD, Progreso, la clase del coach, Tarifas y bonos) son pantallas propias, no renombradas. Las que son iguales (ajustes, personal, tienda, contabilidad) se comparten con el vocabulario del modelo.
- Para tener lo que tiene AimHarder faltan tres piezas grandes: **clases abiertas con reserva** (aforo, lista de espera, cancelación tardía, bonos), **WOD publicado con resultados** (Scaled o RX, tiempo, kilos, clasificación) y **marcas personales** (máximas, benchmarks, evolución física). El resto es medio o pequeño.
- Cinco fases. Recomiendo empezar por la 1 (que se vea fitness) y encadenar la 2 (reservar y cobrar): sin reservas ningún box cambia de software.

## 1. Diagnóstico: por qué hoy huele a club deportivo

| Lo que ve un box hoy | Por qué no encaja |
| --- | --- |
| Navegación con Secciones, Deportistas, Socios, Personal, Instalaciones y Entrenamiento | En un box no hay secciones ni equipos: hay tipos de clase y un horario |
| El atleta pertenece a un grupo fijo con horario ("Yoga lunes 19:00") | En un box el atleta reserva la clase que quiere, cada día. El grupo fijo no existe |
| Socio y deportista son dos fichas | En un box son la misma persona: quien entrena paga una tarifa. La palabra "socio" confunde |
| Cuotas por periodo (mensual, trimestral, anual, única) | Un box vende tarifas con derecho de uso: ilimitada, 3 por semana, bono de 10 sesiones con caducidad |
| La sesión solo se planifica en entrenamientos de equipo (pendiente de la ADR 0046) | La clase de un box no tiene WOD publicado. Es lo primero que abre el atleta cada día |
| Tests físicos que registra el staff, con unidades sin `kg` | El atleta registra sus marcas: 1RM, benchmarks, tiempos |
| Partidos, convocatorias, pizarra, familias y PDI | No aplican. Ocupan sitio en el menú y en el inicio |
| Bienestar y RPE con lenguaje de rendimiento deportivo | Sirven, pero como "sensaciones" dentro del resultado del WOD, no como un formulario aparte |

Lo que encaja tal cual: identidad del club, tienda con stock, cuotas con Stripe y Holded, agenda e instalaciones (las salas del box), asistencia, retos, biblioteca con vídeo, propuesta de sesión con IA con perfil de box, restricciones y lesiones, "ver como", paleta de mandos y aislamiento por club.

## 2. La idea: un motor, dos experiencias

### 2.1 El modelo del club

Un campo del club, `modelo`: `deportivo` (lo que hay) o `fitness`. Lo elige la plataforma al crear el club en `/admin`. Cambiarlo es raro y lo hace la plataforma.

| Capa | Club deportivo | Club de fitness |
| --- | --- | --- |
| Vocabulario | El de hoy | Capa de léxico propia, como las capas de voz de la ADR 0043 |
| Navegación | La de hoy | Propia por rol (sección 5) |
| Inicio | El de hoy por rol | Propio por rol: dueño, coach y atleta |
| Módulos | Partidos, secciones de competición, familias, PDI, pizarra | Reservas, WOD, resultados, marcas, tarifas y bonos, leads |
| Semilla | Catálogo de deportes y categorías | Tipos de clase, movimientos, benchmarks y tarifas tipo |
| Identidad | Paletas actuales | Presets de box: tipografía deportiva, navegación oscura, portada con foto |
| Club demo | `/demo` | `/demo-box` |

Por qué a nivel de club y no de sección. Un polideportivo con una sala de CrossFit existe, pero hoy no hay ningún cliente así. A nivel de club es un campo y una rama por pantalla. A nivel de sección cada pantalla mezcla dos mundos. Si llega ese cliente, se abre después.

Por qué no dos aplicaciones. Dos frontends duplican identidad, cuotas, tienda, ajustes, contabilidad y pruebas de aislamiento. Cada mejora se paga dos veces. El modelo cuesta lo mismo que una capa de voz más las pantallas propias.

Lo que no basta: cambiar palabras. Si solo se renombra, huele igual. Por eso las cinco pantallas del día a día de un box son nuevas: Reservar, WOD, Progreso, la clase del coach y Tarifas y bonos.

### 2.2 Vocabulario

| Dato (no cambia) | Club deportivo | Club de fitness |
| --- | --- | --- |
| Sección | Sección (Fútbol sala, Natación) | Disciplina (CrossFit, HYROX, Halterofilia, Yoga) |
| Categoría | Categoría (Alevín, Sénior) | Nivel (Iniciación, Intermedio, Competidor), oculto por defecto |
| Equipo o grupo | Equipo o grupo | Tipo de clase (WOD, Open Box, Gimnásticos) |
| Entrenamiento o actividad en la agenda | Entrenamiento | Clase |
| Sesión planificada | Sesión | WOD, la programación del día |
| Bloques de la sesión | Activación, principal, vuelta a la calma | Warm up, Strength o Skill, WOD, Cool down |
| Tarea de la biblioteca | Tarea con pizarra | Movimiento con vídeo |
| Deportista o jugador | Deportista, jugador | Atleta |
| Socio | Socio | Desaparece como ficha: es el estado de la tarifa del atleta |
| Familia | Familia | Solo si el box tiene clases infantiles |
| Personal o cuerpo técnico | Personal, cuerpo técnico | Equipo, coaches |
| Instalación | Instalación (pista, piscina) | Sala (Box, Studio, Outdoor) |
| Cuotas | Cuotas | Tarifas y bonos |
| Pase de lista | Pase de lista | Check-in |
| Tests físicos | Tests | Marcas (PRs) y benchmarks |
| Reto por puntos | Reto | Retos y ranking |
| Bienestar y RPE | Bienestar, esfuerzo | Sensaciones, esfuerzo |
| Partido | Partido | Oculto (competición interna, más adelante) |

### 2.3 Socio y atleta, una sola cosa

En un club deportivo hay socios que no entrenan (pagan por pertenecer) y deportistas que no son socios (los menores). En un box, quien entrena es quien paga. Propuesta:

- En fitness hay una sola lista: **Atletas**. Cada atleta tiene una tarifa: activa, pausada, caducada o de baja.
- Por debajo se reutiliza lo que existe: persona (`people`), ficha deportiva (`players`) y socio (`club_members`). La interfaz los funde; los datos no se tocan.
- "Socio" solo aparece en precios ("precio para atletas del box") y en la tienda.

## 3. Lo que tiene AimHarder y lo que tenemos

Lectura de las 18 capturas de la app del atleta. Solo lo que se ve; el back office del box no está en las capturas.

Tamaño orientativo: S (días), M (una semana), L (más de una semana).

| # | AimHarder (app del atleta) | Lo que tenemos | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| 1 | Reservas: tira de la semana, clases del día por tipo y sala, color por tipo, ocupación 7/16, reservar, filtro | Grupos con aforo y horario fijo; agenda; el atleta ve sus clases | Clase abierta que reserva cualquier atleta con tarifa válida; reservar y cancelar; ocupación en vivo | L |
| 2 | "Ver clases restantes" | Cuotas por periodo | Tarifas con derecho de uso (ilimitada, N por semana, bono de N con caducidad) y saldo de sesiones | L |
| 3 | Historial: Asistido, Cancelación tardía | Asistencia: presente, ausente, justificado | Estados de la reserva (reservada, en espera, cancelada, cancelación tardía, no presentado, asistida), política de cancelación y penalización | M |
| 4 | Atletas apuntados a la clase, con foto | El atleta no ve a otros (ADR 0046) | En fitness la lista de la clase es parte del producto, con opción de ocultarse | S |
| 5 | WOD del día en el inicio, publicado por el box | Sesiones por bloques con IA, solo en entrenamientos de equipo | Programación diaria por disciplina, publicada a una hora, visible para quien reserva | L |
| 6 | Cargar resultados: Scaled o RX, kilos, tiempo, "WOD completado", sensaciones, vídeo | RPE y bienestar del atleta | Resultado por bloque según su marcador (tiempo, rondas y repeticiones, kilos, repeticiones, distancia, calorías), nivel, nota y sensaciones | L |
| 7 | Mis máximas (PRs) | Tests físicos del staff, sin kilos | Catálogo de movimientos, máximas a 1, 3 y 5 repeticiones, PR detectado al registrar | M |
| 8 | Benchmarks (Fran, Murph) | Nada | Catálogo de benchmarks sembrado e histórico personal | M |
| 9 | Calendario con días entrenados, racha y mejor racha | Nada | Calendario, racha y constancia, a partir de reservas y resultados | S |
| 10 | Evolución física: peso, grasa, medidas, nutrición; privada; acceso del box si el atleta quiere | Altura en la ficha; salud con consentimiento | Medidas del atleta, privadas por defecto y compartidas con el box con el consentimiento que ya existe | M |
| 11 | Analytics: nivel de fitness y último WOD, un servicio que activa el box | Carga aguda y crónica, bienestar y reglas, para el staff | Analítica del atleta: frecuencia, volumen, progreso de marcas, reparto por tipo de trabajo | M |
| 12 | Ranking "Fittest" del box y de toda la red AimHarder | Retos por puntos de sección o equipo | Clasificación por WOD (Scaled o RX, sexo, edad) y por constancia del mes. Sin ranking entre boxes | M |
| 13 | Timer: reloj, Tabata, For Time, AMRAP, EMOM | Modo pista a pantalla completa | Timer; mejor, el timer que lee el formato del WOD | S |
| 14 | Librería de ejercicios con vídeo y favoritos | Biblioteca con vídeo, solo para el staff | Librería de movimientos para el atleta, con favoritos | S |
| 15 | Mis vídeos, vídeo en el resultado | Fotos y audio en Blobs | Vídeo del atleta para que el coach corrija la técnica | M, después |
| 16 | Mensajes del box a todos y entre atletas | Nada | Anuncios del box con notificación y mensajes coach-atleta adulto. Sin chat entre atletas | M |
| 17 | Perfil social con seguidores y publicaciones | Nada | Muro del box con los resultados del día y reacciones. Sin seguidores | M, después |
| 18 | Competiciones de terceros | Partidos del equipo | Competición interna del box (throwdown, Open). Sin catálogo de terceros | M, después |
| 19 | Mis entrenamientos personalizados | Tareas asignadas a un deportista, readaptación y PDI | Programación individual que vende el box: accesorios, preparación de competición | M |
| 20 | Tienda con precio para socios | Tienda con stock, pedidos y cobro | Precio para atletas con tarifa activa | S |
| 21 | Agenda: próximas e historial | Agenda | Se reutiliza con los estados de la reserva | S |

Lo que el box necesita y no sale en las capturas (back office): horario semanal por tipo de clase con coach y sala, políticas de reserva, lista de espera automática, check-in, tarifas y bonos, cobro recurrente domiciliado, pausas de tarifa, leads y clase de prueba, métricas del negocio (atletas activos, ocupación, altas y bajas, ingresos recurrentes) y la pantalla del box en la TV.

## 4. Mejor que AimHarder: dónde ganamos

1. **El box es la marca.** AimHarder pone su nombre en el ranking ("AimHarder Fittest") y en la analítica. Aquí el atleta solo ve su box: escudo, colores, tipografía y voz (ADR 0043). Para el dueño es argumento de venta.
2. **Kilos calculados.** El WOD dice "1 x 10 @ 60%" y AimHarder deja el campo en 0 kg. Aquí: "60% de tu 1RM de press banca (80 kg) = 48 kg", serie a serie.
3. **Restricciones dentro del WOD.** Con una lesión abierta, el WOD marca qué movimiento cambiar. Ya existe en "Mi plan" (ADR 0046); se lleva al WOD.
4. **Retención con reglas explicables.** El motor de reglas de la ADR 0039 trabaja para el dueño: "11 atletas no reservan desde hace 14 días; 4 renuevan tarifa esta semana". Es la métrica que paga el box.
5. **Programación con IA.** El perfil de coach de box ya existe (ADR 0044). Se pasa de una sesión a la semana de WODs por disciplina, con el estilo del box.
6. **Brief de la clase para el coach.** Quién viene, quién es nuevo, quién vuelve tras dos semanas, quién tiene una restricción y sus máximas para ajustar cargas.
7. **Dinero sin hojas de cálculo.** Stripe Connect y Holded ya conectados (ADR 0042): cada cobro sale como factura.
8. **Privacidad seria.** Salud y medidas en un área aparte con consentimiento y lectura auditada. Lista de la clase y clasificación con opción de ocultarse.

## 5. Interfaces por rol

### 5.1 Atleta (móvil)

Barra inferior de cinco destinos:

| Club deportivo (hoy) | Club de fitness |
| --- | --- |
| Inicio | **Hoy**: próxima clase reservada, WOD del día con tus kilos, saldo de la tarifa y racha |
| Mi ficha | **Reservar**: tira de la semana, clases del día con ocupación, reservar en un toque, lista de espera |
| Mi plan | **WOD**: el del día por disciplina, registrar resultado, clasificación |
| Mi bienestar | **Progreso**: máximas, benchmarks, calendario y racha, evolución física, analítica |
| Más | **Más**: mi tarifa y pagos, tienda, anuncios, retos, timer, librería, ajustes |

AimHarder usa cuatro pestañas y un menú de trece entradas. Aquí lo diario está a un toque y el menú baja a siete.

### 5.2 Coach (móvil)

| Club deportivo | Club de fitness |
| --- | --- |
| Inicio con su panel por cargo | **Hoy**: mis clases del día con ocupación |
| Equipo: plantilla, sesión, pase de lista | **Clase**: brief (nuevos, restricciones, quién vuelve), check-in en un toque, WOD y pantalla del box |
| Entrenamiento: semana, carga, biblioteca | **Programación**: semana de WODs, borradores e IA |
| Agenda | **Atletas**: ficha con marcas y asistencia |

### 5.3 Dueño o administración (escritorio)

```
Hoy
EL BOX       Clases · Programación · Atletas · Equipo
NEGOCIO      Tarifas y bonos · Leads y pruebas · Tienda · Métricas
COMUNIDAD    Anuncios · Retos y ranking
Ajustes
```

El inicio responde en este orden: clases de hoy con ocupación y lista de espera; cifras del box (atletas activos, ocupación media de la semana, altas y bajas del mes, ingresos recurrentes, pruebas de la semana); qué hace falta hoy (atletas que no vienen, bonos que caducan, pruebas sin convertir, WOD de mañana sin publicar, cobros fallidos); y el estado de la programación de la semana.

## 6. Qué cambia en datos (para dimensionar, sin código)

- **Club:** campo `modelo` (`deportivo`, `fitness`).
- **Clases abiertas:** el tipo de clase reutiliza el equipo o grupo con un modo "abierta", sin inscritos fijos. El horario semanal (`team_schedules`) ya genera los eventos. El evento gana aforo propio: hoy solo lo tiene el grupo.
- **Reservas:** tabla nueva con atleta, clase, estado (reservada, en espera, cancelada, cancelación tardía, no presentado, asistida), cuándo y desde dónde. El check-in escribe en la asistencia que ya existe.
- **Políticas de reserva:** por club y tipo de clase. Abre N días antes, cierra N minutos antes, cancelación gratis hasta N horas antes, penalización por cancelación tardía y por no presentarse, máximo de reservas por día y por semana, lista de espera con subida automática y aviso.
- **Tarifas y bonos:** el plan de cuota gana derecho de uso (ilimitada, N por semana, N por mes, bono de N con caducidad) y los tipos de clase que incluye. Saldo de sesiones por atleta que baja con cada clase. Pausa de tarifa con fechas.
- **Cobro recurrente:** suscripción en la cuenta de Stripe del box con domiciliación SEPA. Hoy cada cuota se cobra suelta.
- **Programación:** el WOD cuelga del día y la disciplina, no de cada clase. Reutiliza sesión, bloques y biblioteca. Cada bloque lleva su marcador, time cap, versiones Scaled, RX y RX+, y hora de publicación.
- **Resultados:** tabla nueva con atleta, bloque del WOD, marcador, nivel, nota, sensaciones y si es público.
- **Movimientos, máximas y benchmarks:** catálogo sembrado por el modelo; máximas por movimiento y repeticiones; PR detectado al registrar. Los tests físicos ganan la unidad `kg`.
- **Medidas corporales:** del atleta, privadas, compartidas con el box con el consentimiento que ya existe (`health_consents`).
- **Anuncios y notificaciones:** anuncios con confirmación de lectura y notificación web (PWA). Mensajes coach-atleta solo entre adultos (DESIGN.md, regla 13).
- **Leads:** contacto, origen, clase de prueba reservada desde la web del box (amplía el catálogo público `/api/public/v1`) y conversión a atleta.

## 7. Plan por fases

| Fase | Entregable | Esfuerzo | Depende de |
| --- | --- | --- | --- |
| 1. Que se vea fitness | Modelo del club, capa de léxico, navegación e inicio de los tres roles, presets de identidad de box y club demo de box. Las pantallas nuevas con lo que ya existe | 4 a 6 días | Aprobar esta propuesta |
| 2. Reservar y cobrar | Clases abiertas, reservas, lista de espera, políticas, check-in e historial con estados; tarifas con derecho de uso y bonos; cobro recurrente | 9 a 12 días | 1 |
| 3. El WOD | Programación diaria por disciplina, publicación programada, resultados, clasificación por WOD, máximas, benchmarks, kilos calculados e IA de la semana | 7 a 9 días | 1 (mejor tras la 2) |
| 4. Progreso y comunidad | Calendario y racha, evolución física, analítica del atleta, retos y ranking del mes, anuncios con notificación, timer y librería para el atleta | 6 a 8 días | 3 |
| 5. Negocio del box | Leads y clase de prueba desde la web, métricas del negocio, reglas de retención, pausas, programación individual de pago y pantalla del box | 7 a 9 días | 2 |

Por qué este orden:

- La 1 cambia la percepción con el menor coste: casi todo es interfaz sobre tablas que existen. Permite enseñar el producto a un box en una semana.
- La 2 decide la compra. Reservar y cobrar es lo que un box usa decenas de veces al día. Sin eso nadie deja AimHarder, por bueno que sea lo demás.
- La 3 retiene al atleta. Es lo que abre cada día y lo que le hace no querer cambiar.
- La 4 y la 5 suben el precio: comunidad para el atleta, métricas y leads para el dueño.
- Ahora, vendible a un box: 1 y 2, unas tres semanas. Después: 3, unas dos. Más adelante: 4 y 5.

Cada fase sigue la disciplina del repo: rama, PR, ADR, migraciones idempotentes, pruebas de aislamiento y capturas.

## 8. Decisiones que te pido

1. **Modelo a nivel de club.** Recomiendo sí. A nivel de sección cuesta el doble y hoy no hay cliente que lo pida.
2. **Atleta único en fitness, sin ficha de socio aparte.** Recomiendo sí. Resuelve la ambigüedad sin tocar datos.
3. **Marca comercial propia para fitness.** "sportsmanager" huele a club deportivo en la entrada, los emails y la web. Dentro del box no se ve, porque manda su marca; fuera, sí. Recomiendo una marca y una landing propias para fitness sobre la misma plataforma. Coste: una landing, el remitente de los emails y la pantalla de entrada por modelo. El nombre lo eliges tú.
4. **Lista de la clase y clasificación visibles por defecto, con opción de ocultarse.** Recomiendo sí, con un consentimiento al entrar. Es parte de la experiencia de un box; conviene validarlo con quien lleve el RGPD.
5. **Sin chat entre atletas ni red social en la primera versión.** Recomiendo anuncios del box y mensajes coach-atleta. El chat entre atletas exige moderación y no paga más al box.
6. **Cobro recurrente dentro de la fase 2.** Recomiendo sí: cobrar es el primer dolor del dueño de un box. Si aprieta el calendario, se separa en una 2b.
7. **Sin competiciones de terceros ni ranking entre boxes.** Es el efecto red de AimHarder y no tenemos esa red. Competición interna del box, más adelante.

## 9. Lo que no toco

El club deportivo se queda como está. Identidad, tienda, cuotas, contabilidad, "ver como", paleta, aislamiento, IA y biblioteca se comparten. Nada de esta propuesta cambia lo que ve hoy un club deportivo.
