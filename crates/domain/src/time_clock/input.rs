//! Entradas del control horario (#153).

use serde::Deserialize;
use simpletpv_shared::AppError;
use uuid::Uuid;

use super::model::TimeClockType;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntry {
    pub store_id: Uuid,
    pub device_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub entry_type: String,
}

impl CreateEntry {
    pub fn parse_type(&self) -> Result<TimeClockType, AppError> {
        match self.entry_type.as_str() {
            "CLOCK_IN" => Ok(TimeClockType::ClockIn),
            "CLOCK_OUT" => Ok(TimeClockType::ClockOut),
            "BREAK_START" => Ok(TimeClockType::BreakStart),
            "BREAK_END" => Ok(TimeClockType::BreakEnd),
            _ => Err(AppError::BadRequest),
        }
    }
}

/// Filtros del historial / log (rango de fechas opcional).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQuery {
    pub store_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub from: Option<String>,
    pub to: Option<String>,
}
