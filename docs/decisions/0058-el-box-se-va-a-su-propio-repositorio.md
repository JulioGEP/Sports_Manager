# 0058. El box se va a su propio repositorio, inthebox

Estado: aceptada. Fecha: 2026-10-27. Saca de este repositorio lo construido en la 0049, 0050, 0051, 0052, 0053, 0054, 0055 y 0057. La 0056 (formato del dinero) es de toda la app y se queda.

## Contexto

La 0049 montó el box como un segundo modelo de club sobre la misma base. Funcionó, pero un box y un club deportivo son negocios distintos y se gestionan distinto:

- **Clientes distintos.** Un box vende clases, tarifas y programación a adultos que reservan. Un club deportivo organiza equipos, temporadas, partidos y familias.
- **Evolución distinta.** El box ya tiene planificación, KPIs por club, reservas con espera y aforo. Nada de eso le sirve a un club deportivo, y al revés pasa lo mismo con partidos, retos o la pizarra.
- **Código que se soporta en la sombra.** Cada pantalla compartida preguntaba "¿es un box?". Cada cambio en un lado obligaba a probar el otro. La API, la web y el esquema cargaban con el doble.

Producto decidió separarlos ahora, antes de que crezcan más.

## Decisión

- El box vive en su propio repositorio, **inthebox**, con su propia base, su propio despliegue y su propia hoja de ruta. Lo compartido (personas, estructura, agenda, cuotas, tienda, identidad, IA, aislamiento) se duplica allí.
- Este repositorio queda para clubes deportivos. Sale todo lo del box: rutas y pantallas, el modelo de club (`club_model`), el léxico de fitness, los cuadros de mando, las reservas, las tarifas con derecho de uso, el WOD, las marcas, la comunidad, los leads, la biblioteca de ejercicios, la planificación, el precio de socio y la API pública de clases.
- Lo general que llegó con esas decisiones se queda: el dinero como `1.234,56 €` (0056), el horario que conserva sus franjas al guardarlo (no duplica sesiones), el pase de lista con quien tiene asistencia sin estar en la plantilla, la unidad `kg` en los tests físicos, el "Más" del móvil por grupos y los textos de todas las acciones de la actividad.
- Una migración de datos borra el club `demo-box` y las cuentas que solo existían para él (`box@`, `coach@` y `atleta@demo.test`). `admin@demo.test` sigue en el club `demo`.

## Consecuencias

- La web, la API, lo compartido y el esquema pierden unas 65.000 líneas. Cada repositorio se prueba y se despliega solo.
- Una idea que sirva a los dos se porta a mano de un repositorio a otro. Los paquetes conservan el mismo nombre (`@sportsmanager/*`) para que portar sea copiar.
- **Contracción pendiente.** Las tablas y columnas del box siguen en la base, sin uso. El código nuevo no las lee ni las escribe: todas aceptan nulo o tienen valor por defecto. Se borran en la siguiente PR de esquema, después de desplegar esta (docs/deploy.md, regla 6), con `pnpm db:generate`, que ya las ve fuera del esquema:
  - Tablas: `announcement_reads`, `announcements`, `athlete_levels`, `benchmark_results`, `body_measurements`, `booking_policies`, `bookings`, `box_equipment`, `box_plan_members`, `box_plans`, `direct_messages`, `exercises`, `fitness_preferences`, `leads`, `personal_records`, `plan_adjustments`, `planning_settings`, `subscriptions`, `workout_blocks`, `workout_results` y `workouts`.
  - Columnas: `organizations.club_model` y `organizations.dashboards`; `teams.booking_mode`; `team_schedules.coach_user_id` y `team_schedules.capacity`; `events.capacity` y `events.coach_user_id`; `fee_plans.entitlement`, `sessions`, `validity_days`, `class_team_ids`, `includes_plus` e `includes_programming`; `store_products.member_price_cents`; `ai_generations.kind` y `ai_generations.plan_id`.
  - Antes de devolver `ai_generations.team_id` a obligatoria, borrar las propuestas sin equipo (las de WOD y planificación de otros clubes de fitness, si los hubiera).
- Un club creado como fitness en producción, si lo hubiera, pasa a verse como club deportivo. Su sitio es inthebox.
- Las ADR 0049 a 0055 y la 0057 quedan aquí como historia, marcadas como trasladadas. Su código y sus capturas viven en inthebox.

## Alternativas descartadas

- **Seguir con los dos modelos en un repositorio.** Es lo que había. Cada mejora de uno arrastra al otro y el código condicional crece en cada pantalla.
- **Un paquete compartido entre los dos repositorios.** Ataría su evolución, que es justo lo que se quiere evitar. Duplicar lo común es más barato que coordinar versiones.
- **Borrar las tablas en esta misma PR.** Entre aplicar la migración y publicar el código nuevo, la versión anterior seguiría leyendo `club_model` y fallaría. Se contrae en el siguiente deploy, como manda la regla 6.
