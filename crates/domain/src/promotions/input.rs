//! Entradas y validación de promociones (#154 base + #275 S-22).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::max_price;
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::{PromoAmountScope, PromoAppliesTo, PromoConditionType, PromoDiscountType};

const MAX_THRESHOLD: i32 = 1_000_000;
const MAX_SCOPE_IDS: usize = 5_000;
const MAX_QTY_XY: i32 = 100;

/// `YYYY-MM-DD` (10 chars, dígitos y guiones en posición).
fn date_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..].iter().all(u8::is_ascii_digit)
}

/// `HH:MM` 24h (`00:00`..`23:59`). 5 chars exactos; rechaza horas/minutos fuera de rango.
fn time_ok(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 5
        || b[2] != b':'
        || !b[..2].iter().all(u8::is_ascii_digit)
        || !b[3..].iter().all(u8::is_ascii_digit)
    {
        return false;
    }
    let h = (b[0] - b'0') * 10 + (b[1] - b'0');
    let m = (b[3] - b'0') * 10 + (b[4] - b'0');
    h <= 23 && m <= 59
}

fn threshold_ok(t: i32) -> bool {
    (1..=MAX_THRESHOLD).contains(&t)
}

fn discount_ok(d: Decimal) -> bool {
    d >= Decimal::ZERO && d <= max_price()
}

/// Valida la franja horaria opcional (`HH:MM`) y la coherencia de su par: si una
/// extremo va presente, el otro también (van juntos o ninguno).
fn time_pair_ok(start: &Option<String>, end: &Option<String>) -> bool {
    match (start, end) {
        (None, None) => true,
        (Some(s), Some(e)) => time_ok(s) && time_ok(e),
        _ => false,
    }
}

/// Valida los días de la semana: cada uno en 0..=6 (0=Dom..6=Sáb).
fn weekdays_ok(days: &[i16]) -> bool {
    days.iter().all(|d| (0..=6).contains(d))
}

/// Coherencia del 2x1 (`qty_xy`): buyQty/payQty presentes, 1 <= payQty < buyQty.
fn qty_xy_ok(buy: Option<i32>, pay: Option<i32>) -> bool {
    match (buy, pay) {
        (Some(b), Some(p)) => {
            (1..=MAX_QTY_XY).contains(&b) && (1..=MAX_QTY_XY).contains(&p) && p < b
        }
        _ => false,
    }
}

fn default_applies_to() -> PromoAppliesTo {
    PromoAppliesTo::Ticket
}
fn default_amount_scope() -> PromoAmountScope {
    PromoAmountScope::Ticket
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePromotion {
    pub name: String,
    pub condition_type: PromoConditionType,
    pub threshold: i32,
    pub discount_type: PromoDiscountType,
    pub discount_value: Decimal,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub active: Option<bool>,
    // S-22.
    #[serde(default = "default_applies_to")]
    pub applies_to: PromoAppliesTo,
    #[serde(default = "default_amount_scope")]
    pub amount_scope: PromoAmountScope,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub weekdays: Vec<i16>,
    #[serde(default)]
    pub stackable: Option<bool>,
    #[serde(default)]
    pub clerk_can_skip: Option<bool>,
    #[serde(default)]
    pub buy_qty: Option<i32>,
    #[serde(default)]
    pub pay_qty: Option<i32>,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub product_ids: Vec<Uuid>,
    #[serde(default)]
    pub family_ids: Vec<Uuid>,
    #[serde(default)]
    pub store_ids: Vec<Uuid>,
}

impl CreatePromotion {
    /// `weekdays` como `Vec<i16>` para el bind `smallint[]` (clona; lista corta).
    pub fn weekdays_smallint(&self) -> Vec<i16> {
        self.weekdays.clone()
    }

    /// Reglas de los campos avanzados (S-22): franja horaria, weekdays, tamaño de
    /// scopes, coherencia alcance↔scope y coherencia del 2x1.
    fn advanced_ok(&self) -> bool {
        if !time_pair_ok(&self.start_time, &self.end_time) || !weekdays_ok(&self.weekdays) {
            return false;
        }
        if self.product_ids.len() > MAX_SCOPE_IDS
            || self.family_ids.len() > MAX_SCOPE_IDS
            || self.store_ids.len() > MAX_SCOPE_IDS
        {
            return false;
        }
        // Coherencia alcance ↔ scope: PRODUCT exige al menos un producto; FAMILY al
        // menos una familia. TICKET no usa scopes de producto/familia.
        match self.applies_to {
            PromoAppliesTo::Product if self.product_ids.is_empty() => return false,
            PromoAppliesTo::Family if self.family_ids.is_empty() => return false,
            _ => {}
        }
        // El 2x1 exige buyQty/payQty coherentes; los demás tipos no deben llevarlos.
        match self.condition_type {
            PromoConditionType::QtyXy => qty_xy_ok(self.buy_qty, self.pay_qty),
            _ => self.buy_qty.is_none() && self.pay_qty.is_none(),
        }
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty()
            || !threshold_ok(self.threshold)
            || !discount_ok(self.discount_value)
            || !date_ok(&self.start_date)
            || !date_ok(&self.end_date)
            || self.start_date > self.end_date
            || !self.advanced_ok()
        {
            return Err(AppError::BadRequest);
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePromotion {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub condition_type: Option<PromoConditionType>,
    #[serde(default)]
    pub threshold: Option<i32>,
    #[serde(default)]
    pub discount_type: Option<PromoDiscountType>,
    #[serde(default)]
    pub discount_value: Option<Decimal>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub active: Option<bool>,
    // S-22. `Option<Option<T>>` permite distinguir "no enviado" de "ponlo a null".
    #[serde(default)]
    pub applies_to: Option<PromoAppliesTo>,
    #[serde(default)]
    pub amount_scope: Option<PromoAmountScope>,
    #[serde(default)]
    pub start_time: Option<Option<String>>,
    #[serde(default)]
    pub end_time: Option<Option<String>>,
    #[serde(default)]
    pub weekdays: Option<Vec<i16>>,
    #[serde(default)]
    pub stackable: Option<bool>,
    #[serde(default)]
    pub clerk_can_skip: Option<bool>,
    #[serde(default)]
    pub buy_qty: Option<Option<i32>>,
    #[serde(default)]
    pub pay_qty: Option<Option<i32>>,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub product_ids: Option<Vec<Uuid>>,
    #[serde(default)]
    pub family_ids: Option<Vec<Uuid>>,
    #[serde(default)]
    pub store_ids: Option<Vec<Uuid>>,
}

impl UpdatePromotion {
    /// `weekdays` para el bind `smallint[]`: vacío si no se envía (el CASE del
    /// UPDATE ignora el valor cuando la flag `weekdays.is_some()` es false).
    pub fn weekdays_smallint(&self) -> Vec<i16> {
        self.weekdays.clone().unwrap_or_default()
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.as_ref().is_some_and(|n| n.trim().is_empty())
            || self.threshold.is_some_and(|t| !threshold_ok(t))
            || self.discount_value.is_some_and(|d| !discount_ok(d))
            || self.start_date.as_ref().is_some_and(|s| !date_ok(s))
            || self.end_date.as_ref().is_some_and(|s| !date_ok(s))
        {
            return Err(AppError::BadRequest);
        }
        // Franja horaria: si se envía un extremo, debe ser HH:MM válido; un par
        // completo debe ser coherente (ambos o ninguno) cuando ambos se envían.
        for t in [&self.start_time, &self.end_time] {
            if let Some(Some(v)) = t {
                if !time_ok(v) {
                    return Err(AppError::BadRequest);
                }
            }
        }
        if let Some(days) = &self.weekdays {
            if !weekdays_ok(days) {
                return Err(AppError::BadRequest);
            }
        }
        // Coherencia 2x1 cuando el PATCH lo toca: si fija conditionType=qty_xy o
        // cambia buy/pay, deben quedar 1 <= pay < buy.
        let touches_xy = matches!(self.condition_type, Some(PromoConditionType::QtyXy))
            || self.buy_qty.is_some()
            || self.pay_qty.is_some();
        if touches_xy {
            let buy = self.buy_qty.flatten();
            let pay = self.pay_qty.flatten();
            // Solo validamos si AMBOS se conocen en el PATCH; si solo uno se envía
            // y el otro queda en BD, no podemos comprobar la coherencia aquí (el
            // cliente avanzado del backoffice envía el par completo).
            if buy.is_some() && pay.is_some() && !qty_xy_ok(buy, pay) {
                return Err(AppError::BadRequest);
            }
            if matches!(self.condition_type, Some(PromoConditionType::QtyXy))
                && (buy.is_none() || pay.is_none())
            {
                return Err(AppError::BadRequest);
            }
        }
        for ids in [&self.product_ids, &self.family_ids, &self.store_ids] {
            if ids.as_ref().is_some_and(|v| v.len() > MAX_SCOPE_IDS) {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> CreatePromotion {
        CreatePromotion {
            name: "Promo".into(),
            condition_type: PromoConditionType::MinTicket,
            threshold: 50,
            discount_type: PromoDiscountType::Percent,
            discount_value: Decimal::from(10),
            start_date: "2026-06-01".into(),
            end_date: "2026-06-30".into(),
            active: None,
            applies_to: PromoAppliesTo::Ticket,
            amount_scope: PromoAmountScope::Ticket,
            start_time: None,
            end_time: None,
            weekdays: vec![],
            stackable: None,
            clerk_can_skip: None,
            buy_qty: None,
            pay_qty: None,
            priority: None,
            product_ids: vec![],
            family_ids: vec![],
            store_ids: vec![],
        }
    }

    #[test]
    fn alta_basica_valida() {
        assert!(base().validate().is_ok());
    }

    #[test]
    fn franja_horaria_hhmm() {
        assert!(time_ok("00:00"));
        assert!(time_ok("23:59"));
        assert!(!time_ok("24:00"));
        assert!(!time_ok("12:60"));
        assert!(!time_ok("9:00"));
        assert!(!time_ok("09-00"));
    }

    #[test]
    fn franja_horaria_par_completo_o_ninguno() {
        let mut p = base();
        p.start_time = Some("18:00".into());
        // Solo inicio sin fin → inválida.
        assert!(p.validate().is_err());
        p.end_time = Some("20:00".into());
        assert!(p.validate().is_ok());
    }

    #[test]
    fn weekdays_fuera_de_rango() {
        let mut p = base();
        p.weekdays = vec![0, 6];
        assert!(p.validate().is_ok());
        p.weekdays = vec![7];
        assert!(p.validate().is_err());
        p.weekdays = vec![-1];
        assert!(p.validate().is_err());
    }

    #[test]
    fn applies_to_product_exige_scope() {
        let mut p = base();
        p.applies_to = PromoAppliesTo::Product;
        assert!(p.validate().is_err(), "PRODUCT sin productos → inválida");
        p.product_ids = vec![Uuid::new_v4()];
        assert!(p.validate().is_ok());
    }

    #[test]
    fn applies_to_family_exige_scope() {
        let mut p = base();
        p.applies_to = PromoAppliesTo::Family;
        assert!(p.validate().is_err());
        p.family_ids = vec![Uuid::new_v4()];
        assert!(p.validate().is_ok());
    }

    #[test]
    fn dos_por_uno_exige_buy_mayor_que_pay() {
        let mut p = base();
        p.condition_type = PromoConditionType::QtyXy;
        // Sin buy/pay → inválida.
        assert!(p.validate().is_err());
        p.buy_qty = Some(2);
        p.pay_qty = Some(1);
        assert!(p.validate().is_ok(), "2x1 válido");
        // pay >= buy → inválida.
        p.pay_qty = Some(2);
        assert!(p.validate().is_err());
        // pay 0 → inválida.
        p.pay_qty = Some(0);
        assert!(p.validate().is_err());
    }

    #[test]
    fn buy_pay_solo_en_qty_xy() {
        let mut p = base();
        // Tipo no-xy con buy/pay → inválida (evita datos huérfanos).
        p.buy_qty = Some(2);
        p.pay_qty = Some(1);
        assert!(p.validate().is_err());
    }

    #[test]
    fn fecha_invertida_es_invalida() {
        let mut p = base();
        p.start_date = "2026-07-01".into();
        p.end_date = "2026-06-30".into();
        assert!(p.validate().is_err());
    }
}
