# Spec — Issue #50 (parte impresión): TPV — ticket ESC/POS con QR VeriFactu

| Campo      | Valor                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                       |
| Estado     | Implementado (parte de impresión)                                                |
| Issue      | [#50](https://github.com/ncara42/simpleTPV/issues/50) — `area:tpv`, `mvp:week-4` |
| Blocked by | #47 (QR VeriFactu)                                                               |

## 1. Alcance

La #50 mezclaba impresión y **devolución sin ticket**. La devolución sin ticket necesita backend de calado (Return con saleId opcional + validación de PIN de MANAGER) y se ha movido a la issue **#59**. Esta spec cubre la impresión.

## 2. Impresión

- `lib/escpos.ts`: `renderTicketEscPos(ticket)` genera el contenido ESC/POS (texto + comandos INIT/CENTER/BOLD/CUT + comando GS de **QR**) listo para enviar a una impresora térmica por un puente; `buildQrData` reproduce la URL de cotejo VeriFactu (misma fórmula que el backend) a partir de los datos del ticket.
- `TicketView` muestra al pie "VeriFactu · cotejo AEAT" con el enlace de cotejo (`ticket-qr`).
- Botón **Imprimir ticket** en la confirmación de venta → `window.print()`; `@media print` deja solo el ticket a ancho de recibo (72mm).

## 3. Limitación conocida

La impresión en **impresora térmica física** requiere hardware del piloto. Se genera el contenido ESC/POS + el preview imprimible (window.print); la prueba en hardware real queda como TODO.

## 4. Tests

- No rompe los testids/E2E existentes del TPV (8/8 passed).
- Verificado en navegador: tras cobrar, el ticket muestra el botón Imprimir y el QR/enlace VeriFactu (URL de cotejo con NIF/número/importe). Sin errores de consola.
