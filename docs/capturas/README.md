# Capturas de la interfaz (Bloques 14 a 26, pizarra animada, tienda, pasarela y contabilidad, identidad del club, mejoras de la plataforma, clubs de fitness, su revisión y la planificación del box)

Capturas que generan las pruebas de interfaz (`pnpm test:ui`) contra la API real con base embebida, con el front de Vite + React + Tailwind sobre el design system del producto (`packages/design`, ADR 0027). Escritorio a 1280x800; móvil, Pixel 7. La fuente viva es el artefacto `capturas-interfaz` de CI; esta carpeta es la foto de la revisión del club completo (ADR 0031), con el design system 1.3: todo botón lleva el icono de su acción (rueda dentada para editar, cubo de basura rojo para eliminar, más para añadir); la fila es el objeto (se abre tocándola, con acciones como iconos silenciosos sin borde); la paleta de mandos ⌘K encuentra personas, equipos, pantallas y acciones; y la plantilla de un equipo se ve como un tablero por posición: secciones por deporte, socios, agenda e instalaciones, cuotas y "ver como", sobre lo que ya había de los bloques 11 a 13 (ADR 0028, 0029 y 0030), más el alcance por cargo y la gestión de acceso por rol del Bloque 19 (ADR 0033): el cuerpo técnico, la dirección y la fisio ven solo su parte del club, y "Personal" gana la pestaña "Acceso", y el partido en directo del Bloque 20 (ADR 0034): configuración del motor por sección, consola en la banda a pantalla completa y en tres zonas con el banquillo arrastrable (ADR 0037), estadísticas e histórico, y el entrenamiento de los bloques 21 a 26 (ADR 0039): semana del equipo con "A tener en cuenta", sesión por bloques con su cierre y modo pista, biblioteca con pizarra, carga, enfermería, salud y "Mi bienestar".

Cada club vive en una ruta del mismo dominio: el club demo en `/demo`, el negocio en `/admin`. Cuentas de demostración, todas con contraseña `123456`: `admin@demo.test` (administra el club demo; en este entorno también la plataforma), `entrenador@demo.test` (entrenadora del Alevín A), `familia@demo.test` (madre de dos jugadores y socia), `director@demo.test` (dirección deportiva), `fisio@demo.test` (fisioterapia), `senior@demo.test` (entrenador del Sénior A), `preparador@demo.test` (preparación física), `jugador@demo.test` (deportista del Sénior A con cuenta propia, rol de deportista), `deportista@demo.test` (deportista de yoga con cuenta propia), `natacion@demo.test` (coordinación de natación) y `basquet@demo.test`, `basquetfem@demo.test` y `yoga@demo.test` (cuerpo técnico). El club demo llega con la temporada 2026-27, cuatro secciones (fútbol sala, baloncesto, natación y yoga) con categorías, doce equipos y grupos, 95 deportistas, socios con tres tipos, cuatro instalaciones con horario, la agenda generada desde los horarios, partidos, planes de cuota con cargos y pagos, un reto activo, dos partidos jugados del Alevín A con su registro completo y el Sénior A con cuatro partidos, sesiones planificadas, cuatro semanas de carga y bienestar, biblioteca de tareas, un jugador limitado y otro en readaptación.

## Acceso

### Entrada general, con la marca del producto

![Entrada general, con la marca del producto](escritorio-01-login.png)

### Login: error de credenciales

![Login: error de credenciales](escritorio-02-login-error.png)

### Recuperar contraseña

![Recuperar contraseña](escritorio-05-recuperar.png)

### Recuperar contraseña: confirmación

![Recuperar contraseña: confirmación](escritorio-06-recuperar-enviado.png)

### Nueva contraseña sin enlace válido

![Nueva contraseña sin enlace válido](escritorio-07-nueva-contrasena-sin-token.png)

## El inicio del club completo (`/demo`)

### Portada del administrador: héroe con el próximo evento, hoy en el club, recuentos y el club por deporte

![Portada del administrador](escritorio-03-inicio.png)

### Inicio con alertas del club, preparación de las fichas y actividad plegada

![Inicio operativo](escritorio-03b-inicio-operativo.png)

### Inicio completo: secciones, alertas y recuentos de socios y cuotas (Bloque 14)

![Inicio del club completo](escritorio-03c-inicio-club-completo.png)

### Menú de persona: ver el club como otra persona, clubes, negocio, idioma y salir

![Menú de persona](escritorio-04-menu-persona.png)

### Paleta de mandos (⌘K): "alev" encuentra el Alevín A; también personas, pantallas y acciones

![Paleta de mandos](escritorio-03d-paleta.png)

## Ver el club como otra persona (Bloque 14)

### Elegir a quién mirar: personal, familias y administración del club

![Ver como](escritorio-80-ver-como.png)

### El club con los ojos de la entrenadora, con la banda de salida

![Ver como entrenadora](escritorio-81-ver-como-entrenadora.png)

### El club con los ojos de una familia

![Ver como familia](escritorio-82-ver-como-familia.png)

## Secciones por deporte (`/demo/sections`, Bloque 14)

### Secciones: una tarjeta por deporte con sus cifras, coordinación y alertas

![Secciones](escritorio-30-secciones.png)

### Nueva sección: el deporte propone el nombre y las categorías (hoja)

![Nueva sección](escritorio-32-seccion-nueva.png)

### Ficha de sección: categorías con sus equipos, resumen, alertas y accesos

![Ficha de sección](escritorio-31-seccion-ficha.png)

### Personal de la sección

![Personal de la sección](escritorio-31b-seccion-personal.png)

### Nueva categoría (hoja)

![Nueva categoría](escritorio-33-categoria-nueva.png)

### Nuevo equipo en una categoría (hoja)

![Nuevo equipo](escritorio-34-equipo-nuevo.png)

### Ficha de equipo: plantilla, cuerpo técnico con cargo y horario semanal

![Ficha de equipo](escritorio-35-equipo-ficha.png)

### Horario semanal del equipo, del que se genera la agenda (hoja)

![Horario del equipo](escritorio-35b-equipo-horario.png)

### Añadir a la plantilla a un jugador del club

![Añadir jugador a la plantilla](escritorio-36-equipo-anadir-jugador.png)

## Deportistas y familias (`/demo/players`)

### Deportistas con sección, equipo, socio, familia y estado

![Deportistas](escritorio-40-jugadores.png)

### Ficha de deportista: foto, indicadores, objetivo, acciones prioritarias, timeline, datos personales y de socio, PDI, equipos, familia y estado

![Ficha de deportista](escritorio-41-jugador-ficha.png)

### Valorar los indicadores (hoja)

![Valorar indicadores](escritorio-41b-jugador-valorar.png)

### Ficha con foto, indicadores revisados y un registro añadido al timeline

![Ficha completa](escritorio-41c-jugador-ficha-completa.png)

### Invitar a la familia desde la ficha

![Invitar familia](escritorio-42-jugador-invitar-familia.png)

### Invitación de familia pendiente, con el enlace de pruebas

![Familia pendiente](escritorio-43-jugador-familia-pendiente.png)

### Alta de un deportista

![Nuevo deportista](escritorio-44-jugador-nuevo.png)

### Dar de baja: confirmación con el texto del design system

![Dar de baja](escritorio-45-jugador-baja.png)

## Socios (`/demo/club-members`, Bloque 15)

### Socios con número, tipo, papeles en el club, cuotas y estado

![Socios](escritorio-90-socios.png)

### Nuevo socio: persona nueva o alguien que ya está en el club (hoja)

![Nuevo socio](escritorio-91-socio-nuevo.png)

### Ficha de socio: persona, socio, papeles y cuotas

![Ficha de socio](escritorio-92-socio-ficha.png)

## Agenda e instalaciones (`/demo/agenda`, `/demo/facilities`, Bloque 16)

### Agenda de la semana, por sección, equipo o instalación

![Agenda](escritorio-93-agenda.png)

### Nuevo evento con instalación y repetición semanal (hoja)

![Nuevo evento](escritorio-94-agenda-evento-nuevo.png)

### Detalle de un entrenamiento: equipo, instalación y pase de lista

![Detalle de evento](escritorio-95-agenda-evento.png)

### Instalaciones con apertura y uso de la semana

![Instalaciones](escritorio-96-instalaciones.png)

### Ficha de instalación: horas de apertura y ocupación semanal

![Ficha de instalación](escritorio-97-instalacion-ficha.png)

## Cuotas y cobros (`/demo/fees`, Bloque 18)

### Cargos del club: pendientes, vencidos y cobrados, con filtros, y el aviso de que el club cobra a mano

![Cargos](escritorio-98-cuotas-cargos.png)

### Registrar un pago a mano (hoja)

![Registrar pago](escritorio-98b-cuotas-cobrar.png)

### Planes de cuota: a quién aplica cada uno

![Planes](escritorio-98c-cuotas-planes.png)

### Ajustes, Cobros y contabilidad: cómo cobra el club, con Stripe preparado y sin claves

![Ajustes de cobro](escritorio-99-ajustes-cobros.png)

### Pasarela y contabilidad (ADR 0042): por qué conectar Stripe, en qué paso está el club, y Holded

![Pasarela y contabilidad](escritorio-123-cuotas-pasarela-y-contabilidad.png)

### Ajustes, Cobros y contabilidad: la cuenta de Stripe del club, que se da de alta desde aquí

![Cuenta de Stripe del club](escritorio-124-ajustes-cuenta-de-stripe.png)

### Ajustes, Cobros y contabilidad: conectar Holded con su clave de API, debajo de la pasarela (ADR 0045)

![Conectar Holded](escritorio-125-ajustes-conectar-holded.png)

## Personal y ajustes

### Personal del club con cargo y equipos

![Personal del club](escritorio-10-miembros.png)

### Personal con cargo (Bloque 13)

![Personal con cargo](escritorio-10b-miembros-cargos.png)

### Invitar a alguien (hoja)

![Invitar a alguien](escritorio-11-miembros-invitar.png)

### Invitar a personal del club con cargo y equipo (hoja)

![Invitar personal](escritorio-11b-miembros-invitar-personal.png)

### Invitaciones pendientes con el enlace de pruebas

![Invitaciones pendientes](escritorio-12-invitaciones.png)

### Roles de una persona (hoja)

![Roles de una persona](escritorio-13-miembros-roles.png)

### Acceso por rol (Bloque 19): un check por rol o cargo y área, con el alcance a la vista

![Acceso por rol](escritorio-14-personal-acceso.png)

### Nueva excepción por persona en la pestaña "Acceso": todas las áreas editables, partiendo de lo que ve su rol (ADR 0036)

![Nueva excepción](escritorio-14b-personal-excepcion.png)

### Ajustes del club, General (ADR 0045): la puesta en marcha mientras falte algo, y los datos y la zona horaria

![Ajustes del club: datos generales](escritorio-20-ajustes-general.png)

### Ajustes del club, Identidad (ADR 0043): vista previa, escudo, paletas y colores, tipografía, botones, iconos, fondo, portada, navegación, esquinas, lema y voz

![Ajustes del club: identidad](escritorio-21-ajustes-identidad.png)

### Identidad: vista previa en directo en toda la app antes de guardar (letra deportiva, navegación del club, portada a rayas, voz vestuario y lema)

![Ajustes del club: identidad en vista previa](escritorio-22-ajustes-identidad-vista-previa.png)

### Inicio del club con su identidad guardada: habla con su voz y lleva su lema

![Inicio con la identidad del club](escritorio-23-inicio-identidad-propia.png)

### Ajustes del club: escudo subido y visible en la navegación

![Ajustes del club: logo subido](escritorio-24-ajustes-logo-subido.png)

### Ajustes, Temporadas y socios: nueva temporada (hoja)

![Nueva temporada](escritorio-33-temporada-nueva.png)

### Ajustes, Temporadas y socios: las temporadas y, debajo, los tipos de socio

![Tipos de socio](escritorio-99b-ajustes-tipos-socio.png)

### Ajustes, General: puesta en marcha del club

![Puesta en marcha](escritorio-99c-ajustes-puesta-en-marcha.png)

## Familia y entrenadora

### Portada de una familia: sus deportistas

![Portada de una familia](escritorio-46-familia-inicio.png)

### Mi familia: equipo de la temporada y quién lo entrena

![Mi familia](escritorio-47-familia.png)

### Ficha de uno de los suyos, vista por la familia: foto, equipo, objetivo, reto y movimientos; sin indicadores (Bloque 13)

![Ficha para la familia](escritorio-47b-familia-ficha.png)

### La agenda de la familia: lo que tienen sus hijos esta semana (Bloque 16)

![Agenda de la familia](escritorio-99d-familia-agenda.png)

### Mis cuotas: lo pendiente y lo pagado, con el aviso de cobro a mano (Bloque 18)

![Mis cuotas](escritorio-99e-familia-cuotas.png)

### La entrenadora gestiona la plantilla de su equipo y valora a sus jugadores (Bloque 13)

![Entrenadora](escritorio-48-entrenadora-equipo.png)

### Inicio de la entrenadora: su panel con sus equipos y qué hace falta en sus fichas

![Inicio de la entrenadora](escritorio-48b-entrenadora-inicio.png)

## Reto por puntos (Bloque 13; ámbito por sección o equipo, ADR 0032). Sin entrada en la barra: vive en cada sección y cada equipo

### Pestaña "Retos" de una sección: el de toda la sección y el de cada equipo

![Retos de la sección](escritorio-70-retos.png)

### Nuevo reto desde la sección (hoja): la sección viene dada; toda la sección o un solo equipo

![Nuevo reto](escritorio-70b-reto-nuevo.png)

### El reto en la ficha del equipo: el suyo, el de su sección y el histórico

![Reto del equipo](escritorio-70c-equipo-retos.png)

### Un reto: catálogo de pruebas

![Catálogo de pruebas](escritorio-71-reto-pruebas.png)

### Nueva prueba (hoja)

![Nueva prueba](escritorio-71b-reto-prueba-nueva.png)

### Validación de los registros de las familias, acotada al equipo desde el que se abrió

![Validación](escritorio-72-reto-validacion.png)

### Participación por jugador, solo para el personal

![Participación](escritorio-73-reto-participacion.png)

### Los retos vistos por la familia: los de la sección y los del equipo de cada jugador, solo con sus puntos

![Reto de la familia](escritorio-74-familia-reto.png)

### La familia registra actividad (hoja)

![Registrar actividad](escritorio-74b-familia-reto-registrar.png)

## Paneles por cargo (Bloque 13)

### Dirección deportiva: seguimiento del club

![Dirección deportiva](escritorio-75-director-inicio.png)

### Fisioterapia: seguimiento físico

![Fisioterapia](escritorio-76-fisio-inicio.png)

## Invitación de punta a punta

### Invitación: la persona crea su cuenta en la ruta del club

![Invitación: la persona crea su cuenta](escritorio-40-invitacion.png)

### Portada de una tutora: solo lo que su rol permite

![Portada de una tutora](escritorio-41-inicio-tutor.png)

## Panel del negocio (`/admin`)

### Entrada del negocio: su propio login, sin marca de ningún club

![Entrada del negocio](escritorio-48-negocio-login.png)

### Alta del primer administrador de plataforma (solo emails autorizados)

![Alta del primer administrador](escritorio-49-negocio-alta-administrador.png)

### Una cuenta de club no entra en el negocio

![Cuenta de club rechazada](escritorio-42-negocio-cuenta-de-club.png)

### Clubes

![Panel del negocio: clubes](escritorio-50-negocio-clubes.png)

### Nuevo club (sin marca ni logo)

![Panel del negocio: nuevo club](escritorio-51-negocio-nuevo-club.png)

### Ficha de un club sin administrador

![Panel del negocio: ficha de un club sin administrador](escritorio-52-negocio-ficha-club.png)

### Invitar al primer administrador

![Panel del negocio: invitar al primer administrador](escritorio-53-negocio-invitar-admin.png)

### Ficha con la invitación enviada

![Panel del negocio: ficha con la invitación enviada](escritorio-54-negocio-ficha-club-invitado.png)

### Ficha del club demo con sus administradores

![Panel del negocio: ficha del club demo](escritorio-55-negocio-ficha-demo.png)

### Actividad

![Panel del negocio: actividad](escritorio-56-negocio-actividad.png)

### Sistema

![Panel del negocio: sistema](escritorio-57-negocio-sistema.png)

## Mejoras de la plataforma (ADR 0047; en Ajustes, ADR 0048)

Solo la administración del club, en la pestaña Mejoras de Ajustes (`/demo/settings?tab=improvements`). Lo que un club envía lo ven ese club y la plataforma; lo publicado lo ven todos los clubes, sin saber quién lo pidió.

### Ajustes, Mejoras: las sugerencias del club arriba y la hoja de ruta debajo (lo que viene en orden y con fecha aproximada, lo que está en estudio para votar y lo último disponible)

![Hoja de ruta del club](escritorio-140-mejoras-hoja-de-ruta.png)

### Detalle de una mejora: estado, fecha aproximada, votos y el voto del club

![Detalle de una mejora](escritorio-141-mejoras-detalle.png)

### Sugerir una mejora: el formulario avisa de las parecidas que ya están en la hoja de ruta para votarlas

![Sugerir una mejora](escritorio-142-mejoras-sugerir.png)

### Ajustes, Mejoras: las sugerencias del club con su estado

![Sugerencias del club](escritorio-143-mejoras-sugerencias-del-club.png)

### Negocio: la bandeja de lo que piden los clubes, por revisar

![Mejoras por revisar](escritorio-144-negocio-mejoras-por-revisar.png)

### Negocio: revisar una sugerencia (estado, versión pública, fecha aproximada y respuesta al club)

![Revisar una sugerencia](escritorio-145-negocio-mejoras-revisar.png)

### Negocio: la hoja de ruta con su orden y las flechas para ordenarla

![Hoja de ruta en el negocio](escritorio-146-negocio-mejoras-hoja-de-ruta.png)

### El club ve en qué ha quedado su sugerencia, con la respuesta de la plataforma

![Respuesta de la plataforma](escritorio-147-mejoras-respuesta.png)

## Varios clubes con un único login

### La misma cuenta acepta la invitación al club nuevo (otra ruta)

![La misma cuenta acepta la invitación al club nuevo](escritorio-60-club-nuevo-invitacion.png)

### Portada del club nuevo con su propia marca

![Portada del club nuevo](escritorio-61-club-nuevo-inicio.png)

### Selector de clubes con varias pertenencias

![Selector de clubes](escritorio-62-mis-clubes.png)

## Partido en directo (Bloque 20)

### Configuración del motor por sección: cómo se juega y el catálogo de acciones

![Configuración del partido en directo](escritorio-100-partido-configuracion.png)

### Una acción nueva inventada por el club

![Acción nueva](escritorio-100b-partido-accion-nueva.png)

### Partidos del equipo

![Partidos del equipo](escritorio-101-partidos.png)

### Estadísticas de un partido: comparativa, mapa de finalización, trabajo por periodos, jugadores y porteros

![Estadísticas del partido](escritorio-102-partido-estadisticas.png)

### Histórico del equipo: selección de partidos, acumulados, evolución y cruce de métricas

![Histórico del equipo](escritorio-103-partido-historico.png)

### Partido nuevo y convocatoria con el quinteto inicial

![Partido nuevo](escritorio-104-partido-nuevo.png)

![Convocatoria](escritorio-104b-partido-convocatoria.png)

### La consola en la banda, a pantalla completa y en tres zonas: el partido arriba (marcador, faltas, cronómetro, deshacer y menú), nuestro equipo (pista, banquillo arrastrable y bandeja del jugador tocado; sin nadie tocado, media bandeja del equipo y media del partido) y el rival entero con las últimas acciones en pequeño

![Partido en directo](escritorio-105-partido-en-directo.png)

### La zona del gol se toca sobre la propia pista: la mitad de ataque en nueve, la propia oscurecida

![Zona del gol](escritorio-105b-partido-zona.png)

### Sin nadie seleccionado, la bandeja se parte: media de acciones del equipo y media de acciones del partido, con el rival entero a la derecha

![Bandeja del equipo y del partido](escritorio-105d-partido-bandeja-equipo-y-partido.png)

### Lo que ve la familia: los partidos de su hija, solo su línea

![Partidos para la familia](escritorio-106-familia-partidos.png)

## Entrenamiento, carga y salud (bloques 21 a 26, ADR 0039)

### Semana del Sénior A: días con su etiqueta MD, sesiones, partido, disponibilidad, carga planificada frente a la media y "A tener en cuenta" con la cifra de cada recomendación

![Semana del equipo](escritorio-201-entrenamiento-semana.png)

### La sesión: planificación, avisos de la sesión, bloques con sus tareas y pizarras, y la plantilla del día con su disponibilidad

![Sesión](escritorio-202-entrenamiento-sesion.png)

### Modo pista: una tarea por pantalla, a pantalla completa, con cronómetro

![Modo pista](escritorio-204-entrenamiento-pista.png)

### Carga del equipo: aguda, crónica y relación aguda:crónica como aviso, con el umbral del club

![Carga del equipo](escritorio-207-entrenamiento-carga.png)

### Biblioteca de tareas y una tarea nueva dibujada en la pizarra

![Biblioteca](escritorio-209-entrenamiento-biblioteca.png)

![Tarea nueva](escritorio-210-entrenamiento-tarea-nueva.png)

### Enfermería y salud de un jugador: solo con acceso a Salud, con consentimiento y lectura auditada

![Enfermería](escritorio-211-entrenamiento-enfermeria.png)

![Rendimiento y salud](escritorio-212-entrenamiento-rendimiento-salud.png)

### "Mi bienestar": el deportista adulto responde desde su cuenta

![Mi bienestar](escritorio-213-entrenamiento-mi-bienestar.png)

## Pizarra animada (ADR 0040)

### El editor: las piezas se arrastran, el movimiento se graba por capas con voz y se reproduce

![Pizarra grabada](escritorio-220-pizarra-grabada.png)

### En la ficha de la tarea, parada, la pizarra enseña por dónde va cada pieza

![Trayectorias](escritorio-221-pizarra-trayectorias.png)

### Reproduciendo: las piezas se mueven con la voz

![Reproducción](escritorio-222-pizarra-reproduccion.png)

## Tienda del club (ADR 0041)

### La tienda fijada en "Mi familia": tres productos a la venta para sus menores y el enlace

![Tienda fijada en Mi familia](escritorio-110-familia-tienda-fijada.png)

### Catálogo de la familia por categorías: la cena solo del Alevín A aparece porque Clara juega en él

![Catálogo de la tienda](escritorio-111-tienda-catalogo.png)

### Ficha de compra: talla (la agotada, tachada), cantidad y para quién de los suyos

![Ficha de compra](escritorio-112-tienda-producto.png)

### Cesta: un pedido por persona, con su nota para el club

![Cesta](escritorio-113-tienda-cesta.png)

### Mis pedidos: estado, cobro, anular mientras está recibido y sin pagar

![Mis pedidos](escritorio-114-tienda-mis-pedidos.png)

### Gestión de pedidos: por preparar, listos, por cobrar y descarga a Excel

![Pedidos de la tienda](escritorio-115-tienda-pedidos.png)

### Ficha del pedido: preparar, entregar, cobrar a mano o anular (devuelve el stock)

![Ficha del pedido](escritorio-116-tienda-pedido.png)

### Productos con stock, vendidas, tallas agotadas y pocas unidades

![Productos de la tienda](escritorio-117-tienda-productos.png)

### Nuevo producto con tallas infantiles, stock por talla, ámbito y visibilidad en la web

![Nuevo producto](escritorio-118-tienda-producto-nuevo.png)

### Venta en el mostrador para cualquier persona del club

![Venta en el mostrador](escritorio-119-tienda-mostrador.png)

### Ajustes, Web del club: clave publicable, endpoints, código para pegar y prueba en vivo

![Web del club](escritorio-120-ajustes-desarrolladores.png)

### El deportista adulto compra lo suyo: sin la cena de un equipo que no es el suyo

![Tienda del deportista adulto](escritorio-121-tienda-deportista.png)

## Deportista con cuenta propia (ADR 0046)

### Inicio del deportista: lo suyo de hoy y su próxima sesión

![Inicio del deportista](escritorio-130-deportista-inicio.png)

### Mi ficha, en primera persona

![Mi ficha](escritorio-131-deportista-ficha.png)

### Mi plan: sus entrenamientos con el plan publicado, solo lo que le toca

![Mi plan](escritorio-132-deportista-entrenamientos.png)

### Una deportista de yoga: sus clases, sin anunciar un plan que no se hace

![Mi plan de una actividad](escritorio-133-deportista-actividad.png)

### La administración le da acceso desde su ficha

![Acceso del deportista](escritorio-134-ficha-acceso-deportista.png)

### Ver el club como un deportista

![Ver como deportista](escritorio-135-ver-como-deportista.png)

## Clubs de fitness (ADR 0049): el box de demostración (`/demo-box`)

Cuentas, con contraseña `123456`: `atleta@demo.test` (Laia Ferrer, atleta con tarifa ilimitada), `coach@demo.test` (Álex Romero, coach) y `box@demo.test` (Marta Vidal, dueña); `admin@demo.test` también administra el box.

### Inicio de la atleta: su próxima clase, el WOD de hoy con sus kilos, racha, último PR, tarifa y el box

![Inicio de la atleta: su próxima clase, el WOD de hoy con sus kilos, racha, último PR, tarifa y el box](escritorio-240-box-atleta-inicio.png)

### Reservar: la semana en calendario (ADR 0051), con tu reserva rellena, lo que puedes reservar con borde y lo pasado o cerrado en gris

![Reservar: la semana en calendario (ADR 0051), con tu reserva rellena, lo que puedes reservar con borde y lo pasado o cerrado en gris](escritorio-241-box-atleta-reservar.png)

### Reservar: el panel de una clase, con sus plazas, el coach y el botón

![Reservar: el panel de una clase, con sus plazas, el coach y el botón](escritorio-241b-box-atleta-reservar-panel.png)

### La clase: ventanas de reserva y cancelación, quién viene y el WOD

![La clase: ventanas de reserva y cancelación, quién viene y el WOD](escritorio-242-box-atleta-clase.png)

### El WOD del día con sus kilos según su 1RM y su resultado

![El WOD del día con sus kilos según su 1RM y su resultado](escritorio-243-box-atleta-wod.png)

### Clasificación de un bloque por nivel

![Clasificación de un bloque por nivel](escritorio-244-box-atleta-clasificacion.png)

### Progreso: calendario, marcas con su tabla de porcentajes, benchmarks, medidas y privacidad

![Progreso: calendario, marcas con su tabla de porcentajes, benchmarks, medidas y privacidad](escritorio-245-box-atleta-progreso.png)

### Mi tarifa: uso, domiciliar y reservas

![Mi tarifa: uso, domiciliar y reservas](escritorio-246-box-atleta-tarifa.png)

### Mensajes con el box

![Mensajes con el box](escritorio-247-box-atleta-mensajes.png)

### Anuncios del box

![Anuncios del box](escritorio-248-box-atleta-anuncios.png)

### Timer: por tiempo, AMRAP, EMOM y Tabata

![Timer: por tiempo, AMRAP, EMOM y Tabata](escritorio-249-box-atleta-timer.png)

### Ranking del mes por constancia

![Ranking del mes por constancia](escritorio-250-box-atleta-ranking.png)

### Inicio del coach: sus clases de hoy y el WOD

![Inicio del coach: sus clases de hoy y el WOD](escritorio-255-box-coach-inicio.png)

### Clases del coach: su semana en calendario, con las plazas y el check-in

![Clases del coach: su semana en calendario, con las plazas y el check-in](escritorio-256-box-coach-clases.png)

### La clase del coach: check-in, brief con las cargas y el WOD con la clasificación de la clase

![La clase del coach: check-in, brief con las cargas y el WOD con la clasificación de la clase](escritorio-257-box-coach-clase.png)

### Programación de la semana por disciplina

![Programación de la semana por disciplina](escritorio-258-box-coach-programacion.png)

### Editor del WOD, con la propuesta con IA

![Editor del WOD, con la propuesta con IA](escritorio-259-box-coach-editor.png)

### Atletas del box con tarifa, última visita y restricciones

![Atletas del box con tarifa, última visita y restricciones](escritorio-260-box-coach-atletas.png)

### Ficha de un atleta para el box

![Ficha de un atleta para el box](escritorio-261-box-coach-ficha.png)

### Mensajes del box con sus atletas

![Mensajes del box con sus atletas](escritorio-262-box-coach-mensajes.png)

### Inicio de la dueña: lo que pide atención, cifras, clases de hoy y programación de la semana

![Inicio de la dueña: lo que pide atención, cifras, clases de hoy y programación de la semana](escritorio-265-box-duena-inicio.png)

### Clases de la dueña: todo el box en la semana, por disciplina, con la ocupación y los huecos sin clases plegados

![Clases de la dueña: todo el box en la semana, por disciplina, con la ocupación y los huecos sin clases plegados](escritorio-265b-box-duena-clases.png)

### Clases en la vista de día

![Clases en la vista de día](escritorio-265c-box-duena-clases-dia.png)

### Horario: tipos de clase con sus franjas, coach, sala y aforo

![Horario: tipos de clase con sus franjas, coach, sala y aforo](escritorio-266-box-duena-horario.png)

### Tarifas y bonos con su derecho de uso

![Tarifas y bonos con su derecho de uso](escritorio-267-box-duena-tarifas.png)

### Leads y clases de prueba

![Leads y clases de prueba](escritorio-268-box-duena-leads.png)

### Métricas: ocupación por franja y semana, recurrente y conversión

![Métricas: ocupación por franja y semana, recurrente y conversión](escritorio-269-box-duena-metricas.png)

### Identidad: looks de box

![Identidad: looks de box](escritorio-270-box-duena-identidad.png)

### Pantalla del box para la tele

![Pantalla del box para la tele](escritorio-271-box-pantalla.png)

### Plataforma: el tipo de cada club

![Plataforma: el tipo de cada club](escritorio-272-plataforma-tipo-de-club.png)

## Revisión del box (ADR 0050): ejercicios y programación

### Ejercicios: la biblioteca del box por categoría y material

![Ejercicios: la biblioteca del box por categoría y material](escritorio-280-box-ejercicios.png)

### Un ejercicio: cómo se hace, puntos clave, errores comunes y escalados

![Un ejercicio: cómo se hace, puntos clave, errores comunes y escalados](escritorio-281-box-ejercicio.png)

### Editar un ejercicio, sin pizarra ni campos de deporte de equipo

![Editar un ejercicio, sin pizarra ni campos de deporte de equipo](escritorio-282-box-ejercicio-editar.png)

### Workouts: los benchmarks del catálogo por familia, para repasarlos o programarlos

![Workouts: los benchmarks del catálogo por familia, para repasarlos o programarlos](escritorio-283-box-workouts.png)

### Programación: la semana con un día por fila, el estado de cada WOD y los huecos sin WOD

![Programación: la semana con un día por fila, el estado de cada WOD y los huecos sin WOD](escritorio-290-box-programacion-semana.png)

### Editor del WOD: bloques por formato y "Así lo ve el atleta" al lado

![Editor del WOD: bloques por formato y "Así lo ve el atleta" al lado](escritorio-291-box-programacion-editor.png)

### Editor del WOD: la vista del atleta y la barra de publicación

![Editor del WOD: la vista del atleta y la barra de publicación](escritorio-292-box-programacion-vista-previa.png)

### Una semana vacía: copiar la anterior o programar cada día

![Una semana vacía: copiar la anterior o programar cada día](escritorio-293-box-programacion-dia-vacio.png)

## Planificación del box (ADR 0053)

### Planificación: el plan activo de cada disciplina, su punto del ciclo y el papel de cada día

![Planificación: el plan activo de cada disciplina, su punto del ciclo y el papel de cada día](escritorio-300-box-planificacion.png)

### El plan: dónde está el box, el mapa del ciclo, el reparto de los 100 puntos y lo que se puede esperar

![El plan: dónde está el box, el mapa del ciclo, el reparto de los 100 puntos y lo que se puede esperar](escritorio-301-box-plan-mapa.png)

### La semana del plan: cada día con su papel, su intención, su progresión, su WOD y el validador; equilibrio, cobertura y límites

![La semana del plan: cada día con su papel, su intención, su progresión, su WOD y el validador; equilibrio, cobertura y límites](escritorio-302-box-plan-semana.png)

### La revisión del domingo: lo previsto frente a lo que pasó, los ajustes y lo que ha aprendido el box

![La revisión del domingo: lo previsto frente a lo que pasó, los ajustes y lo que ha aprendido el box](escritorio-303-box-plan-revision.png)

### La salud de la programación: cumplimiento, equilibrio real, duraciones, patrones por semana y coste de la IA

![La salud de la programación: cumplimiento, equilibrio real, duraciones, patrones por semana y coste de la IA](escritorio-304-box-plan-salud.png)

### El material del box, con lo que está en reparación

![El material del box, con lo que está en reparación](escritorio-305-box-material.png)

### Nuevo plan, paso 1: la IA o una plantilla, con la proyección al lado

![Nuevo plan, paso 1: la IA o una plantilla, con la proyección al lado](escritorio-306-box-plan-nuevo-objetivo.png)

### Nuevo plan, paso 3: repartir 100 puntos entre seis capacidades

![Nuevo plan, paso 3: repartir 100 puntos entre seis capacidades](escritorio-307-box-plan-nuevo-enfasis.png)

### Nuevo plan, paso 5: lo que ya sabe el box y de dónde sale cada dato

![Nuevo plan, paso 5: lo que ya sabe el box y de dónde sale cada dato](escritorio-308-box-plan-nuevo-tu-box.png)

### Nuevo plan, paso 6: el resumen con el mapa del ciclo

![Nuevo plan, paso 6: el resumen con el mapa del ciclo](escritorio-309-box-plan-nuevo-resumen.png)

### El editor del WOD con la intención del día y los campos del plan

![El editor del WOD con la intención del día y los campos del plan](escritorio-310-box-plan-editor-intencion.png)

### El WOD del atleta: el plan, el papel, la intención y su versión en cada bloque

![El WOD del atleta: el plan, el papel, la intención y su versión en cada bloque](escritorio-315-box-atleta-wod-plan.png)

### Tu ciclo: dónde estás, tus marcas con su rango, tu constancia y tu nivel

![Tu ciclo: dónde estás, tus marcas con su rango, tu constancia y tu nivel](escritorio-316-box-atleta-ciclo.png)

### Tu ciclo en cifras, para guardar o compartir

![Tu ciclo en cifras, para guardar o compartir](escritorio-317-box-atleta-ciclo-cifras.png)

## Móvil

Las mismas pantallas en un móvil, con la forma envolvente del design system: cabecera con el escudo, barra de pestañas flotante abajo con cuatro destinos y "Más", listas en filas cápsula y hojas que ocupan todo el ancho.

### Entrada general

![Entrada general (móvil)](movil-01-login.png)

### Portada del club

![Portada del club (móvil)](movil-03-inicio.png)

### Inicio del club completo

![Inicio del club completo (móvil)](movil-03c-inicio-club-completo.png)

### Menú de persona

![Menú de persona (móvil)](movil-04-menu-persona.png)

### Paleta de mandos desde la lupa de la cabecera

![Paleta de mandos (móvil)](movil-03d-paleta.png)

### Ver como entrenadora

![Ver como entrenadora (móvil)](movil-81-ver-como-entrenadora.png)

### Secciones

![Secciones (móvil)](movil-30-secciones.png)

### Ficha de sección

![Ficha de sección (móvil)](movil-31-seccion-ficha.png)

### Ficha de equipo

![Ficha de equipo (móvil)](movil-35-equipo-ficha.png)

### Deportistas

![Deportistas (móvil)](movil-40-jugadores.png)

### Ficha de deportista

![Ficha de deportista (móvil)](movil-41-jugador-ficha.png)

### Alta de un deportista

![Nuevo deportista (móvil)](movil-44-jugador-nuevo.png)

### Socios

![Socios (móvil)](movil-90-socios.png)

### Ficha de socio

![Ficha de socio (móvil)](movil-92-socio-ficha.png)

### Agenda

![Agenda (móvil)](movil-93-agenda.png)

### Instalaciones

![Instalaciones (móvil)](movil-96-instalaciones.png)

### Cargos

![Cargos (móvil)](movil-98-cuotas-cargos.png)

### Pasarela y contabilidad

![Pasarela y contabilidad (móvil)](movil-123-cuotas-pasarela-y-contabilidad.png)

### Personal del club

![Personal del club (móvil)](movil-10-miembros.png)

### Acceso por rol

![Acceso por rol (móvil)](movil-14-personal-acceso.png)

### Invitar a alguien (hoja)

![Invitar a alguien (móvil)](movil-11-miembros-invitar.png)

### Invitaciones pendientes con el enlace de pruebas

![Invitaciones pendientes (móvil)](movil-12-invitaciones.png)

### Ajustes del club: datos generales

![Ajustes del club: datos generales (móvil)](movil-20-ajustes-general.png)

### Ajustes del club: identidad

![Ajustes del club: identidad (móvil)](movil-21-ajustes-identidad.png)

### Identidad: vista previa en directo

![Ajustes del club: identidad en vista previa (móvil)](movil-22-ajustes-identidad-vista-previa.png)

### Inicio con la identidad del club

![Inicio con la identidad del club (móvil)](movil-23-inicio-identidad-propia.png)

### Inicio operativo

![Inicio operativo (móvil)](movil-03b-inicio-operativo.png)

### Portada de una familia

![Portada de una familia (móvil)](movil-46-familia-inicio.png)

### Mi familia

![Mi familia (móvil)](movil-47-familia.png)

### Ficha para la familia

![Ficha para la familia (móvil)](movil-47b-familia-ficha.png)

### Mis cuotas

![Mis cuotas (móvil)](movil-99e-familia-cuotas.png)

### Retos

![Retos de la sección (móvil)](movil-70-retos.png)

### Validación del reto

![Validación (móvil)](movil-72-reto-validacion.png)

### El reto visto por la familia

![Reto de la familia (móvil)](movil-74-familia-reto.png)

### Dirección deportiva

![Dirección deportiva (móvil)](movil-75-director-inicio.png)

### Invitación: la persona crea su cuenta

![Invitación (móvil)](movil-40-invitacion.png)

### Entrada del negocio

![Entrada del negocio (móvil)](movil-48-negocio-login.png)

### Panel del negocio: clubes

![Panel del negocio: clubes (móvil)](movil-50-negocio-clubes.png)

### Panel del negocio: nuevo club

![Panel del negocio: nuevo club (móvil)](movil-51-negocio-nuevo-club.png)

### Panel del negocio: ficha de un club sin administrador

![Panel del negocio: ficha de un club (móvil)](movil-52-negocio-ficha-club.png)

### Selector de clubes con varias pertenencias

![Selector de clubes (móvil)](movil-62-mis-clubes.png)

### Partido en directo (móvil): la consola en vertical, con el aviso para girar el móvil, y en horizontal, con pista, banquillo, bandeja y rival a la vez; estadísticas e histórico

![Partido en directo (móvil)](movil-105-partido-en-directo.png)

![Partido en directo en horizontal (móvil)](movil-105c-partido-horizontal.png)

![Estadísticas del partido (móvil)](movil-102-partido-estadisticas.png)

![Histórico (móvil)](movil-103-partido-historico.png)

### Entrenamiento (móvil): la sesión con la plantilla del día y "Mi bienestar"

![Sesión (móvil)](movil-202-entrenamiento-sesion.png)

![Mi bienestar (móvil)](movil-213-entrenamiento-mi-bienestar.png)

### Deportista (móvil): inicio y su plan

![Inicio del deportista (móvil)](movil-130-deportista-inicio.png)

![Mi plan (móvil)](movil-132-deportista-entrenamientos.png)

### Pizarra animada (móvil): grabar con el dedo

![Pizarra grabada (móvil)](movil-220-pizarra-grabada.png)

### Tienda (móvil): fijada en "Mi familia", catálogo y mis pedidos con la barra de cinco destinos

![Tienda fijada (móvil)](movil-110-familia-tienda-fijada.png)

![Catálogo de la tienda (móvil)](movil-111-tienda-catalogo.png)

![Mis pedidos (móvil)](movil-114-tienda-mis-pedidos.png)

### Ajustes, Mejoras (móvil): las sugerencias del club, la hoja de ruta y la respuesta al club

![Hoja de ruta (móvil)](movil-140-mejoras-hoja-de-ruta.png)

![Respuesta de la plataforma (móvil)](movil-147-mejoras-respuesta.png)

### Clubs de fitness (móvil): la atleta, el coach y la dueña

![Inicio de la atleta: su próxima clase, el WOD de hoy con sus kilos, racha, último PR, tarifa y el box (móvil)](movil-240-box-atleta-inicio.png)

![Reservar: el día en calendario con la semana arriba (móvil)](movil-241-box-atleta-reservar.png)

![Reservar: el panel de una clase (móvil)](movil-241b-box-atleta-reservar-panel.png)

![Clases del coach: el día en calendario (móvil)](movil-256-box-coach-clases.png)

![El WOD del día con sus kilos según su 1RM y su resultado (móvil)](movil-243-box-atleta-wod.png)

![Progreso: calendario, marcas con su tabla de porcentajes, benchmarks, medidas y privacidad (móvil)](movil-245-box-atleta-progreso.png)

![Timer: por tiempo, AMRAP, EMOM y Tabata (móvil)](movil-249-box-atleta-timer.png)

![La clase del coach: check-in, brief con las cargas y el WOD con la clasificación de la clase (móvil)](movil-257-box-coach-clase.png)

![Programación de la semana por disciplina (móvil)](movil-258-box-coach-programacion.png)

![Inicio de la dueña: lo que pide atención, cifras, clases de hoy y programación de la semana (móvil)](movil-265-box-duena-inicio.png)

![Tarifas y bonos con su derecho de uso (móvil)](movil-267-box-duena-tarifas.png)

### Revisión del box (móvil): ejercicios y programación

![Ejercicios: la biblioteca del box por categoría y material (móvil)](movil-280-box-ejercicios.png)

![Un ejercicio: cómo se hace, puntos clave, errores comunes y escalados (móvil)](movil-281-box-ejercicio.png)

![Workouts: los benchmarks del catálogo por familia (móvil)](movil-283-box-workouts.png)

![Programación: la semana con un día por fila (móvil)](movil-290-box-programacion-semana.png)

![Editor del WOD: la pestaña Editar (móvil)](movil-291-box-programacion-editor.png)

![Editor del WOD: la pestaña Vista previa (móvil)](movil-292-box-programacion-vista-previa.png)

### Planificación del box (móvil)

![Planificación: el plan activo de cada disciplina, su punto del ciclo y el papel de cada día (móvil)](movil-300-box-planificacion.png)

![El plan: dónde está el box, el mapa del ciclo, el reparto de los 100 puntos y lo que se puede esperar (móvil)](movil-301-box-plan-mapa.png)

![La semana del plan: cada día con su papel, su intención, su progresión, su WOD y el validador; equilibrio, cobertura y límites (móvil)](movil-302-box-plan-semana.png)

![La revisión del domingo: lo previsto frente a lo que pasó, los ajustes y lo que ha aprendido el box (móvil)](movil-303-box-plan-revision.png)

![La salud de la programación: cumplimiento, equilibrio real, duraciones, patrones por semana y coste de la IA (móvil)](movil-304-box-plan-salud.png)

![El material del box, con lo que está en reparación (móvil)](movil-305-box-material.png)

![Nuevo plan, paso 1: la IA o una plantilla, con la proyección al lado (móvil)](movil-306-box-plan-nuevo-objetivo.png)

![Nuevo plan, paso 3: repartir 100 puntos entre seis capacidades (móvil)](movil-307-box-plan-nuevo-enfasis.png)

![Nuevo plan, paso 5: lo que ya sabe el box y de dónde sale cada dato (móvil)](movil-308-box-plan-nuevo-tu-box.png)

![Nuevo plan, paso 6: el resumen con el mapa del ciclo (móvil)](movil-309-box-plan-nuevo-resumen.png)

![El editor del WOD con la intención del día y los campos del plan (móvil)](movil-310-box-plan-editor-intencion.png)

![El WOD del atleta: el plan, el papel, la intención y su versión en cada bloque (móvil)](movil-315-box-atleta-wod-plan.png)

![Tu ciclo: dónde estás, tus marcas con su rango, tu constancia y tu nivel (móvil)](movil-316-box-atleta-ciclo.png)

![Tu ciclo en cifras, para guardar o compartir (móvil)](movil-317-box-atleta-ciclo-cifras.png)
