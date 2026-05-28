# Instrucciones para agentes Claude en simpletpv

## Idioma

- Español de España (tuteo peninsular, nunca voseo).
- Términos técnicos y identificadores en su forma original.

## Stack

- TypeScript end-to-end, Node 22, pnpm 11.
- Monorepo Turborepo + pnpm workspaces.
- Backend: NestJS 11 + Prisma 6 + PostgreSQL 16.
- Frontends: React 19 + Vite 6 (apps/tpv y apps/backoffice).
- Tests: Vitest (api), Playwright (frontends).

## Convenciones

- Conventional Commits.
- Antes de tocar código, leer el archivo relevante; preferir edits a reescrituras.
- No mocks de BD en tests de integración — usar Postgres efímero.
- ESLint flat config raíz aplica a todo el monorepo; cada workspace puede sobreescribir.
- `tsconfig.base.json` en raíz; cada workspace extiende.
- `apps/api/tsconfig.json` sobrescribe `module` a `node16` (NestJS 11 más estable en CJS/Node resolution clásica). El resto del monorepo usa `ESNext`/`Bundler`. Override documentado en `docs/superpowers/specs/2026-05-28-f3-api-nestjs-design.md` F3-D2.
- Multi-tenancy: cada request HTTP DEBE pasar `X-Org-Id` (UUID v4) salvo `/health`. `TenantMiddleware` lo valida (regex UUID estricto) y pobla `AsyncLocalStorage`. `PrismaService` con `$extends` ejecuta `set_config('app.current_organization_id', ...)` parametrizado en una `$transaction` y re-emite la operación sobre `tx[model][operation]` → RLS aplicada en DB.
- Sin contexto → query devuelve 0 filas (fail-safe). Nunca filtra entre tenants. Verificado en `apps/api/test/rls.integration.spec.ts`.
- Puertos por defecto en local: API `:3001` (no 3000 — evita colisión con otros dev servers). Postgres docker mapeado a `:5434` host (no 5432).
- Password del rol `app` NO está en migraciones Prisma (se eliminó tras finding de seguridad MEDIUM). Vive en `packages/db/scripts/dev-bootstrap.sql` y se aplica con `pnpm --filter @simpletpv/db db:bootstrap-dev` UNA VEZ tras `prisma migrate deploy`. En producción Dokploy ejecuta `ALTER ROLE app LOGIN PASSWORD '<secret-real>'` manualmente. Ver `packages/db/scripts/README.md`.

## Scripts raíz

- `pnpm lint`, `pnpm format`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
- Build/test/typecheck van por Turborepo (cache local activado).

## Documentación viva

- Specs en `docs/superpowers/specs/`.
- Planes de implementación en `docs/superpowers/plans/`.
- PRD y plan MVP en raíz (`PRD_TPV_Multitienda.md`, `Plan_Desarrollo_MVP.md`).
