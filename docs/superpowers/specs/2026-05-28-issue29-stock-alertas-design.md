# Spec — Issue #29: Alertas automáticas de stock mínimo + config de mínimos

| Campo      | Valor                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                  |
| Estado     | Implementado                                                                                |
| Issue      | [#29](https://github.com/ncara42/simpleTPV/issues/29) — `area:api`, `area:db`, `mvp:week-3` |
| Blocked by | #27 (stock base), #28 (consultas)                                                           |

## 1. Objetivo

Generar/resolver automáticamente alertas cuando el stock cae bajo el mínimo, exponerlas ordenadas por urgencia, y permitir configurar el mínimo por producto/tienda. Todo en el flujo del movimiento (consistencia inmediata, sin cron).

## 2. Datos

`model StockAlert` (organizationId, productId, storeId, alertType, resolved, resolvedAt?, createdAt). Índice `[organizationId, resolved, createdAt]`. RLS por tenant.

`enum AlertType { LOW_STOCK OUT_OF_STOCK }` (decisión D29-1).

Índice único parcial `StockAlert_active_unique` sobre `(productId, storeId) WHERE resolved = false`: una sola alerta activa por par; al resolverla, una nueva caída puede crear otra.

## 3. Lógica (en `applyMovement` y `setMin`)

`alertTypeFor(quantity, minStock)` — función pura: `OUT_OF_STOCK` si `<=0`, `LOW_STOCK` si `<=minStock`, `null` si por encima.

`reevaluateAlert(tx, ...)` dentro de la tx del movimiento:

- `null` (stock OK) → resuelve la alerta activa si existe.
- alerta deseada y no hay activa → crea.
- hay activa de distinto tipo (p.ej. LOW→OUT al agotarse) → actualiza el tipo.
- hay activa del mismo tipo → no-op (no duplica).

## 4. API

- `GET /stock/alerts?storeId=&resolved=false` — alertas (por defecto activas), ordenadas por urgencia (OUT_OF_STOCK antes que LOW_STOCK) y luego por antigüedad. Cualquier rol.
- `PUT /stock/min` `{ productId, storeId, minStock }` — ADMIN/MANAGER. Actualiza `Stock.minStock` y reevalúa la alerta en una tx atómica.

## 5. Decisiones (triage)

- **D29-1 — AlertType = LOW_STOCK + OUT_OF_STOCK.** Espeja el semáforo amarillo/rojo de #28; permite priorizar lo crítico. Confirmado en triage 2026-05-28.

## 6. Tests

- Unit: `alertTypeFor`; `reevaluateAlert` (crea/resuelve/actualiza tipo/no-op); `alerts` (orden urgencia+antigüedad); `setMin` (dispara alerta); controller (alerts params, setMin).
- Integración (`stock-alerts.integration.spec.ts`): venta cruza el mínimo → LOW_STOCK; agotar → OUT_OF_STOCK sin duplicar; reposición → resuelta; setMin dispara; aislamiento por tenant.
