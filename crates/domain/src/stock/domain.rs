//! Dominio puro de stock (sin BD/cache/tenant) — port de `stock.domain.ts`.
//! Nivel semáforo, tipo de alerta, reparto FEFO, reparto de devolución a lotes y
//! cálculo de caducidad. Todo testeable de forma aislada.

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::Serialize;
use time::Date;
use uuid::Uuid;

use super::model::AlertType;

/// Ventana por defecto de "por caducar" (días).
pub const EXPIRY_THRESHOLD_DAYS: i64 = 30;

/// Nivel de stock tipo semáforo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StockLevel {
    Red,
    Yellow,
    Green,
}

/// Nivel derivado de `quantity` vs `minStock`: `red` agotado (≤0), `yellow` en/por
/// debajo del mínimo, `green` por encima.
pub fn stock_level(quantity: Decimal, min_stock: Decimal) -> StockLevel {
    if quantity <= Decimal::ZERO {
        StockLevel::Red
    } else if quantity <= min_stock {
        StockLevel::Yellow
    } else {
        StockLevel::Green
    }
}

/// Tipo de alerta que corresponde a un nivel, o `None` si no hay alerta. Espeja
/// `stock_level`: red→OUT_OF_STOCK, yellow→LOW_STOCK, green→ninguna.
pub fn alert_type_for(quantity: Decimal, min_stock: Decimal) -> Option<AlertType> {
    if quantity <= Decimal::ZERO {
        Some(AlertType::OutOfStock)
    } else if quantity <= min_stock {
        Some(AlertType::LowStock)
    } else {
        None
    }
}

/// Urgencia para ordenar alertas: OUT_OF_STOCK (0) antes que LOW_STOCK (1).
pub fn alert_urgency(alert: AlertType) -> u8 {
    match alert {
        AlertType::OutOfStock => 0,
        AlertType::LowStock => 1,
    }
}

/// Redondeo a 3 decimales (la cantidad de stock es `Decimal(12,3)`).
fn round3(n: Decimal) -> Decimal {
    n.round_dp(3)
}

// --- FEFO (first-expired-first-out, #126) ---

pub struct FefoBatch {
    pub lot_code: String,
    pub quantity: Decimal,
}

#[derive(Debug, PartialEq, Eq)]
pub struct FefoConsumed {
    pub lot_code: String,
    pub qty: Decimal,
}

#[derive(Debug, PartialEq, Eq)]
pub struct FefoAllocation {
    /// Cuánto consumir de cada lote, en el orden FEFO de entrada.
    pub consumed: Vec<FefoConsumed>,
    /// Cantidad que los lotes NO cubren: el caller la aplica como salida SIN lote
    /// (no bloquea — decisión Q3). 0 si los lotes cubren todo.
    pub shortfall: Decimal,
}

/// Reparte una salida de `qty` sobre `batches` YA ORDENADOS por caducidad
/// ascendente (NULLs al final; el caller los lee así). `qty` se asume > 0.
pub fn allocate_fefo(batches: &[FefoBatch], qty: Decimal) -> FefoAllocation {
    let mut remaining = round3(qty);
    let mut consumed = Vec::new();
    for b in batches {
        if remaining <= Decimal::ZERO {
            break;
        }
        if b.quantity <= Decimal::ZERO {
            continue;
        }
        let take = round3(remaining.min(b.quantity));
        consumed.push(FefoConsumed {
            lot_code: b.lot_code.clone(),
            qty: take,
        });
        remaining = round3(remaining - take);
    }
    FefoAllocation {
        consumed,
        shortfall: remaining.max(Decimal::ZERO),
    }
}

// --- Reingreso a lotes originales (devolución, #137) ---

pub struct ConsumedBatch {
    pub batch_id: Uuid,
    pub qty: Decimal,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ReturnPerBatch {
    pub batch_id: Uuid,
    pub qty: Decimal,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ReturnAllocation {
    pub per_batch: Vec<ReturnPerBatch>,
    /// Cantidad sin atribuir a ningún lote (faltante vendido sin lote, o lotes ya
    /// reingresados): se reingresa SIN lote.
    pub no_lot: Decimal,
}

/// Reparte el reingreso de `qty` sobre los lotes que la venta consumió (en orden
/// de consumo), capando cada lote por lo que salió de él menos lo ya reingresado
/// en devoluciones previas (`already_returned`). `qty` se asume > 0.
pub fn allocate_return_to_batches(
    consumed: &[ConsumedBatch],
    already_returned: &HashMap<Uuid, Decimal>,
    qty: Decimal,
) -> ReturnAllocation {
    let mut remaining = round3(qty);
    let mut per_batch = Vec::new();
    for c in consumed {
        if remaining <= Decimal::ZERO {
            break;
        }
        let already = already_returned
            .get(&c.batch_id)
            .copied()
            .unwrap_or(Decimal::ZERO);
        let capacity = round3(c.qty - already);
        if capacity <= Decimal::ZERO {
            continue;
        }
        let take = round3(remaining.min(capacity));
        per_batch.push(ReturnPerBatch {
            batch_id: c.batch_id,
            qty: take,
        });
        remaining = round3(remaining - take);
    }
    ReturnAllocation {
        per_batch,
        no_lot: remaining.max(Decimal::ZERO),
    }
}

// --- Caducidad (#126 slice 4) ---

/// Estado de caducidad de un lote relativo a hoy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExpiryStatus {
    Expired,
    Expiring,
    Ok,
}

/// Días enteros desde hoy hasta la caducidad (negativo si ya caducó, 0 si caduca
/// hoy). Las columnas son `@db.Date` (sin hora), así que es resta de fechas.
pub fn days_until(expiry: Date, today: Date) -> i64 {
    (expiry - today).whole_days()
}

/// Clasifica un lote por su caducidad vs hoy y la ventana `within_days`.
pub fn expiry_status(expiry: Date, today: Date, within_days: i64) -> ExpiryStatus {
    let days = days_until(expiry, today);
    if days < 0 {
        ExpiryStatus::Expired
    } else if days <= within_days {
        ExpiryStatus::Expiring
    } else {
        ExpiryStatus::Ok
    }
}

/// Fecha límite del barrido de caducidad: hoy + `within_days`. Un lote con
/// `expiryDate <= cutoff` está caducado o por caducar dentro de la ventana.
pub fn expiry_cutoff(today: Date, within_days: i64) -> Date {
    today.saturating_add(time::Duration::days(within_days))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(n: i64, scale: u32) -> Decimal {
        Decimal::new(n, scale)
    }

    #[test]
    fn stock_level_semaforo() {
        assert_eq!(stock_level(d(0, 0), d(10, 0)), StockLevel::Red);
        assert_eq!(stock_level(d(-5, 0), d(10, 0)), StockLevel::Red);
        assert_eq!(stock_level(d(10, 0), d(10, 0)), StockLevel::Yellow);
        assert_eq!(stock_level(d(5, 0), d(10, 0)), StockLevel::Yellow);
        assert_eq!(stock_level(d(11, 0), d(10, 0)), StockLevel::Green);
        // minStock 0: solo red (≤0) o green (>0).
        assert_eq!(stock_level(d(1, 0), d(0, 0)), StockLevel::Green);
    }

    #[test]
    fn alert_type_espeja_nivel() {
        assert_eq!(
            alert_type_for(d(0, 0), d(10, 0)),
            Some(AlertType::OutOfStock)
        );
        assert_eq!(alert_type_for(d(5, 0), d(10, 0)), Some(AlertType::LowStock));
        assert_eq!(alert_type_for(d(11, 0), d(10, 0)), None);
    }

    #[test]
    fn fefo_consume_por_orden_y_reporta_faltante() {
        // batches ya ordenados FEFO: early primero.
        let batches = vec![
            FefoBatch {
                lot_code: "EARLY".into(),
                quantity: d(3, 0),
            },
            FefoBatch {
                lot_code: "LATE".into(),
                quantity: d(10, 0),
            },
        ];
        // Vende 5 → 3 de EARLY + 2 de LATE, sin faltante.
        let a = allocate_fefo(&batches, d(5, 0));
        assert_eq!(
            a.consumed,
            vec![
                FefoConsumed {
                    lot_code: "EARLY".into(),
                    qty: d(3, 0)
                },
                FefoConsumed {
                    lot_code: "LATE".into(),
                    qty: d(2, 0)
                },
            ]
        );
        assert_eq!(a.shortfall, Decimal::ZERO);
    }

    #[test]
    fn fefo_faltante_cuando_no_cubre() {
        let batches = vec![FefoBatch {
            lot_code: "L".into(),
            quantity: d(8, 0),
        }];
        let a = allocate_fefo(&batches, d(20, 0));
        assert_eq!(
            a.consumed,
            vec![FefoConsumed {
                lot_code: "L".into(),
                qty: d(8, 0)
            }]
        );
        assert_eq!(a.shortfall, d(12, 0));
    }

    #[test]
    fn fefo_salta_lotes_vacios() {
        let batches = vec![
            FefoBatch {
                lot_code: "EMPTY".into(),
                quantity: d(0, 0),
            },
            FefoBatch {
                lot_code: "OK".into(),
                quantity: d(5, 0),
            },
        ];
        let a = allocate_fefo(&batches, d(2, 0));
        assert_eq!(
            a.consumed,
            vec![FefoConsumed {
                lot_code: "OK".into(),
                qty: d(2, 0)
            }]
        );
    }

    #[test]
    fn return_capa_por_lo_salido_menos_ya_reingresado() {
        let b1 = Uuid::from_u128(1);
        let b2 = Uuid::from_u128(2);
        let consumed = vec![
            ConsumedBatch {
                batch_id: b1,
                qty: d(3, 0),
            },
            ConsumedBatch {
                batch_id: b2,
                qty: d(2, 0),
            },
        ];
        let mut already = HashMap::new();
        already.insert(b1, d(1, 0)); // ya reingresado 1 del lote 1 → capacidad 2
                                     // Devolver 4 → 2 a b1 (cap 2) + 2 a b2 (cap 2), sin sobrante.
        let r = allocate_return_to_batches(&consumed, &already, d(4, 0));
        assert_eq!(
            r.per_batch,
            vec![
                ReturnPerBatch {
                    batch_id: b1,
                    qty: d(2, 0)
                },
                ReturnPerBatch {
                    batch_id: b2,
                    qty: d(2, 0)
                },
            ]
        );
        assert_eq!(r.no_lot, Decimal::ZERO);
    }

    #[test]
    fn return_excedente_cae_en_no_lot() {
        let b1 = Uuid::from_u128(1);
        let consumed = vec![ConsumedBatch {
            batch_id: b1,
            qty: d(2, 0),
        }];
        let r = allocate_return_to_batches(&consumed, &HashMap::new(), d(5, 0));
        assert_eq!(
            r.per_batch,
            vec![ReturnPerBatch {
                batch_id: b1,
                qty: d(2, 0)
            }]
        );
        assert_eq!(r.no_lot, d(3, 0));
    }

    #[test]
    fn caducidad_estado_y_dias() {
        let today = Date::from_calendar_date(2026, time::Month::June, 16).unwrap();
        let past = Date::from_calendar_date(2026, time::Month::June, 6).unwrap();
        let soon = Date::from_calendar_date(2026, time::Month::June, 26).unwrap();
        let far = Date::from_calendar_date(2026, time::Month::December, 1).unwrap();
        assert_eq!(days_until(past, today), -10);
        assert_eq!(days_until(soon, today), 10);
        assert_eq!(expiry_status(past, today, 30), ExpiryStatus::Expired);
        assert_eq!(expiry_status(soon, today, 30), ExpiryStatus::Expiring);
        assert_eq!(expiry_status(far, today, 30), ExpiryStatus::Ok);
        // ventana estrecha (3 días): soon ya no entra.
        assert_eq!(expiry_status(soon, today, 3), ExpiryStatus::Ok);
        assert_eq!(
            expiry_cutoff(today, 30),
            Date::from_calendar_date(2026, time::Month::July, 16).unwrap()
        );
    }
}
