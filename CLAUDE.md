# Instrucciones para agentes Claude en simpletpv

## Idioma

- Español de España (tuteo peninsular, nunca voseo).
- Términos técnicos e identificadores en su forma original.

## Stack

- Monorepo Turborepo + pnpm workspaces. Node 22, pnpm 11.
- **Backend: Rust** en `crates/` (Tokio + Axum 0.8 + SQLx 0.8 + PostgreSQL 16). Binario `simpletpv-api`.
  - `apps/api` es un cascarón legacy NestJS (sin `package.json`) — no usar.
- Frontends: React 19 + Vite 8 — `apps/tpv` (PWA, punto de venta) y `apps/backoffice` (admin).
- Tests: `cargo test` (backend), Vitest (unit de packages/frontends), Playwright (e2e frontends).
- Prisma (`packages/db`) = solo fuente del schema + cliente TS para seeds/tests. Las migraciones reales son SQL en `crates/app/migrations/`, aplicadas por el binario al arrancar (tabla `_sqlx_migrations`).

## Convenciones

- Conventional Commits.
- Antes de tocar código, leer el archivo relevante; preferir edits a reescrituras.
- No mocks de BD en tests de integración — usar Postgres efímero.
- ESLint flat config raíz aplica a todo el monorepo; `tsconfig.base.json` en raíz (cada workspace extiende).
- **Multi-tenancy (RLS Postgres):** el `organizationId` viaja DENTRO del JWT; el cliente solo manda `Authorization: Bearer` (no hay header `X-Org-Id`). `crates/db` abre una transacción por tenant con `with_tenant_tx` → `set_config('app.current_organization_id', $1, true)` como primera sentencia, y todas las queries van sobre esa tx → RLS aplicada en BD. Sin contexto → 0 filas (fail-safe, nunca filtra entre tenants; verificado en `crates/db` tests RLS).
- Dos roles Postgres: `app` (RLS aplicada, runtime) y `app_admin` (BYPASSRLS, solo lookup de login pre-tenant).
- Password del rol `app` fuera de migraciones: `packages/db/scripts/dev-bootstrap.sql` (dev); en prod se aplica `ALTER ROLE app ... PASSWORD` manualmente.
- Puertos locales: API `:3001`, Postgres `:5434`, Redis `:6381`. Redis es opcional/degradable.

## Scripts raíz

- `pnpm lint | format | build | typecheck | test | test:e2e` (vía Turborepo).
- Backend Rust: `cd crates && cargo build | clippy | test`.

## Documentación viva

- Specs en `docs/superpowers/specs/`; planes en `docs/superpowers/plans/`.
- PRD y plan MVP en raíz (`PRD_TPV_Multitienda.md`, `Plan_Desarrollo_MVP.md`).
- Migración a app de escritorio Tauri: `~/ia/docs/planes/plan_migracion_tauri.md`.
