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

/**
 * Cotas de tamaño para entradas no numéricas (cadenas `TEXT` sin límite nativo y
 * arrays). El `ValidationPipe` con whitelist NO impone longitud por sí solo, así
 * que sin `@MaxLength`/`@ArrayMaxSize`/`@Max` un cliente autenticado puede mandar
 * cadenas o arrays enormes → abuso de almacenamiento/ancho de banda y DoS por
 * amplificación (N lookups/inserts por línea, OFFSET ilimitado). Centralizadas
 * para que todos los DTOs compartan los mismos topes semánticos
 * (VAL-02/03/06/07, KEY-04, INJ-02 — issue #111).
 */

// Nombres legibles (productos, tiendas, proveedores, familias, usuarios...).
export const MAX_NAME_LENGTH = 200;

// Códigos cortos (código de tienda, símbolo de unidad, color/icono de familia...).
export const MAX_CODE_LENGTH = 50;

// Identificadores de catálogo (barcode, sku, lotCode).
export const MAX_BARCODE_LENGTH = 100;

// NIF/CIF y similares.
export const MAX_NIF_LENGTH = 20;

// Teléfonos.
export const MAX_PHONE_LENGTH = 30;

// Direcciones postales.
export const MAX_ADDRESS_LENGTH = 500;

// Notas, motivos y texto libre auditado.
export const MAX_NOTES_LENGTH = 1000;

// Término de búsqueda libre (filtro `q`, ILIKE).
export const MAX_SEARCH_LENGTH = 200;

// Tope de líneas/IDs por petición (pedidos, asignaciones de tiendas...). Mismo
// criterio que `CreateSaleDto` (200): suficiente para un pedido real y corta la
// amplificación por arrays gigantes.
export const MAX_ARRAY_SIZE = 200;

// Tope de `page` en listados paginados: evita un `OFFSET` ilimitado (escaneo
// costoso) manteniendo holgura más que de sobra para datos reales.
export const MAX_PAGE = 10000;

// Días de cobertura objetivo en la sugerencia de compra (#45): un año basta y
// evita aritmética con valores absurdos/Infinity en la fórmula.
export const MAX_COVERAGE_DAYS = 365;
