# Plan — Refactor de `apps/backoffice/src/DashboardPage.tsx` (2152 LOC)

> Estado: **plan listo para ejecutar** (análisis hecho 2026-06-16). No ejecutado:
> es una descomposición de ~1500 líneas + arnés de visual-regression nuevo; se
> hace en una sesión enfocada con contexto fresco para no arriesgar la pantalla
> más usada. Decisión del usuario: hacerlo **con baselines Playwright**.

## Objetivo

Partir el cuerpo monolítico de la función `DashboardPage` (líneas 193–1697, ~1500
LOC) en componentes hijos por **extracción pura** (sin cambiar markup ni
comportamiento): contenedor (datos + estado) → presentacionales (props). Meta:
parent ~500 LOC + 14 hijos en `apps/backoffice/src/components/dashboard/`.

## Red de seguridad: visual-regression SIN backend

El e2e actual corre contra el backend real (`vite preview` → `/api:3001`). Para
baselines deterministas y sin levantar la API, usar **Playwright `page.route()`**
mockeando `/api/**` + **congelar `new Date()`** (la página usa `new Date()` para
`hourDay`, `todayIso` y etiquetas de comparación → no determinista si no se fija).

1. `page.addInitScript` que fija `Date` a `2026-06-15T00:00:00Z`.
2. Mockear las 17 rutas (ver tabla) con datos fijos.
3. `toHaveScreenshot` en breakpoints 320/768/1024/1440 → **capturar baselines**.
4. Extraer cada sección → re-ejecutar → **debe ser pixel-idéntico**.

### Rutas a mockear (preset por defecto "ventas")

`/api/stores`, `/api/dashboard/{sales-today,sales-by-family,sales-by-hour,
sales-kpis,margin-kpis,stockout-kpis,product-rankings,product-rotation,
archetype-rotation,sales-by-employee,discount-by-employee}`, `/api/stock/{alerts,
expiring}`, `/api/purchase-orders`, `/api/supplier-prices/comparison`,
`/api/time-clock/history-all`. Shapes en `apps/backoffice/src/lib/dashboard.ts`
(+ `stock.ts`, `purchases.ts`, `@simpletpv/auth`).

## Descomposición (componentes hijos, todos prop-only)

| Componente                                     | Archivo                                   | Líneas origen               | Riesgo              |
| ---------------------------------------------- | ----------------------------------------- | --------------------------- | ------------------- |
| `KpiCardsRow` (+ `KpiCard`, `ChartKindToggle`) | `components/dashboard/KpiCardsRow.tsx`    | 466–580                     | bajo                |
| `SalesComparisonPanel`                         | `.../SalesComparisonPanel.tsx`            | 767–845                     | bajo                |
| `FamilySalesPanel` (+ `FamilyScrollList`)      | `.../FamilySalesPanel.tsx`                | 848–884, 1737               | bajo                |
| `StockoutPanel`                                | `.../StockoutPanel.tsx`                   | 887–924                     | bajo                |
| `RankingsPanel` (+ `Rankings`)                 | `.../RankingsPanel.tsx`                   | 753–763, 928–933, 2063–2151 | bajo                |
| `ExpiringPanel`                                | `.../ExpiringPanel.tsx`                   | 936–982                     | bajo                |
| `PurchaseOrdersPanel`                          | `.../PurchaseOrdersPanel.tsx`             | 985–1040                    | bajo                |
| `HourChartPanel` (+ `HourChart`)               | `.../HourChartPanel.tsx`, `HourChart.tsx` | 1043–1064, 1861–2053        | bajo                |
| `SalesEmployeePanel`                           | `.../SalesEmployeePanel.tsx`              | 1067–1102                   | bajo                |
| `DiscountEmployeePanel`                        | `.../DiscountEmployeePanel.tsx`           | 1105–1137                   | bajo                |
| `SuppliersPanel`                               | `.../SuppliersPanel.tsx`                  | 1140–1194                   | bajo                |
| `RotationPanel`                                | `.../RotationPanel.tsx`                   | 1197–1280                   | medio (mapeo doble) |
| `TimeclockPanel`                               | `.../TimeclockPanel.tsx`                  | 1283–1317                   | bajo                |
| `ScrollFadeList` (utilidad)                    | `.../ScrollFadeList.tsx`                  | 1698–1734                   | bajo                |

**Se queda en el parent (orquestación):** definiciones de queries + estado, switch
`preset`/`mode`, edición del tablero (`editing`/`draftLayouts`/`moveItem`),
selectores de período/tienda, `renderItem()` dispatcher, contenedor RGL, y los
memos `itemIds`/`vis`/`visibleItemIds` (condicionan el `enabled` de cada query).

## Orden de extracción (más seguro primero)

1. Presentacionales puros: `ScrollFadeList`, `FamilySalesPanel`, `StockoutPanel`,
   `SalesEmployeePanel`, `DiscountEmployeePanel`, `ExpiringPanel`,
   `PurchaseOrdersPanel`, `SuppliersPanel`.
2. Con lógica de render: `KpiCardsRow`, `RankingsPanel`, `SalesComparisonPanel`,
   `RotationPanel`.
3. Interactivos aislados: `HourChartPanel`/`HourChart`, `TimeclockPanel`.

Tras CADA extracción: `typecheck` + `lint` + re-run del screenshot test (0 diff).

## Hazards (de la revisión)

- IIFE `renderPanel('dash-bars')` (774–843) captura ~10 locales → pasar todo por
  props, destructurar en el hijo.
- `draftLayouts`/`moveItem` y los memos `vis`/`itemIds` → NO extraer (orquestación).
- Refs (`editToggleRef`, `boardRef`, `defaultsApplied`) y `useEffect` (426–457) →
  se quedan en el parent.
- `cardDefs` (466–580) lee 4 queries inline → extraer a `getKpiCards(queries)` a
  nivel de módulo y pasar el array al render.

## Modales (parte 2, aparte)

Consolidar el scaffolding repetido (`ConfirmModal`/`PaymentModal` TPV vs
`Modal.tsx` backoffice) requiere su propio análisis de visual-regression; tratar
como tarea separada tras el split del dashboard.
