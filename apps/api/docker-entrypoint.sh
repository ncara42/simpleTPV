#!/bin/sh
# Entrypoint del contenedor de la API (#78).
# Aplica las migraciones de Prisma antes de arrancar y aborta si fallan
# (fail-fast): así nunca se sirve código contra un esquema a medio migrar.
set -e

if [ -z "$DATABASE_URL_MIGRATE" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL_MIGRATE no está definida. Abortando." >&2
  echo "[entrypoint] Configúrala en Dokploy con un rol con privilegios DDL (owner)." >&2
  exit 1
fi

# El CLI de Prisma lee la URL de prisma.config.ts, que toma process.env.DATABASE_URL.
# dotenv/config no sobreescribe variables ya presentes, así que este export manda.
export DATABASE_URL="$DATABASE_URL_MIGRATE"

echo "[entrypoint] Aplicando migraciones de base de datos…"
# El CLI de Prisma se resuelve desde el paquete @simpletpv/db (donde es dependencia).
# Usamos require.resolve para no depender de la ruta interna de pnpm (.pnpm/<hash>),
# que es frágil. El CWD debe ser el del paquete db para que el CLI encuentre
# prisma.config.ts y la carpeta prisma/migrations — pero lo hacemos en un subshell
# para que el CWD del proceso principal siga siendo /app: el CMD arranca con
# `node dist/main.js` (ruta relativa a /app) y no debe heredar otro CWD.
(
  cd /app/node_modules/@simpletpv/db
  PRISMA_CLI=$(node -e "console.log(require.resolve('prisma/build/index.js'))")
  node "$PRISMA_CLI" migrate deploy
)

echo "[entrypoint] Migraciones aplicadas. Arrancando la API…"
exec "$@"
