//! Modelos del control horario (#153).

use serde::Serialize;
use time::PrimitiveDateTime;
use uuid::Uuid;

pg_text_enum! {
    /// Tipo de fichaje (enum `TimeClockType` de Prisma).
    pub enum TimeClockType {
        ClockIn = "CLOCK_IN",
        ClockOut = "CLOCK_OUT",
        BreakStart = "BREAK_START",
        BreakEnd = "BREAK_END",
    }
}

/// Fila `TimeClockEntry` (salida JSON, `type` aliased a `entry_type` en SQL).
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeClockEntry {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub store_id: Uuid,
    pub user_id: Uuid,
    pub device_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub entry_type: TimeClockType,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}

/// Resumen de la jornada de hoy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodaySummary {
    pub status: String,
    pub worked_ms: i64,
    pub break_ms: i64,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub running_since: Option<PrimitiveDateTime>,
    pub entries: Vec<TimeClockEntry>,
}

/// Jornada agregada (usuario + tienda + día) para el historial de gestión.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JornadaRow {
    pub user_id: Uuid,
    pub user_name: String,
    pub store_id: Uuid,
    pub store_name: String,
    pub date: String,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub first_in: Option<PrimitiveDateTime>,
    #[serde(serialize_with = "crate::serde_helpers::iso_opt_utc")]
    pub last_out: Option<PrimitiveDateTime>,
    pub worked_ms: i64,
    pub break_ms: i64,
}

/// Entrada en bruto del log de una tienda.
#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub user_name: String,
    #[serde(rename = "type")]
    pub entry_type: TimeClockType,
    #[serde(serialize_with = "crate::serde_helpers::iso_utc")]
    pub created_at: PrimitiveDateTime,
}
