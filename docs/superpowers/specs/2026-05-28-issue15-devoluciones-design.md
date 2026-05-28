# Spec — Issue #15: Devoluciones parciales contra ticket

| Campo      | Valor                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                              |
| Estado     | Aprobado para implementación                                                                            |
| Issue      | [#15](https://github.com/ncara42/simpleTPV/issues/15) — `area:api`, `area:db`, `area:tpv`, `mvp:week-2` |
| Blocked by | #8 ✅, #11 ✅ (ticket)                                                                                  |

## 1. Objetivo

Devolver productos de una venta existente: devolución parcial contra un ticket (selección de líneas y cantidades), motivo obligatorio, sin exceder lo vendido (contando devoluciones previas). Aislado por tenant, auditado.

## 2. Datos

`model Return`:

```
id             String   @id @default(uuid()) @db.Uuid
organizationId String   @db.Uuid
storeId        String   @db.Uuid
userId         String   @db.Uuid
saleId         String   @db.Uuid       // venta contra la que se devuelve
reason         String                    // motivo obligatorio
total          Decimal  @db.Decimal(12,2)
createdAt      DateTime @default(now())
lines          ReturnLine[]
```

`model ReturnLine`:

```
id          String  @id @default(uuid()) @db.Uuid
organizationId String @db.Uuid          // RLS propia (como SaleLine)
returnId    String  @db.Uuid
saleLineId  String  @db.Uuid            // línea de venta devuelta
productId   String  @db.Uuid
qty         Decimal @db.Decimal(10,3)
lineTotal   Decimal @db.Decimal(12,2)
```

Relaciones a organization/store/user/sale (Return) y return/saleLine/product (ReturnLine). Migración con RLS (NULLIF, igual que Sale/SaleLine) en ambas tablas. Índices: Return `@@index([organizationId, saleId])`, ReturnLine `@@index([returnId])`.

## 3. API — módulo `returns`

`POST /returns` (`@Roles('ADMIN','MANAGER','CLERK')`):

- Body `CreateReturnDto`: `saleId` (UUID), `reason` (string, `@IsNotEmpty` — motivo obligatorio), `lines: [{ saleLineId: UUID, qty: number > 0 }]` (`@ArrayMinSize(1)`).
- Servicio `create(dto, userId)` dentro de `withTenantTx` (cliente base, atómico):
  1. requireTenant. Carga la venta (findFirst id=saleId + organizationId, include lines). 404 si no existe. Si la venta está VOIDED → BadRequest ("No se puede devolver una venta anulada").
  2. Para cada línea a devolver: localizar la SaleLine correspondiente (debe pertenecer a la venta). Calcular lo ya devuelto de esa saleLine (suma de ReturnLine.qty previas). Validar `qty_a_devolver <= saleLine.qty - ya_devuelto`; si excede → BadRequest ("No se puede devolver más de lo vendido en la línea X"). `qty > 0`.
  3. `lineTotal` de cada ReturnLine = proporción del neto de la SaleLine: `round2(saleLine.lineTotal / saleLine.qty * qty)` (precio unitario neto ya con descuentos de línea, congelado). El `total` del Return = Σ lineTotal.
  4. Crea Return + ReturnLines (nested create) con organizationId en ambos.
  5. Restauración de stock: `// TODO: stock semana 3` (no-op).
- El AuditInterceptor global registra el POST.
- Función pura `computeReturnable(saleLineQty, alreadyReturned, requestedQty)` o validación testeable; y `computeReturnLineTotal(saleLineTotal, saleLineQty, qty)`.

`GET /returns?saleId=` (`@Roles(...)`): devuelve las devoluciones de una venta del tenant (para que el TPV muestre lo ya devuelto). Opcional pero útil para el flujo; incluirlo.

## 4. TPV

- `lib/returns.ts`: `createReturn({saleId, reason, lines})`, `listReturns(saleId)`. Tipos en `@simpletpv/auth`.
- Flujo de devolución (componente `ReturnPanel` o página): buscar el ticket por nº de ticket o id (reutilizar getTicket o un lookup por ticketNumber — añadir `GET /sales/by-ticket/:ticketNumber` si hace falta, o pegar el id). Para el MVP: localizar la venta por su ticketNumber vía un endpoint o por el historial. Mostrar las líneas con la cantidad vendida y la ya devuelta; permitir elegir cantidades a devolver (<= disponible); campo motivo obligatorio; confirmar → createReturn. Mostrar confirmación con el total devuelto.
- data-testids relevantes. No bloquear ni romper testids existentes.

## 5. Tests

- Unit: validación de cantidad (devolver exactamente lo disponible OK; exceder → error; con devolución previa el disponible baja); `computeReturnLineTotal` (proporción correcta); motivo vacío rechazado (vía DTO). Tests del servicio mockeado + controller para mantener cobertura sobre el floor del ratchet (~78%).
- Integración: devolución parcial contra una venta; intentar devolver más de lo vendido → error; dos devoluciones que en conjunto exceden → la segunda falla; venta VOIDED → no se puede devolver; aislamiento por tenant (no devolver contra venta de otra org).
