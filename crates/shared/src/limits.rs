//! Cotas superiores y escala decimal de los campos transaccionales — port de
//! `apps/api/src/common/limits.ts`.
//!
//! Sin estas cotas, un valor enorme o con exceso de decimales (a) reventaría el
//! INSERT con un 500 en vez de un 400 (fuera de la precisión `Decimal`), o (b)
//! sería redondeado en silencio por Postgres y divergiría del valor usado en los
//! cálculos → discrepancias contables sutiles (A-03 / SEC-15). Centralizadas aquí
//! para que catálogo, ventas, compras, traspasos, etc. compartan exactamente los
//! mismos límites.

use rust_decimal::Decimal;

// --- Cotas numéricas (devueltas como `Decimal`: nunca float para dinero) ---

/// Precios y costes unitarios — `Decimal(10,4)`: 6 enteros + 4 decimales.
pub fn max_price() -> Decimal {
    Decimal::new(9_999_999_999, 4) // 999999.9999
}

/// Importes monetarios (totales, efectivo, descuentos) — `Decimal(12,2)`.
pub fn max_amount() -> Decimal {
    Decimal::new(999_999_999_999, 2) // 9999999999.99
}

/// Cantidades de producto — `Decimal(_,3)`. Cota que cabe en TODAS las columnas
/// de cantidad del esquema (la menor es `Decimal(10,3)`).
pub fn max_quantity() -> Decimal {
    Decimal::new(999_999_999, 3) // 999999.999
}

/// Tipo impositivo (IVA) en porcentaje — `Decimal(5,2)`, tope 100%.
pub fn max_tax_rate() -> Decimal {
    Decimal::new(100, 0)
}

// --- Cotas de longitud para entradas de texto (TEXT sin límite nativo) ---

/// Nombres legibles (productos, tiendas, proveedores, familias, usuarios...).
pub const MAX_NAME_LENGTH: usize = 200;
/// Códigos cortos (código de tienda, símbolo de unidad, color/icono...).
pub const MAX_CODE_LENGTH: usize = 50;
/// Identificadores de catálogo (barcode, sku, lotCode).
pub const MAX_BARCODE_LENGTH: usize = 100;
/// NIF/CIF y similares.
pub const MAX_NIF_LENGTH: usize = 20;
/// Teléfonos.
pub const MAX_PHONE_LENGTH: usize = 30;
/// Direcciones postales.
pub const MAX_ADDRESS_LENGTH: usize = 500;
/// Notas, motivos y texto libre auditado.
pub const MAX_NOTES_LENGTH: usize = 1000;
/// Término de búsqueda libre (filtro, ILIKE).
pub const MAX_SEARCH_LENGTH: usize = 200;
/// Tope de líneas/IDs por petición.
pub const MAX_ARRAY_SIZE: usize = 200;

/// Tope de filas por importación CSV (trabajo por fila → DoS autenticado).
pub const MAX_IMPORT_ROWS: usize = 500;
