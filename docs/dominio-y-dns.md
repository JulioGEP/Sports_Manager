# Dominio, subdominios y DNS

Estado: Fase 0, Bloque 5. El dominio definitivo no está decidido; hasta entonces la plataforma vive en `hubsports.netlify.app`, donde no hay subdominios por club. Este documento explica qué hace la plataforma con los subdominios, cómo probarlos hoy y qué habrá que hacer el día que exista el dominio.

## Cómo resuelve el club cada petición

- La API decide el club por el host (`apps/api/src/tenancy.ts`, ADR 0011 y 0016): `<slug>.<dominio base>` es ese club; el dominio base a secas, `localhost` y las deploy previews sirven el club de reserva (`TENANT_FALLBACK_SLUG`, hoy `demo`); `admin`, `www`, `api`, `app`, `staging` y `mail` están reservados.
- La web no interpreta el host: pasa el de cada petición a `GET /api/org/branding` y pinta lo que la API devuelve (nombre, colores, logo, idioma). Sin club, muestra la portada de la plataforma.
- Las direcciones de los clubes las calcula la API (`url` en `GET /api/me/memberships`): `https://<slug>.<dominio base>`, y el dominio base para el club de reserva.

## Subdominios en local (parche hasta el dominio final)

`APP_BASE_DOMAIN=sportsmanager.localhost` en `.env`. Con `pnpm dev`:

- `http://localhost:8888` → club de reserva (`demo`).
- `http://club-a.sportsmanager.localhost:8888` → club `club-a`, si existe en la base local.

Chrome y Firefox resuelven cualquier `*.localhost` a tu máquina sin configurar nada. Si tu navegador no lo hace, añade a `/etc/hosts` (en Windows, `C:\Windows\System32\drivers\etc\hosts`) una línea por club:

```
127.0.0.1 sportsmanager.localhost club-a.sportsmanager.localhost
```

La cookie de sesión es de host único hasta que exista `SESSION_COOKIE_DOMAIN`: en local, cada subdominio pide su propio login. Es el comportamiento esperado del parche.

## El día que haya dominio

Lo que sé sobre subdominios comodín en Netlify viene de respuestas de su personal en el foro, no de una página oficial de documentación que haya podido verificar desde este entorno. Compruébalo con ellos antes de dar nada por hecho:

- https://answers.netlify.com/t/multi-tenant-application-is-it-possible-to-have-a-wildcard-domain-in-netlify/79724
- https://answers.netlify.com/t/wildcard-certificate/96388
- Documentación general de dominios: https://docs.netlify.com/domains-https/custom-domains/

Según esas respuestas: hace falta plan Pro o superior (el equipo GEP Group lo tiene), el comodín lo activa soporte de Netlify a petición, el DNS del dominio debe estar en Netlify DNS para que emitan el certificado comodín (la alternativa es aportar un certificado propio) y ese proyecto no puede tener alias de dominio.

Pasos, en este orden:

1. **Registrar el dominio** en el registrador que prefieras.
2. **Añadir el dominio al proyecto**: Netlify → proyecto `hubsports` → Domain management → Add a domain → escribir el dominio. Netlify ofrece usar Netlify DNS: aceptar. Te dará cuatro servidores de nombres.
3. **Delegar el DNS**: en el registrador, cambiar los servidores de nombres del dominio por los cuatro de Netlify. Tarda entre minutos y horas en propagarse.
4. **Pedir el comodín**: escribir a soporte de Netlify (Support → Contact support) pidiendo activar el subdominio comodín `*.tudominio` en el proyecto `hubsports`. Cuando confirmen, en Domain management debe aparecer `*.tudominio` y el certificado debe cubrirlo.
5. **Variables en Netlify** (Project configuration → Environment variables, contexto Production): `APP_BASE_DOMAIN=tudominio`, `SESSION_COOKIE_DOMAIN=.tudominio` (login único entre subdominios, ADR 0006) y mover `TENANT_FALLBACK_SLUG` al contexto Deploy previews, para que el dominio base a secas muestre la portada de la plataforma en vez del club demo.
6. **Redesplegar** y comprobar: `https://demo.tudominio/api/org/branding` devuelve el club demo; `https://tudominio` muestra la portada; una invitación creada en un club lleva el enlace con su subdominio.

Si el DNS no puede estar en Netlify DNS, la alternativa es un registro `CNAME` comodín (`*`) apuntando a `hubsports.netlify.app` más un certificado comodín propio subido a Netlify. Es más trabajo y hay que confirmarlo con soporte.
