#!/usr/bin/env bash
# Levanta el stack LOCAL completo (API Rust + frontend backoffice) contra una BD
# `simpletpv_e2e` con datos demo, para ver la app en el navegador.
#
#   bash scripts/dev-local.sh          # arranca API + frontend (BD ya provista)
#   bash scripts/dev-local.sh --fresh  # recrea la BD desde cero + seed:demo
#
# Requisitos: docker compose (Postgres en :5434) y el binario ya compilado
# (crates/target/debug/simpletpv-api; si no, `cd crates && cargo build`).
# Login en la app: admin@demo.simpletpv / demo1234
set -euo pipefail
cd "$(dirname "$0")/.."

DB=simpletpv_e2e
API=./crates/target/debug/simpletpv-api
APILOG=/tmp/simpletpv-api-local.log
FRESH="${1:-}"

dc() { docker compose exec -T postgres psql -U postgres "$@"; }

# Variables de entorno de la API (la API NO lee .env; van explícitas).
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

# Restaura LOGIN+password de `app` y los atributos de `app_admin`. IMPRESCINDIBLE:
# la migración `remove_app_password` deja `app` en NOLOGIN (por seguridad, igual que
# prod); sin re-bootstrap la API no puede conectar como `app` y no carga datos.
ensure_roles() {
  dc -c "ALTER ROLE app_admin CREATEROLE BYPASSRLS;" >/dev/null 2>&1 || true
  dc -c "GRANT app TO app_admin WITH ADMIN OPTION;" >/dev/null 2>&1 || true
  dc -d "$DB" -f - < packages/db/scripts/dev-bootstrap.sql >/dev/null 2>&1 || true
}

if [[ "$FRESH" == "--fresh" ]]; then
  echo "▶ Recreando $DB…"
  dc -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);"
  dc -c "CREATE DATABASE $DB;"
fi

echo "▶ Restaurando roles (app con LOGIN)…"
ensure_roles

echo "▶ Arrancando API en :3001 (log: $APILOG)…"
nohup "$API" > "$APILOG" 2>&1 &
APIPID=$!
for i in $(seq 1 40); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then echo "  ✅ API healthy"; break; fi
  sleep 1
done

# Tras migrar, `remove_app_password` puede haber dejado `app` en NOLOGIN otra vez:
# restaurarlo para que las conexiones de runtime (los datos del navegador) funcionen.
ensure_roles

if [[ "$FRESH" == "--fresh" ]]; then
  echo "▶ Sembrando datos demo…"
  pnpm --filter @simpletpv/db db:seed:demo
fi

trap 'echo; echo "Parando API (pid $APIPID)…"; kill "$APIPID" 2>/dev/null || true; exit 0' INT TERM
echo
echo "════════════════════════════════════════════════════════════════"
echo "  Abre  http://localhost:5174   ·   login: admin@demo.simpletpv / demo1234"
echo "  (Ctrl-C para parar; la API se detiene también)"
echo "════════════════════════════════════════════════════════════════"
echo
pnpm --filter @simpletpv/backoffice dev
