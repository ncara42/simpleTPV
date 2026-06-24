#!/usr/bin/env bash
# Levanta el stack LOCAL (API Rust + frontend backoffice) contra `simpletpv_e2e`
# con datos demo, para ver la app en el navegador.
#
#   bash scripts/dev-local.sh          # arranca API + frontend (BD ya provista)
#   bash scripts/dev-local.sh --fresh  # recrea la BD desde cero + seed:demo
#
# ⚠️ Lánzalo en una TERMINAL DE VERDAD (no con `! …` dentro de Claude: eso bloquea
#    y muere al enviar el siguiente mensaje). Login: admin@demo.simpletpv / demo1234
set -uo pipefail   # SIN -e: queremos manejar los errores y avisar, no salir en silencio.

cd "$(dirname "$0")/.." || { echo "✗ No pude entrar al repo"; exit 1; }
echo "Repo: $(pwd)"

DB=simpletpv_e2e
API=./crates/target/debug/simpletpv-api
APILOG=/tmp/simpletpv-api-local.log
FRESH="${1:-}"

# ── Prerrequisitos ───────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "✗ Falta docker."; exit 1; }
command -v pnpm   >/dev/null 2>&1 || { echo "✗ Falta pnpm en el PATH."; exit 1; }
[ -x "$API" ] || { echo "✗ Falta el binario $API — compílalo: (cd crates && cargo build --bin simpletpv-api)"; exit 1; }
if ! docker compose ps postgres 2>/dev/null | grep -qi 'up\|running\|healthy'; then
  echo "▶ Levantando Postgres + Redis…"; docker compose up -d postgres redis
fi

dc() { docker compose exec -T postgres psql -U postgres "$@"; }

# ── Entorno de la API (NO lee .env; va explícito) ────────────────────────────
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

# Restaura LOGIN+password de `app` (la migración remove_app_password lo deja NOLOGIN,
# como en prod; sin esto la API no conecta y el frontend no carga datos).
ensure_roles() {
  dc -c "ALTER ROLE app_admin CREATEROLE BYPASSRLS;" >/dev/null 2>&1 || true
  dc -c "GRANT app TO app_admin WITH ADMIN OPTION;"  >/dev/null 2>&1 || true
  dc -d "$DB" -f - < packages/db/scripts/dev-bootstrap.sql >/dev/null 2>&1 || true
}

if [ "$FRESH" = "--fresh" ]; then
  echo "▶ Recreando $DB…"
  dc -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" || true
  dc -c "CREATE DATABASE $DB;" || true
fi

echo "▶ Restaurando roles (app con LOGIN)…"
ensure_roles
if dc -tAc "select rolcanlogin from pg_roles where rolname='app'" 2>/dev/null | grep -q t; then
  echo "  ✅ rol app puede conectar"
else
  echo "  ✗ el rol app sigue sin LOGIN — la API no podrá cargar datos."
fi

# Mata una API nuestra previa (evita conflicto en :3001).
pkill -f "simpletpv-api" 2>/dev/null || true
sleep 1

echo "▶ Arrancando API en :3001 (log: $APILOG)…"
nohup "$API" > "$APILOG" 2>&1 &
APIPID=$!
OK=0
for i in $(seq 1 45); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then OK=1; break; fi
  if ! kill -0 "$APIPID" 2>/dev/null; then break; fi   # la API murió
  sleep 1
done
if [ "$OK" != 1 ]; then
  echo "  ✗ La API NO arrancó. Últimas líneas de $APILOG:"
  echo "  ────────────────────────────────────────────────"
  tail -25 "$APILOG" 2>/dev/null | sed 's/^/  /'
  echo "  ────────────────────────────────────────────────"
  echo "  Pega esto en el chat y lo arreglo."
  exit 1
fi
echo "  ✅ API healthy (pid $APIPID)"
ensure_roles   # por si la migración volvió a dejar app en NOLOGIN

if [ "$FRESH" = "--fresh" ]; then
  echo "▶ Sembrando datos demo…"; pnpm --filter @simpletpv/db db:seed:demo
fi

trap 'echo; echo "Parando API (pid $APIPID)…"; kill "$APIPID" 2>/dev/null || true; exit 0' INT TERM
echo
echo "════════════════════════════════════════════════════════════════"
echo "  ▶ Abre  http://localhost:5174    login: admin@demo.simpletpv / demo1234"
echo "  (Ctrl-C aquí para parar API + frontend)"
echo "════════════════════════════════════════════════════════════════"
echo
exec pnpm --filter @simpletpv/backoffice dev
