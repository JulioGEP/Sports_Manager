# 0062. Sin CI en GitHub Actions

Estado: aceptada. Fecha: 1 de noviembre de 2026. Decisión de producto. Deja sin efecto los checks obligatorios que pedía la ADR 0003 y el plan de la Fase 0.

## Contexto

El repositorio tenía un workflow (`.github/workflows/ci.yml`) con cuatro jobs en cada PR y en cada entrega a `main`: lint con typecheck, tests y build; aislamiento; migraciones al día con `main`; e interfaz. Entre todos, unos quince minutos de máquina por PR, y el de interfaz solo ya eran once.

Con una sola persona trabajando en el repositorio, esas comprobaciones se pasan igual en local antes de subir, y ahí tardan menos porque las dependencias ya están instaladas. Lo que aportaba CI era vigilar a quien se olvidara de pasarlas; hoy no hay a quién vigilar, y a cambio cuesta minutos de cuota y espera en cada subida.

## Decisión

Se borra `.github/` entero. No hay CI.

Las comprobaciones pasan a ser responsabilidad de quien sube, antes de abrir la PR:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm test:isolation
```

```bash
git fetch origin main && pnpm db:check
```

Y `pnpm test:ui` cuando se toca la interfaz.

**La protección de rama hay que tocarla a mano.** Si en GitHub (Settings → Branches → `main`) siguen marcados como obligatorios `lint, typecheck y tests`, `aislamiento` o `migraciones al día con main`, ninguna PR se podrá mezclar: GitHub esperará un check que ya no se ejecuta nunca. Hay que quitarlos de la lista. El único que se queda es el de la preview de Netlify, que lo publica Netlify y no GitHub Actions.

## Consecuencias

- Se acaba la espera de quince minutos por PR y el consumo de cuota de Actions.
- **Nada impide que llegue a `main` código que no compila o con pruebas en rojo.** La única red que queda es la preview de Netlify, que falla si el build falla o si a la rama le falta una migración, pero no ejecuta ninguna prueba.
- `pnpm db:check` deja de avisar solo. Olvidarlo significa que la preview de Netlify falle con `migrations have been removed after being applied`, que es justo lo que ese check existía para evitar (pasó el 21 y el 22 de octubre de 2026; está contado en `docs/deploy.md`).
- El día que entre una segunda persona al repositorio, esto hay que revisarlo: la decisión se apoya en que hoy solo hay una.

## Alternativas descartadas

- **Dejar solo lint, typecheck y tests, que tardan veinticinco segundos.** Es la opción sensata si el motivo fuera el tiempo. No lo es: la petición es quitar Actions.
- **Un hook de git antes de subir.** Pasa las mismas comprobaciones sin GitHub, pero se salta con `--no-verify` y hay que instalarlo en cada copia. Si más adelante molesta subir algo roto, esta es la primera opción a recuperar.
