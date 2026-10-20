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
| 0011 | Resolución del club por entorno y subdominios reservados | Aceptada |
| 0012 | i18n con next-intl y diccionarios compartidos | Propuesta |
| 0013 | La API se empaqueta con esbuild en un único fichero | Aceptada |
| 0014 | Varios roles por usuario y club | Aceptada |
| 0015 | Cadena de petición y ámbito de organización | Aceptada |
| 0016 | Club de reserva cuando el host no lleva subdominio | Aceptada |
| 0017 | Acceso de soporte del administrador de plataforma | Aceptada |
| 0018 | Transporte de email y registro de salida | Aceptada |
| 0019 | Alta de cuentas solo por invitación | Aceptada |
| 0020 | Política de contraseñas y límite de intentos | Aceptada |
