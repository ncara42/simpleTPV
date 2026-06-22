//! Dashboard de KPIs del backoffice (#154, Fase 4). Base pura de periodos
//! ([`period`]) + los 11 endpoints de agregación ([`service`]), todos read-only.

pub mod model;
pub mod period;
pub mod service;

pub use model::{
    ArchetypeRotationItem, DiscountByEmployeeItem, MarginKpis, ProductRankings,
    ProductRotationItem, SalesByEmployeeItem, SalesByFamilyItem, SalesByHourItem, SalesByStoreItem,
    SalesKpis, SalesToday, StockoutKpis,
};
pub use period::{
    comparison_starts, delta_pct, previous_range, resolve_period, CompareMode, ComparisonStarts,
    DashboardPeriod, DateRange,
};
