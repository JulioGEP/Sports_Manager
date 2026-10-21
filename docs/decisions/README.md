# Decisiones de arquitectura (ADR)

Una decisión técnica relevante, un fichero. Formato corto:

- Título y número correlativo.
- Estado: propuesta, aceptada, sustituida por otra.
- Fecha.
- Contexto: qué problema resuelve.
- Decisión.
- Consecuencias: lo bueno y lo malo que acepta.
- Alternativas descartadas, con el motivo.

Las decisiones no se editan una vez aceptadas. Si cambian, se escribe una nueva que sustituye a la anterior y se enlazan.

| Nº | Decisión | Estado |
|---|---|---|
| 0001 | Monorepo pnpm con front y back separados | Aceptada |
| 0002 | Hono como framework de la API | Aceptada |
| 0003 | Drizzle como ORM y migraciones aplicadas por Netlify DB | Aceptada |
| 0004 | Better Auth dentro de apps/api | Aceptada |
| 0005 | Resend como proveedor de email transaccional | Aceptada |
| 0006 | Cookie de sesión en el dominio padre para login único | Aceptada |
| 0007 | Región UE: Frankfurt para funciones y base, eu-central-1 para Blobs | Aceptada |
| 0008 | Roles como datos y platform_admin fuera de la aplicación | Aceptada |
| 0009 | Aislamiento entre clubes por código | Aceptada |
| 0010 | Un solo proyecto Netlify con la API en /api del mismo host | Aceptada |
| 0011 | Resolución del club por entorno y subdominios reservados | Aceptada; panel interno sustituido por 0022 |
| 0012 | i18n con next-intl y diccionarios compartidos | Aceptada |
| 0013 | La API se empaqueta con esbuild en un único fichero | Aceptada |
| 0014 | Varios roles por usuario y club | Aceptada |
| 0015 | Cadena de petición y ámbito de organización | Aceptada |
| 0016 | Club de reserva cuando el host no lleva subdominio | Aceptada |
| 0017 | Acceso de soporte del administrador de plataforma | Aceptada |
| 0018 | Transporte de email y registro de salida | Aceptada |
| 0019 | Alta de cuentas solo por invitación | Aceptada |
| 0020 | Política de contraseñas y límite de intentos | Aceptada |
| 0021 | Subdominios por club, parche local y comodín en Netlify | Aceptada |
| 0022 | Admin interno en `/admin` del dominio base | Aceptada |
| 0023 | Primer administrador de plataforma por variable de entorno | Aceptada |
| 0024 | Logos de club en Netlify Blobs a través de la API | Aceptada |
| 0025 | Interfaz: dos espacios, sistema de componentes y pruebas de interfaz con capturas | Aceptada |
| 0026 | Entrada propia del negocio y alta del primer administrador de plataforma | Aceptada |
| 0027 | Front como SPA con Vite, React y Tailwind sobre el design system, y clubes por ruta | Aceptada |
| 0028 | Estructura del club: temporadas, secciones, equipos, jugadores y familias | Aceptada |
| 0029 | Ficha ampliada del jugador: foto, indicadores, objetivo, PDI y timeline | Aceptada |
| 0030 | Personal con cargo, permisos por equipo, ficha para la familia, inicio operativo y reto por puntos | Aceptada |
| 0031 | Club completo: secciones por deporte, personas y socios, agenda e instalaciones, asistencia, cuotas con Stripe y "ver como" | Aceptada |
