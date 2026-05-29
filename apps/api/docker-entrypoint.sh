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
# prisma.config.ts vive junto al paquete db dentro de node_modules; el CLI necesita
# ese CWD para encontrar la config y la carpeta prisma/migrations.
# Con --legacy deploy, pnpm no aplana prisma a node_modules/ raíz; el wrapper .bin
# generado por pnpm apunta a la ruta correcta dentro de .pnpm/.
cd /app/node_modules/@simpletpv/db
/app/node_modules/@simpletpv/db/node_modules/.bin/prisma migrate deploy
cd /app

echo "[entrypoint] Migraciones aplicadas. Arrancando la API…"
exec "$@"
