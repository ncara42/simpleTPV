# Spec — Issue #31: Traspasos central→tienda (crear/enviar/recibir/cerrar)

| Campo      | Valor                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                  |
| Estado     | Implementado                                                                                |
| Issue      | [#31](https://github.com/ncara42/simpleTPV/issues/31) — `area:api`, `area:db`, `mvp:week-3` |
| Blocked by | #27 (applyMovement, StockMovement)                                                          |

## 1. Objetivo

Flujo completo de traspaso de mercancía entre dos tiendas del tenant, con estados, movimientos de stock atómicos y registro de discrepancias en la recepción.

## 2. Datos

`model Transfer` (originStoreId, destStoreId, status, notes?, createdBy, createdAt, sentAt?, receivedAt?, closedAt?). Índice `[organizationId, status, createdAt]`. RLS.

`model TransferLine` (transferId, productId, quantitySent, quantityReceived?, discrepancy?, discrepancyNote?). RLS propia.

`enum TransferStatus { DRAFT SENT RECEIVED CLOSED }`.

## 3. Flujo (TransfersService)

- `POST /transfers` → **DRAFT**. Valida tiendas del tenant y distintas.
- `POST /transfers/:id/send` → **SENT**: decrementa el origen (`TRANSFER_OUT`, -quantitySent), `sentAt`. Atómico.
- `POST /transfers/:id/receive` → **RECEIVED**: registra `quantityReceived` por línea, `discrepancy = received - sent` (función pura `computeDiscrepancy`) y nota opcional; incrementa el destino (`TRANSFER_IN`) por lo **realmente recibido**, `receivedAt`. Atómico.
- `POST /transfers/:id/close` → **CLOSED**, `closedAt`.
- `GET /transfers?status=` y `GET /transfers/:id` — aislados por tenant.

Transiciones atómicas: cada paso usa `updateMany` condicional al estado esperado (como void/caja) → dos transiciones concurrentes no pueden ambas tener éxito (la segunda afecta 0 filas → 409). Los movimientos de stock corren en la misma tx vía `withTenantTx` + `applyMovement`.

## 4. Decisiones (triage)

- **D31-1 — Roles.** Crear/enviar/cerrar = ADMIN/MANAGER (central); recibir = ADMIN/MANAGER/CLERK (el responsable de tienda presente). Confirmado en triage 2026-05-28.
- El stock del destino se incrementa por lo **recibido**, no por lo enviado (la merma en tránsito no entra en el inventario del destino).

## 5. Tests

- Unit: `computeDiscrepancy`; `create` (origen≠destino, tiendas del tenant); `send`/`receive` (transición, movimientos OUT/IN, discrepancia, 0 recibido sin movimiento, carrera→409); `close`/`list`/`get`; controller.
- Integración (`transfers.integration.spec.ts`): flujo completo mueve stock (origen -30, destino +28 con merma -2), no recibir en DRAFT, doble envío rechazado, aislamiento por tenant.
