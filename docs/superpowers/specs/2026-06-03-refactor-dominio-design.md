# Refactor profesional: separación de dominio puro y deuda técnica

**Fecha:** 2026-06-03
**Estado:** Fases 1 (backend), 2 (infra frontend) y 3 (descomposición StockPage + PurchasesPage) aplicadas · más componentes pendientes
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

## Cambios aplicados (Fase 2 — frontend / infra)

| Commit                                                                       | Alcance                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `test(backoffice): añade vitest y cubre los formatters`                      | vitest (config espejo de tpv) + script `test` + spec de `format.ts`. backoffice pasa a estar cubierto por `pnpm test`.       |
| `refactor(web): unifica la derivación del nivel de stock en @simpletpv/auth` | `stockLevel()` se mueve a `@simpletpv/auth` (junto al tipo `StockLevel`) con test; `StockPage` deja de duplicar el semáforo. |

Resultado acumulado: typecheck 7/7, lint limpio, **436 tests** en verde
(api 369, tpv 41, auth 13, backoffice 11, ui 2), sin cambios de comportamiento.

## Hallazgo: "duplicación" frontend mayormente falsa

Una revisión inicial marcó `nav.ts` y `format.ts` como duplicados entre `tpv` y
`backoffice`. Verificado en detalle, **no lo son**:

- `switchApp` (nav.ts) hace lo OPUESTO en cada app (tpv→backoffice vs
  backoffice→tpv, distinta env var). Son espejos específicos, no duplicados.
- `format.ts` expone APIs distintas: `eur()` en tpv (solo número) vs
  `fmtEur/fmtRate/fmtDelta/…` en backoffice (currency style, manejo de null).

Hoistarlos sería churn con riesgo de regresión y poco valor. Lección: validar
los hallazgos de un barrido automático antes de actuar.

## Cambios aplicados (Fase 3 — descomposición de componentes)

Patrón seguro: (1) montar red de tests de render, (2) smoke test del componente
monolítico que fija el comportamiento observable, (3) mover el código a
componentes de sección, (4) el mismo smoke test confirma que no cambió nada.

| Commit                                                                | Alcance                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `test(backoffice): infra de render-testing + smoke test de StockPage` | @testing-library/react + jest-dom (espejo de packages/ui); smoke test de StockPage.                                        |
| `refactor(backoffice): descompone StockPage`                          | 695 → 74 líneas. Carpeta `stock/`: labels, GlobalStockSection, AlertsSection, TransfersSection. Elimina `LevelDot` muerto. |
| `refactor(backoffice): descompone PurchasesPage`                      | 479 → 47 líneas. Carpeta `purchases/`: labels, OrdersSection, SuppliersSection, SuggestSection.                            |

Cada página queda como orquestador (pestañas + secciones), con cada sección en su
propio archivo de responsabilidad única y un smoke test que protege el cableado.

## Roadmap pendiente (priorizado)

### Frontend — más descomposición (mismo patrón)

- backoffice: `StoresPage` (383), `FamiliesPage` (334).
- tpv: `SalePage` (452), `CashPanel` (420), `ReturnPanel` (318), `CartPanel`
  (314). Requiere replicar la infra de render-testing en `apps/tpv` (hoy solo
  tiene tests de lib con mocks).

### Backend

- Patrón `*.domain.ts` ya completo (sales, returns, stock, purchases);
  cash-sessions usa `common/money`; dashboard ya tenía `period.ts`. Sin
  pendientes de relevancia.

### Frontend — otras mejoras

- Reducir prop drilling de `storeId` con un `StoreProvider`/contexto.

### Infra / tests

- **React Compiler rules (eslint-plugin-react-hooks v7)**: el preset
  `recommended` completo añade reglas nuevas (`set-state-in-effect`, `refs`,
  `purity`, `immutability`…). Medido: solo **5 errores** en 4 ficheros
  (FamiliesPage, SalesHistoryPage, DiscountModal, useBarcodeScanner), todos
  patrones idiomáticos (reset de estado por prop, latest-ref). Arreglarlos cambia
  comportamiento → requiere tests de render primero. Tanda propia.
- ESLint NestJS: reglas específicas para `apps/api` (puede aflorar violaciones).

## Cómo continuar

Cada fase debe: (1) partir de verde, (2) mover/dividir sin cambiar
comportamiento, (3) reejecutar `pnpm typecheck && pnpm lint && pnpm test`, (4)
commitear con Conventional Commits y un cuerpo que explique el _porqué_.
