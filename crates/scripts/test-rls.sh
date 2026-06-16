#!/usr/bin/env bash
# Gate de la Fase 0: ejecuta el test de aislamiento RLS portado a SQLx contra el
# Postgres de desarrollo (docker compose). Prerrequisitos (ver crates/README.md):
#   docker compose up -d postgres
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/simpletpv \
#     pnpm --filter @simpletpv/db exec prisma migrate deploy
#   pnpm --filter @simpletpv/db db:bootstrap-dev   # roles app / app_admin
#   pnpm --filter @simpletpv/db db:seed            # orgs B11111111 / B22222222
set -euo pipefail

export DATABASE_URL_APP="${DATABASE_URL_APP:-postgres://app:app_dev_password@localhost:5434/simpletpv}"
export DATABASE_URL_ADMIN="${DATABASE_URL_ADMIN:-postgres://app_admin:app_admin_dev_password@localhost:5434/simpletpv}"

cd "$(dirname "$0")/.."
cargo test -p simpletpv-db --test rls -- --nocapture
