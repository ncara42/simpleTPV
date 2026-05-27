# Instrucciones para agentes Claude en qrush_tpv

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

## Scripts raíz

- `pnpm lint`, `pnpm format`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
- Build/test/typecheck van por Turborepo (cache local activado).

## Documentación viva

- Specs en `docs/superpowers/specs/`.
- Planes de implementación en `docs/superpowers/plans/`.
- PRD y plan MVP en raíz (`PRD_TPV_Multitienda.md`, `Plan_Desarrollo_MVP.md`).
