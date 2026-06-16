# Backend Rust — Fase 0 (fundaciones + spike RLS)

Workspace Cargo de la migración del backend de NestJS a Rust. Esta fase es el
**gate bloqueante** (`docs/migration-rust/02` §4): demuestra el invariante más
delicado — el **aislamiento multi-tenant por RLS** — sobre el stack objetivo
(Tokio · Axum · SQLx). Si el test de RLS no pasa en Rust, la migración no avanza.

## Estructura (arquitectura por capas, doc 02 §3)

```
crates/
├── shared/   # config (fail-fast) + AppError (thiserror). No conoce Axum ni SQLx.
├── db/       # SQLx: pool + transacción RLS por tenant (set_config $1, true) +
│   │           after_commit + FOR UPDATE. Único punto que fija el tenant.
│   └── tests/rls.rs   # port de apps/api/test/rls.integration.spec.ts
└── app/      # bootstrap: Axum + Tokio + tracing + graceful shutdown (/health, /ready)
```

Las capas `http`, `domain` y `auth` se añaden en fases posteriores.

## Procedencia

Toda la elección de crates y patrones proviene de fuentes oficiales vía Context7,
documentadas en `docs/migration-rust/` (02 stack, 04 SQLx+RLS, 06 auth, 07
serde/errores/tracing). Nada inventado.

## Prerrequisitos del gate

Postgres con el esquema migrado y el seed (mismas condiciones que el test de
Vitest original):

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/simpletpv \
  pnpm --filter @simpletpv/db exec prisma migrate deploy
pnpm --filter @simpletpv/db db:bootstrap-dev   # roles app / app_admin (dev)
pnpm --filter @simpletpv/db db:seed            # orgs B11111111 / B22222222
```

## Comandos

```bash
cd crates
cargo build                 # compila las tres crates
cargo test -p simpletpv-db  # tests (incluye el gate RLS)
./scripts/test-rls.sh       # solo el gate RLS, con las URLs de dev por defecto

# Arrancar el binario mínimo:
DATABASE_URL_APP=postgres://app:app_dev_password@localhost:5434/simpletpv \
  cargo run -p simpletpv-app
```

El gate lee `DATABASE_URL_APP` (rol `app`, RLS) y `DATABASE_URL_ADMIN`
(rol `app_admin`, BYPASSRLS, solo para descubrir IDs de org por NIF). Sin
variables, usa las credenciales de desarrollo (públicas, ver
`packages/db/scripts/dev-bootstrap.sql`).
