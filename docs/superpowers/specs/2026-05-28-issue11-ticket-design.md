# Spec — Issue #11: Ticket de venta (datos formateados para impresión)

| Campo      | Valor                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                   |
| Estado     | Aprobado para implementación                                                                 |
| Issue      | [#11](https://github.com/ncara42/simpleTPV/issues/11) — `area:api`, `area:tpv`, `mvp:week-2` |
| Blocked by | #8 ✅; construye sobre #9 (pago) y #10 (descuentos)                                          |

## 1. Objetivo

`GET /sales/:id/ticket` devuelve un JSON con todos los datos de la venta formateados para impresión/resumen, incluyendo IVA desglosado. El TPV muestra ese ticket-resumen en la confirmación post-venta.

## 2. Alcance

**Dentro:** endpoint de ticket (JSON), cálculo de IVA desglosado al vuelo, render del ticket-resumen en el TPV.
**Fuera:** impresión física ESC/POS, QR VeriFactu (fases posteriores).

## 3. IVA — decisión

Hasta ahora las ventas no persisten IVA. Los precios de producto (`salePrice`, `taxRate`) son **IVA incluido** (convención retail España). El ticket calcula el desglose **al vuelo** desde las líneas de la venta:

- No se persiste nada nuevo en DB (la venta ya tiene las líneas con `name`/`unitPrice`/`qty`/`lineTotal`/`discountAmt`). PERO `SaleLine` no guardó el `taxRate` en el momento de la venta.
- **Decisión:** `SaleLine` necesita el `taxRate` congelado para un desglose histórico fiable. Como es aditivo y barato, **añadir `taxRate Decimal @default(21) @db.Decimal(5,2)` a `SaleLine`**, poblado en el create de la venta desde `product.taxRate`. (Migración aditiva con default 21 para filas existentes.)
- El ticket agrupa las líneas por `taxRate` y, para cada grupo, sobre el importe neto (con IVA incluido) calcula: `base = round2(neto / (1 + taxRate/100))`, `cuota = round2(neto - base)`.

## 4. API

`GET /sales/:id/ticket` (`@Roles('ADMIN','MANAGER','CLERK')`):

- Carga la venta del tenant con líneas, tienda y organización (`sale.findFirst({ where: {id}, include: {lines, store, organization} })`). RLS aísla por tenant; si no existe → `NotFoundException` (404).
- Devuelve un DTO `SaleTicket`:
  ```
  organization: { name, nif }
  store: { name, code }
  ticketNumber, createdAt
  lines: [{ name, qty, unitPrice, discountPct, lineTotal }]
  subtotal, discountTotal, total
  paymentMethod, cashGiven, cashChange
  taxBreakdown: [{ taxRate, base, cuota }]  // agrupado por tipo de IVA
  ```
- Cálculo del desglose en una función pura `buildTaxBreakdown(lines)` (testeable).

Va en `sales.controller.ts` (nuevo método `@Get(':id/ticket')`) y `sales.service.ts` (`getTicket(id)`).

## 5. TPV

- `lib/sales.ts`: `getTicket(id)` → `api.get('/sales/:id/ticket')`. Tipo `SaleTicket` en `@simpletpv/auth`.
- La pantalla de confirmación (CartPanel, estado `confirmed`) pasa de mostrar un resumen mínimo a renderizar el **ticket-resumen** completo: cabecera (tienda, nº ticket, fecha), líneas, subtotal, descuentos, desglose de IVA, total, método de pago y cambio. Componente `TicketView.tsx` (recibe `SaleTicket`). Tras crear la venta, el TPV pide el ticket por su id y lo muestra.
- Estilo monoespaciado tipo ticket (ancho fijo) en sale.css.

## 6. Tests

- Unit: `buildTaxBreakdown` con un tipo de IVA y con varios (agrupa correctamente; base+cuota=neto).
- Integración: `GET /sales/:id/ticket` devuelve los datos completos; 404 para id inexistente; aislado por tenant (org2 no ve el ticket de org1).
- TPV: render de TicketView con un SaleTicket de ejemplo (opcional si es práctico).
