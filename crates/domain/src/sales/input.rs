//! Entradas de ventas (DTOs) — port de `sales.dto.ts`. Importes como número JSON
//! → `Decimal`; `deny_unknown_fields`; cotas iguales a NestJS.

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_amount, max_quantity};
use simpletpv_shared::AppError;
use time::Date;
use uuid::Uuid;

use super::model::{PaymentMethod, SaleChannel};

const MAX_LINES: usize = 200;
const HUNDRED: i64 = 100;
/// Cotas del destinatario de factura completa F1 (holgadas; el NIF/NIE/CIF español
/// cabe de sobra en 20 y la razón social en 120, alineado con el XSD de la AEAT).
const MAX_TAX_ID_LEN: usize = 20;
const MAX_CUSTOMER_NAME_LEN: usize = 120;

/// Normaliza un campo opcional de texto: `None`/vacío/solo-espacios → `None`;
/// si no, el valor trimmed. Unifica el trato de strings de la frontera (un `""`
/// del cliente no debe contar como destinatario presente).
fn normalize_opt(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Línea de venta.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSaleLine {
    pub product_id: Uuid,
    #[serde(with = "rust_decimal::serde::float")]
    pub qty: Decimal,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub discount_pct: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub discount_amt: Option<Decimal>,
}

/// `POST /sales`: crea una venta.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSale {
    pub store_id: Uuid,
    #[serde(default)]
    pub client_id: Option<Uuid>,
    #[serde(default)]
    pub ticket_number: Option<String>,
    pub lines: Vec<CreateSaleLine>,
    pub payment_method: PaymentMethod,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub cash_given: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub ticket_discount_pct: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::float_option")]
    pub ticket_discount_amt: Option<Decimal>,
    /// Factura completa F1: NIF del destinatario. Si va presente, `customer_name`
    /// también debe ir (van juntos o ninguno). Ausente → ticket simplificado F2.
    #[serde(default)]
    pub customer_tax_id: Option<String>,
    /// Factura completa F1: razón social / nombre del destinatario.
    #[serde(default)]
    pub customer_name: Option<String>,
    /// Canal de la venta para el ledger de cobro: TPV (por defecto si ausente),
    /// Online o B2B. Una factura a crédito se emite en canal B2B/Online.
    #[serde(default)]
    pub channel: Option<SaleChannel>,
    /// Vencimiento del cobro (`YYYY-MM-DD`) para facturas a crédito. Si va presente,
    /// la venta nace PENDING de cobro; solo se admite en canal B2B/Online.
    #[serde(default)]
    pub credit_due_date: Option<String>,
}

impl CreateSale {
    /// Vencimiento de cobro parseado cuando la venta es **a crédito**; `None` →
    /// venta al contado (PAID). La coherencia con el canal la garantiza `validate`.
    pub fn credit_due(&self) -> Result<Option<Date>, AppError> {
        match normalize_opt(&self.credit_due_date) {
            Some(s) => Ok(Some(parse_due_date(&s)?)),
            None => Ok(None),
        }
    }

    /// Destinatario fiscal normalizado `(NIF, razón social)` cuando la venta pide
    /// **factura completa F1**: ambos presentes y no vacíos (ya trimmed). `None` →
    /// factura simplificada (ticket `F2`). Coherencia garantizada por `validate`.
    pub fn fiscal_recipient(&self) -> Option<(String, String)> {
        Some((
            normalize_opt(&self.customer_tax_id)?,
            normalize_opt(&self.customer_name)?,
        ))
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_LINES {
            return Err(AppError::BadRequest);
        }
        // Factura completa F1: NIF y razón social van juntos o ninguno, con cotas.
        let tax = normalize_opt(&self.customer_tax_id);
        let name = normalize_opt(&self.customer_name);
        if tax.is_some() != name.is_some() {
            return Err(AppError::BadRequest);
        }
        if tax
            .as_deref()
            .is_some_and(|t| t.chars().count() > MAX_TAX_ID_LEN)
            || name
                .as_deref()
                .is_some_and(|n| n.chars().count() > MAX_CUSTOMER_NAME_LEN)
        {
            return Err(AppError::BadRequest);
        }
        if let Some(tn) = &self.ticket_number {
            if !is_valid_ticket_number(tn) {
                return Err(AppError::BadRequest);
            }
        }
        for line in &self.lines {
            // qty > 0, ≤ MAX_QUANTITY, máx 3 decimales.
            if line.qty <= Decimal::ZERO
                || line.qty > max_quantity()
                || line.qty.normalize().scale() > 3
            {
                return Err(AppError::BadRequest);
            }
            check_pct(line.discount_pct)?;
            check_amt(line.discount_amt)?;
        }
        if let Some(c) = self.cash_given {
            // > 0 y ≤ MAX_AMOUNT, 2 decimales.
            if c <= Decimal::ZERO || c > max_amount() || c.normalize().scale() > 2 {
                return Err(AppError::BadRequest);
            }
        }
        check_pct(self.ticket_discount_pct)?;
        check_amt(self.ticket_discount_amt)?;
        // Cobro a crédito: el vencimiento (si va) debe ser una fecha YYYY-MM-DD
        // válida y SOLO se admite en canal B2B/Online (una venta TPV es al contado).
        if let Some(due) = normalize_opt(&self.credit_due_date) {
            if !matches!(
                self.channel,
                Some(SaleChannel::B2b) | Some(SaleChannel::Online)
            ) {
                return Err(AppError::BadRequest);
            }
            parse_due_date(&due)?;
        }
        Ok(())
    }
}

/// Parsea una fecha de vencimiento de cobro `YYYY-MM-DD`.
fn parse_due_date(s: &str) -> Result<Date, AppError> {
    Date::parse(s, time::macros::format_description!("[year]-[month]-[day]"))
        .map_err(|_| AppError::BadRequest)
}

/// `POST /sales/ticket-block`: reserva un bloque de números de ticket.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReserveTicketBlock {
    pub store_id: Uuid,
    pub size: i64,
}

impl ReserveTicketBlock {
    pub fn validate(&self) -> Result<(), AppError> {
        if (1..=200).contains(&self.size) {
            Ok(())
        } else {
            Err(AppError::BadRequest)
        }
    }
}

fn is_valid_ticket_number(tn: &str) -> bool {
    let len = tn.chars().count();
    (1..=40).contains(&len)
        && tn
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Porcentaje de descuento: 0 ≤ v ≤ 100, máx 2 decimales.
fn check_pct(v: Option<Decimal>) -> Result<(), AppError> {
    match v {
        Some(p) if p < Decimal::ZERO || p > Decimal::from(HUNDRED) || p.normalize().scale() > 2 => {
            Err(AppError::BadRequest)
        }
        _ => Ok(()),
    }
}

/// Importe de descuento: 0 ≤ v ≤ MAX_AMOUNT, máx 2 decimales.
fn check_amt(v: Option<Decimal>) -> Result<(), AppError> {
    match v {
        Some(a) if a < Decimal::ZERO || a > max_amount() || a.normalize().scale() > 2 => {
            Err(AppError::BadRequest)
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Venta mínima válida (un producto), parametrizable en los campos fiscales F1.
    fn sale(tax: Option<&str>, name: Option<&str>) -> CreateSale {
        CreateSale {
            store_id: Uuid::nil(),
            client_id: None,
            ticket_number: None,
            lines: vec![CreateSaleLine {
                product_id: Uuid::nil(),
                qty: Decimal::ONE,
                discount_pct: None,
                discount_amt: None,
            }],
            payment_method: PaymentMethod::Card,
            cash_given: None,
            ticket_discount_pct: None,
            ticket_discount_amt: None,
            customer_tax_id: tax.map(str::to_owned),
            customer_name: name.map(str::to_owned),
            channel: None,
            credit_due_date: None,
        }
    }

    #[test]
    fn sin_datos_fiscales_es_f2_valida() {
        let s = sale(None, None);
        assert!(s.validate().is_ok());
        assert_eq!(s.fiscal_recipient(), None);
    }

    #[test]
    fn nif_y_razon_social_juntos_es_f1() {
        let s = sale(Some("  B11111111 "), Some(" Cliente SL "));
        assert!(s.validate().is_ok());
        // Normaliza (trim) ambos campos.
        assert_eq!(
            s.fiscal_recipient(),
            Some(("B11111111".to_owned(), "Cliente SL".to_owned()))
        );
    }

    #[test]
    fn solo_nif_sin_nombre_es_invalida() {
        assert!(sale(Some("B11111111"), None).validate().is_err());
        // Un nombre solo (sin NIF) también se rechaza.
        assert!(sale(None, Some("Cliente SL")).validate().is_err());
    }

    #[test]
    fn cadena_vacia_no_cuenta_como_destinatario() {
        // "" / espacios → como ausente: válida (F2) y sin destinatario.
        let s = sale(Some("   "), Some(""));
        assert!(s.validate().is_ok());
        assert_eq!(s.fiscal_recipient(), None);
    }

    #[test]
    fn nif_o_nombre_demasiado_largos_es_invalida() {
        assert!(sale(Some(&"X".repeat(21)), Some("Cliente"))
            .validate()
            .is_err());
        assert!(sale(Some("B1"), Some(&"N".repeat(121))).validate().is_err());
    }
}
