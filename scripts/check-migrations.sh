#!/usr/bin/env bash
# Comprueba que la rama lleva todas las migraciones que ya están en main, sin tocar ninguna.
#
# Las previews de Netlify nacen de una copia de producción, y producción ya tiene aplicadas todas
# las migraciones de main. Si a la rama le falta alguna, Netlify la da por borrada y el deploy
# preview falla con "N migrations have been removed after being applied". Si la rama cambia una
# migración que main ya tiene, falla por "modified after being applied". Ver docs/deploy.md.
#
# Uso: scripts/check-migrations.sh [base] [rama]   (por defecto origin/main y HEAD)
set -euo pipefail

base="${1:-origin/main}"
head="${2:-HEAD}"
dir="netlify/database/migrations"

if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "No encuentro la referencia '${base}'. Ejecuta antes: git fetch origin main" >&2
  exit 2
fi

missing=()
changed=()
while IFS=$'\t' read -r status path; do
  [[ "${path}" == *.sql ]] || continue
  case "${status}" in
    D) missing+=("${path#"${dir}/"}") ;;
    M) changed+=("${path#"${dir}/"}") ;;
  esac
done < <(git diff --name-status --no-renames "${base}" "${head}" -- "${dir}")

if ((${#missing[@]} == 0 && ${#changed[@]} == 0)); then
  echo "Migraciones al día con ${base}."
  exit 0
fi

if ((${#missing[@]} > 0)); then
  echo "La rama no lleva estas migraciones que ${base} ya tiene (y producción ya ha aplicado):" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "El deploy preview fallaría con \"migrations have been removed after being applied\"." >&2
  echo "Arreglo: mezcla main en la rama (git merge origin/main) y vuelve a subirla." >&2
  echo "Nunca borres ni renombres una migración para quitar el error." >&2
fi

if ((${#changed[@]} > 0)); then
  echo "La rama cambia migraciones que ${base} ya tiene aplicadas:" >&2
  printf '  - %s\n' "${changed[@]}" >&2
  echo "Una migración aplicada es inmutable. Deshaz el cambio y escribe una migración nueva." >&2
fi

exit 1
