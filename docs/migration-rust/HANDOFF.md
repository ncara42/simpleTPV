# Handoff — Migración del backend a Rust

> Estado vivo de la migración NestJS → Rust. Pégalo (o su esencia) al arrancar una
> sesión nueva. Regla de oro: toda decisión técnica viene de **fuentes oficiales
> vía Context7**; nada inventado, código corto, responsabilidades separadas.
> Última actualización: 2026-06-16.

## Qué hay YA en `main` (verificado, revisado, mergeado)

Workspace Cargo en `crates/` (Rust 1.96, instalado vía rustup). Arquitectura por
capas (ver `docs/migration-rust/02` §3):

| Crate    | Contenido                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared` | `AppConfig` (fail-fast; `DATABASE_URL_APP`, `DATABASE_URL_AUTH`, `BIND_ADDR`, `COOKIE_SECURE`; secretos en `secrecy::SecretString`) + `AppError` (BadRequest/Unauthorized/Forbidden/NotFound/Conflict/Unavailable/Internal).                                                                                                                                                                          |
| `db`     | pool SQLx + **`with_tenant_tx`** (RLS por tenant: `set_config($1::text,true)` en UNA tx con `FOR UPDATE` + `after_commit` en `tokio::spawn`; devuelve `AppError`) + `classify(sqlx::Error)→AppError` (RLS `42501`→Forbidden). 11 tests RLS + 2 unit.                                                                                                                                                  |
| `auth`   | JWT **HS256** (interop NestJS), **bcrypt cost 10** (verifica hashes existentes, `spawn_blocking`) + SEC-14 dummy + cap 72B, login (lookup por email con rol **app_admin BYPASSRLS**), **rotación SEC-06** (reuso→revoca familia en tx `FOR UPDATE`), logout. 6 unit + 7 integración.                                                                                                                  |
| `http`   | `ApiError`→`IntoResponse`, extractor **`AuthUser`** (`FromRequestParts`), rutas `/auth/login\|refresh\|logout` (refresh en cookie httpOnly+SameSite=Strict+Secure runtime+7d), `/me`, `/health`, `/ready`; stack tower-http (nosniff/frame/referrer/HSTS, body-limit 64kb, timeout, trace, redacción Authorization/Cookie); **rate-limit login 5/min/IP** (tower_governor). 6 tests integración HTTP. |
| `app`    | bootstrap: dos pools (app RLS + app_admin BYPASSRLS) + `AuthService` + router; `serve` con `into_make_service_with_connect_info`; graceful shutdown.                                                                                                                                                                                                                                                  |

PRs mergeados: #161 (Fase 0 + docs), #165 (Fase 1 auth), #166 (capa http auth).
Abiertos (TS, opcionales): #162 (knip), #164 (dead-code + plan dashboard).

## Entorno de pruebas (Postgres dev en docker)

```bash
docker compose up -d postgres   # host :5434, db simpletpv, postgres/postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/simpletpv \
  pnpm --filter @simpletpv/db exec prisma migrate deploy
pnpm --filter @simpletpv/db db:bootstrap-dev   # roles app / app_admin
pnpm --filter @simpletpv/db db:seed            # orgs B11111111/B22222222;
                                               # usuarios *@org1.test / *@org2.test, pwd password123
cd crates && . "$HOME/.cargo/env"
cargo test --workspace          # todo verde
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

## Convenciones / gotchas

- Conventional Commits; **rama por fase**; PR a `main` (repo `ncara42/simpleTPV`).
- El check CI **OSV Scanner (pnpm-lock) FALLA pero es informativo/no-requerido** y
  preexistente (estos PRs no tocan deps). Los checks que importan: _Lint, typecheck,
  tests y build_ + _E2E smoke_. `main` no tiene required checks → mergeable en `UNSTABLE`.
- Cada fase: research Context7 → portar tests existentes (TDD) → implementar →
  `clippy -D warnings` + `fmt` → **security-reviewer** (es backend) → commit + PR.
- Tests de integración Rust: **un usuario del seed distinto por test** (parallel-safe).
- El esquema lo sigue gestionando **Prisma Migrate**; SQLx solo consume (doc 04 §5).

## Divergencias conscientes de paridad

Casos donde el backend Rust se aparta **a propósito** de NestJS (no son bugs):

- **`PATCH /price-lists/:id` inexistente → 404** (NestJS devolvía `200` con cuerpo
  `null`: hacía `updateMany`+`findFirst`). El `RETURNING` vacío se mapea a
  `NotFound`, que es la semántica REST correcta para un PATCH a un recurso que no
  existe. Decidido en #165; fijado por test en `domain/tests/price_lists.rs`.
- **`GET /public/stock` → `sku: null`** cuando el producto no tiene referencia
  (`Product.sku` es opcional). Esto **sí** era un defecto: el port tipaba `sku`
  como `String` y reventaba con `500` (decode de NULL). Corregido en #165 a
  `Option<String>` → paridad real con NestJS (`sku: s.product.sku`).

## Próximo trabajo (en orden)

1. **Cerrar la capa http de auth** (TODO en `crates/http`):
   - **Revalidación A-04** por request en `AuthUser`: revalidar `active`+`role`
     contra BD con caché corta (~15s) y **fail-closed ADMIN/MANAGER, fail-open
     CLERK** (port de `UserStateService`). Portar sus tests.
   - **CORS** por env (`CORS_ORIGINS`) + `allow_credentials`, fail-fast en prod (SEC-18).
   - **rate-limit en `/refresh`** (10/min).
2. **Fase 2 — núcleo transaccional** (doc 02 §4): crate `domain` + rutas http para
   `products`, `stock` (+lotes FEFO), `sales` (+líneas, idempotencia `Sale.clientId`),
   `returns` (PIN). Escrituras multi-tabla con `with_tenant_tx`; portar los
   `apps/api/test/*.integration.spec.ts` correspondientes.
3. **(Frontend, sesión aparte)** Split de `apps/backoffice/src/DashboardPage.tsx`
   según `docs/superpowers/plans/2026-06-16-dashboard-refactor.md` (baselines
   Playwright mockeadas + `Date` congelada); luego consolidación de modales.

## Punteros

- Investigación y referencias: `docs/migration-rust/00..09`.
- Plan del dashboard: `docs/superpowers/plans/2026-06-16-dashboard-refactor.md`.
- Memoria del proyecto: nodo `migracion-backend-rust`.
