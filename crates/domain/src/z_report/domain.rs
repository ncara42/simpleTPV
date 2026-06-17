//! Dominio puro del cierre Z (#124) — port de `z-report.domain.ts`. Construye el
//! informe fiscal del día: totales (solo COMPLETED), nº de tickets, rango de
//! numeración emitido (COMPLETED + VOIDED), desglose de IVA (reusa
//! `build_tax_breakdown`) y desglose por método de pago. Sin I/O.

use std::collections::HashMap;

use rust_decimal::Decimal;

use crate::sales::domain::{build_tax_breakdown, TaxLine};

use super::model::{ZReport, ZReportPaymentRow, ZReportSale, ZReportStore, ZReportTaxRow};

fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

pub fn build_z_report(store: ZReportStore, date: String, sales: Vec<ZReportSale>) -> ZReport {
    let completed: Vec<&ZReportSale> = sales.iter().filter(|s| s.status == "COMPLETED").collect();
    let voided_count = sales.iter().filter(|s| s.status == "VOIDED").count() as i64;

    // Rango EMITIDO: min/max sobre los nº de COMPLETED + VOIDED. Mismo prefijo y
    // padding ⇒ el orden lexicográfico coincide con el numérico.
    let mut issued: Vec<&str> = sales
        .iter()
        .filter(|s| s.status == "COMPLETED" || s.status == "VOIDED")
        .map(|s| s.ticket_number.as_str())
        .collect();
    issued.sort_unstable();
    let first_ticket_number = issued.first().map(|s| s.to_string());
    let last_ticket_number = issued.last().map(|s| s.to_string());

    let subtotal = round2(completed.iter().map(|s| s.subtotal).sum());
    let discount_total = round2(completed.iter().map(|s| s.discount_total).sum());
    let total = round2(completed.iter().map(|s| s.total).sum());

    ZReport {
        store,
        date,
        ticket_count: completed.len() as i64,
        voided_count,
        first_ticket_number,
        last_ticket_number,
        subtotal,
        discount_total,
        total,
        tax_breakdown: aggregate_tax_breakdown(&completed),
        payment_breakdown: aggregate_payments(&completed),
    }
}

/// Acumula el desglose de IVA: por cada venta se calcula con SU descuento de
/// ticket (subtotal − total) prorrateado y se suma base/cuota por tipo.
fn aggregate_tax_breakdown(sales: &[&ZReportSale]) -> Vec<ZReportTaxRow> {
    let mut by_rate: HashMap<Decimal, (Decimal, Decimal)> = HashMap::new();
    for sale in sales {
        let ticket_discount = round2(sale.subtotal - sale.total);
        let lines: Vec<TaxLine> = sale
            .lines
            .iter()
            .map(|l| TaxLine {
                tax_rate: l.tax_rate,
                line_total: l.line_total,
            })
            .collect();
        for row in build_tax_breakdown(&lines, ticket_discount) {
            let acc = by_rate
                .entry(row.tax_rate)
                .or_insert((Decimal::ZERO, Decimal::ZERO));
            acc.0 += row.base;
            acc.1 += row.cuota;
        }
    }
    let mut rows: Vec<ZReportTaxRow> = by_rate
        .into_iter()
        .map(|(tax_rate, (base, cuota))| ZReportTaxRow {
            tax_rate,
            base: round2(base),
            cuota: round2(cuota),
        })
        .collect();
    rows.sort_by_key(|r| r.tax_rate);
    rows
}

/// Desglose por método de pago: nº de tickets y total. Orden estable por método.
fn aggregate_payments(sales: &[&ZReportSale]) -> Vec<ZReportPaymentRow> {
    let mut by_method: HashMap<String, (i64, Decimal)> = HashMap::new();
    for sale in sales {
        let acc = by_method
            .entry(sale.payment_method.clone())
            .or_insert((0, Decimal::ZERO));
        acc.0 += 1;
        acc.1 += sale.total;
    }
    let mut rows: Vec<ZReportPaymentRow> = by_method
        .into_iter()
        .map(|(payment_method, (count, total))| ZReportPaymentRow {
            payment_method,
            count,
            total: round2(total),
        })
        .collect();
    rows.sort_by(|a, b| a.payment_method.cmp(&b.payment_method));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    fn store() -> ZReportStore {
        ZReportStore {
            id: uuid::Uuid::nil(),
            name: "T".into(),
            code: "T01".into(),
        }
    }

    fn sale(num: &str, status: &str, pay: &str, sub: &str, tot: &str, rate: &str) -> ZReportSale {
        ZReportSale {
            ticket_number: num.into(),
            status: status.into(),
            payment_method: pay.into(),
            subtotal: dec(sub),
            total: dec(tot),
            discount_total: dec("0"),
            lines: vec![ZReportSaleLine {
                tax_rate: dec(rate),
                line_total: dec(tot),
            }],
        }
    }
    use super::super::model::ZReportSaleLine;

    #[test]
    fn solo_completed_suma_voided_solo_cuenta_y_amplia_rango() {
        let sales = vec![
            sale("T01-000001", "COMPLETED", "CASH", "10.00", "10.00", "21"),
            sale("T01-000002", "VOIDED", "CARD", "5.00", "5.00", "21"),
            sale("T01-000003", "COMPLETED", "CARD", "20.00", "20.00", "10"),
        ];
        let z = build_z_report(store(), "2026-06-01".into(), sales);
        assert_eq!(z.ticket_count, 2); // solo COMPLETED
        assert_eq!(z.voided_count, 1);
        assert_eq!(z.total, dec("30.00")); // 10 + 20 (la anulada no suma)
                                           // El rango incluye la anulada.
        assert_eq!(z.first_ticket_number.as_deref(), Some("T01-000001"));
        assert_eq!(z.last_ticket_number.as_deref(), Some("T01-000003"));
        // Dos tipos de IVA (21 y 10), ordenados asc.
        assert_eq!(z.tax_breakdown.len(), 2);
        assert_eq!(z.tax_breakdown[0].tax_rate, dec("10"));
        assert_eq!(z.tax_breakdown[1].tax_rate, dec("21"));
        // Dos métodos de pago (CARD por la completed nº3; CASH por la nº1).
        assert_eq!(z.payment_breakdown.len(), 2);
        assert_eq!(z.payment_breakdown[0].payment_method, "CARD");
    }

    #[test]
    fn dia_sin_ventas_da_informe_vacio() {
        let z = build_z_report(store(), "2026-06-02".into(), vec![]);
        assert_eq!(z.ticket_count, 0);
        assert_eq!(z.total, dec("0"));
        assert!(z.first_ticket_number.is_none());
        assert!(z.tax_breakdown.is_empty());
        assert!(z.payment_breakdown.is_empty());
    }
}
