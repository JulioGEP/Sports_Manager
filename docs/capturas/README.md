# Capturas de la interfaz (Bloques 14 a 26 y pizarra animada)

Capturas que generan las pruebas de interfaz (`pnpm test:ui`) contra la API real con base embebida, con el front de Vite + React + Tailwind sobre el design system del producto (`packages/design`, ADR 0027). Escritorio a 1280x800; móvil, Pixel 7. La fuente viva es el artefacto `capturas-interfaz` de CI; esta carpeta es la foto de la revisión del club completo (ADR 0031), con el design system 1.3: todo botón lleva el icono de su acción (rueda dentada para editar, cubo de basura rojo para eliminar, más para añadir); la fila es el objeto (se abre tocándola, con acciones como iconos silenciosos sin borde); la paleta de mandos ⌘K encuentra personas, equipos, pantallas y acciones; y la plantilla de un equipo se ve como un tablero por posición: secciones por deporte, socios, agenda e instalaciones, cuotas y "ver como", sobre lo que ya había de los bloques 11 a 13 (ADR 0028, 0029 y 0030), más el alcance por cargo y la gestión de acceso por rol del Bloque 19 (ADR 0033): el cuerpo técnico, la dirección y la fisio ven solo su parte del club, y "Personal" gana la pestaña "Acceso", y el partido en directo del Bloque 20 (ADR 0034): configuración del motor por sección, consola en la banda a pantalla completa y en tres zonas con el banquillo arrastrable (ADR 0037), estadísticas e histórico, y el entrenamiento de los bloques 21 a 26 (ADR 0039): semana del equipo con "A tener en cuenta", sesión por bloques con su cierre y modo pista, biblioteca con pizarra, carga, enfermería, salud y "Mi bienestar".

Cada club vive en una ruta del mismo dominio: el club demo en `/demo`, el negocio en `/admin`. Cuentas de demostración, todas con contraseña `123456`: `admin@demo.test` (administra el club demo; en este entorno también la plataforma), `entrenador@demo.test` (entrenadora del Alevín A), `familia@demo.test` (madre de dos jugadores y socia), `director@demo.test` (dirección deportiva), `fisio@demo.test` (fisioterapia), `senior@demo.test` (entrenador del Sénior A), `preparador@demo.test` (preparación física), `jugador@demo.test` (deportista adulto del Sénior A con cuenta propia), `natacion@demo.test` (coordinación de natación) y `basquet@demo.test`, `basquetfem@demo.test` y `yoga@demo.test` (cuerpo técnico). El club demo llega con la temporada 2026-27, cuatro secciones (fútbol sala, baloncesto, natación y yoga) con categorías, doce equipos y grupos, 95 deportistas, socios con tres tipos, cuatro instalaciones con horario, la agenda generada desde los horarios, partidos, planes de cuota con cargos y pagos, un reto activo, dos partidos jugados del Alevín A con su registro completo y el Sénior A con cuatro partidos, sesiones planificadas, cuatro semanas de carga y bienestar, biblioteca de tareas, un jugador limitado y otro en readaptación.

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

### Cargos del club: pendientes, vencidos y cobrados, con filtros

![Cargos](escritorio-98-cuotas-cargos.png)

### Registrar un pago a mano (hoja)

![Registrar pago](escritorio-98b-cuotas-cobrar.png)

### Planes de cuota: a quién aplica cada uno

![Planes](escritorio-98c-cuotas-planes.png)

### Ajustes: cómo cobra el club, con Stripe preparado y sin claves

![Ajustes de cobro](escritorio-99-ajustes-cobros.png)

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

### Ajustes del club: datos generales y zona horaria

![Ajustes del club: datos generales](escritorio-20-ajustes-general.png)

### Ajustes del club: colores de marca con vista previa del motor de tema

![Ajustes del club: colores de marca](escritorio-21-ajustes-marca.png)

### Ajustes del club: la marca cambia al guardar

![Ajustes del club: marca guardada](escritorio-22-ajustes-marca-guardada.png)

### Ajustes del club: subir logo

![Ajustes del club: subir logo](escritorio-23-ajustes-logo.png)

### Ajustes del club: logo subido y visible en la cabecera

![Ajustes del club: logo subido](escritorio-24-ajustes-logo-subido.png)

### Ajustes: nueva temporada (hoja)

![Nueva temporada](escritorio-33-temporada-nueva.png)

### Ajustes: tipos de socio

![Tipos de socio](escritorio-99b-ajustes-tipos-socio.png)

### Ajustes: puesta en marcha del club

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

### Ajustes del club: colores de marca con vista previa

![Ajustes del club: colores de marca (móvil)](movil-21-ajustes-marca.png)

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

### Pizarra animada (móvil): grabar con el dedo

![Pizarra grabada (móvil)](movil-220-pizarra-grabada.png)
