# Spec — Issue #70: API de dashboards / KPIs operativos

| Campo      | Valor                                                    |
| ---------- | -------------------------------------------------------- |
| Fecha      | 2026-05-29                                               |
| Estado     | En desarrollo                                            |
| Issue      | #70 — `area:api`, `mvp:week-5`                           |
| Blocked by | #8 (venta), #15 (devolución), #27 (stock), #44 (compras) |

## 1. Objetivo

Módulo `dashboard` (NestJS) con endpoints de KPIs operativos para el backoffice (Semana 5 / HITO A). Solo lectura, agregaciones sobre datos ya existentes (Sale, SaleLine, Return, Stock, StockMovement, StockAlert, Product, ProductFamily). Multi-tenant con RLS. Solo `ADMIN`/`MANAGER` (no `CLERK`).

## 2. Endpoints

Base `/dashboard`. Todos `@Roles('ADMIN', 'MANAGER')`.

| Método | Ruta                          | Descripción                                                                    | Query                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| GET    | `/dashboard/sales-today`      | Ventas de hoy vs ayer por tienda + total org, con delta %                      | `storeId?`                                     |
| GET    | `/dashboard/sales-by-family`  | Ventas (neto) agrupadas por familia de producto en un periodo                  | `period`, `from?`, `to?`, `storeId?`           |
| GET    | `/dashboard/stockout-kpis`    | Roturas de stock: tasa, eventos, duración media, venta perdida estimada        | `period`, `from?`, `to?`, `storeId?`           |
| GET    | `/dashboard/sales-kpis`       | Ticket medio, UPT (unidades por ticket), tasa de descuento, tasa de devolución | `period`, `from?`, `to?`, `storeId?`           |
| GET    | `/dashboard/margin-kpis`      | Margen bruto (€), % margen, margen real tras descuentos                        | `period`, `from?`, `to?`, `storeId?`           |
| GET    | `/dashboard/product-rankings` | Top ventas (€/uds), top margen, peor rotación                                  | `period`, `from?`, `to?`, `storeId?`, `limit?` |

### Selector de periodo (`DashboardPeriodQueryDto`)

- `period`: `today | yesterday | week | month | custom` (default `today`).
- `from`, `to`: ISO date, **obligatorios si `period=custom`**.
- `storeId?`: UUID v4 opcional — filtra a una tienda (vista MANAGER).
- El service resuelve `period` → `[from, to)` (semiabierto) en TZ del servidor. `week`=lunes a hoy, `month`=día 1 a hoy.

## 3. Cálculos (definiciones)

Solo `Sale.status = COMPLETED`. Devoluciones desde `Return` por `createdAt`.

- **sales-today**: por tienda, `SUM(total)` y `COUNT(*)` de hoy y de ayer (mismo rango horario completo del día anterior); `deltaPct = (hoy-ayer)/ayer*100` (null si ayer=0).
- **sales-by-family**: `SUM(SaleLine.lineTotal)` agrupado por `Product.familyId` → nombre/color de `ProductFamily`. Líneas sin familia → "Sin familia".
- **sales-kpis**:
  - `ticketMedio = SUM(total) / COUNT(ventas)`.
  - `upt = SUM(SaleLine.qty) / COUNT(ventas)`.
  - `tasaDescuento = SUM(discountTotal) / SUM(subtotal)` (proporción 0–1).
  - `tasaDevolucion = SUM(Return.total) / SUM(Sale.total)` (proporción 0–1).
- **margin-kpis** (por línea, coste actual de `Product.costPrice`):
  - `margenBruto = SUM((unitPrice - costPrice) * qty)` (sin descuentos).
  - `margenReal = SUM(lineTotal - costPrice * qty)` (tras descuentos de línea/ticket reflejados en `lineTotal`).
  - `pctMargen = margenReal / SUM(lineTotal)`.
- **stockout-kpis** (sobre `StockAlert` tipo `OUT_OF_STOCK` en el periodo):
  - `eventos = COUNT(alertas OUT_OF_STOCK)`.
  - `duracionMediaHoras = AVG(resolvedAt - createdAt)` de las resueltas.
  - `tasa = eventos / COUNT(productos activos)` (proxy).
  - `ventaPerdidaEstimada`: estimación = por cada alerta no resuelta, `salePrice * media_diaria_ventas_producto`. **MVP**: estimación simple `salePrice` del producto agotado (documentado como proxy grosero); refinable con datos reales (Semana 7).
- **product-rankings**: top N por `SUM(lineTotal)` (ventas), por margen real, y peor rotación = productos activos con menor `SUM(qty)` vendida (incl. cero ventas).

## 4. Implementación / RLS

**Decisión clave:** los KPIs necesitan JOINs (SaleLine↔Product↔ProductFamily) y expresiones agregadas que `prisma.aggregate/groupBy` no soporta. El cliente extendido **no aplica `set_config` a `$queryRaw`** (cae al fallback fuera de tx → RLS = 0 filas; ver `prisma.service.ts:57-59`). Por tanto el service usa **`withTenantTx(base, organizationId, tx => tx.$queryRaw...)`** para todas las consultas SQL crudas — misma conexión, `set_config` LOCAL aplicado, RLS efectiva. Filtro explícito de `organizationId` en cada `WHERE` como defensa en profundidad.

- Inyecta `@Inject(PRISMA_BASE) base` para `withTenantTx`.
- Importes parametrizados (`${orgId}::uuid`, `${from}::timestamptz`) — nunca interpolación de strings.
- `SELECT` con `COALESCE`/`NULLIF` para evitar `null`/división por cero; importes devueltos como `number` (cast en TS, los Decimal de pg llegan como string).

## 5. Tests

- **Unit** (`dashboard.service.spec.ts`): resolución de periodos (`resolvePeriod`), cálculo de deltas y ratios sobre filas simuladas (funciones puras extraídas).
- **Integración** (`test/dashboard.integration.spec.ts`): Postgres efímero + seed. Verifica:
  - Aislamiento por tenant (org1 no ve ventas de org2).
  - `sales-today` con ventas sembradas hoy/ayer y delta correcto.
  - `sales-by-family`, `sales-kpis`, `margin-kpis` con valores esperados.
  - Sin contexto de tenant → 0 filas (fail-safe).

## 6. Fuera de alcance

- Caché de resultados (los rangos < 3s con índices existentes; optimización en tarea de endurecimiento si hiciera falta).
- Refinado de venta perdida con histórico de demanda (Semana 7).
