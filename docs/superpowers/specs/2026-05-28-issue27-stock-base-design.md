# Spec — Issue #27: Stock base (Stock + StockMovement) y conexión venta/devolución

| Campo      | Valor                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                  |
| Estado     | Implementado                                                                                |
| Issue      | [#27](https://github.com/ncara42/simpleTPV/issues/27) — `area:api`, `area:db`, `mvp:week-3` |
| Blocked by | #8 ✅ (venta), #15 ✅ (devolución)                                                          |

## 1. Objetivo

Introducir el modelo de stock (cantidad por producto+tienda) y el registro de movimientos auditados, y conectar los no-op que dejó la semana 2: venta decrementa, devolución y anulación reponen. Es la issue base de la semana 3 — el resto (consultas, alertas, ajustes, traspasos, SSE) cuelga de `applyMovement`.

## 2. Datos

`model Stock`: una fila por par producto+tienda (`@@unique([productId, storeId])`).

```
id             String   @id @default(uuid()) @db.Uuid
organizationId String   @db.Uuid
productId      String   @db.Uuid
storeId        String   @db.Uuid
quantity       Decimal  @default(0) @db.Decimal(12,3)   // granel → 3 decimales
minStock       Decimal  @default(0) @db.Decimal(12,3)   // umbral de alerta (#29)
updatedAt      DateTime @updatedAt
@@index([organizationId, storeId])
```

`model StockMovement`: rastro de cada entrada/salida. `quantity` con signo (+ entrada / − salida).

```
id             String       @id @default(uuid()) @db.Uuid
organizationId String       @db.Uuid
productId      String       @db.Uuid
storeId        String       @db.Uuid
userId         String?      @db.Uuid
type           MovementType
quantity       Decimal      @db.Decimal(12,3)
referenceId    String?      @db.Uuid   // saleId / returnId / transferId
reason         String?
createdAt      DateTime     @default(now())
@@index([organizationId, productId, createdAt])
@@index([organizationId, storeId, createdAt])
```

`enum MovementType { SALE RETURN TRANSFER_IN TRANSFER_OUT PURCHASE_RECEIPT ADJUSTMENT }`.

RLS por tenant en ambas tablas con el patrón NULLIF (igual que Sale/Return): sin contexto de tenant → 0 filas (fail-safe).

## 3. `applyMovement`

`StockService.applyMovement(tx, input)` opera **siempre** sobre una `tx` ya abierta por `withTenantTx` (tenant fijado): upsert del `Stock` (`quantity: { increment }`) + create del `StockMovement`. Atómico con la operación que lo invoca. Devuelve la cantidad resultante (la usarán alertas/SSE en issues posteriores).

## 4. Conexión

- **Venta** (`SalesService.create`): tras crear la venta, por cada línea un movimiento `SALE` con `quantity = -qty`, `referenceId = saleId`, dentro de la misma tx de la venta.
- **Anulación** (`voidSale`): se reescribe para correr dentro de `withTenantTx` — la transición de estado y la reposición de las líneas (`RETURN`, `+qty`) deben ser atómicas. Antes operaba sobre el cliente extendido fuera de transacción.
- **Devolución** (`ReturnsService.create`): tras crear el `Return`, por cada línea devuelta un movimiento `RETURN` con `quantity = +qty`, `referenceId = returnId`.

## 5. Decisiones (triage)

- **D27-1 — Stock negativo permitido.** La venta nunca se bloquea por falta de stock; puede dejar `quantity` negativo. El control de mínimos es vía alertas (#29), no bloqueo. Confirmado en triage 2026-05-28.
- **D27-2 — `voidSale` transaccional.** Pasa a `withTenantTx` para reponer stock atómicamente con la anulación; no debe quedar la venta anulada sin reponer.

## 6. Tests

- Unit `applyMovement`: salida (increment negativo + movimiento SALE), entrada (RETURN), ajuste con motivo (ADJUSTMENT).
- Integración (`stock.integration.spec.ts`): venta decrementa + registra SALE; devolución repone; anulación repone; aislamiento por tenant (Stock de org1 invisible desde org2).
