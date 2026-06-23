//! Dominio puro de ventas (sin BD/tenant) — port de `sales.domain.ts`. Aritmética
//! de importes, descuentos e IVA del ticket. `round2` = redondeo a céntimos
//! (`Decimal::round_dp(2)`), exacto (sin la imprecisión float de NestJS).

use rust_decimal::Decimal;
use serde::Serialize;
use simpletpv_shared::AppError;

use super::model::{DiscountSource, PaymentMethod};
use crate::promotions::apply::PromoOutcome;

/// Redondeo a 2 decimales (céntimos) para casar con `Decimal(12,2)`.
fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

/// Descuento manual efectivo de una línea, con la MISMA precedencia que
/// `compute_totals`: importe fijo (>0) capado al bruto tiene prioridad sobre el %.
fn manual_line_discount(
    gross: Decimal,
    discount_pct: Option<Decimal>,
    discount_amt: Option<Decimal>,
) -> Decimal {
    match discount_amt {
        Some(amt) if amt > Decimal::ZERO => round2(amt.min(gross)),
        _ => round2(gross * discount_pct.unwrap_or(Decimal::ZERO) / Decimal::from(100)),
    }
}

/// Resultado de fusionar las promos automáticas con el descuento manual del
/// vendedor (S-22, regla GANA LA MEJOR exclusiva por dimensión):
///  - `lines`: las líneas con el descuento EFECTIVO ya bajado a `discount_amt`
///    (override del pct cuando aplica) — listas para `compute_totals`.
///  - `line_sources`: origen de cada línea (`PROMOTION` si ganó la promo).
///  - `ticket`: descuento de ticket efectivo (manual vs mejor promo de ticket).
///  - `ticket_source`: origen del descuento de ticket.
///  - `manual_discount_total`: SOLO la parte de descuento MANUAL (líneas + ticket
///    donde NO ganó una promo automática) — es lo único que cuenta contra el
///    límite de descuento del rol. Las promos automáticas no penalizan al rol.
#[derive(Debug, Clone)]
pub struct MergedDiscounts {
    pub lines: Vec<PricedLine>,
    pub line_sources: Vec<DiscountSource>,
    pub ticket: TicketDiscount,
    pub ticket_source: DiscountSource,
    pub manual_discount_total: Decimal,
}

/// Fusiona el descuento manual del ticket con las promos automáticas casadas
/// (`PromoOutcome`). Para cada línea elige el MAYOR descuento (manual vs promo);
/// si gana la promo, baja el importe a `discount_amt` (anula el pct manual para
/// no doblar) y marca el origen `PROMOTION`. Igual para el descuento de ticket.
///
/// `manual_discount_total` acumula SOLO la parte que sigue siendo voluntaria, de
/// modo que el límite del rol no se dispare por una promo automática (decisión de
/// producto: las promos automáticas no cuentan contra el límite del vendedor).
pub fn merge_promotions(
    priced: Vec<PricedLine>,
    manual_ticket: TicketDiscount,
    outcome: &PromoOutcome,
) -> MergedDiscounts {
    let n = priced.len();
    let mut lines = priced;
    let mut line_sources = vec![DiscountSource::Voluntary; n];
    let mut manual_discount_total = Decimal::ZERO;

    // Indexa el descuento de promo por índice de línea.
    let mut promo_by_line: std::collections::HashMap<usize, Decimal> =
        std::collections::HashMap::with_capacity(outcome.lines.len());
    for ld in &outcome.lines {
        promo_by_line.insert(ld.line_index, ld.discount_amt);
    }

    for (i, line) in lines.iter_mut().enumerate() {
        let gross = round2(line.unit_price * line.qty);
        let manual = manual_line_discount(gross, line.discount_pct, line.discount_amt);
        let promo = promo_by_line.get(&i).copied().unwrap_or(Decimal::ZERO);
        // GANA LA MEJOR: si la promo supera estrictamente al manual, la promo
        // sustituye el descuento de la línea; en empate, conserva el manual
        // (evita reclasificar un descuento del vendedor como promo sin ventaja).
        if promo > manual {
            line.discount_amt = Some(round2(promo.min(gross)));
            line.discount_pct = None;
            line_sources[i] = DiscountSource::Promotion;
            // La promo NO cuenta contra el límite del rol → no suma a manual_total.
        } else {
            // Gana (o iguala) el manual: cuenta contra el límite del rol.
            manual_discount_total = round2(manual_discount_total + manual);
        }
    }

    // Descuento de ticket: el manual efectivo vs la mejor promo de ticket.
    let subtotal_after_lines: Decimal = round2(
        lines
            .iter()
            .map(|l| {
                let gross = round2(l.unit_price * l.qty);
                let d = manual_line_discount(gross, l.discount_pct, l.discount_amt);
                round2(gross - d)
            })
            .sum(),
    );
    let manual_ticket_amt = if let Some(amt) = manual_ticket.amt {
        round2(amt.min(subtotal_after_lines))
    } else if let Some(pct) = manual_ticket.pct {
        round2(subtotal_after_lines * pct / Decimal::from(100))
    } else {
        Decimal::ZERO
    };
    let promo_ticket_amt = outcome
        .ticket
        .as_ref()
        .map(|t| round2(t.discount_amt.min(subtotal_after_lines)))
        .unwrap_or(Decimal::ZERO);

    let (ticket, ticket_source) = if promo_ticket_amt > manual_ticket_amt {
        // La promo de ticket gana: se expresa como importe fijo (override del pct).
        (
            TicketDiscount {
                pct: None,
                amt: Some(promo_ticket_amt),
            },
            DiscountSource::Promotion,
        )
    } else {
        manual_discount_total = round2(manual_discount_total + manual_ticket_amt);
        (manual_ticket, DiscountSource::Voluntary)
    };

    MergedDiscounts {
        lines,
        line_sources,
        ticket,
        ticket_source,
        manual_discount_total,
    }
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

/// Línea de entrada para el desglose de IVA: tipo de IVA + neto de línea
/// (`line_total`, con IVA incluido). Solo entrada (sin `Serialize`).
#[derive(Debug, Clone, Copy)]
pub struct TaxLine {
    pub tax_rate: Decimal,
    pub line_total: Decimal,
}

/// Item del desglose de IVA por tipo: base imponible + cuota. SALIDA JSON
/// (camelCase, importes como string normalizado, paridad Prisma).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxBreakdownItem {
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub tax_rate: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub base: Decimal,
    #[serde(serialize_with = "crate::serde_helpers::decimal_str")]
    pub cuota: Decimal,
}

/// Desglosa el IVA agrupando líneas por tipo (port de `buildTaxBreakdown`).
///
/// Convención retail España: los `line_total` llevan el IVA incluido. El
/// descuento de TICKET se prorratea entre los grupos proporcional al neto de
/// cada uno ANTES de calcular base/cuota; el grupo de MAYOR neto absorbe el
/// residuo de céntimo para que `Σ(base + cuota) == total` exacto. Para cada
/// grupo, sobre el neto ajustado: `base = round2(neto/(1+t/100))`,
/// `cuota = round2(neto − base)`. Salida ordenada ascendente por `tax_rate`.
pub fn build_tax_breakdown(lines: &[TaxLine], ticket_discount: Decimal) -> Vec<TaxBreakdownItem> {
    let hundred = Decimal::from(100);

    // Agrupa el neto por tipo de IVA preservando exactitud (sin HashMap de Decimal).
    let mut groups: Vec<(Decimal, Decimal)> = Vec::new();
    for l in lines {
        match groups.iter_mut().find(|(rate, _)| *rate == l.tax_rate) {
            Some(g) => g.1 += l.line_total,
            None => groups.push((l.tax_rate, l.line_total)),
        }
    }

    let subtotal = round2(groups.iter().map(|(_, neto)| *neto).sum());
    if subtotal <= Decimal::ZERO {
        return Vec::new();
    }

    // Orden ascendente por tipo para una salida estable.
    groups.sort_by_key(|g| g.0);

    // Prorrateo del descuento de ticket; el grupo de MAYOR neto (el primero en
    // caso de empate, igual que NestJS) absorbe el residuo de céntimo.
    let discount = round2(ticket_discount);
    let mut absorber_idx = 0;
    for i in 1..groups.len() {
        if groups[i].1 > groups[absorber_idx].1 {
            absorber_idx = i;
        }
    }

    let mut assigned = Decimal::ZERO;
    let mut prorate = vec![Decimal::ZERO; groups.len()];
    for (i, (_, neto)) in groups.iter().enumerate() {
        if i == absorber_idx {
            continue;
        }
        let p = round2(discount * *neto / subtotal);
        assigned = round2(assigned + p);
        prorate[i] = p;
    }
    prorate[absorber_idx] = round2(discount - assigned);

    groups
        .iter()
        .enumerate()
        .map(|(i, (tax_rate, neto))| {
            let neto_ajustado = round2(*neto - prorate[i]);
            let base = round2(neto_ajustado / (Decimal::ONE + *tax_rate / hundred));
            let cuota = round2(neto_ajustado - base);
            TaxBreakdownItem {
                tax_rate: *tax_rate,
                base,
                cuota,
            }
        })
        .collect()
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

    fn tax_line(rate: &str, total: &str) -> TaxLine {
        TaxLine {
            tax_rate: dec(rate),
            line_total: dec(total),
        }
    }

    #[test]
    fn iva_sin_descuento_cuadra_con_total() {
        let items = build_tax_breakdown(&[tax_line("21", "121.00")], dec("0"));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].tax_rate, dec("21"));
        assert_eq!(items[0].base, dec("100.00"));
        assert_eq!(items[0].cuota, dec("21.00"));
        assert_eq!(items[0].base + items[0].cuota, dec("121.00"));
    }

    #[test]
    fn iva_con_descuento_de_ticket_un_grupo_cuadra() {
        // total = 121.00 − 21.00 = 100.00; Σ(base+cuota) debe ser EXACTO 100.00.
        let items = build_tax_breakdown(&[tax_line("21", "121.00")], dec("21.00"));
        assert_eq!(items[0].base + items[0].cuota, dec("100.00"));
    }

    #[test]
    fn iva_dos_grupos_residuo_al_mayor_y_orden_ascendente() {
        let items = build_tax_breakdown(
            &[tax_line("21", "100.00"), tax_line("10", "50.00")],
            dec("10.00"),
        );
        // Orden ascendente por tipo: 10 antes que 21.
        assert_eq!(items[0].tax_rate, dec("10"));
        assert_eq!(items[1].tax_rate, dec("21"));
        // Σ(base+cuota) == total (150.00 − 10.00 = 140.00) EXACTO, sin descuadre.
        let suma: Decimal = items.iter().map(|i| i.base + i.cuota).sum();
        assert_eq!(suma, dec("140.00"));
    }

    #[test]
    fn iva_lineas_vacias_o_subtotal_no_positivo_devuelve_vacio() {
        assert!(build_tax_breakdown(&[], dec("0")).is_empty());
        assert!(build_tax_breakdown(&[tax_line("21", "0.00")], dec("0")).is_empty());
    }
}
