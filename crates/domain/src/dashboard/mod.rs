//! Dashboard de KPIs del backoffice (#154, Fase 4). Base pura de periodos
//! ([`period`]) + los endpoints de agregación ([`service`]), todos read-only.

pub mod model;
pub mod period;
pub mod service;

pub use model::{
    ArchetypeRotationItem, CumulativeMonth, DiscountByEmployeeItem, MarginKpis, ProductRankings,
    ProductRotationItem, RankByMargin, RankBySales, RankByUnits, RankedProduct, RankedProducts,
    RecentSaleItem, SalesByDayItem, SalesByEmployeeItem, SalesByFamilyItem, SalesByHourItem,
    SalesByPaymentItem, SalesByStoreItem, SalesGoal, SalesKpis, SalesToday, StockoutKpis,
};
pub use period::{
    comparison_starts, delta_pct, month_cumulative_bounds, period_full_end, previous_full_period,
    previous_range, resolve_period, CompareMode, ComparisonStarts, DashboardPeriod, DateRange,
    MonthCumulativeBounds,
};
