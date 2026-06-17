//! Generación de CSV de ventas (#152) — port puro de `generateExportCsv`
//! (`sales.service.ts`) y `buildAccountingCsv` (`accounting-export.ts`).
//!
//! - **Ventas** (IT-05): una fila por venta; importes con punto decimal
//!   (normalizados, paridad `String(Decimal)` de Prisma), fecha ISO-8601 completa.
//! - **Contable** (libro de IVA repercutido, #125): formato LARGO, una fila por
//!   (factura × tipo de IVA), reutilizando [`build_tax_breakdown`] para que
//!   Σ(base+cuota) de cada factura cuadre con su total. Fecha solo `YYYY-MM-DD`.
//!
//! Campos de texto escapados con [`escape_csv_field`] (anti CSV/formula injection).

use rust_decimal::Decimal;
use time::PrimitiveDateTime;

use crate::csv::escape_csv_field;

use super::domain::{build_tax_breakdown, TaxLine};
use super::model::{PaymentMethod, SaleStatus};

const SALES_HEADER: &str =
    "ticket,fecha,tienda,vendedor,estado,metodo_pago,subtotal,descuento,total";
const ACCOUNTING_HEADER: &str = "fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total";

/// Importe con punto decimal y SIN ceros sobrantes — paridad con `String(Decimal)`
/// de Prisma (`53.90` → `53.9`, `53.00` → `53`).
fn amount_str(d: Decimal) -> String {
    d.normalize().to_string()
}

/// Fecha-hora UTC en ISO-8601 con milisegundos y `Z` — paridad con
/// `Date.toISOString()` (`2026-06-02T12:05:00.000Z`).
fn iso_z(dt: PrimitiveDateTime) -> String {
    let ms = dt.nanosecond() / 1_000_000;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{ms:03}Z",
        dt.year(),
        u8::from(dt.month()),
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second(),
    )
}

/// Solo fecha `YYYY-MM-DD` (UTC) — paridad con `toISOString().slice(0, 10)`.
fn date_only(dt: PrimitiveDateTime) -> String {
    format!(
        "{:04}-{:02}-{:02}",
        dt.year(),
        u8::from(dt.month()),
        dt.day()
    )
}

/// Una venta para el export de historial (IT-05).
#[derive(Debug, Clone)]
pub struct SalesExportRow {
    pub ticket_number: String,
    pub created_at: PrimitiveDateTime,
    pub store_name: String,
    pub user_name: String,
    pub status: SaleStatus,
    pub payment_method: PaymentMethod,
    pub subtotal: Decimal,
    pub discount_total: Decimal,
    pub total: Decimal,
}

/// Una factura para el libro de IVA (#125): cabecera + líneas (tipo/neto).
#[derive(Debug, Clone)]
pub struct AccountingSaleRow {
    pub ticket_number: String,
    pub created_at: PrimitiveDateTime,
    pub store_name: String,
    pub payment_method: PaymentMethod,
    pub subtotal: Decimal,
    pub total: Decimal,
    pub lines: Vec<TaxLine>,
}

/// CSV del historial de ventas. Devuelve `(csv, row_count)` con `row_count` = nº
/// de ventas (filas de datos).
pub fn build_sales_csv(rows: &[SalesExportRow]) -> (String, usize) {
    let mut out = Vec::with_capacity(rows.len() + 1);
    out.push(SALES_HEADER.to_owned());
    for r in rows {
        out.push(
            [
                escape_csv_field(&r.ticket_number),
                iso_z(r.created_at),
                escape_csv_field(&r.store_name),
                escape_csv_field(&r.user_name),
                r.status.as_str().to_owned(),
                r.payment_method.as_str().to_owned(),
                amount_str(r.subtotal),
                amount_str(r.discount_total),
                amount_str(r.total),
            ]
            .join(","),
        );
    }
    (out.join("\n"), rows.len())
}

/// CSV contable (libro de IVA repercutido). Formato LARGO: una fila por
/// (factura × tipo de IVA). `row_count` = nº de FACTURAS (no de filas IVA): el
/// total se repite por fila → agrupar por `numero` antes de sumar el total. Una
/// factura con base 0 (100% descuento) no genera filas pero cuenta en `row_count`.
pub fn build_accounting_csv(sales: &[AccountingSaleRow]) -> (String, usize) {
    let mut out = vec![ACCOUNTING_HEADER.to_owned()];
    for s in sales {
        let ticket_discount = s.subtotal - s.total;
        let breakdown = build_tax_breakdown(&s.lines, ticket_discount);
        let date = date_only(s.created_at);
        for b in &breakdown {
            out.push(
                [
                    date.clone(),
                    escape_csv_field(&s.ticket_number),
                    escape_csv_field(&s.store_name),
                    escape_csv_field(s.payment_method.as_str()),
                    amount_str(b.tax_rate),
                    amount_str(b.base),
                    amount_str(b.cuota),
                    amount_str(s.total),
                ]
                .join(","),
            );
        }
    }
    (out.join("\n"), sales.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    #[test]
    fn sales_csv_cabecera_y_fila_con_iso_y_escape() {
        let rows = vec![SalesExportRow {
            ticket_number: "T01-000001".into(),
            created_at: datetime!(2026-06-02 12:05:00),
            store_name: "Tienda, Centro".into(), // coma → entrecomillado RFC 4180
            user_name: "Ana".into(),
            status: SaleStatus::Completed,
            payment_method: PaymentMethod::Cash,
            subtotal: dec("53.90"),
            discount_total: dec("0"),
            total: dec("53.90"),
        }];
        let (csv, n) = build_sales_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines[0], SALES_HEADER);
        assert_eq!(
            lines[1],
            r#"T01-000001,2026-06-02T12:05:00.000Z,"Tienda, Centro",Ana,COMPLETED,CASH,53.9,0,53.9"#
        );
        assert_eq!(n, 1);
    }

    #[test]
    fn sales_csv_neutraliza_formula_en_nombre_de_tienda() {
        let rows = vec![SalesExportRow {
            ticket_number: "T1".into(),
            created_at: datetime!(2026-01-01 00:00:00),
            store_name: "=SUM(A1)".into(),
            user_name: "x".into(),
            status: SaleStatus::Voided,
            payment_method: PaymentMethod::Card,
            subtotal: dec("10"),
            discount_total: dec("0"),
            total: dec("10"),
        }];
        let (csv, _) = build_sales_csv(&rows);
        assert!(csv.contains(",'=SUM(A1),"), "fórmula neutralizada: {csv}");
        assert!(csv.contains(",VOIDED,CARD,"));
    }

    #[test]
    fn accounting_csv_cuadra_iva_y_usa_solo_fecha() {
        let sales = vec![AccountingSaleRow {
            ticket_number: "T01-000001".into(),
            created_at: datetime!(2026-06-02 12:05:00),
            store_name: "Centro".into(),
            payment_method: PaymentMethod::Cash,
            subtotal: dec("121.00"),
            total: dec("121.00"),
            lines: vec![TaxLine {
                tax_rate: dec("21"),
                line_total: dec("121.00"),
            }],
        }];
        let (csv, n) = build_accounting_csv(&sales);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines[0], ACCOUNTING_HEADER);
        // Una sola fila (un tipo de IVA): fecha YYYY-MM-DD, base 100, cuota 21.
        assert_eq!(lines[1], "2026-06-02,T01-000001,Centro,CASH,21,100,21,121");
        assert_eq!(n, 1); // row_count = nº de facturas
    }

    #[test]
    fn accounting_csv_dos_tipos_iva_dos_filas_por_factura() {
        let sales = vec![AccountingSaleRow {
            ticket_number: "T2".into(),
            created_at: datetime!(2026-06-02 00:00:00),
            store_name: "Centro".into(),
            payment_method: PaymentMethod::Card,
            subtotal: dec("150.00"),
            total: dec("150.00"),
            lines: vec![
                TaxLine {
                    tax_rate: dec("21"),
                    line_total: dec("100.00"),
                },
                TaxLine {
                    tax_rate: dec("10"),
                    line_total: dec("50.00"),
                },
            ],
        }];
        let (csv, n) = build_accounting_csv(&sales);
        let data: Vec<&str> = csv.lines().skip(1).collect();
        assert_eq!(data.len(), 2, "una fila por tipo de IVA");
        assert_eq!(n, 1, "pero una sola factura");
        // Σ(base+cuota) de las filas == total de la factura (150).
        let suma: Decimal = data
            .iter()
            .map(|row| {
                let c: Vec<&str> = row.split(',').collect();
                dec(c[5]) + dec(c[6])
            })
            .sum();
        assert_eq!(suma, dec("150"));
    }
}
