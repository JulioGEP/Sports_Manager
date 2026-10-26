# 0045. Ajustes del club en seis pestañas, una por función

Estado: aceptada. Fecha: 2026-10-26. Reordena las pestañas de los ajustes que dejaron la ADR 0041 (catálogo público), la 0042 (pasarela y contabilidad) y la 0043 (identidad, que no cambia por dentro).

## Contexto

Los ajustes habían crecido a nueve pestañas: General, Identidad, Temporadas, Tipos de socio, Cobros, Contabilidad, Desarrolladores, Puesta en marcha y Actividad. Cuatro problemas:

- **Lo mismo, partido en dos.** Cobros (la pasarela de Stripe) y Contabilidad (Holded) son el mismo dinero: el cargo se cobra y se lleva a la contabilidad. Cuotas ya los enseña juntos en "Pasarela y contabilidad"; los ajustes los separaban.
- **Una pestaña que no es un ajuste.** Puesta en marcha es una guía que lleva a otras pestañas y pantallas. Ocupaba sitio para siempre, también con todo hecho.
- **Un nombre que dice para quién y no para qué.** "Desarrolladores" es la clave para que la web del club enseñe la tienda. Quien la busca piensa en su web.
- **Listas cortas sueltas.** Temporadas y Tipos de socio son las dos listas que usa el resto del club (equipos por temporada, socios por tipo). Cada una ocupaba una pestaña con una tarjeta, y General era una tarjeta sola de tres campos.

## Decisión

Seis pestañas, en el orden en que se pone en marcha un club:

| Pestaña | Qué reúne | Antes |
| --- | --- | --- |
| General | La puesta en marcha, mientras le falte algo al club, y los datos del club (nombre, idioma, zona horaria) | General y Puesta en marcha |
| Identidad | Lo mismo que en la ADR 0043 | Identidad |
| Temporadas y socios | Las temporadas y, debajo, los tipos de socio | Temporadas y Tipos de socio |
| Cobros y contabilidad | Dos bloques con su nombre: "Pasarela de pago" (cómo cobra el club, la cuenta de Stripe y su estado) y "Contabilidad" (Holded) | Cobros y Contabilidad |
| Web del club | El catálogo público, como estaba | Desarrolladores |
| Actividad | Lo mismo | Actividad |

- **La pestaña que absorbe a otra conserva su clave** (`general`, `seasons`, `payments`, `developers`). Los enlaces de siempre (`?tab=seasons&new=1` desde Secciones y la paleta de mandos, `?tab=payments` desde Cuotas, `?tab=developers`) no cambian.
- **Los enlaces viejos siguen valiendo.** `?tab=setup` abre General; `?tab=memberTypes`, Temporadas y socios; `?tab=accounting`, Cobros y contabilidad, y baja hasta el bloque de contabilidad cuando lo de encima ya ha cargado, para que no lo empuje. `?tab=brand` y `?tab=logo` siguen en Identidad.
- **La puesta en marcha se va cuando está todo hecho.** Mientras carga no se pinta, para no enseñar como pendiente un paso que ya está hecho. El aviso del inicio enlaza a General.
- **Cada pestaña se ve con el permiso de lo que lleva dentro.** Temporadas y socios, con `org.structure.write` o `org.club_members.write`, y cada tarjeta con el suyo. Cobros y contabilidad, con `org.fees.read`, como antes.

## Consecuencias

- Tres pestañas menos y ninguna función partida en dos: lo que se configura junto se ve junto.
- Cobros y contabilidad es una página larga. Cada bloque lleva su nombre encima para que se vea dónde empieza.
- General ya no es una tarjeta sola: un club nuevo entra en los ajustes y lo primero que ve es lo que le falta.

## Alternativas descartadas

- **Una pestaña "Conexiones" con Stripe, Holded y la web del club.** Agrupa por tecnología y no por función: la web del club es de la tienda, no del dinero de las cuotas. Y saldría una página con tres bloques largos.
- **Subpestañas dentro de Cobros y contabilidad.** Son dos pestañas con otro nombre: vuelve lo mismo partido en dos.
- **Llevar los tipos de socio a la pantalla de Socios.** Puede tener sentido más adelante, pero saca un ajuste de los ajustes. Por ahora van con las temporadas, la otra lista que usa el resto del club.
- **Dejar la puesta en marcha como pestaña.** Una guía con todo hecho no aporta y ocupa sitio para siempre.
