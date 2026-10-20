# 0026. Entrada propia del negocio y alta del primer administrador de plataforma

Estado: aceptada. Fecha: 2026-10-20.

## Contexto

El panel del negocio (`/admin`, ADR 0022) exigía sesión, pero sin sesión mandaba al login del club del host, con la marca de ese club, y la única forma de tener cuenta era aceptar una invitación de algún club (ADR 0019). El responsable de producto, cuyo email está en `PLATFORM_ADMIN_EMAILS` (ADR 0023), no podía entrar en `/admin` sin antes hacerse miembro del club demo. Eso mezcla dos cosas que deben estar separadas: la cuenta del club demo (`admin@demo.test`) y la cuenta de quien administra la plataforma.

## Decisión

- **Entrada propia:** `/admin/login`, con la marca neutra de la plataforma y nunca la de un club. Sin sesión, cualquier ruta de `/admin` lleva ahí. Una cuenta que no es administradora de plataforma recibe un aviso con la opción de entrar con otra cuenta; no se le abre nada.
- **Alta del primer administrador sin club:** `/admin/setup` llama a `POST /api/platform-setup` con email, nombre y contraseña. La API crea la cuenta solo si el email está en `PLATFORM_ADMIN_EMAILS` y no existe todavía; en caso contrario responde 403 o 409 y no toca nada. Tras crearla inicia sesión con las mismas cookies que un login normal y queda en la auditoría como `platform.admin_created`, sin club.
- La ruta vive fuera de `/api/platform/*` porque ese prefijo exige sesión de administrador y aquí aún no hay cuenta. La lista de emails la controla el negocio en Netlify; el código no tiene ningún administrador fijo.
- `admin@demo.test` sigue siendo solo la cuenta administradora del club demo. No administra la plataforma en producción.

## Consecuencias

- Hay una ventana entre desplegar y darse de alta en la que alguien que conozca un email autorizado podría crear esa cuenta antes. Se mitiga dándose de alta nada más desplegar; si llegara a pasar, el administrador legítimo recupera la contraseña por email cuando haya transporte real, o el negocio cambia la lista y borra la cuenta.
- Un administrador de plataforma puede tener además pertenencias en clubes; son independientes.

## Alternativas descartadas

- Sembrar la cuenta del administrador por migración: obligaría a guardar una contraseña o un hash en el repo.
- Invitación de plataforma emitida por otro administrador: resuelve el segundo administrador, no el primero. Puede añadirse más adelante sobre esta misma ruta.
