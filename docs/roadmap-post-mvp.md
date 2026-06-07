# Roadmap post-MVP — simpleTPV

> Estado y plan tras cerrar el épico **offline**. Este documento es la **fuente de
> verdad** para continuar en una sesión nueva sin perder el hilo. Cada bloque del
> roadmap tiene su **issue** en GitHub (ncara42/simpleTPV) etiquetado con
> `roadmap:post-mvp`; este doc da el contexto compartido que los issues no repiten.

Última actualización: 2026-06-07.

## 1. Dónde estamos

El MVP está en `main` (origin **ncara42** y upstream **marcogmurciano**, sincronizados)
y **desplegable**. Esta sesión cerró, además:

- **CI saneado**: ratchet de cobertura recuperado, dependabot integrado, races de
  concurrencia arregladas (S-10/11/12), manual de piloto + capturas, `.gitignore`
  de secretos.
- **Auditoría de seguridad** (2026-06-03 + seguimiento 2026-06-06): 23/23 + las de
  seguimiento resueltas o documentadas (accept-risk / diferidas). SEC-05/SEC-13
  cerrados.
- **Épico offline (#1) COMPLETO** y verificado end-to-end con el stack real
  (PR #122, mergeado): el TPV es PWA (carga sin red), idempotencia de ventas por
  `clientId`, reserva de **bloques de ticket por dispositivo**, y **cola+sync**
  (vender offline → reconectar → sincronizar → persistido en BD). Ver
  `docs/manual-usuario-piloto.md` y los commits `7198e48`/`049eea3`/`446fdbe`/`30e0d7f`.

## 2. Qué falta (prioridad)

| #   | Bloque                                                                            | Issue        | Prioridad                          | ¿Portátil?                 |
| --- | --------------------------------------------------------------------------------- | ------------ | ---------------------------------- | -------------------------- |
| 2   | **Fiscal**: factura/ticket simplificado, cierre Z, export contable                | (ver issues) | **Alta** (requisito legal/negocio) | Sí                         |
| 4   | **Trazabilidad**: lote + caducidad                                                | (issue)      | Media (regulatorio CBD)            | Sí                         |
| 5   | **Control plane** multi-tienda: central + pricing por tienda + feature flags      | (issue)      | Media-alta (estrategia 7 tiendas)  | Sí                         |
| 3   | **Hardware**: impresora ESC/POS (#64), báscula (issue)                            | #64 + issue  | Media                              | **No** (necesita hardware) |
| —   | **Piloto de campo**: formación (#84), acompañamiento (#85), manual+feedback (#86) | #84/#85/#86  | Tras desplegar                     | No (necesita piloto)       |
| —   | dependabot dev-deps (#34 upstream)                                                | chore        | Trivial                            | Sí                         |
| —   | VeriFactu envío real AEAT (#63)                                                   | #63          | **Diferido a 2027**                | Sí                         |

**Recomendación de orden:** #2 (fiscal) → #4 (lote/caducidad) → #5 (control plane).
El hardware y el piloto quedan a la espera de hardware/tienda.

## 3. Contexto técnico compartido (LEER antes de tocar nada)

### Stack y convenciones

- Monorepo Turborepo + pnpm 11, Node 22, TypeScript end-to-end. Español de España.
- API: NestJS 11 + Prisma 6 (cliente) + PostgreSQL 16, **multi-tenant por RLS**
  (el `organizationId` viaja en el JWT; `AsyncLocalStorage` + `PrismaService.$extends`).
- Frontends: React 19 + Vite 6 (`apps/tpv`, `apps/backoffice`); TanStack Query + zustand.
- Conventional Commits. Antes de editar, leer el fichero; preferir edits a reescrituras.
- Puertos locales: API `:3001`, Postgres docker `:5434`, Redis `:6381`.

### El épico offline como PATRÓN a seguir

Cada bloque se entrega como el offline: **diseño → slices verificadas → PR a `main`**,
con tests unit + integration, gate verde, y (si toca frontend) verificación con el
stack. Reusar el módulo `apps/tpv/src/lib/offline-sales.ts` y `useOfflineSync` como
referencia de capa de datos cliente.

### GOTCHAS que cuestan tiempo si no se saben (todas verificadas esta sesión)

1. **Coverage ratchet (CI bloqueante).** El gate corre SOLO unit tests
   (`apps/api/vitest.config.ts`, `src/**/*.spec.ts`) pero mide cobertura sobre TODO
   `src/**/*.ts`. Código cubierto solo por _integration specs_ **hunde** la cobertura
   y rompe el gate. Suelo en `coverage-threshold.json` (**89.13%** hoy). Arreglo:
   añadir unit tests (Prisma mockeado + `tenantStorage.run`), NO bajar el suelo.
   `pnpm knip` tiene `continue-on-error: true` → no bloquea.
2. **Migraciones Prisma 7.** `prisma migrate dev` es **interactivo** y falla en no-TTY.
   → **escribir la migración a mano** en `packages/db/prisma/migrations/<timestamp>_<nombre>/migration.sql`
   (replicar el estilo: AlterTable + índices + bloque RLS si es tabla nueva) y aplicar
   con `prisma migrate deploy`. `prisma.config.ts` hace `import 'dotenv/config'` (carga
   `.env`, NO `.env.local`) → **exportar `DATABASE_URL`**; para DDL usar
   `DATABASE_URL_MIGRATE` (rol `postgres` superuser). Tras migrar: `prisma generate`.
3. **Stack local (orden):** `docker compose up -d postgres redis` → `prisma migrate deploy`
   (con `DATABASE_URL=$DATABASE_URL_MIGRATE`) → `pnpm --filter @simpletpv/db db:bootstrap-dev`
   (fija la password del rol `app`; **re-ejecutar si recreas el contenedor**, si no:
   "Authentication failed ... role `app`") → seed → API.
4. **Seeds:** `db:seed` crea org1/org2 (`B11111111`, login `admin@org1.test`/`password123`);
   `db:seed:demo` crea la org demo `B99999999` (login `admin@demo.simpletpv`/`demo1234`,
   con caja abierta). Ejecutar con `DATABASE_URL=$DATABASE_URL_MIGRATE`.
5. **Integration tests** (`apps/api/test/*.integration.spec.ts`, config aparte, NECESITAN
   Postgres): correr con `DATABASE_URL=$DATABASE_URL_MIGRATE` (superuser, para los lookups
   `admin` del setup) y `DATABASE_URL_APP` = rol `app` (RLS). Cmd:
   `cd apps/api && npx vitest run --config vitest.integration.config.ts <ficheros>`.
6. **Arrancar el API en local:** carga `.env.local` pero la resolución de ruta de
   `nest start` no siempre cuadra → arrancarlo con el env exportado
   (`set -a; source .env.local; set +a; pnpm --filter @simpletpv/api start:dev`).
7. **Frontend modo real vs demo:** el script `dev`/`build` de e2e hornea
   `VITE_DEMO_MODE=true`. Para probar contra la API real, construir SIN esa var; el
   `vite preview` proxya `/api` → `http://localhost:3001` (config en
   `packages/web-config/vite.base.ts`). PWA desactivable con `VITE_PWA_DISABLED=true`.
8. **Dos forks.** `origin` = ncara42, `upstream` = marcogmurciano. El job CI "Raise
   coverage floor" commitea `chore: ratchet coverage floor [skip ci]` en cada push a
   `main`; como pusheamos a ambos, los `main` **divergen** por ese commit (mismo
   contenido, distinto SHA) → al reintegrar, `git merge` y resolver `coverage-threshold.json`
   al valor MAYOR. Mantener ambos sincronizados.
9. **localStorage en tests (jsdom/Node 22):** no siempre disponible; hay polyfill en
   `apps/tpv/vitest.setup.ts`.
10. **Pre-commit:** lint-staged (eslint --fix + prettier) + gitleaks. No commitear `.env.local`
    (ya en `.gitignore`).

## 4. Detalle por bloque

### #2 Fiscal (Alta)

Estado actual: las ventas tienen `ticketNumber` y desglose de IVA en líneas
(`SaleLine.taxRate`); hay export CSV de ventas (`apps/api/src/sales/sales-export.service.ts`);
VeriFactu en modo sandbox (`apps/api/src/verifactu/`, ver #63, diferido 2027). **Faltan:**

- **Factura / ticket simplificado imprimible** (PDF o HTML imprimible) con los datos
  fiscales (NIF org, desglose IVA, nº ticket). Hoy `getTicket` (`sales.service.ts`)
  devuelve un resumen JSON; falta el documento imprimible/descargable.
- **Cierre Z** (arqueo fiscal diario por tienda): totales del día, desglose por IVA y
  método de pago, nº de tickets, secuencia. Apoyarse en `dashboard.service.ts` (KPIs) y
  `cash-sessions`.
- **Export contable** a gestoría (CSV estándar y/o Holded/Sage/A3). Ampliar el patrón de
  `sales-export.service.ts`.

### #4 Trazabilidad: lote + caducidad (Media)

El schema (`packages/db/prisma/schema.prisma`) **no** tiene lote/caducidad. Añadir
(migración a mano, ver gotcha #2): lote y fecha de caducidad a nivel de stock/movimiento
(modelo nuevo `StockBatch` o campos en `StockMovement`/`Stock`), selección de lote en la
venta/recepción, y alertas de caducidad. Pensar FEFO (first-expired-first-out) para CBD.

### #5 Control plane multi-tienda (Media-alta)

Cliente ancla: **7 tiendas CBD**. Hoy: multi-tenant por org, tiendas dentro de la org,
tarifas **B2B** (`PriceList`) pero **no pricing retail por tienda**. Construir: gestión
central cross-tienda, **precio por tienda** (override del PVP por `Store`), y **feature
flags** por tienda/org. Ver memoria `cbd-anchor-business-model`.

### #3 Hardware (Media — necesita hardware)

- Impresora térmica ESC/POS: **#64** (ya existe).
- **Báscula**: el enum `SaleUnit` ya soporta `WEIGHT/VOLUME/LENGTH`; falta UI de entrada
  de peso en el TPV (`apps/tpv/src/SalePage.tsx`/`CartPanel.tsx`) y, opcional, lectura de
  balanza. (issue nuevo)

### Otros

- **#34** (upstream) dependabot dev-deps: merge trivial cuando pase la política de
  antigüedad de release (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`).
- **#63** VeriFactu real AEAT: diferido a 2027 (obligatorio 1-ene-2027 Sociedades /
  1-jul-2027 resto).

## 5. Issues (GitHub ncara42/simpleTPV)

Punto de entrada: **EPIC #130** (todo enlazado). Filtro: `label:roadmap:post-mvp`.

- **#130** — EPIC roadmap post-MVP (seguimiento)
- Fiscal (#2): **#123** factura/ticket imprimible · **#124** cierre Z · **#125** export contable
- Trazabilidad (#4): **#126** lote + caducidad (FEFO)
- Control plane (#5): **#127** central + pricing por tienda + feature flags
- Hardware (#3): **#64** impresora ESC/POS (existente) · **#128** báscula/venta por peso
- Piloto: **#84** formación · **#85** acompañamiento · **#86** manual + feedback
- Menores: **#129** dependabot dev-deps (upstream #34) · **#63** VeriFactu AEAT (diferido 2027)
