use simpletpv_shared::AppError;
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::dashboard::{
    period::{resolve_period, DashboardPeriod},
    service::{
        discount_by_employee, margin_kpis, product_rankings, sales_by_employee, sales_by_family,
        sales_by_hour, sales_by_store, sales_kpis, stockout_kpis,
    },
};
use crate::purchases::service as purchases_service;
use crate::time_clock::service as time_clock_service;

// Despacha una herramienta invocada por el LLM y devuelve el resultado como JSON.
// Aplica redacción de campos sensibles por tool según el rol del usuario.
pub async fn dispatch_tool(
    pool: &PgPool,
    org: Uuid,
    tool_name: &str,
    args: &serde_json::Value,
    is_admin: bool,
) -> Result<serde_json::Value, AppError> {
    let now_odt = OffsetDateTime::now_utc();
    let now = time::PrimitiveDateTime::new(now_odt.date(), now_odt.time());

    match tool_name {
        "sales_kpis" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let kpis = sales_kpis(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(kpis).unwrap_or(serde_json::Value::Null))
        }

        "sales_by_hour" => {
            let range = if let Some(d) = args["day"].as_str() {
                let fmt = time::macros::format_description!("[year]-[month]-[day]");
                let date = time::Date::parse(d, fmt).map_err(|_| AppError::BadRequest)?;
                let from = time::PrimitiveDateTime::new(date, time::Time::MIDNIGHT);
                let to = from + time::Duration::days(1);
                crate::dashboard::period::DateRange { from, to }
            } else {
                resolve_period(DashboardPeriod::Today, now, None, None)?
            };
            let store_id = parse_uuid_opt(&args["store_id"]);
            let result = sales_by_hour(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "sales_by_family" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let result = sales_by_family(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "product_rankings" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let limit = args["limit"].as_i64().unwrap_or(10).clamp(1, 50);
            let result = product_rankings(pool, org, range, store_id, limit).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "stock_alerts" => {
            let range = resolve_period(DashboardPeriod::Today, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let kpis = stockout_kpis(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(kpis).unwrap_or(serde_json::Value::Null))
        }

        "purchase_orders" => {
            let status = args["status"].as_str().and_then(|s| {
                if s == "all" {
                    None
                } else {
                    Some(s.to_uppercase())
                }
            });
            let result = purchases_service::list(pool, org, status, None).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "sales_by_employee" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let by_sales = sales_by_employee(pool, org, range, store_id).await?;
            let by_disc = discount_by_employee(pool, org, range, store_id).await?;
            Ok(serde_json::json!({ "bySales": by_sales, "byDiscount": by_disc }))
        }

        "sales_by_store" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let result = sales_by_store(pool, org, range, None).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "margin_kpis" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let result = margin_kpis(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "stockout_kpis" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let result = stockout_kpis(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "discount_by_employee" => {
            let period = parse_period(&args["period"]);
            let range = resolve_period(period, now, None, None)?;
            let store_id = parse_uuid_opt(&args["store_id"]);
            let result = discount_by_employee(pool, org, range, store_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "time_clock_today" => {
            let store_id = parse_uuid_opt(&args["store_id"]).ok_or(AppError::BadRequest)?;
            let user_id = parse_uuid_opt(&args["user_id"]).unwrap_or(Uuid::nil());
            let result = time_clock_service::today(pool, org, store_id, user_id).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "stores_list" if is_admin => {
            use crate::stores::service as stores_service;
            let result = stores_service::find_all(pool, org).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        "users_list" if is_admin => {
            use crate::users::service as users_service;
            let result = users_service::find_all(pool, org).await?;
            let mut json = serde_json::to_value(result).unwrap_or(serde_json::Value::Null);
            // Redactar campos sensibles
            if let serde_json::Value::Array(arr) = &mut json {
                for user in arr.iter_mut() {
                    if let serde_json::Value::Object(m) = user {
                        m.remove("email");
                        m.remove("pinHash");
                        m.remove("passwordHash");
                    }
                }
            }
            Ok(json)
        }

        "supplier_prices_comparison" if is_admin => {
            use crate::suppliers::service as suppliers_service;
            let product_id = parse_uuid_opt(&args["product_id"]).ok_or(AppError::BadRequest)?;
            // comparison devuelve precios por proveedor para un producto
            let result = suppliers_service::list_prices(pool, org, None, Some(product_id)).await?;
            Ok(serde_json::to_value(result).unwrap_or(serde_json::Value::Null))
        }

        _ => Ok(serde_json::json!({
            "error": format!("Tool '{}' no disponible o no tienes permiso para usarla.", tool_name)
        })),
    }
}

fn parse_period(v: &serde_json::Value) -> DashboardPeriod {
    v.as_str()
        .and_then(DashboardPeriod::parse)
        .unwrap_or(DashboardPeriod::Today)
}

fn parse_uuid_opt(v: &serde_json::Value) -> Option<Uuid> {
    v.as_str().and_then(|s| Uuid::parse_str(s).ok())
}
