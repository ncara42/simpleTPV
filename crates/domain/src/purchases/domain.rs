//! Dominio puro de compras (#153) — port de `purchases.domain.ts`. KPIs de
//! proveedor y cantidad sugerida de reposición. Sin BD ni tenant.

use rust_decimal::Decimal;
use time::PrimitiveDateTime;

/// Cobertura por defecto (días) de la cantidad sugerida.
pub const DEFAULT_DAYS_COVERAGE: i64 = 14;
/// Ventana (días) sobre la que se promedia la venta diaria.
pub const SALES_WINDOW_DAYS: i64 = 30;

/// `fillRate = round3(recibido / pedido)` en 0..1; `None` si nada pedido.
pub fn fill_rate(ordered: Decimal, received: Decimal) -> Option<Decimal> {
    if ordered <= Decimal::ZERO {
        return None;
    }
    Some((received / ordered).round_dp(3))
}

/// `leadTimeDays = round2(días entre confirmación y recepción)`; `None` si falta
/// alguna fecha.
pub fn lead_time_days(
    confirmed_at: Option<PrimitiveDateTime>,
    received_at: Option<PrimitiveDateTime>,
) -> Option<Decimal> {
    match (confirmed_at, received_at) {
        (Some(c), Some(r)) => {
            let ms = (r - c).whole_milliseconds();
            let days = Decimal::from(ms) / Decimal::from(86_400_000i64);
            Some(days.round_dp(2))
        }
        _ => None,
    }
}

/// Cantidad sugerida a pedir (#45): cubre el mínimo + la demanda esperada durante
/// la cobertura, descontando el stock actual. Nunca negativa.
/// `max(0, round3(min − stock + ventaMediaDiaria · diasCobertura))`.
pub fn suggest_quantity(
    min_stock: Decimal,
    stock_actual: Decimal,
    venta_media_diaria: Decimal,
    dias_cobertura: i64,
) -> Decimal {
    let raw =
        (min_stock - stock_actual + venta_media_diaria * Decimal::from(dias_cobertura)).round_dp(3);
    raw.max(Decimal::ZERO)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    #[test]
    fn fill_rate_basico() {
        assert_eq!(fill_rate(dec("10"), dec("8")), Some(dec("0.8")));
        assert_eq!(fill_rate(dec("0"), dec("5")), None);
        assert_eq!(fill_rate(dec("3"), dec("1")), Some(dec("0.333")));
    }

    #[test]
    fn lead_time_dias() {
        use time::macros::datetime;
        let c = datetime!(2026-06-01 10:00:00);
        let r = datetime!(2026-06-03 22:00:00); // 2.5 días
        assert_eq!(lead_time_days(Some(c), Some(r)), Some(dec("2.5")));
        assert_eq!(lead_time_days(None, Some(r)), None);
    }

    #[test]
    fn cantidad_sugerida() {
        // min 10, stock 3, venta 2/día, cobertura 14 → 10-3+28 = 35.
        assert_eq!(
            suggest_quantity(dec("10"), dec("3"), dec("2"), 14),
            dec("35")
        );
        // Nunca negativa: stock alto.
        assert_eq!(
            suggest_quantity(dec("5"), dec("100"), dec("0"), 14),
            Decimal::ZERO
        );
    }
}
