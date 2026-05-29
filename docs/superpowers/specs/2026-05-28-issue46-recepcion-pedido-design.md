# Spec — Issue #46: Recepción de pedido + KPIs de proveedor

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado                                                                     |
| Issue      | [#46](https://github.com/ncara42/simpleTPV/issues/46) — `area:api`, `mvp:week-4` |
| Blocked by | #44 (pedidos), #27 (applyMovement)                                               |

## 1. Objetivo

Recibir un pedido a proveedor (parcial o completa), actualizando el stock del destino y exponiendo KPIs del proveedor.

## 2. API

`POST /purchase-orders/:id/receive` `{ lines: [{ lineId, quantityReceived }] }` — ADMIN/MANAGER. Solo desde CONFIRMED o PARTIALLY_RECEIVED.

- Acumula `quantityReceived` por línea (recepciones sucesivas); valida no pasarse de lo pedido.
- Incrementa el stock del destino con `applyMovement` tipo `PURCHASE_RECEIPT` por lo recibido en la tanda, en la misma tx (`withTenantTx`).
- Estado resultante: **RECEIVED** si todas las líneas alcanzan lo pedido (set receivedAt), **PARTIALLY_RECEIVED** si no.

## 3. KPIs (en `GET /purchase-orders/:id`)

Funciones puras:

- `fillRate(ordered, received)` = Σrecibido / Σpedido (0..1), null si nada pedido.
- `leadTimeDays(confirmedAt, receivedAt)` = días entre confirmación y recepción, null si falta alguna fecha.

## 4. Tests

- Unit: `fillRate`, `leadTimeDays`; `receive` (409 estado inválido, 400 exceso, completa→RECEIVED + movimiento PURCHASE_RECEIPT, parcial→PARTIALLY_RECEIVED).
- Integración: recepción completa incrementa el stock del destino, pasa a RECEIVED, y `get` devuelve fillRate=1 + leadTime definido.
