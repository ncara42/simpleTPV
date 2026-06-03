# Refactor profesional: separación de dominio puro y deuda técnica

**Fecha:** 2026-06-03
**Estado:** Fase 1 (backend) aplicada · roadmap frontend pendiente
**Rama:** `worktree-refactor-pro` (desde `main`)

## Contexto

Tras cerrar la auditoría de seguridad (23/23 hallazgos), se aborda una limpieza
estructural del monorepo. El objetivo NO es reescribir, sino reducir deuda
técnica concreta manteniendo el comportamiento idéntico y la suite en verde en
cada paso.

El codebase de partida ya estaba sano: naming consistente (kebab-case en
ficheros/carpetas, PascalCase en componentes), **0** usos de `any`, **0**
`eslint-disable`, un único `@ts-expect-error` (en un test) y apenas 2 marcadores
`TODO`/deuda documentada. La deuda real estaba en el **tamaño y la mezcla de
responsabilidades** de algunos archivos, no en la calidad del código.

## Línea base (antes de tocar nada)

| Workspace  | typecheck | lint | tests                            |
| ---------- | --------- | ---- | -------------------------------- |
| api        | ✅        | ✅   | ✅ 369 specs · 86.9% cobertura   |
| tpv        | ✅        | ✅   | ✅ 41                            |
| auth       | ✅        | ✅   | ✅ 9                             |
| ui         | ✅        | ✅   | ❌ Button (2 fallos, ya en main) |
| backoffice | ✅        | ✅   | — (sin script `test`)            |

Único rojo preexistente: el test de `Button` esperaba clases con tokens del
design system (`bg-[var(--ui-danger)]`) pero el componente había regresado a
colores Tailwind fijos (`bg-red-600`).

## Decisión de arquitectura: módulo `*.domain.ts`

Se introduce un patrón explícito para los módulos de la API que mezclaban
**aritmética de negocio pura** con **orquestación de Prisma/RLS** en un mismo
archivo:

- `*.domain.ts` — funciones SIN efectos (no tocan DB, cache ni contexto de
  tenant): tipos, constantes y cálculos. Testeables de forma aislada.
- `*.service.ts` — la clase `@Injectable` que orquesta DB, transacciones,
  eventos y VeriFactu, importando del dominio.

Ventajas: tests de cálculo sin montar el módulo Nest, archivos de servicio más
cortos y centrados, y una frontera clara entre "qué se calcula" y "cómo se
persiste". Los specs ya existentes que probaban las funciones puras pasan a
importarlas del `*.domain.ts` sin cambios de aserciones.

Además se crea `apps/api/src/common/money.ts` como única fuente de verdad del
redondeo a céntimos (`round2`), que estaba **triplicado** en `sales`, `returns`
y `cash-sessions` con comentarios casi idénticos.

## Cambios aplicados (Fase 1)

| Commit                                                                          | Alcance                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `refactor(ui): Button usa tokens del design system`                             | `Button.tsx` alinea primary/danger con `var(--ui-*)`; test en verde.                                   |
| `refactor(api): separa el dominio puro de ventas/devoluciones y unifica round2` | Nuevo `common/money.ts`; `sales.domain.ts` y `returns.domain.ts`; `sales.service.ts` 671 → 458 líneas. |
| `refactor(api): extrae el dominio puro de stock`                                | `stock.domain.ts` (stockCacheKey, stockLevel, alertTypeFor, ALERT_URGENCY).                            |

Resultado: typecheck 7/7, lint limpio, 369 specs de la API en verde, sin cambios
de comportamiento (sólo movimiento de código + dedup + tokens).

## Roadmap pendiente (priorizado)

Lo siguiente queda mapeado pero no ejecutado en esta tanda para mantener los
diffs revisables y no tocar código con poca cobertura de tests sin antes
añadirla.

### Backend (riesgo bajo)

- `dashboard.service.ts` (458 líneas): extraer `rangeFor`/cálculo de periodos a
  un dominio puro con reloj inyectable. El resto son consultas SQL crudas que no
  se benefician de un split.
- `purchases.service.ts` (347): valorar extraer el cálculo de recepción.

### Frontend (riesgo medio — requiere tests antes)

- Componentes >250 líneas a descomponer: `StockPage` (700), `PurchasesPage`
  (479), `SalePage` (452), `CashPanel` (420), `StoresPage`, `FamiliesPage`.
  Patrón: extraer subcomponentes por sección + hooks de datos.
- Hoisting a `packages/`: `useStoresList`, `useModal`, constantes de
  `query-keys`, helpers de formato y `switchApp` (duplicados entre `tpv` y
  `backoffice`).
- Reducir prop drilling de `storeId` con un `StoreProvider`/contexto.

### Infra / tests

- `backoffice` sin script `test` ni suite: añadir vitest + cobertura mínima de
  componentes antes de descomponerlos.
- ESLint: añadir reglas de React (hooks/a11y) para `apps/*` y de NestJS para la
  API.

## Cómo continuar

Cada fase debe: (1) partir de verde, (2) mover/dividir sin cambiar
comportamiento, (3) reejecutar `pnpm typecheck && pnpm lint && pnpm test`, (4)
commitear con Conventional Commits y un cuerpo que explique el _porqué_.
