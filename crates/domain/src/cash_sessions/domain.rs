//! Dominio puro del cuadre de caja (#145/#146) — port de `cash-sessions.service`
//! (funciones `computeExpected`/`computeDifference`). Sin BD.

use rust_decimal::Decimal;

fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

/// Efectivo esperado al cerrar: `inicial + ventas efectivo + neto movimientos −
/// reembolsos efectivo` (SEC-11).
pub fn compute_expected(
    opening: Decimal,
    cash_sales: Decimal,
    movement_net: Decimal,
    cash_refunds: Decimal,
) -> Decimal {
    round2(opening + cash_sales + movement_net - cash_refunds)
}

/// Diferencia del cuadre: `contado − esperado` (positivo = sobrante).
pub fn compute_difference(counted: Decimal, expected: Decimal) -> Decimal {
    round2(counted - expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    #[test]
    fn esperado_y_diferencia() {
        // 100 inicial + 250 ventas + (50 IN - 30 OUT = 20) - 10 reembolsos = 360.
        let expected = compute_expected(dec("100"), dec("250"), dec("20"), dec("10"));
        assert_eq!(expected, dec("360.00"));
        // Contado 358 → faltante de 2.
        assert_eq!(compute_difference(dec("358"), expected), dec("-2.00"));
        // Cuadre exacto.
        assert_eq!(compute_difference(dec("360"), expected), dec("0.00"));
    }
}
