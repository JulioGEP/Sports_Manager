# 0046. Mejoras de la plataforma: la administración del club sugiere y vota, y una hoja de ruta común

Estado: aceptada. Fecha: 2026-10-26.

## Contexto

Producto pidió un canal para que los clubes propongan mejoras a la plataforma:

- Solo la administración de cada club sugiere.
- Ve en qué estado está cada petición suya.
- Ve la hoja de ruta: las mejoras que han pedido otros, para votarlas, y cuándo, aproximadamente, va a llegar cada una, o al menos en qué orden.
- La plataforma lo recibe en su panel, lo acepta y lo pone en una hoja de ruta pública para todos los clubes.

Es lo primero que cruza clubes. Hasta ahora todo dato de un club era solo suyo (ADR 0009 y 0015). Un club tampoco tiene por qué saber qué pide otro: pueden ser competidores, y una petición puede contar cosas del club ("el seguro nos pide los DNI de los socios").

## Decisión

### Una tabla, un ciclo

Una sugerencia es una fila de `suggestions` con un estado:

| Estado | Qué ve el club que la pidió | Qué ven los demás clubes |
| --- | --- | --- |
| `submitted` (recibida) | Su texto y "la plataforma la revisará" | Nada |
| `open` (en estudio) | Su texto, la versión pública, los votos | La versión pública, para votarla |
| `planned` (planificada) | Lo mismo y la fecha aproximada | La versión pública, su puesto y la fecha aproximada |
| `in_progress` (en desarrollo) | Lo mismo | Lo mismo |
| `released` (disponible) | Lo mismo | En "Ya disponible" (las 20 últimas); ya no se vota |
| `declined` (descartada) | El porqué que le contesta la plataforma | Nada |
| `merged` (unida a otra) | A qué mejora publicada se unió | Nada: cuenta en la otra |

La plataforma también añade mejoras que no ha pedido nadie (lo que ya tiene previsto): la misma tabla, sin club.

### Lo que cruza clubes, y lo que no

- **Solo se ve lo que la plataforma publica.** Lo recibido puede traer datos del club, quejas o duplicados. Publicar es una decisión de la plataforma, no del club.
- **Dos versiones del texto.** Lo que escribió el club (`title`, `body`) no cambia y solo lo ven ese club y la plataforma. La versión pública (`public_title`, `public_body`) la reescribe la plataforma al publicar; si no la toca, se usa la del club, prerrellenada en el formulario para que se revise. La base exige versión pública en todo estado público.
- **Nunca qué club pidió o votó qué.** La hoja de ruta lleva votos, el puesto y dos marcas de este club: "pedida por tu club" (también si una petición suya se unió a esta) y "tu club la ha votado". La respuesta de la plataforma (`response`) es solo para el club que la pidió. Una prueba de aislamiento comprueba que la hoja de ruta de otro club no contiene ni el nombre, ni el subdominio, ni el email, ni el texto original, ni la respuesta.
- **Excepción documentada a "todo lleva `organization_id` obligatorio".** Aquí es opcional: nulo si la añadió la plataforma, y al borrar un club sus mejoras publicadas siguen (otros clubes las han votado). Las rutas del club siempre filtran por el club del host para lo suyo y por estado público para lo común.

### Un voto por club, no por persona

- `suggestion_votes` es única por (mejora, club) y guarda quién votó. Cualquier administración del club pone o quita el voto del club.
- **Por qué por club:** esto es B2B, se prioriza por clientes. Si contara cada persona, un club con cuatro administradores pesaría cuatro veces más que uno con una, y la señal mediría el tamaño de la plantilla de gestión y no el interés de los clientes. Más adelante el voto se puede ponderar por plan o por facturación sin cambiar el modelo.
- **Quien sugiere, vota.** Al enviar una sugerencia el club queda votándola: así, cuando se publica o se une a otra, ese interés ya cuenta.
- **Unir duplicados mueve los votos.** Al unir una sugerencia a otra (que no puede ser ella misma ni estar unida a su vez), sus votos pasan a la otra sin contar dos veces el mismo club, y las que ya se le habían unido pasan también: nunca hay cadenas de uniones. El club que la pidió ve "pide lo mismo que «…» y se han unido: tu voto cuenta ahí".

### Cuándo y en qué orden

- **Fecha aproximada, nunca un día:** un mes (`2027-03`) o un trimestre (`2027-Q1`), que el club lee como "marzo de 2027" o "T1 2027". Una hoja de ruta promete plazos; una fecha exacta se convierte en una fecha de entrega que se incumple. La base lo exige con un `CHECK`.
- **Orden explícito de lo que viene.** `position` ordena lo que está en desarrollo y lo planificado. Lo que entra en planificado se pone al final y la plataforma lo coloca con las flechas (`PUT /api/platform/suggestions/order`). Lo que sale de ahí pierde el puesto.
- **Cómo se ve:** primero lo que está en desarrollo, después lo planificado (por su orden; sin orden, por fecha aproximada), cada una con su número ("1. …"); luego lo que está en estudio, lo más votado primero; y lo último disponible. La regla vive en `orderRoadmap` (`packages/shared`), pura y probada, y la usan la API y el panel.

### Menos ruido en la bandeja

- **Parecidas antes de enviar.** Mientras el club escribe, el formulario busca en la hoja de ruta las mejoras con las mismas palabras (sin acentos ni mayúsculas, con la misma raíz: "socio" y "socios", "sincronizar" y "sincronización") y propone votarlas. Un voto suma más que una petición repetida, y cada duplicado que no llega es trabajo de revisión que se ahorra.
- **Tope de 10 sugerencias por club en 24 horas**, contado con la fila del club bloqueada. Frena el ruido sin frenar a nadie de verdad. Error nuevo `suggestion_limit` (429).
- **Parte de la aplicación** (`SUGGESTION_AREAS`, once opciones cerradas) para ordenar la bandeja.

### Permisos y pantallas

- Permiso nuevo `org.suggestions`, solo de `org_admin`. No es un área de acceso (ADR 0033): no se puede abrir a otros cargos ni por excepción, porque hablar con la plataforma en nombre del club es de la administración. Con "ver como" se ve con los ojos del otro, así que sin él. El soporte de plataforma dentro de un club tampoco lo tiene: la plataforma no vota por un club. Quien envía y quien vota queda con su sesión real.
- **Club:** "Mejoras" en el grupo Gestión de la navegación (`/<club>/roadmap`), con dos pestañas: "Hoja de ruta" y "Sugerencias del club". El detalle de una mejora, el de una sugerencia y el formulario se abren por la dirección (`?item=`, `?mine=`, `?new=1`); "Sugerir una mejora" entra en la paleta de mandos.
- **Plataforma:** "Mejoras" en el panel del negocio (`/admin/suggestions`), con "Por revisar", "Hoja de ruta" (lo que viene con sus flechas y lo que está en estudio con sus votos y peticiones unidas), "Disponibles" y "Cerradas". Revisar es un formulario: estado, a qué unirla, versión pública, parte de la aplicación, fecha aproximada y respuesta al club. "Añadir a la hoja de ruta" crea una mejora sin club.
- **Votar** entra en el catálogo de acciones (`vote`, `ArrowFatUp`): sale en las filas, en el detalle y en el aviso de parecidas.
- Las pantallas de mejoras no tienen capa de voz: no habla el club, habla la plataforma.

### Rutas

- Club: `GET /api/org/roadmap`, `PUT` y `DELETE /api/org/roadmap/{id}/vote`, `GET` y `POST /api/org/suggestions`. Lo no publicado responde 404 al votar; lo disponible, 409.
- Plataforma, dentro de la cadena de `/api/platform/*`: `GET` y `POST /api/platform/suggestions`, `PATCH /api/platform/suggestions/{id}` y `PUT /api/platform/suggestions/order`.
- Auditoría: `suggestion.created`, `suggestion.updated`, `suggestion.voted`, `suggestion.unvoted` y `suggestion.reordered`. Lo que hace la plataforma queda sin club: es de la hoja de ruta, no de un club.

## Consecuencias

- Migración `20261026113843_platform_suggestions`: tablas `suggestions` y `suggestion_votes`. Sin semilla: una mejora sembrada en producción la verían todos los clubes reales.
- La plataforma tiene una señal priorizada por clientes (votos por club y peticiones unidas) y los clubes ven que se les escucha: qué viene, cuándo y qué pasó con lo suyo.
- La barra del panel del negocio pasa a cuatro destinos y en móvil va en dos líneas. "Clubes" deja de marcarse como activo en Actividad y Sistema.
- Revisar cuesta trabajo a la plataforma: cada sugerencia pide una decisión. El aviso de parecidas y el tope diario lo acotan.

## Alternativas descartadas

- **Todo lo recibido visible para todos:** expone datos y quejas de cada club y llena la hoja de ruta de duplicados sin revisar.
- **Voto por persona:** mide cuántas personas gestionan cada club, no cuántos clientes quieren algo.
- **Fecha exacta o solo un orden sin fecha:** la exacta es una promesa que se incumple; sin fecha el club no puede planificar nada.
- **Una herramienta externa (Canny, Productboard):** otra cuenta y otro login para cada club, los datos de los clientes en otro proveedor y sin saber de qué club es cada persona. El volumen inicial no lo justifica.
- **Un área de acceso para abrirla a dirección o coordinación:** producto pidió solo la administración; si se pide, se convierte en área sin cambiar el modelo.

## Pendiente

- Avisar por email al club cuando su sugerencia cambia de estado (con el registro de salida de la ADR 0018).
- Contador de "por revisar" en la barra del panel del negocio.
- Ponderar los votos por plan si hace falta.
- Comentarios o preguntas de la plataforma al club sobre una sugerencia antes de decidir.
