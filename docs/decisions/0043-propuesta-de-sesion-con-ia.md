# 0043. Propuesta de sesión con IA: un perfil de coach por tipo de sección, encima de las reglas

Estado: aceptada. Fecha: 2026-10-23. Construye el "borrador de sesión con IA" que la 0039 dejó para después, encima de sus reglas explicables.

## Contexto

Producto pidió que la planificación de un entrenamiento se apoye en una llamada a la IA: que reciba el contexto del club y devuelva una planificación detallada. El contexto: el equipo disponible, el material, la biblioteca de tareas, lo que quiera añadir quien entrena y un balance de lo que se quiere potenciar. Y una condición: la IA tiene que pensar como un coach experto de la sección de la que cuelga el entreno. Un box de CrossFit no planifica como un centro de yoga ni como un equipo benjamín.

Un único token del proveedor, en una variable de Netlify, para todos los clubes. Límite de cinco llamadas por semana. Producto no contestó las decisiones de la propuesta, así que se aplican sus recomendaciones: la cuota es configurable por club con cinco por defecto, las tareas nuevas se permiten marcadas y el modelo es Claude Opus 5.5.

## Decisión

### Un motor, un perfil de coach por tipo de sección

- **No hay una IA por sección: hay un perfil por tipo de sección, en datos** (`packages/shared/src/training-ai.ts`). Lo mismo que "el deporte es configuración en datos, no código". Cada perfil dice quién es el experto, sus principios, sus líneas rojas, cómo llama a cada bloque de la sesión, qué ejes se pueden potenciar con su reparto por defecto y en qué unidades se mide. Lleva versión, que se guarda con cada propuesta para poder comparar.
- **Nueve perfiles:** formación y competición en deportes de equipo (fútbol sala, fútbol, balonmano, baloncesto y voleibol), raqueta (pádel y tenis), natación, CrossFit, yoga, pilates, fitness y uno general para el resto. El de equipo se elige por la sección (formativa o no) y, si no lo dice, por la mediana de edad (menos de 16 es formación), como en la 0039. Sin portería no hay bloque de porteros ni eje de portero.
- **El club pone su metodología encima:** "Cómo entrenamos aquí" (`sections.training_settings.methodologyNotes`) va al modelo con cada petición. El perfil no lo edita el club.
- **Los bloques de la sesión dejan de ser solo de fútbol sala.** Las secciones de actividad y los deportes individuales llaman a sus bloques a su manera ("Secuencia principal", "Fuerza / técnica y WOD", "Relajación final") en el editor, el modo pista y la impresión, y no enseñan los que no usan (porteros en yoga). Los códigos de bloque y sus permisos por papel no cambian.

### El contexto: lo que ya sabe el club, sin datos personales

- **La API arma el contexto desde la base**, nunca desde lo que mande el navegador, y respeta el ámbito de quien pide (0033). Entran: los entrenamientos que se planifican (fecha, duración, instalación y día respecto al partido), la plantilla con su puesto y su disponibilidad (estado, restricciones y minutos máximos), la edad del grupo, el ciclo y su foco, el último partido y el próximo, las sesiones de las dos semanas anteriores, las recomendaciones activas de la 0039 con sus cifras, los contenidos de la sección, la biblioteca (hasta 80 tareas, las mejor valoradas y más usadas primero), el material y lo que pide quien entrena.
- **Las recomendaciones van dentro.** Las reglas detectan ("más pérdidas que la media") y la IA redacta la respuesta. Es lo que diferencia esto de un chat genérico.
- **Privacidad por diseño.** El modelo no recibe nombres, fechas de nacimiento ni diagnósticos (Salud queda fuera, como dice la 0039). Los jugadores van como J1, J2…; la API traduce de vuelta. Los nombres de la plantilla que alguien escriba en el texto libre se cambian por su referencia antes de enviar (`redactNames`), sin mirar acentos ni mayúsculas. Las cifras de una recomendación de jugador llevan su referencia en vez de su nombre. Antes de activarlo en un club real, el proveedor tiene que figurar como encargado del tratamiento; conviene validarlo con el delegado de protección de datos del club.

### Lo que pide quien entrena

- Entrenamientos: uno, o varios de la semana en una sola propuesta (cuenta como una).
- Objetivo opcional, intensidad (suave, media, alta), material de hoy (el inventario con casillas, más otro material en texto) y contexto libre.
- **Balance de 100 puntos** entre los ejes del perfil. Puntos y no deslizadores independientes: con deslizadores todo el mundo lo sube todo al máximo y la señal no sirve; repartir 100 obliga a elegir. Parte de la metodología de la sección para la categoría (0039) si encaja con los ejes, o del perfil.
- Solo tareas de la biblioteca o también nuevas; y si quiere variantes para los jugadores con restricciones.

### Lo que devuelve, y cómo se revisa

- **Salida estructurada** con esquema JSON: un resumen y, por sesión, objetivo, RPE previsto, contenidos, el porqué, bloques con tareas (de la biblioteca por referencia o nuevas con lo necesario para hacerlas), material y avisos del propio modelo.
- **Validación en la API** (`resolveProposal`, pura y probada): referencias que existen, bloques del perfil (lo que cae en uno que no usa pasa a la parte principal), jugadores de baja fuera (y fuera la tarea que se queda sin nadie), restricciones que chocan con las etiquetas de la tarea, minutos máximos de cada limitado, minutos de la sesión y el tope de 20 tareas por bloque. Nada tumba la propuesta: se corrige o se avisa, y quien entrena decide. La lectura es tolerante: textos largos se cortan y números fuera de rango se encajan. Una salida truncada o que no se puede leer se reintenta una vez.
- **La IA propone y el cuerpo técnico decide.** Aplicar crea la sesión si falta (en borrador), pone objetivo, RPE y contenidos, y sustituye las tareas de los bloques propuestos que quien aplica puede editar. Las tareas nuevas quedan como tareas libres o, si se marca, entran en la biblioteca del equipo (una sola vez aunque salgan en varias sesiones). Nunca escribe en la ficha ni en salud.
- **Cada tarea aplicada queda marcada** (`training_session_items.ai_generation_id`) y se ve como "IA" en la sesión. Las tareas que siguen en su sesión sobre las aplicadas es la medida de si la IA ayuda.

### Token, cuota y coste

- **Un token para todos** en `ANTHROPIC_API_KEY`, que solo lee la API. La web nunca lo ve. Como Resend, solo la capa de datos habla con el proveedor (`apps/api/src/data/ai-model.ts`); ESLint y el test de arquitectura lo impiden fuera.
- **Cuota por club y semana**, de lunes a domingo en la zona del club. `organizations.ai_weekly_quota`, 5 por defecto, de 0 (apagada) a 100, la fija la plataforma. Se reserva al pedir con la fila del club bloqueada, así dos peticiones a la vez no gastan la misma plaza. Lo que falla no gasta: una propuesta fallida devuelve su plaza, y una que lleva más de 15 minutos en cola o generándose se da por perdida.
- **Configurable por club y no fija** porque cinco por semana en un club con veinte equipos es una propuesta por equipo cada cuatro semanas: mata la adopción. Configurable, se puede vender por plan sin tocar código, y los clubes que la agoten son los candidatos a subir.
- **Modelo:** Claude Opus 5.5 con esfuerzo alto y reintento en el servidor si sus filtros de seguridad rechazan la petición. `AI_MODEL` lo cambia, por ejemplo para comparar con Claude Sonnet 5.5 midiendo las tareas que se quedan.
- **Coste:** cada propuesta guarda tokens y coste en millonésimas de dólar. Con unos 25.000 tokens de entrada y 10.000 de salida, unos 0,30 $ por propuesta con Opus 5.5: como mucho, unos 6,5 $ por club y mes con la cuota por defecto. La plataforma ve, por club y en 30 días, propuestas, fallos, aplicadas, coste y tareas que se quedan.

### En segundo plano

- Una propuesta detallada tarda de uno a varios minutos: más de lo que aguanta una función normal. La API reserva la propuesta y la manda, firmada, a una **función en segundo plano de Netlify** (`ai-draft-background`, hasta 15 minutos), que responde enseguida. La web consulta el estado cada tres segundos. Quien cierra el panel la encuentra en "Propuestas recientes".
- La función solo atiende ids firmados con el secreto de la API, y una propuesta solo se genera una vez: la toma quien la encuentra en cola. Repetir la llamada no gasta de nuevo.
- En local sin Netlify y en tests, se genera en el propio proceso (`AI_RUNNER=inline`).

### Material de la sección

`section_equipment`: nombre, cantidad y notas, único por sección y nombre. Lo edita quien gestiona la biblioteca y la metodología (`org.training.library`), en los ajustes de entrenamiento. La IA planifica solo con lo que hay.

### Permisos

Sin permisos nuevos. Pedir y aplicar es de quien planifica el equipo (lleva la parte principal, 0039); ver una propuesta, de quien lee el entrenamiento del equipo. Fuera del ámbito, 404.

## Consecuencias

- Migración `20261023231523_ai_training_drafts` (tablas `ai_generations` y `section_equipment`, `organizations.ai_weekly_quota` y `training_session_items.ai_generation_id`) y semilla del demo con el material de fútbol sala y yoga y su "cómo entrenamos aquí".
- Rutas nuevas: `GET /api/org/teams/{id}/ai-config`, `POST /api/org/teams/{id}/ai-drafts`, `GET /api/org/ai-drafts/{id}`, `POST /api/org/ai-drafts/{id}/apply`, el material en `/api/org/sections/{id}/equipment` y la cuota en `/api/platform/organizations/{slug}/ai`. Errores nuevos: `quota_exceeded` (429) y `ai_unavailable` (503).
- Una segunda función de Netlify y su bundle (`worker.mjs`), generados en la build como el de la API.
- `pnpm lint` corre con 4 GB de memoria: con los tipos del SDK del proveedor, el lint con tipos pasa de los 2 GB que da Node por defecto (también en CI). `tsc` no lo necesita.
- La acción "Proponer" entra en el catálogo de iconos (`Sparkle`): sale en la sesión y en la semana.
- Suite de aislamiento con modelo falso (`training-ai.isolation.test.ts`) y prueba de interfaz con las respuestas del modelo simuladas (`e2e/ia.spec.ts`).
- Sin `ANTHROPIC_API_KEY` todo sigue como antes: el botón no aparece y la plataforma avisa.

## Alternativas descartadas

- **Una integración por sección:** cinco o nueve códigos que mantener. Un perfil en datos cuesta un texto, no un desarrollo.
- **Llamar al modelo desde la web:** expone el token y salta el ámbito de cada persona.
- **Generar dentro de la petición:** la función normal se queda corta para una semana entera.
- **Aplicar la propuesta sin revisión:** la decisión es del cuerpo técnico, como en las recomendaciones.
- **Cuota fija de 5 para todos:** se queda corta en clubes grandes y no deja venderla por plan.
- **Mandar nombres y fechas de nacimiento:** no mejoran la planificación y son datos de menores.

## Pendiente

- Validar los perfiles con un experto real de cada disciplina antes de abrirlos a clubes reales.
- Comparar Opus 5.5 con Sonnet 5.5 con las tareas que se quedan.
- La pizarra de las tareas nuevas, generada por la IA (ya es JSON con coordenadas).
- Usar las valoraciones del cierre como contexto ("tareas que funcionaron").
- Repartir la cuota del club entre secciones, si algún club lo pide.
