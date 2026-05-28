# Spec — Issue #30: Ajuste manual de inventario (POST /stock/adjust)

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado                                                                     |
| Issue      | [#30](https://github.com/ncara42/simpleTPV/issues/30) — `area:api`, `mvp:week-3` |
| Blocked by | #27 (applyMovement), #29 (alertas)                                               |

## 1. Objetivo

Corregir el stock manualmente (recuento, mermas, roturas) dejando rastro auditado, reevaluando las alertas tras el ajuste.

## 2. API

`POST /stock/adjust` `{ productId, storeId, newQuantity, reason }` — ADMIN/MANAGER (CLERK → 403). `reason` obligatorio (`@IsNotEmpty`). `newQuantity` >= 0.

## 3. Lógica

`StockService.adjust` dentro de `withTenantTx`:

1. Lee la cantidad actual con lock pesimista (`SELECT ... FOR UPDATE`) para serializar ajustes concurrentes del mismo par (si no existe la fila, actual = 0).
2. delta = `newQuantity - actual`.
3. `applyMovement(tx, { type: ADJUSTMENT, quantity: delta, reason, userId })` — fija el stock, registra el movimiento y reevalúa la alerta (vía la lógica de #29), todo atómico.

Auditoría: el `AuditInterceptor` global registra el POST; el `StockMovement` ADJUSTMENT con su `reason` es la trazabilidad de negocio.

## 4. Decisiones (triage)

- **D30-1 — Cantidad absoluta nueva.** El body indica `newQuantity` (no un delta); el servicio calcula el delta internamente. Más intuitivo para un recuento físico. Confirmado en triage 2026-05-28.

## 5. Tests

- Unit: cálculo de delta (con/sin fila previa), motivo en el movimiento; controller delega con el sub del JWT como userId.
- Integración: el ajuste fija el stock al valor indicado y crea un movimiento ADJUSTMENT. (Rol 403 y aislamiento cubiertos por los guards/RLS globales ya testeados en otras suites.)
