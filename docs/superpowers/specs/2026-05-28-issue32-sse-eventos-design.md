# Spec — Issue #32: SSE multiplexado (GET /events) + historial de movimientos

| Campo      | Valor                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                                      |
| Estado     | Implementado                                                                                                    |
| Issue      | [#32](https://github.com/ncara42/simpleTPV/issues/32) — `area:api`, `area:tpv`, `area:backoffice`, `mvp:week-3` |
| Blocked by | #27 (stock base), #29 (alertas)                                                                                 |

## 1. Objetivo

Canal de eventos en vivo (SSE) compartido por TPV y backoffice, filtrado por tenant, más el endpoint de historial de movimientos de stock.

## 2. SSE `GET /events`

Stream multiplexado (`@Sse()`) que emite, **solo del tenant del JWT**:

- `stock.changed` (productId, storeId, quantity) — tras cada `applyMovement`.
- `sale.completed` (saleId, storeId, ticketNumber, total) — tras crear venta.
- `alert.created` (productId, storeId, alertType) — al crearse una alerta.

Más un heartbeat `ping` cada 15s. El filtrado por tenant es del **servidor** (deriva del JWT); el cliente nunca elige el tenant.

Nota: el AuthGuard exige `Authorization: Bearer`. Desde el navegador, el cliente debe usar un EventSource con cabeceras (p.ej. fetch-event-source), no el nativo.

## 3. EventBus

Abstracción `EventBus` (`publish` / `subscribe(org) → Observable`):

- `RedisEventBus`: pub/sub por canal `events:{org}`; **difunde entre réplicas**. `publish` best-effort (no propaga si Redis falla); cada `subscribe` abre una conexión Redis dedicada (modo subscribe) que se cierra al desuscribirse.
- `InMemoryEventBus`: Subject por tenant (una instancia, dev/test) — fallback si no hay `REDIS_URL`.
- `EventsModule` global elige según `REDIS_URL`.

## 4. Emisión tras commit

`withTenantTx` gana un hook `afterCommit(cb)`: los efectos registrados se ejecutan **tras** el commit (best-effort). Así un rollback no emite eventos fantasma. `applyMovement` emite `stock.changed`/`alert.created`; `sales.create` emite `sale.completed`; `setMin` emite `alert.created`.

## 5. Historial `GET /stock/movements`

`StockMovement` filtrable (productId, storeId, from, to), paginado, orden createdAt desc. Aislado por tenant. Para el timeline del backoffice.

## 6. Decisiones (triage)

- **D32-1 — Eventos tras commit, best-effort.** Se publican después del commit; si la tx falla no se emite nada. Confirmado en triage 2026-05-28.
- **D32-2 — Redis pub/sub con fallback in-process.** Cumple el requisito multi-réplica; sin Redis degrada a un bus en memoria.

## 7. Tests

- Unit: `InMemoryEventBus` (entrega + aislamiento por tenant); `RedisEventBus` (publish al canal, best-effort, filtrado de canal, mensaje malformado); `EventsController` (emite del tenant del JWT, no de otra org); `movements` (filtros/paginación, sin fechas).
- Integración: `movements` historial filtrado + aislamiento por tenant.
- Verificación manual E2E (API real + Redis): una venta dispara `stock.changed` + `sale.completed` que llegan al SSE; un cliente de otra org NO los recibe.
