# simpletpv

TPV multitienda SaaS — monorepo TypeScript.

## Requisitos

- Node 22 (`nvm use`)
- pnpm 11+

## Arranque

```bash
pnpm install
pnpm lint
pnpm format
pnpm build
```

## Estructura

- `apps/api` — Backend NestJS 11
- `apps/tpv` — Frontend TPV (React 19 + Vite 6)
- `apps/backoffice` — Frontend Backoffice (React 19 + Vite 6)
- `packages/db` — Schema Prisma + cliente compartido

## Documentación

- `PRD_TPV_Multitienda.md` — Producto y requisitos
- `Plan_Desarrollo_MVP.md` — Cronograma y stack detallado
- `docs/superpowers/` — Specs y planes de implementación
