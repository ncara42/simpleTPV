//! Dashboard de KPIs del backoffice (#154, Fase 4). De momento se porta la base
//! pura de resolución de periodos ([`period`]); los endpoints de agregación
//! (ventas/márgenes/rotación/rankings) se construyen sobre ella.

pub mod period;

pub use period::{
    comparison_starts, delta_pct, previous_range, resolve_period, CompareMode, ComparisonStarts,
    DashboardPeriod, DateRange,
};
