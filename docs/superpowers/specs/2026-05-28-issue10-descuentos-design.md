# Spec — Issue #10: Descuentos por línea y por ticket

| Campo      | Valor                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                   |
| Estado     | Aprobado para implementación                                                                 |
| Issue      | [#10](https://github.com/ncara42/simpleTPV/issues/10) — `area:api`, `area:tpv`, `mvp:week-2` |
| Blocked by | #8 (venta) ✅, construye sobre #9 (cobro)                                                    |

## 1. Objetivo

Permitir descuentos por línea (%) y por ticket (% o importe fijo), recalculados en el servidor, con límites por rol. El total de la venta refleja los descuentos.

## 2. Datos

`SaleLine` añade:

- `discountPct Decimal @default(0) @db.Decimal(5,2)` — % de descuento de la línea.
- `discountAmt Decimal @default(0) @db.Decimal(12,2)` — importe de descuento de la línea (derivado: lineSubtotal × pct/100, redondeado).

`Sale` añade:

- `discountTotal Decimal @default(0) @db.Decimal(12,2)` — descuento total efectivo aplicado (líneas + ticket).

`lineTotal` de SaleLine pasa a ser el neto tras su descuento de línea. `subtotal` de Sale = suma de lineTotal **antes** del descuento de ticket. `total` = subtotal − descuento de ticket.

Migración aditiva, defaults 0, sin RLS nuevo.

## 3. Lógica de descuentos (servidor, fuente de verdad)

`CreateSaleDto` añade:

- En cada línea: `discountPct?: number` (0–100, `@IsOptional @Min(0) @Max(100)`).
- En el ticket: `ticketDiscountPct?: number` (0–100) **o** `ticketDiscountAmt?: number` (>=0). Si vienen ambos, `ticketDiscountAmt` tiene precedencia (validado en servicio; documentar).

Cálculo en `computeTotals` (ampliado):

1. Por línea: `gross = unitPrice*qty`; `discountAmt = round2(gross * discountPct/100)`; `lineTotal = round2(gross - discountAmt)`.
2. `subtotal = Σ lineTotal`.
3. Descuento de ticket: si `ticketDiscountAmt` → `ticketDisc = min(ticketDiscountAmt, subtotal)`; si `ticketDiscountPct` → `ticketDisc = round2(subtotal * pct/100)`.
4. `discountTotal = Σ line.discountAmt + ticketDisc`.
5. `total = round2(subtotal - ticketDisc)`.

(IVA queda fuera de #10; total = base. El desglose de IVA es trabajo posterior.)

## 4. Límites por rol

Sobre el **% de descuento efectivo total** del ticket (`discountTotal / grossTotal × 100`, donde grossTotal = Σ unitPrice\*qty):

- `CLERK`: máximo 10%.
- `MANAGER`: máximo 50%.
- `ADMIN`: sin límite.

Si se supera → `ForbiddenException` (403) con mensaje claro ("Descuento X% supera el límite del rol Y: Z%"). El rol sale del JWT (`req.user.role`), pasado al servicio. Constante `DISCOUNT_LIMITS: Record<UserRole, number | null>` (null = sin límite) en el módulo sales.

## 5. TPV

- `cart.ts`: cada item gana `discountPct` (default 0); el store gana `ticketDiscountPct`/`ticketDiscountAmt` y selectores que calculan `lineNet`, `subtotal` (Σ netos), `ticketDiscount`, `total` con la MISMA lógica que el servidor (round2).
- **DiscountModal** (nuevo): dos modos — descuento de línea (elige línea, mete %) y descuento de ticket (% o importe). Aplica al store.
- `CartPanel`: muestra el descuento por línea (si >0) y una fila "Descuento" en el pie si hay descuento de ticket; botón "Descuento" que abre el modal. El total mostrado ya incluye descuentos.
- `createSale` envía `discountPct` por línea y `ticketDiscountPct`/`ticketDiscountAmt`.
- Si el servidor rechaza por límite de rol (403), mostrar el mensaje al usuario sin perder el carrito.

## 6. Tests

- Unit (servicio): cálculo con descuento de línea, de ticket (% e importe), combinados; `discountTotal` y `total` correctos; límite por rol (CLERK 11% → 403; MANAGER 11% → OK; ADMIN 80% → OK); importe de ticket que excede subtotal se capa.
- Integración: POST /sales con descuentos persiste discountPct/discountAmt/discountTotal correctos; un CLERK con descuento > 10% recibe 403.
- TPV unit: cálculo del cart store con descuentos (coincide con servidor).
