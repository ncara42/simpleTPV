//! Dashboard de KPIs del backoffice (#154, Fase 4). Base pura de periodos
//! ([`period`]) + endpoints de agregación ([`service`]). Portados: sales-today
//! y sales-kpis (las KPI card cabecera). Pendientes: margin/stockout/rankings/
//! rotación/familia/hora/empleado.

pub mod model;
pub mod period;
pub mod service;

pub use model::{SalesKpis, SalesToday};
pub use period::{
    comparison_starts, delta_pct, previous_range, resolve_period, CompareMode, ComparisonStarts,
    DashboardPeriod, DateRange,
};
