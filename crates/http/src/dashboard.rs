//! Handlers HTTP del dashboard de KPIs (`/dashboard`, #154). Solo central →
//! ADMIN/MANAGER; todo lectura. Portados: sales-today y sales-kpis.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use serde::Serialize;
use simpletpv_auth::Role;
use simpletpv_domain::dashboard::period::{
    period_full_end, previous_full_period, resolve_period, CompareMode, DashboardPeriod, DateRange,
};
use simpletpv_domain::dashboard::{
    service, ArchetypeRotationItem, CumulativeMonth, DiscountByEmployeeItem, MarginKpis,
    ProductRankings, ProductRotationItem, RankedProduct, RankedProducts, RecentSaleItem,
    SalesByDayItem, SalesByEmployeeItem, SalesByFamilyItem, SalesByHourItem, SalesByPaymentItem,
    SalesByStoreItem, SalesGoal, SalesKpis, SalesToday, StockoutKpis,
};
use simpletpv_shared::AppError;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::state::AppState;

const MGMT_ROLES: [Role; 2] = [Role::Admin, Role::Manager];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesTodayQuery {
    #[serde(default)]
    compare: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingsQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    limit: Option<i64>,
    /// Proyección a una única lista `items` (#225): `sales` | `margin` | `rotation`.
    /// Ausente → respuesta legacy con las tres listas.
    #[serde(default)]
    rank_by: Option<String>,
}

/// Respuesta de `product-rankings`: forma legacy (tres listas) o, con `?rankBy=`,
/// una única lista `items` alcanzable por las piezas de gráfica.
#[derive(Serialize)]
#[serde(untagged)]
pub enum RankingsResponse {
    Full(ProductRankings),
    Ranked(RankedProducts),
}

/// Resuelve el `DateRange` del periodo desde una `PeriodQuery` (valida `custom`).
impl PeriodQuery {
    /// Token del periodo → enum (Today por defecto). Lo usa `sales-goal` para resolver también
    /// el periodo anterior completo y el fin de periodo, no solo el rango.
    fn period_enum(&self) -> Result<DashboardPeriod, ApiError> {
        Ok(match self.period.as_deref() {
            None => DashboardPeriod::Today,
            Some(s) => DashboardPeriod::parse(s).ok_or(AppError::BadRequest)?,
        })
    }

    fn range(&self) -> Result<DateRange, ApiError> {
        Ok(resolve_period(
            self.period_enum()?,
            now_utc(),
            self.from.as_deref(),
            self.to.as_deref(),
        )?)
    }
}

/// Solo filtro de tienda (sin periodo): `cumulative-month` siempre opera sobre el mes en curso.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
}

/// `recent-sales`: nº de tickets a devolver (por defecto 8, acotado en el servicio) + tienda.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentSalesQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    limit: Option<i64>,
}

/// `GET /dashboard/sales-today?compare=&storeId=`.
pub async fn sales_today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<SalesTodayQuery>,
) -> Result<Json<SalesToday>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let compare = match q.compare.as_deref() {
        None => CompareMode::Day,
        Some(s) => CompareMode::parse(s).ok_or(AppError::BadRequest)?,
    };
    Ok(Json(
        service::sales_today(state.db(), user.organization_id, q.store_id, compare).await?,
    ))
}

/// `GET /tpv/dashboard/sales-today` — recuento diario del TPV. Cualquier rol;
/// un CLERK queda acotado a su tienda (SEC-01), nunca al agregado de la org.
pub async fn tpv_sales_today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<SalesTodayQuery>,
) -> Result<Json<SalesToday>, ApiError> {
    let compare = match q.compare.as_deref() {
        None => CompareMode::Day,
        Some(s) => CompareMode::parse(s).ok_or(AppError::BadRequest)?,
    };
    Ok(Json(
        service::sales_today_tpv(
            state.db(),
            user.organization_id,
            user.user_id,
            user.role.is_org_wide(),
            q.store_id,
            compare,
        )
        .await?,
    ))
}

/// `GET /dashboard/sales-kpis?period=&from=&to=&storeId=`.
pub async fn sales_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<SalesKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-family`.
pub async fn sales_by_family(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByFamilyItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_family(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-hour`.
pub async fn sales_by_hour(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByHourItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_hour(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-day` — serie diaria (base del acumulado del informe).
pub async fn sales_by_day(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByDayItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_day(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-payment` — reparto por método de pago (donut, sección 04).
pub async fn sales_by_payment(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByPaymentItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_payment(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/recent-sales?limit=&storeId=` — últimas ventas (feed de actividad, sección 04).
pub async fn recent_sales(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<RecentSalesQuery>,
) -> Result<Json<Vec<RecentSaleItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::recent_sales(
            state.db(),
            user.organization_id,
            q.limit.unwrap_or(8),
            q.store_id,
        )
        .await?,
    ))
}

/// `GET /dashboard/sales-goal?period=&storeId=` — objetivo vs. periodo anterior (bullet, sección
/// 04). Resuelve aquí el periodo en curso, el periodo anterior completo (objetivo) y el fin de
/// periodo (denominador de la proyección), todo con las primitivas puras de `period`.
pub async fn sales_goal(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<SalesGoal>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let period = q.period_enum()?;
    let now = now_utc();
    let current = resolve_period(period, now, q.from.as_deref(), q.to.as_deref())?;
    let prev_full = previous_full_period(period, now, q.from.as_deref(), q.to.as_deref())?;
    let full_end = period_full_end(period, now, q.from.as_deref(), q.to.as_deref())?;
    Ok(Json(
        service::sales_goal(
            state.db(),
            user.organization_id,
            current,
            prev_full,
            full_end,
            now,
            q.store_id,
        )
        .await?,
    ))
}

/// `GET /dashboard/cumulative-month?storeId=` — acumulado del mes con proyección (área, sección 04).
pub async fn cumulative_month(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<StoreQuery>,
) -> Result<Json<CumulativeMonth>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    Ok(Json(
        service::cumulative_month(state.db(), user.organization_id, now_utc(), q.store_id).await?,
    ))
}

/// `GET /dashboard/discount-by-employee`.
pub async fn discount_by_employee(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<DiscountByEmployeeItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::discount_by_employee(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-employee`.
pub async fn sales_by_employee(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByEmployeeItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_employee(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/sales-by-store` — desglose multitienda (facturación, ticket medio, margen).
pub async fn sales_by_store(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<SalesByStoreItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::sales_by_store(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/margin-kpis`.
pub async fn margin_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<MarginKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::margin_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/stockout-kpis`.
pub async fn stockout_kpis(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<StockoutKpis>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::stockout_kpis(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/product-rankings?limit=`.
pub async fn product_rankings(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<RankingsQuery>,
) -> Result<Json<RankingsResponse>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    // Validar `rankBy` antes de consultar: rechaza valores fuera del contrato.
    let rank_by = q.rank_by.as_deref().map(parse_rank_by).transpose()?;
    let pq = PeriodQuery {
        period: q.period,
        from: q.from,
        to: q.to,
        store_id: q.store_id,
    };
    let range = pq.range()?;
    let rankings = service::product_rankings(
        state.db(),
        user.organization_id,
        range,
        pq.store_id,
        q.limit.unwrap_or(10),
    )
    .await?;
    Ok(Json(match rank_by {
        Some(dim) => RankingsResponse::Ranked(project_rankings(rankings, dim)),
        None => RankingsResponse::Full(rankings),
    }))
}

/// Dimensión de ranking solicitada vía `?rankBy=`.
#[derive(Clone, Copy)]
enum RankDimension {
    Sales,
    Margin,
    Rotation,
}

/// Parsea `rankBy` al enum; valor desconocido → 400 (BadRequest).
fn parse_rank_by(raw: &str) -> Result<RankDimension, ApiError> {
    match raw {
        "sales" => Ok(RankDimension::Sales),
        "margin" => Ok(RankDimension::Margin),
        "rotation" => Ok(RankDimension::Rotation),
        _ => Err(AppError::BadRequest.into()),
    }
}

/// Proyecta las tres listas a una única `items` con forma uniforme (`value`).
fn project_rankings(r: ProductRankings, dim: RankDimension) -> RankedProducts {
    let items = match dim {
        RankDimension::Sales => r
            .top_sales
            .into_iter()
            .map(|x| RankedProduct {
                product_id: x.product_id,
                name: x.name,
                value: x.total,
            })
            .collect(),
        RankDimension::Margin => r
            .top_margin
            .into_iter()
            .map(|x| RankedProduct {
                product_id: x.product_id,
                name: x.name,
                value: x.margin,
            })
            .collect(),
        RankDimension::Rotation => r
            .worst_rotation
            .into_iter()
            .map(|x| RankedProduct {
                product_id: x.product_id,
                name: x.name,
                value: x.units,
            })
            .collect(),
    };
    RankedProducts { items }
}

/// `GET /dashboard/product-rotation`.
pub async fn product_rotation(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<ProductRotationItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::product_rotation(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `GET /dashboard/archetype-rotation`.
pub async fn archetype_rotation(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Result<Json<Vec<ArchetypeRotationItem>>, ApiError> {
    user.require_role(&MGMT_ROLES)?;
    let range = q.range()?;
    Ok(Json(
        service::archetype_rotation(state.db(), user.organization_id, range, q.store_id).await?,
    ))
}

/// `now` en UTC para resolver el periodo en la capa HTTP (frontera con el reloj).
fn now_utc() -> time::PrimitiveDateTime {
    let n = time::OffsetDateTime::now_utc();
    time::PrimitiveDateTime::new(n.date(), n.time())
}

#[cfg(test)]
mod tests {
    use super::*;
    use simpletpv_domain::dashboard::{RankByMargin, RankBySales, RankByUnits};

    fn sample() -> ProductRankings {
        let id = Uuid::nil();
        ProductRankings {
            top_sales: vec![RankBySales {
                product_id: id,
                name: "A".into(),
                total: 40.0,
                units: 4.0,
            }],
            top_margin: vec![RankByMargin {
                product_id: id,
                name: "B".into(),
                margin: 12.5,
            }],
            worst_rotation: vec![RankByUnits {
                product_id: id,
                name: "C".into(),
                units: 1.0,
            }],
        }
    }

    #[test]
    fn parse_rank_by_accepts_contract_values() {
        assert!(matches!(parse_rank_by("sales"), Ok(RankDimension::Sales)));
        assert!(matches!(parse_rank_by("margin"), Ok(RankDimension::Margin)));
        assert!(matches!(
            parse_rank_by("rotation"),
            Ok(RankDimension::Rotation)
        ));
    }

    #[test]
    fn parse_rank_by_rejects_unknown_value() {
        assert!(parse_rank_by("bogus").is_err());
        assert!(parse_rank_by("").is_err());
    }

    #[test]
    fn project_sales_uses_total_as_value() {
        let p = project_rankings(sample(), RankDimension::Sales);
        assert_eq!(p.items.len(), 1);
        assert!((p.items[0].value - 40.0).abs() < 1e-9);
        assert_eq!(p.items[0].name, "A");
    }

    #[test]
    fn project_margin_uses_margin_as_value() {
        let p = project_rankings(sample(), RankDimension::Margin);
        assert!((p.items[0].value - 12.5).abs() < 1e-9);
        assert_eq!(p.items[0].name, "B");
    }

    #[test]
    fn project_rotation_uses_units_as_value() {
        let p = project_rankings(sample(), RankDimension::Rotation);
        assert!((p.items[0].value - 1.0).abs() < 1e-9);
        assert_eq!(p.items[0].name, "C");
    }

    #[test]
    fn ranked_response_serializes_as_items_array() {
        let p = project_rankings(sample(), RankDimension::Margin);
        let json = serde_json::to_value(RankingsResponse::Ranked(p)).unwrap();
        // `toRecords` del frontend toma la primera (única) lista del objeto.
        assert!(json.get("items").and_then(|v| v.as_array()).is_some());
        assert_eq!(json["items"][0]["value"], 12.5);
    }
}
