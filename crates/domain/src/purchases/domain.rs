//! Dominio puro de compras (#153) — port de `purchases.domain.ts`. KPIs de
//! proveedor y cantidad sugerida de reposición. Sin BD ni tenant.

use rust_decimal::Decimal;
use time::PrimitiveDateTime;

/// Cobertura por defecto (días) de la cantidad sugerida.
pub const DEFAULT_DAYS_COVERAGE: i64 = 14;
/// Ventana (días) sobre la que se promedia la venta diaria.
pub const SALES_WINDOW_DAYS: i64 = 30;
/// Techo (días) del horizonte de demanda proyectada (cobertura + lead time). Cota
/// defensiva: la validación del proveedor solo veta lead times negativos, no un
/// máximo, así que un `leadTimeDays` corrupto en BD nunca debe desbordar la
/// aritmética `Decimal` ni generar una propuesta absurda. 10 años.
pub const MAX_HORIZON_DAYS: i64 = 3_650;

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
/// el horizonte de reposición —cobertura **más** el plazo de entrega del proveedor
/// (`lead_time_days`)—, descontando el stock actual. Nunca negativa.
///
/// `max(0, round3(min − stock + ventaMediaDiaria · (diasCobertura + leadTime)))`.
///
/// Incluir el lead time evita la rotura de stock durante el tránsito del pedido:
/// sin él la propuesta solo repone para la cobertura y el stock cae por debajo del
/// mínimo mientras la mercancía viaja. El horizonte se acota a [`MAX_HORIZON_DAYS`]
/// y toda la aritmética es comprobada (`checked_*`), de modo que datos extremos
/// (p. ej. un `leadTimeDays` corrupto) nunca provocan un panic por desbordamiento;
/// el caso inalcanzable degrada a `0` (fail-safe: jamás propone un pedido absurdo).
pub fn suggest_quantity(
    min_stock: Decimal,
    stock_actual: Decimal,
    venta_media_diaria: Decimal,
    dias_cobertura: i64,
    lead_time_days: i64,
) -> Decimal {
    let horizon = dias_cobertura
        .saturating_add(lead_time_days.max(0))
        .clamp(0, MAX_HORIZON_DAYS);
    let demanda = venta_media_diaria
        .checked_mul(Decimal::from(horizon))
        .unwrap_or(Decimal::ZERO);
    let raw = min_stock
        .checked_sub(stock_actual)
        .and_then(|deficit| deficit.checked_add(demanda))
        .map(|v| v.round_dp(3))
        .unwrap_or(Decimal::ZERO);
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
        // min 10, stock 3, venta 2/día, cobertura 14, sin lead → 10-3+28 = 35.
        assert_eq!(
            suggest_quantity(dec("10"), dec("3"), dec("2"), 14, 0),
            dec("35")
        );
        // Nunca negativa: stock alto.
        assert_eq!(
            suggest_quantity(dec("5"), dec("100"), dec("0"), 14, 0),
            Decimal::ZERO
        );
    }

    #[test]
    fn cantidad_sugerida_incluye_lead_time() {
        // El lead time amplía el horizonte: cobertura 14 + lead 7 = 21 días.
        // 10 - 3 + 2·21 = 7 + 42 = 49 (34 más que sin lead → cubre el tránsito).
        assert_eq!(
            suggest_quantity(dec("10"), dec("3"), dec("2"), 14, 7),
            dec("49")
        );
        // Un lead time negativo (dato corrupto) se ignora, no resta: 10-3+2·14 = 35.
        assert_eq!(
            suggest_quantity(dec("10"), dec("3"), dec("2"), 14, -100),
            dec("35")
        );
    }

    #[test]
    fn cantidad_sugerida_nunca_desborda() {
        // Lead time absurdo (i64::MAX): el horizonte se acota a MAX_HORIZON_DAYS y
        // la aritmética comprobada no paniquea. 0 - 0 + 1·3650 = 3650.
        assert_eq!(
            suggest_quantity(Decimal::ZERO, Decimal::ZERO, dec("1"), 0, i64::MAX),
            Decimal::from(MAX_HORIZON_DAYS)
        );
    }
}
