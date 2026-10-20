# 0006. Cookie de sesión en el dominio padre para login único

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Cada club vive en su subdominio. Un usuario puede pertenecer a varios clubes y debe entrar en todos con el mismo login y cambiar entre ellos sin volver a identificarse.

## Decisión

En producción la cookie de sesión se emite con el atributo `Domain` del dominio padre de la plataforma (`.<dominio-base>`), mediante la opción de cookies entre subdominios de Better Auth. Cambiar de club es navegar a otro subdominio. La API comprueba la pertenencia en cada petición, de modo que compartir la cookie no concede acceso a ningún club por sí misma.

En deploy previews (`*.netlify.app`, que está en la Public Suffix List) y en local la cookie es de host único o del dominio local de desarrollo. Se configura por contexto.

El dominio base es provisional y se lee de configuración, nunca del código.

## Consecuencias

- Una sola sesión para todos los clubes del usuario.
- Un club con dominio propio (futuro) no compartirá sesión con el resto. Se tratará cuando exista esa funcionalidad.
- Todos los subdominios del dominio base deben ser de la plataforma; nunca se delegará un subdominio a terceros.

## Alternativas descartadas

- Cookie por subdominio: obliga a iniciar sesión en cada club.
- Token en el almacenamiento del navegador: expuesto a scripts, peor que una cookie HttpOnly.
