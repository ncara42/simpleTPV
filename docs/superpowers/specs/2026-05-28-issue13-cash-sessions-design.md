# Spec — Issue #13: Sesiones de caja (apertura y cierre con cuadre)

| Campo      | Valor                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                              |
| Estado     | Aprobado para implementación                                                                            |
| Issue      | [#13](https://github.com/ncara42/simpleTPV/issues/13) — `area:api`, `area:db`, `area:tpv`, `mvp:week-2` |
| Blocked by | #8 ✅                                                                                                   |

## 1. Objetivo

Control de caja del turno: abrir caja con efectivo inicial, cerrar calculando el esperado (inicial + ventas en efectivo del turno) y comparándolo con lo contado (cuadre/descuadre). Aislado por tenant.

## 2. Decisión: caja obligatoria (CAMBIADA el 2026-05-28)

> **CAMBIO (2026-05-28):** esta decisión se REVIRTIÓ. La caja pasó de **opcional** a **OBLIGATORIA** para cobrar: `POST /sales` ahora exige una `CashSession` con `status=OPEN` para la tienda y devuelve `409 ConflictException` ("No hay caja abierta en esta tienda") si no la hay. Fuente de verdad del nuevo comportamiento: `docs/superpowers/specs/2026-05-28-caja-obligatoria-design.md`. La venta **no** se liga a la sesión (no se añade `Sale.cashSessionId`); el cuadre sigue calculándose por la ventana temporal del turno (sin cambios en cash-sessions).

Decisión original (histórica, ya no vigente): la caja NO era obligatoria para vender. `POST /sales` no exigía sesión abierta. El cuadre al cerrar suma las ventas en efectivo de la **misma tienda** en la ventana temporal del turno (`openedAt..closedAt`), filtrando ventas `COMPLETED` con `paymentMethod = CASH`.

## 3. Datos

`enum CashSessionStatus { OPEN CLOSED }`

`model CashSession`:

```
id             String   @id @default(uuid()) @db.Uuid
organizationId String   @db.Uuid
storeId        String   @db.Uuid
userId         String   @db.Uuid          // quién abrió
openingAmount  Decimal  @db.Decimal(12,2)
closingAmount  Decimal? @db.Decimal(12,2) // efectivo contado al cerrar
expectedAmount Decimal? @db.Decimal(12,2) // inicial + ventas efectivo del turno
difference     Decimal? @db.Decimal(12,2) // closingAmount - expectedAmount
status         CashSessionStatus @default(OPEN)
openedAt       DateTime @default(now())
closedAt       DateTime?
```

Relaciones a organization/store/user. Índices: `@@index([organizationId, storeId, status])`. Migración con **RLS** (patrón NULLIF, igual que Sale). Solo puede haber una sesión OPEN por tienda a la vez (validado en el servicio; no constraint único parcial para mantenerlo simple).

## 4. API — módulo `cash-sessions`

`POST /cash-sessions/open` (`@Roles('ADMIN','MANAGER','CLERK')`):

- Body: `{ storeId: UUID, openingAmount: number >= 0 }`.
- Si ya hay una sesión OPEN para esa tienda (del tenant) → `BadRequestException` ("Ya hay una caja abierta en esta tienda").
- Crea la sesión OPEN con `openingAmount`, `userId` del JWT, `organizationId` del tenant. Devuelve la sesión.

`POST /cash-sessions/:id/close` (`@Roles('ADMIN','MANAGER','CLERK')`):

- Body: `{ countedAmount: number >= 0 }`.
- Carga la sesión del tenant (findFirst id+organizationId). 404 si no existe; `BadRequestException` si ya CLOSED.
- Calcula `cashSales` = Σ total de ventas `COMPLETED` con `paymentMethod=CASH` de esa `storeId`, con `createdAt` entre `openedAt` y ahora.
- `expectedAmount = round2(openingAmount + cashSales)`; `difference = round2(countedAmount - expectedAmount)`.
- Transición atómica con `updateMany` condicional (where status=OPEN) a CLOSED, con closingAmount/expectedAmount/difference/closedAt. Devuelve la sesión cerrada (con el cuadre).

`GET /cash-sessions/current?storeId=` (`@Roles(...)`): devuelve la sesión OPEN de esa tienda o null (para que el TPV sepa el estado).

Funciones puras testeables: `computeExpected(opening, cashSales)` y `computeDifference(counted, expected)` (o una `buildCashReconciliation`).

## 5. TPV

- `lib/cash.ts`: `openCashSession({storeId, openingAmount})`, `closeCashSession(id, countedAmount)`, `currentCashSession(storeId)`.
- Tipos `CashSession` en `@simpletpv/auth`.
- UI mínima de caja (componente `CashSessionPanel` o sección en SalePage): si no hay caja abierta para la tienda activa, botón "Abrir caja" (pide efectivo inicial). Si hay caja abierta, indicador + botón "Cerrar caja" que pide el efectivo contado y muestra el cuadre (esperado vs contado, diferencia con color según signo). **CAMBIO 2026-05-28:** la caja BLOQUEA la venta (ahora es obligatoria, ver §2): el botón "Cobrar" del TPV se deshabilita sin caja abierta.

## 6. Tests

- Unit: `computeExpected`/`computeDifference` (cuadre exacto, sobrante, faltante).
- Integración: abrir caja; abrir dos veces misma tienda → error; cerrar calcula esperado = inicial + ventas efectivo del turno (crear ventas CASH y CARD, verificar que solo CASH cuenta y solo las del rango); cerrar dos veces → error; aislamiento por tenant.
- Tests unitarios del servicio (no solo integración) para mantener la cobertura sobre el floor del ratchet.

## 7. Decisión: ventas anuladas (VOIDED) y el cuadre

El cuadre suma solo ventas `COMPLETED` en efectivo. Una venta CASH **anulada** (void) NO cuenta en el esperado: se trata como si no hubiera ocurrido. La gestión del efectivo físico cuando se anula/devuelve una venta cobrada en efectivo (salida del cajón) pertenece a las devoluciones (#15), no a #13. En el MVP, anular es una corrección, no una devolución de dinero al cliente. Decisión confirmada con el responsable de producto.

## 8. Concurrencia: una sola caja OPEN por tienda

Además de la validación en el servicio (findFirst OPEN antes de crear), un **índice único parcial** en SQL (`UNIQUE (organizationId, storeId) WHERE status='OPEN'`) garantiza a nivel de DB que no puedan existir dos cajas abiertas a la vez en la misma tienda, cerrando la ventana de carrera del findFirst+create. Definido en la migración (Prisma no soporta partial unique indexes en el schema).
