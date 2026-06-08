# Plan — Migración del backoffice a backend real (decomiso del modo demo)

> Estado: **EN CURSO 2026-06-08**. Decisión del usuario: "completo literal".
> Origen: trabajo sin commitear de un agente previo (Qwen) que eliminó las ramas
> `isDemo()` de las 13 libs del backoffice pero lo dejó incompleto (rompía typecheck,
> 2 unit tests y todo el e2e). Tras análisis, el usuario eligió **completar** la
> migración a backend real en vez de revertir.

## Contexto

El backoffice tenía un **modo demo** (`VITE_DEMO_MODE=true`, fixtures en
`apps/backoffice/src/demo/demoData.ts`) que servía datos cliente-side sin backend.
El e2e (`apps/backoffice/e2e/*.spec.ts`, ~35 tests) corría en demo, contra esos
fixtures, con IDs hardcodeados (`u-marta`, `fam-flores-indica`) y valores exactos.

Objetivo: el backoffice opera **siempre** contra la API real (NestJS + Prisma +
Postgres con RLS), sembrada por `packages/db/prisma/seed-demo.ts`, y el e2e corre
contra ese backend real. Decomisar el modo demo (datos y login) del backoffice.

## Estado ya entregado (verde)

- **Fase 1a** — `typecheck` 7/7 verde: `SalesHistoryPage.tsx` y `UsersPage.tsx`
  reescritas contra API real (`listStores`/`listUsers`/`listFamilies`/`SalesViewRow`),
  con la API real de `DataTable`/`ConfigEditor` y todos los testids intactos.
- **Fase 2** — unit backoffice 62/62 verde: `auth.test.ts` reescrito (login siempre
  real, sin bypass demo, A-02), bloque demo de `wiring.test.ts` eliminado, import
  `AppEvent` sin usar quitado de `auth.ts`.

## Bloqueadores verificados (lo que falta construir)

1. **Promociones**: NO existe backend (sin controller/modelo). El e2e espera 4 promos
   en 3 grupos + constructor. → construir módulo completo.
2. **Rotación de producto**: `GET /stock/global` no devuelve rotación; el filtro
   `stock-rotation` está inerte. → computar rotación server-side (reusar lógica de
   velocidad de `dashboard.service.productRotation`) y exponerla en `StockGlobalRow`.
3. **Estado operativo de tienda / dispositivos / token**: abierto-cerrado (derivar de
   `CashSession` OPEN), verificación de dispositivo (`OfficialDevice.authorized` existe),
   token `FICHA-` (BUILD endpoint), log de tienda (BUILD desde `TimeClockEntry`), grid
   ordenado por ventas de hoy (reusar `dashboard.salesToday`).
4. **Muro UUID**: las PKs son `@db.Uuid`; el e2e selecciona por `data-value` con IDs de
   fixture string. → **reescribir el e2e** para descubrir IDs por etiqueta/dinámicamente
   (NO inyectar IDs string en el seed; es imposible).
5. **Seed-demo desalineado**: login (`admin@org1.test`/`demo` del e2e vs
   `admin@demo.simpletpv`/`demo1234` del seed), nombres de usuario (Ana/Marta/Luis),
   conteos (12 productos, 5 familias raíz, etc.), datos operativos.

## Plan por fases (gate de tests en cada una)

- **Fase A — Módulo Promociones** (backend + frontend): ✅ **HECHA 2026-06-08** (verde:
  migración aplicada, API unit 772/772 + integración RLS/CRUD, typecheck 7/7, backoffice
  unit 63/63). Detalle de implementación abajo.
  - Prisma: enums `PromoConditionType`/`PromoDiscountType` + modelo `Promotion`
    (`organizationId`, `storeId?`, `name`, `conditionType`, `threshold`,
    `discountType`, `discountValue Decimal`, `startDate`/`endDate` Date, `active`,
    timestamps; `@@unique([organizationId, storeId, name])`, índices). Back-relations en
    `Organization` y `Store`.
  - Migración manual `…_promotion` (CREATE TABLE + FKs + RLS), patrón exacto de
    `20260608120000_store_price/migration.sql`.
  - DTOs (`class-validator`), `PromotionsService` (CRUD + bulk toggle/remove),
    `PromotionsController` (`@Roles('ADMIN','MANAGER')` en escrituras), `PromotionsModule`
    (registrar en `app.module`). Tests unit (service) + integración (RLS + endpoints).
  - Tipos compartidos en `packages/auth/src/api-types.ts` + lib
    `apps/backoffice/src/lib/promotions.ts`. Wiring de `PromotionsPage` a `useQuery`+
    mutations (mantener todos los testids: `promo-card`, `promo-group-*`, `new-promo`,
    `promo-name`, `promo-save`, `promo-list`, etc.). Caso wiring.test.ts.
  - Gate: `typecheck` + unit + integración del API verdes.
- **Fase B — Rotación en stock global**: ✅ **HECHA 2026-06-08**. `StockGlobalRow.rotation`
  computada en `stock.service.global()` (uds vendidas COMPLETED en 30 d vía `saleLine.groupBy`,
  bandas: <6 baja, ≥30 alta, media entre medias). Filtro `stock-rotation` activado +
  render real en `GlobalStockSection.tsx`. `DEMO_STOCK_GLOBAL` borrado. Verde: API unit
  772/772 + integración stock 10/10, backoffice unit 63/63, typecheck 7/7.
- **Fase C — Estado de tienda / dispositivos / token / log / orden por ventas**: ✅ **HECHA**.
  - **Backend log**: `GET /time-clock/entries` (`TimeClockService.entries` + tipo
    `TimeClockLogRow`) — entradas crudas con nombre, RLS + assertStoreAccess. Unit+integración.
  - **Frontend**: `StoresPage` ordena por ventas-hoy reales (`GET /dashboard/sales-today`
    byStore) + métrica real en la card; `StoreDetailModal` trae el log real (`listStoreLog`
    → `/time-clock/entries`) para última apertura/cierre + drawer; `StoreLogEntry` reubicado
    a `lib/time-clock.ts`. Wiring test del endpoint. Verde: typecheck 7/7, backoffice unit 64/64.
  - **Decisión**: dispositivo (warn/authorize/ok) y token `FICHA-` se quedan CLIENT-SIDE
    (estado React puro): son demo-theater que ya funcionan contra backend real sin endpoint
    (la UI no muestra "sesión abierta en vivo", usa el log para aperturas/cierres). No se
    construyó endpoint de dispositivos por tienda (YAGNI); se revisará en Fase F si el e2e lo pide.
- **Fase D — Migrar páginas restantes off demoData**: CatalogPage, DashboardPage,
  TimeClockPage, VerifactuPage (endpoint `/verifactu/records` existe; oculta hoy).
- **Fase E — Seed-demo determinista**: alinear login (crear `admin@org1.test`/`demo` o
  cambiar el helper del e2e), nombres (Ana/Marta/Luis/Jon), conteos coherentes,
  CashSession OPEN, TimeClockEntry, OfficialDevice, 4 promociones en 3 grupos,
  StorePrice/B2B/verifactu. Datos deterministas para el e2e.
- **Fase F — Reescribir e2e + infra**:
  - `playwright.config.ts`: quitar `VITE_DEMO_MODE`; webServer/global-setup que levante
    Postgres + `migrate deploy` + bootstrap-dev + `db:seed:demo` + API (`:3001`); el
    proxy `/api`→`:3001` de `vite preview` ya existe en `packages/web-config/vite.base.ts`.
  - Reescribir ~20 tests: `selectOption` por etiqueta/descubrimiento de UUID; aserciones
    tolerantes donde el valor exacto de fixture no sea razonable; KPIs por valor real.
  - `access.spec.ts`: login real + test negativo (credencial inválida rechazada).
- **Fase G — Decomiso demo**: borrar `demoData.ts`, `api-config.ts` (isDemo) y plumbing
  `VITE_DEMO_MODE` del backoffice cuando nada los referencie. `dev` script → API real.

## ALCANCE REAL: AMBAS APPS (confirmado 2026-06-08)

El trabajo previo retiró el modo demo también del **TPV** (`apps/tpv/src/lib/*` perdió
las ramas `isDemo()`; `auth.ts` perdió el override de login demo). → el e2e del TPV
(`apps/tpv/e2e/*`) FALLA igual que el del backoffice. La migración cubre las DOS apps:

- **TPV**: completar decomiso demo en libs/páginas + el e2e del TPV (login real, datos
  sembrados). Su e2e hoy: login "cualquier credencial" + tickets/caja de fixture.
- Seed (Fase E) y reescritura e2e (Fase F) aplican a AMBOS suites (tpv + backoffice).

**Decisión (usuario, 2026-06-08): seguir la migración completa dual-app.** PR #149
(`feat/backoffice-real-backend-migration`, en origin+upstream) queda ROJO y SIN mergear
hasta que TODO esté verde. `main` auto-despliega a prod (job `deploy` tras e2e) → no
mergear nada a medias.

### Estado CI (run más reciente del PR #149)

- **quality ✓** (lint/typecheck/API tests+cobertura/build). Cobertura 90.41% ≥ floor 90.2
  (se arregló añadiendo `promotions.module.spec.ts` + `promotions.controller.spec.ts` +
  rama 'media' de rotación; el floor lo sube github-actions vía ratchet `[skip ci]`).
- **e2e ✗** (paso TPV; el backoffice ni corre porque el step TPV va primero). deploy skipped.
- Gotcha CI: el gate de cobertura mide SOLO unit sobre todo `apps/api/src`; el código
  cubierto solo por integración baja el %. Patrón del repo: `*.module.spec.ts` triviales
  (devices/store-orders/time-clock ya los tienen) para cubrir módulos.

## Verificación end-to-end (cuando aplique)

- DB local viva: Docker `simpletpv-postgres` healthy en `:5434`; `.env.local` con las 4
  `DATABASE_URL`. Migrar: `pnpm --filter @simpletpv/db db:migrate` (dev) o
  `db:migrate:deploy`. Sembrar: `pnpm --filter @simpletpv/db db:seed:demo`.
- Unit/typecheck: `pnpm typecheck`, `pnpm --filter @simpletpv/backoffice test`,
  `pnpm --filter @simpletpv/api test`.
- Integración API: `pnpm --filter @simpletpv/api test:int` (requiere DB + seed).
- E2E: `pnpm --filter @simpletpv/backoffice test:e2e` (requiere API + DB sembrado).

## Convenciones a respetar

- Multi-tenant: `organizationId` en JWT → `TenantContextInterceptor` → RLS. Patrón RLS
  manual en migración (GRANT + ENABLE/FORCE + policy `tenant_isolation` con `NULLIF`).
- `@Roles` + `RolesGuard`; aislamiento por tienda con `assertStoreAccess` cuando aplique.
- Conventional Commits; preferir edits; tests por fase; sin deuda técnica.
