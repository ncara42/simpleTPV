//! Matching de promociones (#275 S-22) — DOMINIO PURO, sin BD ni reloj global.
//! El corazón del descuento automático: dadas las promos activas (con sus scopes
//! N:M ya cargados) y el ticket en curso, calcula el descuento aplicable.
//!
//! Reglas de producto CERRADAS:
//!  - GANA LA MEJOR (exclusiva): para cada línea (y para el ticket) se aplica SOLO
//!    la promo más ventajosa para el cliente; NO se acumulan.
//!  - Las promos automáticas NO cuentan contra el límite de descuento del rol (el
//!    cobro las separa del descuento manual en `assert_discount_within_limit`).
//!  - El "ahora" (weekday + hora) entra como PARÁMETRO (`MatchNow`), nunca de un
//!    reloj global → testeable. La vigencia por fechas la filtra el cargador SQL.
//!  - Una promo marcada como `skipped` por el cajero se ignora.
//!
//! 4 tipos (combinables con franja horaria/días):
//!  (a) TICKET por umbral (`min_qty`/`min_ticket`): % o € sobre el ticket.
//!  (b) PRODUCT/FAMILY: % o € por línea de los productos/familias del scope.
//!  (c) Franja horaria/días (happy hour): filtro `startTime..endTime` + weekdays.
//!  (d) `qty_xy` (lleva X paga Y / 2x1): descuenta las unidades "gratis" por línea.

use std::collections::HashSet;

use rust_decimal::Decimal;
use time::Time;
use uuid::Uuid;

use super::model::{
    PromoAmountScope, PromoAppliesTo, PromoConditionType, PromoDiscountType, Promotion,
};

/// Redondeo a céntimos (igual criterio que `sales::domain::round2`).
fn round2(n: Decimal) -> Decimal {
    n.round_dp(2)
}

/// "Ahora" del servidor para el matching de franja horaria/días. `weekday` en
/// 0=Dom..6=Sáb (mismo criterio que Postgres `EXTRACT(DOW)` y la columna
/// `weekdays`). Se pasa como parámetro para que el dominio sea testeable.
#[derive(Debug, Clone, Copy)]
pub struct MatchNow {
    pub weekday: i16,
    pub time: Time,
}

/// Línea del ticket de entrada al matching. `family_id` ya resuelto por el cobro.
#[derive(Debug, Clone)]
pub struct PromoLine {
    pub product_id: Uuid,
    pub family_id: Option<Uuid>,
    pub qty: Decimal,
    pub unit_price: Decimal,
    /// Bruto de la línea (`unit_price * qty`, ya redondeado) — base del descuento.
    pub gross: Decimal,
}

/// Parámetros de matching (ticket + contexto).
#[derive(Debug, Clone)]
pub struct MatchInput<'a> {
    pub lines: &'a [PromoLine],
    pub store_id: Uuid,
    pub now: MatchNow,
    /// Ids de promos que el cajero ha quitado en caja (se ignoran).
    pub skipped: &'a HashSet<Uuid>,
}

/// Resultado del matching para una línea afectada por una promo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineDiscount {
    /// Índice de la línea en el slice de entrada.
    pub line_index: usize,
    pub promotion_id: Uuid,
    /// Descuento automático calculado para esa línea (≥ 0, capado al bruto).
    pub discount_amt: Decimal,
}

/// Descuento de TICKET ganador (la mejor promo de alcance TICKET).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TicketDiscount {
    pub promotion_id: Uuid,
    pub discount_amt: Decimal,
}

/// Salida del matching: descuentos por línea (gana la mejor por línea) + el mejor
/// descuento de ticket (si alguna promo de alcance TICKET aplica).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PromoOutcome {
    pub lines: Vec<LineDiscount>,
    pub ticket: Option<TicketDiscount>,
}

/// ¿La promo está vigente AHORA por franja horaria y día de la semana?
/// - weekdays vacío → todos los días; si no, `now.weekday` debe estar en la lista.
/// - sin `start_time`/`end_time` → todo el día. Con franja, soporta la ventana que
///   cruza medianoche (p.ej. 22:00–02:00) tratando start > end como wrap-around.
fn within_schedule(p: &Promotion, now: MatchNow) -> bool {
    if !p.weekdays.is_empty() && !p.weekdays.contains(&now.weekday) {
        return false;
    }
    match (p.start_time, p.end_time) {
        (Some(start), Some(end)) => {
            let t = now.time;
            if start <= end {
                t >= start && t <= end
            } else {
                // Ventana nocturna que cruza medianoche.
                t >= start || t <= end
            }
        }
        _ => true,
    }
}

/// ¿La promo aplica a esta tienda? `store_ids` vacío → todas las tiendas.
fn within_store(p: &Promotion, store_id: Uuid) -> bool {
    p.store_ids.is_empty() || p.store_ids.contains(&store_id)
}

/// ¿La línea está en el scope de producto/familia de la promo?
fn line_in_scope(p: &Promotion, line: &PromoLine) -> bool {
    match p.applies_to {
        PromoAppliesTo::Product => p.product_ids.contains(&line.product_id),
        PromoAppliesTo::Family => line
            .family_id
            .is_some_and(|fid| p.family_ids.contains(&fid)),
        PromoAppliesTo::Ticket => false,
    }
}

/// Descuento de una promo `qty_xy` (lleva X paga Y) sobre una línea: por cada
/// grupo completo de `buy_qty` unidades, `buy_qty - pay_qty` salen gratis. Las
/// unidades sueltas (resto) se pagan. Solo cuenta la parte ENTERA de qty (las
/// fracciones no forman grupo). `unit_price` es el precio efectivo por unidad.
fn qty_xy_discount(p: &Promotion, line: &PromoLine) -> Decimal {
    let (Some(buy), Some(pay)) = (p.buy_qty, p.pay_qty) else {
        return Decimal::ZERO;
    };
    if buy <= 0 || pay <= 0 || pay >= buy {
        return Decimal::ZERO;
    }
    let whole_units = line.qty.trunc(); // unidades enteras
    let buy_d = Decimal::from(buy);
    let groups = (whole_units / buy_d).trunc(); // nº de grupos completos
    let free_per_group = Decimal::from(buy - pay);
    let free_units = groups * free_per_group;
    round2(free_units * line.unit_price).min(line.gross)
}

/// Descuento porcentual/importe de una promo sobre una base (línea o ticket).
/// `percent` → `base * value / 100`; `amount` → `value` capado a `base`. Capado
/// siempre a `[0, base]`.
fn flat_discount(p: &Promotion, base: Decimal) -> Decimal {
    if base <= Decimal::ZERO {
        return Decimal::ZERO;
    }
    let raw = match p.discount_type {
        PromoDiscountType::Percent => base * p.discount_value / Decimal::from(100),
        PromoDiscountType::Amount => p.discount_value,
    };
    round2(raw.max(Decimal::ZERO).min(base))
}

/// Descuento de una promo de alcance LÍNEA (product/family) sobre una línea
/// concreta: 2x1 si `qty_xy`, si no el descuento plano sobre el bruto de la línea.
fn line_discount_for(p: &Promotion, line: &PromoLine) -> Decimal {
    match p.condition_type {
        PromoConditionType::QtyXy => qty_xy_discount(p, line),
        _ => flat_discount(p, line.gross),
    }
}

/// ¿Se cumple el umbral de una promo de alcance TICKET? `min_qty` compara la suma
/// de cantidades; `min_ticket` el bruto total. `qty_xy` no es de ticket.
fn ticket_threshold_met(p: &Promotion, total_qty: Decimal, total_gross: Decimal) -> bool {
    let threshold = Decimal::from(p.threshold);
    match p.condition_type {
        PromoConditionType::MinQty => total_qty >= threshold,
        PromoConditionType::MinTicket => total_gross >= threshold,
        PromoConditionType::QtyXy => false,
    }
}

/// Calcula el mejor descuento automático del ticket (GANA LA MEJOR, exclusiva).
///
/// Por línea: evalúa todas las promos de alcance PRODUCT/FAMILY que casan con esa
/// línea (vigentes por franja/día/tienda y no skipped) y elige la de MAYOR
/// descuento; empate → la de mayor `priority`, luego la primera en el orden de
/// entrada (el cargador ya ordena por priority DESC, createdAt DESC → determinista).
///
/// Ticket: entre las promos de alcance TICKET cuyo umbral se cumple, elige la de
/// MAYOR descuento (mismo desempate). Devuelve ambos sin acumular.
pub fn best_promotions(promos: &[Promotion], input: &MatchInput) -> PromoOutcome {
    // Pre-filtra promos activas por contexto (franja/día/tienda/skip). La vigencia
    // por fechas la garantiza quien carga las promos.
    let live: Vec<&Promotion> = promos
        .iter()
        .filter(|p| {
            p.active
                && !input.skipped.contains(&p.id)
                && within_store(p, input.store_id)
                && within_schedule(p, input.now)
        })
        .collect();

    // --- Descuentos por línea (PRODUCT/FAMILY) ---
    let mut lines: Vec<LineDiscount> = Vec::new();
    for (idx, line) in input.lines.iter().enumerate() {
        let mut best: Option<(Decimal, &Promotion)> = None;
        for p in &live {
            if !matches!(p.applies_to, PromoAppliesTo::Product | PromoAppliesTo::Family) {
                continue;
            }
            if !line_in_scope(p, line) {
                continue;
            }
            let d = line_discount_for(p, line);
            if d <= Decimal::ZERO {
                continue;
            }
            // GANA LA MEJOR: mayor descuento; empate → ya viene ordenado por
            // priority/createdAt, así que la PRIMERA candidata gana el empate.
            if best.as_ref().is_none_or(|(bd, _)| d > *bd) {
                best = Some((d, p));
            }
        }
        if let Some((d, p)) = best {
            lines.push(LineDiscount {
                line_index: idx,
                promotion_id: p.id,
                discount_amt: d,
            });
        }
    }

    // --- Descuento de ticket (TICKET por umbral) ---
    let total_qty: Decimal = input.lines.iter().map(|l| l.qty).sum();
    let total_gross: Decimal = round2(input.lines.iter().map(|l| l.gross).sum());
    let mut ticket: Option<TicketDiscount> = None;
    for p in &live {
        if p.applies_to != PromoAppliesTo::Ticket {
            continue;
        }
        if p.amount_scope != PromoAmountScope::Ticket {
            continue;
        }
        if !ticket_threshold_met(p, total_qty, total_gross) {
            continue;
        }
        let d = flat_discount(p, total_gross);
        if d <= Decimal::ZERO {
            continue;
        }
        let better = ticket.as_ref().is_none_or(|cur| d > cur.discount_amt);
        if better {
            ticket = Some(TicketDiscount {
                promotion_id: p.id,
                discount_amt: d,
            });
        }
    }

    PromoOutcome { lines, ticket }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::{Date, Month, PrimitiveDateTime};

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    fn t(h: u8, m: u8) -> Time {
        Time::from_hms(h, m, 0).unwrap()
    }

    fn now(weekday: i16, h: u8, m: u8) -> MatchNow {
        MatchNow {
            weekday,
            time: t(h, m),
        }
    }

    /// Promo base totalmente "abierta" (TICKET, sin franja/scope) que luego cada
    /// test ajusta. createdAt/updatedAt da igual (no se usan en el matching).
    fn promo(name: &str) -> Promotion {
        let dt = PrimitiveDateTime::new(
            Date::from_calendar_date(2026, Month::June, 1).unwrap(),
            t(0, 0),
        );
        Promotion {
            id: Uuid::new_v4(),
            organization_id: Uuid::nil(),
            name: name.into(),
            condition_type: PromoConditionType::MinTicket,
            threshold: 0,
            discount_type: PromoDiscountType::Percent,
            discount_value: dec("10"),
            start_date: "2026-06-01".into(),
            end_date: "2026-06-30".into(),
            active: true,
            applies_to: PromoAppliesTo::Ticket,
            amount_scope: PromoAmountScope::Ticket,
            start_time: None,
            end_time: None,
            weekdays: vec![],
            stackable: false,
            clerk_can_skip: false,
            buy_qty: None,
            pay_qty: None,
            priority: 0,
            product_ids: vec![],
            family_ids: vec![],
            store_ids: vec![],
            created_at: dt,
            updated_at: dt,
        }
    }

    fn line(product: Uuid, family: Option<Uuid>, qty: &str, unit: &str) -> PromoLine {
        let q: Decimal = dec(qty);
        let u: Decimal = dec(unit);
        PromoLine {
            product_id: product,
            family_id: family,
            qty: q,
            unit_price: u,
            gross: round2(u * q),
        }
    }

    fn input<'a>(lines: &'a [PromoLine], store: Uuid, now: MatchNow, skipped: &'a HashSet<Uuid>) -> MatchInput<'a> {
        MatchInput {
            lines,
            store_id: store,
            now,
            skipped,
        }
    }

    // ---------- Sin promos / no aplica ----------

    #[test]
    fn sin_promos_cero_descuento() {
        let p = product_line();
        let skip = HashSet::new();
        let out = best_promotions(&[], &input(&p, Uuid::new_v4(), now(3, 12, 0), &skip));
        assert!(out.lines.is_empty());
        assert!(out.ticket.is_none());
    }

    fn product_line() -> Vec<PromoLine> {
        vec![line(Uuid::new_v4(), None, "1", "10.00")]
    }

    // ---------- (a) Ticket por umbral ----------

    #[test]
    fn ticket_min_ticket_aplica_porcentaje() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "2", "50.00")]; // bruto 100.00
        let mut pr = promo("10% > 50€");
        pr.condition_type = PromoConditionType::MinTicket;
        pr.threshold = 50;
        pr.discount_value = dec("10");
        let skip = HashSet::new();
        let out = best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        let tk = out.ticket.expect("hay descuento de ticket");
        assert_eq!(tk.promotion_id, pr.id);
        assert_eq!(tk.discount_amt, dec("10.00")); // 10% de 100
        assert!(out.lines.is_empty());
    }

    #[test]
    fn ticket_min_ticket_no_alcanza_umbral() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "30.00")]; // bruto 30 < 50
        let mut pr = promo("10% > 50€");
        pr.condition_type = PromoConditionType::MinTicket;
        pr.threshold = 50;
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        assert!(out.ticket.is_none(), "no llega al umbral");
    }

    #[test]
    fn ticket_min_qty_importe_fijo_capado() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "3", "1.00")]; // qty 3, bruto 3.00
        let mut pr = promo("5€ si llevas 3");
        pr.condition_type = PromoConditionType::MinQty;
        pr.threshold = 3;
        pr.discount_type = PromoDiscountType::Amount;
        pr.discount_value = dec("5"); // importe 5 > bruto 3 → capado a 3.00
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        assert_eq!(out.ticket.unwrap().discount_amt, dec("3.00"));
    }

    // ---------- (b) Producto / familia ----------

    #[test]
    fn promo_producto_aplica_por_linea() {
        let prod = Uuid::new_v4();
        let other = Uuid::new_v4();
        let lines = vec![
            line(prod, None, "2", "10.00"),  // 20.00 bruto → 20% = 4.00
            line(other, None, "1", "10.00"), // fuera de scope
        ];
        let mut pr = promo("20% en producto X");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.discount_value = dec("20");
        let skip = HashSet::new();
        let out = best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].line_index, 0);
        assert_eq!(out.lines[0].promotion_id, pr.id);
        assert_eq!(out.lines[0].discount_amt, dec("4.00"));
        assert!(out.ticket.is_none());
    }

    #[test]
    fn promo_familia_aplica_por_familia_de_linea() {
        let fam = Uuid::new_v4();
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, Some(fam), "1", "40.00")]; // 25% = 10.00
        let mut pr = promo("25% en familia");
        pr.applies_to = PromoAppliesTo::Family;
        pr.family_ids = vec![fam];
        pr.discount_value = dec("25");
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].discount_amt, dec("10.00"));
    }

    #[test]
    fn promo_familia_no_aplica_si_la_linea_no_es_de_esa_familia() {
        let fam = Uuid::new_v4();
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, Some(Uuid::new_v4()), "1", "40.00")]; // otra familia
        let mut pr = promo("25% en familia");
        pr.applies_to = PromoAppliesTo::Family;
        pr.family_ids = vec![fam];
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 10, 0), &skip));
        assert!(out.lines.is_empty());
    }

    // ---------- (c) Franja horaria / días ----------

    #[test]
    fn happy_hour_dentro_de_franja_aplica() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("Happy hour 18-20");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.discount_value = dec("50");
        pr.start_time = Some(t(18, 0));
        pr.end_time = Some(t(20, 0));
        let skip = HashSet::new();
        // 18:30 dentro.
        let out = best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(5, 18, 30), &skip));
        assert_eq!(out.lines.len(), 1, "dentro de franja aplica");
        assert_eq!(out.lines[0].discount_amt, dec("5.00"));
        // 21:00 fuera.
        let out2 = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(5, 21, 0), &skip));
        assert!(out2.lines.is_empty(), "fuera de franja no aplica");
    }

    #[test]
    fn franja_que_cruza_medianoche() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("Nocturna 22-02");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.start_time = Some(t(22, 0));
        pr.end_time = Some(t(2, 0));
        let skip = HashSet::new();
        // 23:30 dentro (lado noche).
        assert_eq!(best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(5, 23, 30), &skip)).lines.len(), 1);
        // 01:00 dentro (lado madrugada).
        assert_eq!(best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(5, 1, 0), &skip)).lines.len(), 1);
        // 12:00 fuera.
        assert!(best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(5, 12, 0), &skip)).lines.is_empty());
    }

    #[test]
    fn weekday_fuera_de_lista_no_aplica() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("Solo fines de semana");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.weekdays = vec![0, 6]; // Dom y Sáb
        let skip = HashSet::new();
        // Miércoles (3) → fuera.
        assert!(best_promotions(&[pr.clone()], &input(&lines, Uuid::new_v4(), now(3, 12, 0), &skip)).lines.is_empty());
        // Sábado (6) → aplica.
        assert_eq!(best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(6, 12, 0), &skip)).lines.len(), 1);
    }

    // ---------- Scope de tienda ----------

    #[test]
    fn promo_acotada_a_otra_tienda_no_aplica() {
        let prod = Uuid::new_v4();
        let store_a = Uuid::new_v4();
        let store_b = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("Solo tienda B");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.store_ids = vec![store_b];
        let skip = HashSet::new();
        assert!(best_promotions(&[pr.clone()], &input(&lines, store_a, now(1, 12, 0), &skip)).lines.is_empty());
        assert_eq!(best_promotions(&[pr], &input(&lines, store_b, now(1, 12, 0), &skip)).lines.len(), 1);
    }

    // ---------- (d) 2x1 / lleva X paga Y ----------

    #[test]
    fn dos_por_uno_descuenta_una_unidad_gratis() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "2", "10.00")]; // 2x1 → 1 gratis = 10.00
        let mut pr = promo("2x1");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.condition_type = PromoConditionType::QtyXy;
        pr.buy_qty = Some(2);
        pr.pay_qty = Some(1);
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].discount_amt, dec("10.00"));
    }

    #[test]
    fn dos_por_uno_solo_grupos_completos() {
        let prod = Uuid::new_v4();
        // 5 uds, 2x1 → 2 grupos completos (4 uds) → 2 gratis; 1 unidad suelta se paga.
        let lines = vec![line(prod, None, "5", "10.00")];
        let mut pr = promo("2x1");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.condition_type = PromoConditionType::QtyXy;
        pr.buy_qty = Some(2);
        pr.pay_qty = Some(1);
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert_eq!(out.lines[0].discount_amt, dec("20.00")); // 2 uds gratis
    }

    #[test]
    fn tres_paga_dos_3x2() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "3", "5.00")]; // 3x2 → 1 gratis = 5.00
        let mut pr = promo("3x2");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.condition_type = PromoConditionType::QtyXy;
        pr.buy_qty = Some(3);
        pr.pay_qty = Some(2);
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert_eq!(out.lines[0].discount_amt, dec("5.00"));
    }

    #[test]
    fn dos_por_uno_qty_insuficiente_no_descuenta() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")]; // solo 1 ud, 2x1 → 0
        let mut pr = promo("2x1");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.condition_type = PromoConditionType::QtyXy;
        pr.buy_qty = Some(2);
        pr.pay_qty = Some(1);
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert!(out.lines.is_empty());
    }

    // ---------- GANA LA MEJOR (exclusiva) ----------

    #[test]
    fn gana_la_mejor_entre_dos_promos_de_linea() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "100.00")];
        let mut a = promo("10%");
        a.applies_to = PromoAppliesTo::Product;
        a.product_ids = vec![prod];
        a.discount_value = dec("10"); // 10.00
        let mut b = promo("30%");
        b.applies_to = PromoAppliesTo::Product;
        b.product_ids = vec![prod];
        b.discount_value = dec("30"); // 30.00 → gana
        let skip = HashSet::new();
        let out = best_promotions(&[a, b.clone()], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert_eq!(out.lines.len(), 1, "una sola promo por línea, no acumula");
        assert_eq!(out.lines[0].promotion_id, b.id, "gana la del 30%");
        assert_eq!(out.lines[0].discount_amt, dec("30.00"));
    }

    #[test]
    fn empate_de_descuento_gana_mayor_prioridad() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "100.00")];
        let mut a = promo("20% prio 0");
        a.applies_to = PromoAppliesTo::Product;
        a.product_ids = vec![prod];
        a.discount_value = dec("20");
        a.priority = 0;
        let mut b = promo("20% prio 5");
        b.applies_to = PromoAppliesTo::Product;
        b.product_ids = vec![prod];
        b.discount_value = dec("20");
        b.priority = 5;
        let skip = HashSet::new();
        // El cargador ordena por priority DESC: pasamos b (prio 5) antes que a.
        let out = best_promotions(&[b.clone(), a], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert_eq!(out.lines[0].promotion_id, b.id, "empate → mayor prioridad (primera)");
    }

    #[test]
    fn gana_la_mejor_entre_dos_promos_de_ticket() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "100.00")];
        let mut a = promo("5% ticket");
        a.threshold = 0;
        a.discount_value = dec("5");
        let mut b = promo("15% ticket");
        b.threshold = 0;
        b.discount_value = dec("15");
        let skip = HashSet::new();
        let out = best_promotions(&[a, b.clone()], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        let tk = out.ticket.unwrap();
        assert_eq!(tk.promotion_id, b.id);
        assert_eq!(tk.discount_amt, dec("15.00"));
    }

    // ---------- Skipped por el cajero ----------

    #[test]
    fn promo_skipped_se_ignora() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("20% producto");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.discount_value = dec("20");
        let mut skip = HashSet::new();
        skip.insert(pr.id);
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert!(out.lines.is_empty(), "la promo quitada por el cajero se ignora");
    }

    #[test]
    fn promo_inactiva_se_ignora() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "1", "10.00")];
        let mut pr = promo("inactiva");
        pr.applies_to = PromoAppliesTo::Product;
        pr.product_ids = vec![prod];
        pr.active = false;
        let skip = HashSet::new();
        let out = best_promotions(&[pr], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        assert!(out.lines.is_empty());
    }

    // ---------- Combinación línea + ticket (no se mezclan entre sí) ----------

    #[test]
    fn linea_y_ticket_conviven_sin_acumular_en_la_misma_dimension() {
        let prod = Uuid::new_v4();
        let lines = vec![line(prod, None, "2", "50.00")]; // bruto 100
        // Promo de línea 20% sobre el producto.
        let mut linep = promo("20% producto");
        linep.applies_to = PromoAppliesTo::Product;
        linep.product_ids = vec![prod];
        linep.discount_value = dec("20"); // 20.00 en la línea
        // Promo de ticket 10% global.
        let mut ticketp = promo("10% ticket");
        ticketp.threshold = 0;
        ticketp.discount_value = dec("10"); // 10.00 de ticket
        let skip = HashSet::new();
        let out = best_promotions(&[linep.clone(), ticketp.clone()], &input(&lines, Uuid::new_v4(), now(1, 12, 0), &skip));
        // Son dimensiones distintas (línea vs ticket): ambas se devuelven, pero cada
        // una es la MEJOR en su dimensión, sin acumular dos promos de línea.
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].promotion_id, linep.id);
        assert_eq!(out.lines[0].discount_amt, dec("20.00"));
        assert_eq!(out.ticket.as_ref().unwrap().promotion_id, ticketp.id);
        assert_eq!(out.ticket.unwrap().discount_amt, dec("10.00"));
    }
}
