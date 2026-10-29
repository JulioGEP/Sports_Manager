# 0060. La app tiene que volar: una petición por pantalla, caché compartida y precarga

Estado: aceptada. Fecha: 2026-10-29.

## Contexto

Producto: cada pantalla tardaba 1 o 2 segundos en cargar, también al cambiar de ruta, con muy pocos datos. Con 300 clubes de 450 personas no se aguanta. La premisa: tiene que volar.

Lo que se midió (Postgres 16 con las migraciones del repo y latencia simulada de producción: 40 ms por invocación de la función y 2 ms por sentido hacia la base):

- **La cadena de cada petición se ejecutaba 2 o 3 veces.** `org.ts` registra club, sesión y actor en `/api/org/*`, y cada módulo de rutas los vuelve a registrar en `/x` y `/x/*`, que en Hono también encaja con `/x`. Cada pasada eran 5 consultas en fila (club, sesión, usuario, pertenencias y reglas). `GET /api/org/seasons` lanzaba 16 consultas para devolver una.
- **Cada pantalla eran 3 o 6 invocaciones de la función a la vez.** En Netlify cada petición es una invocación, y cada instancia atiende una sola; las que no encuentran una instancia caliente libre pagan un arranque en frío (cargar 6 MB de código, conectar con TLS a la base).
- **El pool de Postgres cerraba las conexiones a los 10 s** (por defecto de `pg`). Casi cada clic, tras leer la pantalla, abría una conexión nueva. Sin manejador de errores: si la base cortaba una conexión ociosa, la función caía.
- **La web arrancaba en cascada:** marca y sesión, después club y pertenencias, después los datos de la pantalla. Tres viajes antes de pintar nada.
- **Sin caché útil:** `staleTime` 0 y cada pantalla con su propia clave para la misma lista (`teams`, `teams,null`, `teams,training`…). Volver a una pantalla o pasar a otra que usa lo mismo lo volvía a pedir todo.
- **2,3 MB de JavaScript en el arranque** (625 KB comprimidos): las sesenta pantallas y los tres diccionarios (680 KB) juntos.
- **Consultas N+1** en la enfermería (dos por jugador), el histórico de partidos (dos o tres por partido), la biblioteca de tareas (una cadena por sección), los planes de cuotas (todas las personas a la API para contarlas) y el inicio (45 consultas en tres oleadas).
- **Listas que crecen sin fin:** los cargos de cuotas de un club de 450 personas son ~4.500 por temporada; la pantalla los bajaba todos (1,8 MB) para sumar totales y buscar en el navegador.

## Decisión

### API

- **Club, sesión y actor una sola vez por petición.** Cada etapa se salta si ya está en el contexto. El club y la sesión salen a la vez. Better Auth trae la sesión y su usuario con un join (`advanced.database.joins` y relaciones Drizzle de `users`, `sessions` y `accounts`, sin migración). La revocación sigue siendo inmediata: no hay caché de sesión en cookie.
- **`POST /api/batch`, lote de lecturas.** Hasta 20 GET de la API en una sola invocación, en paralelo. Cada una recorre la cadena completa como si llegara sola, con la cookie del lote. Solo pueden cambiar `x-sm-club` y `x-sm-view-as`; el resto de cabeceras de cada petición se ignoran. Un memo del lote comparte el club, la sesión, el actor y su ámbito, con claves que llevan club, persona y "ver como". Fuera de él quedan Better Auth, los webhooks, la documentación y el propio lote. Solo JSON, para forzar la comprobación previa del navegador desde otro origen. La suite de aislamiento lo cubre (`batch.isolation.test.ts`).
- **Pool vivo.** Las conexiones ociosas duran 60 s, con keep-alive TCP, timeout de conexión de 10 s, manejador de errores y 5 conexiones por instancia. Con 3, las consultas de un lote hacían cola.
- **Arranque en frío más ligero.** Bundle minificado: de 6 MB a 2,7 MB. Fuera `@netlify/database` del cliente de base (arrastraba el driver serverless de Neon y `ws`, que la API no usa); se lee `Netlify.env` igual que él. El SDK de IA se carga con la primera propuesta.
- **Sin N+1 en lo que más se usa.** Enfermería, histórico de partidos, biblioteca de tareas, planes de cuotas, inicio, ficha de sección, `GET /api/org` y la lista de socios por lotes o en paralelo. Recuentos con `count(*) filter (…)` en una consulta.
- **Cargos por tramos.** `GET /api/org/fees/charges` admite `limit`, `offset` y `q` (persona, concepto, periodo o plan) y devuelve `total`. Los totales salen de la base con el filtro de estado, como antes. Sin `limit`, la lista entera, como antes (la ficha del socio).
- **Dos índices** (`20261029160000_performance_indexes.sql`, escrita a mano): `events (organization_id, ends_at)` para la agenda, el inicio y las secciones, y `challenge_submissions (task_id, player_id)`. Están también en el esquema.

### Web

- **El cliente agrupa solo.** `apiFetch` junta las GET que salen en el mismo tick en un lote, y la misma GET repetida viaja una vez. Una sola va suelta. Si la API no tiene lote (un deploy a medias), cada una va por su cuenta.
- **Caché de verdad.** 30 s de frescura y 10 minutos en memoria. Sin reintentos en 4xx: un 403 no cambia en un segundo. Las listas comunes, con una sola clave (`lib/queries.ts`).
- **Arranque sin cascada.** Antes de pintar, `main.tsx` pide en un lote marca, sesión, club y pertenencias, a la vez que el diccionario. Con los permisos, sale lo que pide la pantalla de entrada.
- **Precarga.** Al pasar el ratón (60 ms), enfocarlo con el teclado o tocarlo sin arrastrar (hacer scroll por una lista no pide nada) sobre cualquier enlace del club, o una fila con `data-prefetch`, se descargan la pantalla y sus datos. En el primer rato libre se descargan las pantallas de la navegación (solo código).
- **Cada pantalla en su fichero** (`src/pages.ts`, rutas perezosas de React Router) y **solo el diccionario del idioma activo**. Si un deploy deja una pestaña vieja pidiendo un fichero que ya no existe, se recarga una vez.
- **Listas largas sin bloquear.** `DataList` pinta 60 filas y el resto justo después, en transición. Al buscar, el campo responde primero (`useDeferredValue`). Las fotos de las listas se descargan en diferido.
- **Menos repintado.** El contexto del club depende de los datos y no de los objetos de resultado de las consultas, y react-intl recibe siempre el mismo manejador de errores. Navegar ya no repinta todo el árbol dos veces.
- **Hilo de progreso** en el color del club, arriba, solo si algo visible tarda más de 150 ms.
- **El idioma del perfil manda también dentro del club**, no solo en el acceso.
- **Caché de un año** para `/assets/*` en Netlify: los nombres llevan hash.

## Consecuencias

Medido con la misma latencia simulada:

| | Antes | Después |
| --- | --- | --- |
| Consultas de `GET /api/org/seasons` | 16 | 5 |
| Consultas del inicio (`/api/org/summary`) | 45 en 3 oleadas | 29 en 1 oleada |
| Recorrido por las 13 pantallas de la navegación y una recarga | 4,6 s | 1,7 s |
| El mismo recorrido con el club a escala (455 deportistas, agenda y cuotas de una temporada) | 8,2 s | 1,9 s |
| Cuotas con el club a escala | 2,9 s | 0,08 s |
| Peticiones al pulsar una pantalla de la navegación | 1 a 4 | 0 (ya precargada) |
| Entrar en el club | 9 peticiones en cascada, 0,8 s | 2 lotes, 0,4 s |
| Cuotas de un club de 450 personas | 1,8 MB, 0,3 s | 35 KB, 0,12 s |
| JavaScript del arranque | 2,3 MB (625 KB comprimido) | 0,98 MB (275 KB comprimido), más el diccionario del idioma en paralelo |

Con 300 clubes de 450 personas (135.000 personas, 1,35 M cargos y 437.000 eventos) todas las rutas medidas responden igual, byte a byte, que antes, con siete perfiles y con "ver como".

- **Más conexiones por instancia** (5 en vez de 3), con menos instancias a la vez. Si un día faltan conexiones en Neon, la cadena con pooler (`-pooler`) admite miles.
- **Un lote espera a su petición más lenta.** Son las de una misma pantalla, que se pinta con todas.
- **Datos de hace hasta 30 s** al volver a una pantalla, refrescándose por detrás. Lo que cambia la propia persona se invalida al momento, como siempre.
- **La próxima migración generada** (la que quita las tablas del box, ADR 0058) traerá los dos índices: hay que quitarlos de ella, porque ya existen.
- Lo que el código no arregla: la primera petición tras un rato sin uso paga el arranque de la función, y si la base de Neon está suspendida (escala a cero tras 5 minutos en los planes pequeños), también el suyo. Con tráfico real las dos se mantienen calientes; si no, el plan de la base puede quitar la suspensión.

## Alternativas descartadas

- **Caché de sesión en cookie (Better Auth `cookieCache`):** ahorra una consulta, pero una sesión cerrada o tras cambiar la contraseña seguiría valiendo hasta que caduque la caché. La ADR 0020 pide cierre inmediato.
- **Caché en memoria del club por slug:** cada instancia tendría la suya, y el cambio de marca o la baja de un club tardaría en verse según en qué instancia cayera la petición.
- **Respuesta del lote en streaming:** la respuesta podría quedarse sin comprimir en la CDN, y la pantalla se pinta con todo igualmente.
- **Paginación de todas las listas:** las del club (deportistas, socios, personal) tienen un techo natural, el tamaño del club, y se buscan en el navegador al instante. Solo se pagina lo que crece cada temporada (los cargos).
- **Driver HTTP de Neon:** sin transacciones interactivas, que la API usa.
