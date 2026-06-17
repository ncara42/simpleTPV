//! Dominio puro de devoluciones (sin BD/tenant) — port de `returns.domain.ts`.
//! Importe a reembolsar por línea (proporcional al neto vendido) y cantidad aún
//! devolvible. `round2` exacto vía `Decimal::round_dp(2)`.

use rust_decimal::Decimal;

fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

/// Importe a reembolsar por una línea devuelta: parte proporcional del neto de la
/// `SaleLine` (`lineTotal / qtyVendida * qtyDevuelta`). Si la venta tuviera qty 0
/// (no debería), devuelve 0.
pub fn compute_return_line_total(
    sale_line_total: Decimal,
    sale_line_qty: Decimal,
    qty: Decimal,
) -> Decimal {
    if sale_line_qty <= Decimal::ZERO {
        return Decimal::ZERO;
    }
    round2(sale_line_total / sale_line_qty * qty)
}

/// Cantidad aún devolvible de una `SaleLine`: lo vendido menos lo ya devuelto,
/// nunca negativa.
pub fn compute_returnable(sale_line_qty: Decimal, already_returned: Decimal) -> Decimal {
    round2((sale_line_qty - already_returned).max(Decimal::ZERO))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    #[test]
    fn importe_proporcional_por_linea() {
        // neto 18.00 sobre 3 uds → 6.00/ud; devolver 2 → 12.00.
        assert_eq!(
            compute_return_line_total(dec("18.00"), dec("3"), dec("2")),
            dec("12.00")
        );
        // qty vendida 0 → 0.
        assert_eq!(
            compute_return_line_total(dec("10.00"), dec("0"), dec("1")),
            Decimal::ZERO
        );
    }

    #[test]
    fn devolvible_descuenta_lo_ya_devuelto_y_no_es_negativa() {
        assert_eq!(compute_returnable(dec("3"), dec("1")), dec("2"));
        assert_eq!(compute_returnable(dec("3"), dec("3")), dec("0"));
        assert_eq!(compute_returnable(dec("3"), dec("5")), dec("0"));
    }
}
