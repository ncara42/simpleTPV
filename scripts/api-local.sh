#!/usr/bin/env bash
# Arranca SOLO la API Rust en :3001 contra `simpletpv_e2e`, en PRIMER PLANO (ves el
# log en vivo). Pensado para depurar en dos terminales:
#   Terminal 1:  bash scripts/api-local.sh
#   Terminal 2:  pnpm --filter @simpletpv/backoffice dev      (frontend en :5174)
# Luego abre http://localhost:5174  (login admin@demo.simpletpv / demo1234).
set -uo pipefail
cd "$(dirname "$0")/.."

DB=simpletpv_e2e
API=./crates/target/debug/simpletpv-api
[ -x "$API" ] || { echo "✗ Falta $API — (cd crates && cargo build --bin simpletpv-api)"; exit 1; }

# Restaura el rol `app` (la migración remove_app_password lo deja NOLOGIN).
docker compose exec -T postgres psql -U postgres -c "ALTER ROLE app_admin CREATEROLE BYPASSRLS;" >/dev/null 2>&1 || true
docker compose exec -T postgres psql -U postgres -d "$DB" -f - < packages/db/scripts/dev-bootstrap.sql >/dev/null 2>&1 || true

export DATABASE_URL_APP="postgresql://app:app_dev_password@localhost:5434/$DB"
export DATABASE_URL_AUTH="postgresql://app_admin:app_admin_dev_password@localhost:5434/$DB"
export DATABASE_URL_ADMIN="postgresql://postgres:postgres@localhost:5434/$DB"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5434/$DB?schema=public"
export REDIS_URL="redis://:redis_dev_password@localhost:6381"
export JWT_SECRET="local-dev-access-secret-0123456789abcd"
export JWT_REFRESH_SECRET="local-dev-refresh-secret-0123456789abcd"
export COOKIE_SECURE="false"
export BIND_ADDR="0.0.0.0:3001"
export THROTTLE_LIMIT="600"
export CORS_ORIGINS="http://localhost:5174,http://localhost:4174"

echo "▶ API en http://localhost:3001  (Ctrl-C para parar)"
exec "$API"
