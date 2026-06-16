//! Dominio puro de ventas (sin BD/tenant) — port de `sales.domain.ts`. Aritmética
//! de importes, descuentos e IVA del ticket. `round2` = redondeo a céntimos
//! (`Decimal::round_dp(2)`), exacto (sin la imprecisión float de NestJS).

use rust_decimal::Decimal;
use simpletpv_shared::AppError;

use super::model::PaymentMethod;

/// Redondeo a 2 decimales (céntimos) para casar con `Decimal(12,2)`.
fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

/// Línea con su precio ya resuelto (antes de calcular totales).
#[derive(Debug, Clone)]
pub struct PricedLine {
    pub product_id: uuid::Uuid,
    pub name: String,
    pub unit_price: Decimal,
    pub qty: Decimal,
    pub discount_pct: Option<Decimal>,
    pub discount_amt: Option<Decimal>,
    pub tax_rate: Decimal,
    pub cost_price: Decimal,
}

/// Línea con los importes calculados (bruto, descuento efectivo, neto).
#[derive(Debug, Clone)]
pub struct ComputedLine {
    pub priced: PricedLine,
    pub gross: Decimal,
    pub discount_amt: Decimal,
    pub line_total: Decimal,
}

/// Descuento a nivel de ticket (el importe fijo tiene precedencia sobre el %).
#[derive(Debug, Clone, Copy, Default)]
pub struct TicketDiscount {
    pub pct: Option<Decimal>,
    pub amt: Option<Decimal>,
}

/// Totales del ticket.
#[derive(Debug, Clone)]
pub struct Totals {
    pub lines: Vec<ComputedLine>,
    pub subtotal: Decimal,
    pub ticket_discount: Decimal,
    pub discount_total: Decimal,
    pub total: Decimal,
    /// Σ(unitPrice·qty) sin descuentos (para el límite de descuento por rol).
    pub gross_total: Decimal,
}

/// Calcula los importes del ticket (port de `computeTotals`). Por línea: bruto,
/// descuento efectivo (importe fijo capado al bruto con precedencia sobre el %) y
/// neto. Después subtotal, descuento de ticket (capado al subtotal) y total.
pub fn compute_totals(lines: Vec<PricedLine>, ticket: TicketDiscount) -> Totals {
    let zero = Decimal::ZERO;
    let hundred = Decimal::from(100);

    let computed: Vec<ComputedLine> = lines
        .into_iter()
        .map(|l| {
            let gross = round2(l.unit_price * l.qty);
            let discount_amt = match l.discount_amt {
                Some(amt) if amt > zero => round2(amt.min(gross)),
                _ => round2(gross * l.discount_pct.unwrap_or(zero) / hundred),
            };
            let line_total = round2(gross - discount_amt);
            ComputedLine {
                priced: l,
                gross,
                discount_amt,
                line_total,
            }
        })
        .collect();

    let subtotal = round2(computed.iter().map(|l| l.line_total).sum());
    let gross_total = round2(computed.iter().map(|l| l.gross).sum());

    let ticket_discount = if let Some(amt) = ticket.amt {
        round2(amt.min(subtotal))
    } else if let Some(pct) = ticket.pct {
        round2(subtotal * pct / hundred)
    } else {
        zero
    };

    let line_discounts = round2(computed.iter().map(|l| l.discount_amt).sum());
    let discount_total = round2(line_discounts + ticket_discount);
    let total = round2(subtotal - ticket_discount);

    Totals {
        lines: computed,
        subtotal,
        ticket_discount,
        discount_total,
        total,
        gross_total,
    }
}

/// Verifica que el % de descuento efectivo del ticket no supere `limit` (None =
/// sin límite). `Forbidden` si lo supera. Con `gross_total <= 0` no hay descuento
/// posible → no-op. Port de `assertDiscountWithinRoleLimit` (Decimal exacto, sin
/// epsilon de float).
pub fn assert_discount_within_limit(
    limit: Option<Decimal>,
    discount_total: Decimal,
    gross_total: Decimal,
) -> Result<(), AppError> {
    let Some(limit) = limit else { return Ok(()) };
    if gross_total <= Decimal::ZERO {
        return Ok(());
    }
    let effective_pct = discount_total / gross_total * Decimal::from(100);
    if effective_pct > limit {
        Err(AppError::Forbidden)
    } else {
        Ok(())
    }
}

/// Detalle de efectivo: para CARD (o CASH sin importe) devuelve `(None, None)`;
/// para CASH con importe calcula el cambio y rechaza si es insuficiente.
pub fn compute_change(
    payment_method: PaymentMethod,
    total: Decimal,
    cash_given: Option<Decimal>,
) -> Result<(Option<Decimal>, Option<Decimal>), AppError> {
    match (payment_method, cash_given) {
        (PaymentMethod::Cash, Some(given)) => {
            if given < total {
                return Err(AppError::BadRequest);
            }
            Ok((Some(given), Some(round2(given - total))))
        }
        _ => Ok((None, None)),
    }
}

/// Formatea el número de ticket: `T{code}-{counter:06}` (p. ej. `T01-000001`).
pub fn format_ticket(code: &str, counter: i64) -> String {
    format!("T{code}-{counter:06}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    fn line(unit: &str, qty: &str, pct: Option<&str>, amt: Option<&str>) -> PricedLine {
        PricedLine {
            product_id: uuid::Uuid::nil(),
            name: "x".into(),
            unit_price: dec(unit),
            qty: dec(qty),
            discount_pct: pct.map(dec),
            discount_amt: amt.map(dec),
            tax_rate: dec("21"),
            cost_price: dec("0"),
        }
    }

    #[test]
    fn totales_con_descuento_de_linea_y_ticket() {
        // 2 uds × 10.00 = 20.00 bruto; 10% línea → 2.00 desc → 18.00 neto.
        let t = compute_totals(
            vec![line("10.00", "2", Some("10"), None)],
            TicketDiscount {
                pct: Some(dec("5")),
                amt: None,
            },
        );
        assert_eq!(t.lines[0].gross, dec("20.00"));
        assert_eq!(t.lines[0].discount_amt, dec("2.00"));
        assert_eq!(t.lines[0].line_total, dec("18.00"));
        assert_eq!(t.subtotal, dec("18.00"));
        // ticket 5% de 18.00 = 0.90.
        assert_eq!(t.ticket_discount, dec("0.90"));
        assert_eq!(t.discount_total, dec("2.90"));
        assert_eq!(t.total, dec("17.10"));
        assert_eq!(t.gross_total, dec("20.00"));
    }

    #[test]
    fn importe_fijo_tiene_precedencia_y_se_capa_al_bruto() {
        let t = compute_totals(
            vec![line("10.00", "1", Some("50"), Some("100"))],
            TicketDiscount::default(),
        );
        // amt 100 capado al bruto 10.00 (no usa el 50%).
        assert_eq!(t.lines[0].discount_amt, dec("10.00"));
        assert_eq!(t.lines[0].line_total, dec("0.00"));
    }

    #[test]
    fn limite_de_descuento_por_rol() {
        // 10% efectivo con límite CLERK 10 → OK.
        assert!(assert_discount_within_limit(Some(dec("10")), dec("10"), dec("100")).is_ok());
        // 11% con límite 10 → Forbidden.
        assert_eq!(
            assert_discount_within_limit(Some(dec("10")), dec("11"), dec("100")),
            Err(AppError::Forbidden)
        );
        // Sin límite (ADMIN) → OK.
        assert!(assert_discount_within_limit(None, dec("99"), dec("100")).is_ok());
        // gross 0 → no-op.
        assert!(assert_discount_within_limit(Some(dec("10")), dec("5"), dec("0")).is_ok());
    }

    #[test]
    fn cambio_en_efectivo() {
        let (given, change) =
            compute_change(PaymentMethod::Cash, dec("17.10"), Some(dec("20"))).unwrap();
        assert_eq!(given, Some(dec("20")));
        assert_eq!(change, Some(dec("2.90")));
        // CARD → sin efectivo.
        assert_eq!(
            compute_change(PaymentMethod::Card, dec("10"), None).unwrap(),
            (None, None)
        );
        // efectivo insuficiente.
        assert_eq!(
            compute_change(PaymentMethod::Cash, dec("20"), Some(dec("10"))),
            Err(AppError::BadRequest)
        );
    }

    #[test]
    fn formato_de_ticket() {
        assert_eq!(format_ticket("01", 1), "T01-000001");
        assert_eq!(format_ticket("ABC", 123456), "TABC-123456");
    }
}
