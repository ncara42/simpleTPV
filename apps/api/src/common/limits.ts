/**
 * Cotas superiores y escala decimal de los campos numéricos transaccionales,
 * alineadas con los tipos `Decimal` del esquema. Se aplican en los DTOs con
 * `@IsNumber({ maxDecimalPlaces })` + `@Max(...)`.
 *
 * Sin ellas, un valor enorme o con exceso de decimales (a) reventaría el INSERT
 * con un 500 en vez de un 400 (fuera de la precisión `Decimal`), o (b) sería
 * REDONDEADO en silencio por Postgres y divergiría del valor usado en los
 * cálculos de totales/stock → discrepancias contables sutiles (A-03 / SEC-15).
 *
 * Centralizadas aquí para que ventas, compras, traspasos, devoluciones,
 * inventario, caja y catálogo compartan exactamente los mismos límites.
 */

// Precios y costes unitarios — Decimal(10,4): 6 dígitos enteros, 4 decimales.
export const MAX_PRICE = 999999.9999;

// Importes monetarios (totales, efectivo, descuentos) — Decimal(12,2).
export const MAX_AMOUNT = 9999999999.99;

// Cantidades de producto — Decimal(_,3). Cota conservadora que cabe en TODAS las
// columnas de cantidad del esquema (la menor es Decimal(10,3)); un retail real
// nunca mueve más de ~1M de unidades en una sola línea.
export const MAX_QUANTITY = 999999.999;
