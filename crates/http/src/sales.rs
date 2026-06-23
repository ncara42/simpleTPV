//! Handlers HTTP de ventas (`/sales`) — core (crear, reservar bloque, listar,
//! consultar por ticket). `void`/recibos llegan en slices posteriores. Todas las
//! rutas exigen sesión.
//!
//! ALCANCE store-scope (SEC-01, paridad NestJS): las ESCRITURAS por tienda
//! (`create`, `ticket-block`) acotan al CLERK a sus tiendas (UserStore). `list`
//! también lo acota (subselect). `by-ticket` es org-scoped por RLS (como
//! `findByTicket` de NestJS, que no llama a `assertStoreAccess`).

use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use simpletpv_auth::Role;
use simpletpv_domain::receipt::render_receipt_html;
use simpletpv_domain::sales::model::{
    Sale, SaleWithLines, SalesPage, SalesStats, TicketBlock, TicketData,
};
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
    // Evento SSE sale.completed (#32, #154): al volver del servicio la tx ya
    // commiteó → semántica after-commit. Best-effort, no afecta la respuesta.
    state.events().publish(
        user.organization_id,
        crate::events::AppEvent {
            event_type: "sale.completed".to_owned(),
            data: serde_json::json!({
                "saleId": sale.sale.id,
                "storeId": sale.sale.store_id,
                "ticketNumber": sale.sale.ticket_number,
                "total": sale.sale.total.to_string(),
            }),
        },
    );
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

/// `GET /sales/:id/ticket` — datos del ticket/factura (JSON). Accesible a todos
/// los roles con sesión (paridad NestJS), org-scoped por RLS.
pub async fn ticket(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TicketData>, ApiError> {
    let ticket = service::get_ticket(state.db(), user.organization_id, id).await?;
    Ok(Json(ticket))
}

/// `GET /sales/:id/receipt` — documento HTML imprimible. CSP estricta y `nosniff`
/// (el documento es autocontenido: solo permite estilos inline propios).
pub async fn receipt(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let ticket = service::get_ticket(state.db(), user.organization_id, id).await?;
    let html = render_receipt_html(&ticket);
    let headers = [
        (header::CONTENT_TYPE, "text/html; charset=utf-8"),
        (
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        ),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
    ];
    Ok((headers, html).into_response())
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
    family_id: Option<Uuid>,
    #[serde(default)]
    q: Option<String>,
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

/// Construye el `SalesFilter` a partir del `ListQuery` (mismo mapeo para `/sales` y
/// `/sales/stats`): valida `status`, resuelve el rango de fechas (`date` = un día;
/// si no, `from`/`to` inclusive por día) y traslada los filtros tal cual.
fn build_filter(q: ListQuery) -> Result<SalesFilter, ApiError> {
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

    Ok(SalesFilter {
        store_id: q.store_id,
        user_id: q.user_id,
        status: q.status,
        family_id: q.family_id,
        q: q.q,
        from,
        to,
        page: q.page.unwrap_or(1),
        page_size: q.page_size.unwrap_or(DEFAULT_SALES_PAGE_SIZE),
    })
}

/// `GET /sales` — historial paginado. CLERK acotado a sus tiendas (SEC-01).
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<SalesPage>, ApiError> {
    let filter = build_filter(q)?;
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

/// `GET /sales/stats` (S-10) — estadísticas embebidas de la page Ventas: serie
/// temporal diaria + KPIs del periodo + comparativa con el periodo anterior. Mismo
/// `ListQuery`, mismo scope (RLS + CLERK acotado a sus tiendas) y mismos filtros que
/// `GET /sales`. ADITIVO: no altera el comportamiento de `/sales`.
pub async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<SalesStats>, ApiError> {
    let filter = build_filter(q)?;
    let stats = service::sales_stats(
        state.db(),
        user.organization_id,
        user.user_id,
        user.role.is_org_wide(),
        filter,
    )
    .await?;
    Ok(Json(stats))
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
