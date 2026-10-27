# 0059. La primera entrada de un club nuevo: a la puesta en marcha, con un recorrido guiado

Estado: aceptada. Fecha: 2026-10-27. Amplía la puesta en marcha de la ADR 0045 (Ajustes, General). inthebox toma la misma decisión con el mismo número.

## Contexto

Cuando el negocio da de alta un club y manda el enlace a su administración, la persona acepta la invitación y cae en el inicio. Un inicio vacío: sin escudo, sin temporada, sin equipos, sin cifras. Lo que le dice qué hacer, la puesta en marcha, vive en Ajustes, y el inicio solo la menciona con un aviso.

Producto pidió que los primeros pasos sean lo primero que haga un club nuevo, con una explicación paso a paso, en sombra, que deje ver lo que da de sí la plataforma. Y que se pueda saltar.

## Decisión

- **Un club por estrenar entra por la puesta en marcha.** Quien lo administra (persona del club con `org.settings.write` y vista completa, sin "ver como") y abre el inicio de un club sin ningún paso hecho va directo a Ajustes, General.
- **Recorrido en sombra.** Ahí se abre solo. La pantalla se oscurece y, paso a paso, queda a la luz lo que se explica, con una tarjeta al lado que dice para qué sirve: la lista de arranque, cada uno de sus cinco pasos, las pestañas de Ajustes, las áreas de la navegación y la paleta de mandos. Diez pasos, con "Paso n de 10", "Volver", "Seguir" y "Saltar".
- **Acaba haciendo.** El último paso ilumina la primera fila pendiente y su botón principal es la acción de esa fila ("Subir logo"), que lleva a hacerla.
- **Se salta y se vuelve a ver.** "Saltar", "Cerrar" o ESC lo cierran. "Ver recorrido", en la cabecera de la puesta en marcha, lo vuelve a abrir mientras quede algo por hacer.
- **Una vez.** Saltado o terminado, queda visto para esa persona y ese club en ese navegador (`localStorage`). Un club con algún paso hecho ya no está por estrenar: no salta, y queda visto para que el inicio no vuelva a esperar a la puesta en marcha.
- **Un componente, `Tour`** (`apps/web/src/ui/tour.tsx`, DESIGN.md 9.20). `<dialog>` modal nativo: foco, ESC y la página inerte los pone el navegador. El hueco iluminado es una caja cuya sombra cubre el resto y sigue a su elemento si la pantalla se mueve. Lo que se ilumina se marca con `data-tour`.
- **Los pasos salen de la tarjeta** a `lib/setup.ts` (`useSetup`), que comparten la tarjeta, el recorrido y el inicio.
- **"Invitar" solo cuenta entrenadores o personal.** La invitación pendiente a la administración del club, la que manda el negocio, ya no da el paso por hecho.

Nada cambia en la API, los datos ni los permisos.

## Consecuencias

- La administración de un club nuevo ve en un minuto qué tiene que hacer y qué tiene la plataforma, y sale del recorrido con la primera acción en la mano.
- Visto por navegador, no por cuenta: quien lo salta en el ordenador y entra después desde el móvil, con el club aún sin tocar, lo vuelve a ver una vez. Guardarlo en la base pide tabla, ruta y migración en los dos repositorios; se hará si molesta.
- Mientras se sabe si toca (club sin tocar y recorrido sin ver en ese navegador), el inicio espera un momento a la puesta en marcha antes de pintarse. Solo hasta que el recorrido queda visto.
- Los clubes que ya están en marcha (con algún paso hecho, como el club demo) no lo ven solos. Lo tienen en "Ver recorrido".

## Alternativas descartadas

- **Un asistente de alta a pantalla completa:** duplica Identidad, Temporadas y Personal, y enseña formularios en lugar de la app. DESIGN.md 18 pide reutilizar Identidad.
- **Una librería de recorridos:** más peso y otro estilo para un componente pequeño que usa los tokens, los botones y el diálogo de la app.
- **Lanzarlo en cada entrada mientras falte un paso:** la puesta en marcha sigue en Ajustes y en el aviso del inicio. Insistir más es ruido.
- **Guardar el "visto" en la base desde el primer día:** ver Consecuencias.
