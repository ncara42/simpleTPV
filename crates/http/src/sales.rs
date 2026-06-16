//! Handlers HTTP de ventas (`/sales`) — core (crear, reservar bloque, listar,
//! consultar por ticket). `void`/recibos llegan en slices posteriores. Todas las
//! rutas exigen sesión.
//!
//! ALCANCE store-scope (SEC-01, paridad NestJS): las ESCRITURAS por tienda
//! (`create`, `ticket-block`) acotan al CLERK a sus tiendas (UserStore). `list`
//! también lo acota (subselect). `by-ticket` es org-scoped por RLS (como
//! `findByTicket` de NestJS, que no llama a `assertStoreAccess`).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::sales::model::{Sale, SaleWithLines, SalesPage, TicketBlock};
use simpletpv_domain::sales::service::{self, SalesFilter};
use simpletpv_domain::sales::{CreateSale, ReserveTicketBlock};
use simpletpv_shared::AppError;
use time::macros::format_description;
use time::{Date, PrimitiveDateTime, Time};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractor::AuthUser;
use crate::json::ValidatedJson;
use crate::state::AppState;

const DEFAULT_SALES_PAGE_SIZE: i64 = 20;

/// `POST /sales` — crea una venta (idempotente por `clientId`).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<CreateSale>,
) -> Result<(StatusCode, Json<SaleWithLines>), ApiError> {
    let sale = service::create(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role,
        body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(sale)))
}

/// `POST /sales/ticket-block` — reserva un bloque de números de ticket (offline).
pub async fn ticket_block(
    State(state): State<AppState>,
    user: AuthUser,
    ValidatedJson(body): ValidatedJson<ReserveTicketBlock>,
) -> Result<Json<TicketBlock>, ApiError> {
    body.validate()?;
    let block = service::reserve_ticket_block(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        body.store_id,
        body.size,
    )
    .await?;
    Ok(Json(block))
}

/// `POST /sales/:id/void` — anula una venta (ADMIN/MANAGER), org-scoped por RLS.
///
/// NO acota por tienda: paridad con NestJS (`voidSale` no llama a
/// `assertStoreAccess`; solo lo hacen `create` y `reserveTicketBlock`). El
/// CLERK no puede anular (la ruta exige ADMIN/MANAGER) y MANAGER es un rol
/// org-wide por diseño (`ORG_WIDE_ROLES`), así que la comprobación por tienda no
/// aplica aquí.
pub async fn void(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Sale>, ApiError> {
    user.require_role(&[Role::Admin, Role::Manager])?;
    let sale = service::void(state.db(), user.organization_id, id, user.user_id).await?;
    Ok(Json(sale))
}

/// `GET /sales/by-ticket/:ticketNumber`.
pub async fn by_ticket(
    State(state): State<AppState>,
    user: AuthUser,
    Path(ticket): Path<String>,
) -> Result<Json<SaleWithLines>, ApiError> {
    let sale = service::find_by_ticket(state.db(), user.organization_id, &ticket).await?;
    Ok(Json(sale))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    store_id: Option<Uuid>,
    #[serde(default)]
    user_id: Option<Uuid>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    page_size: Option<i64>,
}

/// `GET /sales` — historial paginado. CLERK acotado a sus tiendas (SEC-01).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<SalesPage>, ApiError> {
    if let Some(s) = &q.status {
        if s != "COMPLETED" && s != "VOIDED" {
            return Err(AppError::BadRequest.into());
        }
    }
    // Rango de fechas: `date` = un día; si no, `from`/`to` (ambos inclusive por día).
    let (from, to) = if let Some(d) = &q.date {
        let day = parse_day(d)?;
        (Some(start_of(day)), Some(start_of(next_day(day))))
    } else {
        let from = q.from.as_deref().map(parse_day).transpose()?.map(start_of);
        let to =
            q.to.as_deref()
                .map(parse_day)
                .transpose()?
                .map(|d| start_of(next_day(d)));
        (from, to)
    };

    let filter = SalesFilter {
        store_id: q.store_id,
        user_id: q.user_id,
        status: q.status,
        from,
        to,
        page: q.page.unwrap_or(1),
        page_size: q.page_size.unwrap_or(DEFAULT_SALES_PAGE_SIZE),
    };
    let page = service::list(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        filter,
    )
    .await?;
    Ok(Json(page))
}

/// Parsea `YYYY-MM-DD`. Entrada inválida → 400.
fn parse_day(s: &str) -> Result<Date, ApiError> {
    Date::parse(s, format_description!("[year]-[month]-[day]"))
        .map_err(|_| AppError::BadRequest.into())
}

fn start_of(day: Date) -> PrimitiveDateTime {
    PrimitiveDateTime::new(day, Time::MIDNIGHT)
}

fn next_day(day: Date) -> Date {
    day.saturating_add(time::Duration::days(1))
}
