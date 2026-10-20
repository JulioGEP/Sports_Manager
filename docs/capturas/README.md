# Capturas de la interfaz (Bloque 10)

Capturas que generan las pruebas de interfaz (`pnpm test:ui`) contra la API real con base embebida, con el front nuevo (Vite + React + Tailwind) sobre el design system del producto (`packages/design`, ADR 0027). Escritorio a 1280x800; móvil, Pixel 7. La fuente viva es el artefacto `capturas-interfaz` de CI; esta carpeta es la foto de la revisión del Bloque 10.

Cada club vive en una ruta del mismo dominio: el club demo en `/demo`, el negocio en `/admin`. Cuenta de demostración: `admin@demo.test` / `123456`, administradora del club demo. En este entorno también es administradora de plataforma para poder recorrer el panel del negocio.

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

## Espacio del club (`/demo`)

### Portada del club: héroe con la marca, recuentos, primeros pasos y lo que viene

![Portada del club](escritorio-03-inicio.png)

### Menú de persona: clubes, administración del negocio, idioma y salir

![Menú de persona](escritorio-04-menu-persona.png)

### Miembros del club

![Miembros del club](escritorio-10-miembros.png)

### Invitar a alguien (hoja)

![Invitar a alguien](escritorio-11-miembros-invitar.png)

### Invitaciones pendientes con el enlace de pruebas

![Invitaciones pendientes](escritorio-12-invitaciones.png)

### Roles de una persona (hoja)

![Roles de una persona](escritorio-13-miembros-roles.png)

### Ajustes del club: datos generales

![Ajustes del club: datos generales](escritorio-20-ajustes-general.png)

### Ajustes del club: colores de marca con vista previa del motor de tema

![Ajustes del club: colores de marca](escritorio-21-ajustes-marca.png)

### Ajustes del club: la marca cambia al guardar

![Ajustes del club: marca guardada](escritorio-22-ajustes-marca-guardada.png)

### Ajustes del club: subir logo

![Ajustes del club: subir logo](escritorio-23-ajustes-logo.png)

### Ajustes del club: logo subido y visible en la cabecera

![Ajustes del club: logo subido](escritorio-24-ajustes-logo-subido.png)

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

## Móvil

Las mismas pantallas en un móvil, con la forma envolvente del design system: cabecera con el escudo, barra de pestañas flotante abajo, listas en filas cápsula y hojas que ocupan todo el ancho.

### Entrada general

![Entrada general (móvil)](movil-01-login.png)

### Portada del club

![Portada del club (móvil)](movil-03-inicio.png)

### Menú de persona

![Menú de persona (móvil)](movil-04-menu-persona.png)

### Miembros del club

![Miembros del club (móvil)](movil-10-miembros.png)

### Invitar a alguien (hoja)

![Invitar a alguien (móvil)](movil-11-miembros-invitar.png)

### Invitaciones pendientes con el enlace de pruebas

![Invitaciones pendientes (móvil)](movil-12-invitaciones.png)

### Ajustes del club: datos generales

![Ajustes del club: datos generales (móvil)](movil-20-ajustes-general.png)

### Ajustes del club: colores de marca con vista previa

![Ajustes del club: colores de marca (móvil)](movil-21-ajustes-marca.png)

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
