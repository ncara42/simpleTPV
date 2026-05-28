# Spec — Issue #9: Cobro y confirmación de venta (TPV)

| Campo      | Valor                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Fecha      | 2026-05-28                                                                     |
| Estado     | Aprobado para implementación                                                   |
| Issue      | [#9](https://github.com/ncara42/simpleTPV/issues/9) — `area:tpv`, `mvp:week-2` |
| Blocked by | #8 (venta + carrito) ✅ mergeada                                               |

## 1. Objetivo

Cerrar el ciclo de venta en el TPV: del carrito al cobro (efectivo con cambio, o tarjeta) y la confirmación post-venta. Persistir el método de pago y, en efectivo, el importe entregado y el cambio.

## 2. Alcance

**Dentro:**

- `Sale` gana `paymentMethod` (enum `CASH`/`CARD`), `cashGiven Decimal?`, `cashChange Decimal?`.
- `POST /sales` acepta y persiste esos campos.
- TPV: modal de cobro (abierto desde el carrito con el total), cálculo de cambio en efectivo, confirmación tarjeta, y pantalla de confirmación post-venta con resumen + "Nueva venta".
- Test e2e Playwright del flujo completo.

**Fuera (otras issues):**

- `MIXED` payment, `discountTotal`/IVA desglosado, `status`/void, VeriFactu, devoluciones. El enum se deja en `CASH`/`CARD` (ampliable a `MIXED` en su momento).

## 3. Datos

`enum PaymentMethod { CASH CARD }`

`Sale` añade:

- `paymentMethod PaymentMethod` (NOT NULL — toda venta nueva tiene método).
- `cashGiven Decimal? @db.Decimal(12,2)` (solo efectivo).
- `cashChange Decimal? @db.Decimal(12,2)` (solo efectivo).

Migración: `ALTER TABLE` aditivo. `paymentMethod` es NOT NULL pero la tabla puede tener ventas de la #8 → añadir con default temporal `CASH`, backfill implícito, quitar default (o dejar default `CASH` — decisión: dejar SIN default en el schema Prisma pero la migración añade la columna con `DEFAULT 'CASH'` para filas existentes y luego `DROP DEFAULT`). No toca RLS (la policy de Sale ya existe).

## 4. API

`CreateSaleDto` añade:

- `paymentMethod: 'CASH' | 'CARD'` — `@IsEnum(PaymentMethod)`.
- `cashGiven?: number` — `@IsOptional() @IsPositive()` (requerido en la práctica si CASH, validado en servicio).

`SalesService.create`:

- Calcula `cashChange = cashGiven - total` cuando `paymentMethod === CASH` y hay `cashGiven`. Si `cashGiven < total` → `BadRequestException` ("efectivo insuficiente").
- Para CARD: `cashGiven`/`cashChange` quedan null.
- Persiste `paymentMethod`, `cashGiven`, `cashChange` en el create.

## 5. TPV

- **Tipo compartido** `CreateSaleInput` añade `paymentMethod` y `cashGiven?`. `Sale` añade los tres campos.
- **PaymentModal.tsx** (nuevo): recibe `total`, permite elegir CASH/CARD. En CASH: input de importe entregado + cambio calculado en vivo (deshabilita confirmar si entregado < total). En CARD: botón confirmar directo. Al confirmar llama al `onConfirm({paymentMethod, cashGiven})`.
- **CartPanel**: el botón pasa de "Crear venta" a **"Cobrar"** (abre el modal). El `createSale` se llama desde el flujo del modal con los datos de pago. Tras éxito → estado de confirmación.
- **Confirmación post-venta**: resumen (nº ticket, total, método, cambio si efectivo) + botón "Nueva venta" que limpia el carrito y cierra el modal/confirmación.
- Error → mensaje, sin limpiar carrito.

## 6. Tests

- Unit: cálculo de cambio (cashGiven - total), rechazo de efectivo insuficiente.
- TPV unit: el cart store ya está; añadir test de PaymentModal si es práctico (cálculo de cambio en UI).
- E2E Playwright: login → buscar producto → añadir al carrito → cobrar (efectivo) → ver confirmación con ticket → "Nueva venta" deja el carrito vacío.
