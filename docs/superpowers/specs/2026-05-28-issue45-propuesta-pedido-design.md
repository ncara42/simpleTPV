# Spec — Issue #45: Propuesta de pedido inteligente

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado                                                                     |
| Issue      | [#45](https://github.com/ncara42/simpleTPV/issues/45) — `area:api`, `mvp:week-4` |
| Blocked by | #44 (pedidos), #27/#32 (stock + movimientos)                                     |

## 1. Objetivo

Proponer qué pedir a proveedor por tienda, con datos de contexto que expliquen la sugerencia.

## 2. Fórmula

`suggestQuantity(minStock, stockActual, ventaMediaDiaria, diasCobertura)` (función pura):

```
sugerida = max(0, minStock - stockActual + ventaMediaDiaria * diasCobertura)
```

`ventaMediaDiaria` = Σ|quantity| de los `StockMovement` tipo SALE de los últimos 30 días / 30, para ese producto+tienda. Las ventas anuladas no cuentan: al anular se repone con un movimiento RETURN (no SALE).

## 3. API

- `POST /purchase-orders/suggest` `{ storeId, supplierId?, daysCoverage? (default 14) }` — ADMIN/MANAGER. Devuelve por producto: stockActual, minStock, ventaMedia30d, ventaMediaDiaria, rotacion, coberturaDias, cantidadSugerida. Solo incluye `cantidadSugerida > 0`, ordenado desc.
- `GET /stock/to-reorder?storeId=` — productos bajo/sin stock (nivel ≠ verde); atajo sobre `byStore`.

## 4. Tests

- Unit: `suggestQuantity` (déficit, no-negativa, solo demanda, redondeo); `suggest` (cálculo + contexto + filtrado + daysCoverage); `toReorder` (filtra no-verdes); controllers.
- Integración: `suggest` con stock y ventas reales (min 10, stock 2, 30 vendidas → sugerida 22).
