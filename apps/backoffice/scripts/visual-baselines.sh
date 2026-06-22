#!/usr/bin/env bash
# Regenera/actualiza los baselines de regresión visual (#211) en el MISMO entorno que CI: el
# contenedor oficial de Playwright. Los baselines son por plataforma (`-linux`), así que generarlos
# fuera de ese contenedor (p. ej. en macOS) produciría PNGs que NO casan con el job `visual` de CI.
#
# No es destructivo: copia el repo (sin node_modules/target/dist) a un temp, instala+genera dentro
# del contenedor sobre la copia, y copia de vuelta SOLO los baselines `-linux`. El node_modules del
# host (binarios de tu plataforma) queda intacto.
#
# Uso:  pnpm --filter @simpletpv/backoffice visual:baselines
#       (o)  bash apps/backoffice/scripts/visual-baselines.sh
set -euo pipefail

# Versión de la imagen = versión de @playwright/test (ver playwright.visual.config.ts y ci.yml).
IMG="mcr.microsoft.com/playwright:v1.60.0-noble"
SNAP_REL="apps/backoffice/e2e/visual.spec.ts-snapshots"

# Raíz del repo (este script vive en apps/backoffice/scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ Copiando repo (sin node_modules/target/dist) a $WORK"
rsync -a \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
  --exclude 'crates/target' --exclude 'target' \
  --exclude 'playwright-report' --exclude 'test-results' \
  "$ROOT/" "$WORK/"

echo "→ Generando baselines -linux en $IMG"
docker run --rm -v "$WORK":/repo -w /repo "$IMG" bash -lc '
  set -e
  corepack enable
  corepack prepare pnpm@11.1.3 --activate
  pnpm install --frozen-lockfile
  pnpm --filter @simpletpv/backoffice exec playwright test -c playwright.visual.config.ts --update-snapshots
'

echo "→ Copiando baselines -linux de vuelta al repo"
mkdir -p "$ROOT/$SNAP_REL"
cp "$WORK/$SNAP_REL/"*-linux.png "$ROOT/$SNAP_REL/"
echo "✓ $(ls "$ROOT/$SNAP_REL"/*-linux.png | wc -l | tr -d ' ') baselines -linux actualizados en $SNAP_REL"
