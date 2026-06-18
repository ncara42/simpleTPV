//! Servicio de caja y movimientos de efectivo (#145/#146) — port de
//! `cash-sessions.service.ts`. Cierre con cuadre y serialización TOCTOU (SELECT
//! FOR UPDATE de la sesión, RACE-02). Flujo de aprobación de movimientos
//! request→approve/deny. Todo bajo `with_tenant_tx` (RLS).

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::store_access::has_store_access;

use super::domain::{compute_difference, compute_expected};
use super::input::{CashMovementInput, CloseCashSession, OpenCashSession};
use super::model::{
    CashMovement, CashMovementType, CashSession, CashSessionStatus, PendingMovement, StoreRef,
    UserRef,
};

/// Struct interno de mapeo SQLx para `list_pending`. Los campos anidados
/// (`store`, `requested_by`) se construyen manualmente a partir de este plano.
#[derive(sqlx::FromRow)]
struct PendingRow {
    id: Uuid,
    cash_session_id: Uuid,
    store_id: Uuid,
    store_name: String,
    movement_type: CashMovementType,
    amount: Decimal,
    reason: String,
    requested_by_id: Uuid,
    requested_by_name: String,
    created_at: time::PrimitiveDateTime,
}

const SESSION_COLS: &str = r#"id, "organizationId" AS organization_id, "storeId" AS store_id,
    "userId" AS user_id, "openingAmount" AS opening_amount, "closingAmount" AS closing_amount,
    "expectedAmount" AS expected_amount, difference, status::text AS status,
    "openedAt" AS opened_at, "closedAt" AS closed_at"#;

const MOVEMENT_COLS: &str = r#"id, "organizationId" AS organization_id,
    "cashSessionId" AS cash_session_id, "storeId" AS store_id, "userId" AS user_id,
    type::text AS movement_type, amount, reason, status::text AS status,
    "requestedById" AS requested_by_id, "reviewedById" AS reviewed_by_id,
    "reviewedAt" AS reviewed_at, "targetStoreId" AS target_store_id, "createdAt" AS created_at"#;

async fn load_session(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<CashSession>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {SESSION_COLS} FROM "CashSession" WHERE id = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as(&sql)
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
}

/// Lock pesimista de la fila de la sesión (serializa cierre vs movimientos).
async fn lock_session(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(r#"SELECT id FROM "CashSession" WHERE id = $1 FOR UPDATE"#)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// Resuelve la central destino para TRANSFER_OUT; `Err` lógico si no hay central
/// o si el origen es la propia central.
async fn resolve_central(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    source_store: Uuid,
) -> Result<Result<Uuid, AppError>, sqlx::Error> {
    let central: Option<Uuid> = sqlx::query_scalar(
        r#"SELECT id FROM "Store" WHERE "organizationId" = $1 AND "isCentral" = true"#,
    )
    .bind(org)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(match central {
        None => Err(AppError::BadRequest),
        Some(c) if c == source_store => Err(AppError::BadRequest),
        Some(c) => Ok(c),
    })
}

/// `POST /cash-sessions/open` — abre caja (una OPEN por tienda).
pub async fn open(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: OpenCashSession,
) -> Result<CashSession, AppError> {
    input.validate()?;
    let store_id = input.store_id;
    let result: Result<CashSession, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        let existing: Option<(Uuid,)> = sqlx::query_as(
            r#"SELECT id FROM "CashSession" WHERE "storeId" = $1 AND "organizationId" = $2 AND status = 'OPEN'::"CashSessionStatus""#,
        )
        .bind(store_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        if existing.is_some() {
            return Ok(Err(AppError::BadRequest)); // ya hay caja abierta
        }
        let s: CashSession = sqlx::query_as(&format!(
            r#"INSERT INTO "CashSession" (id, "organizationId", "storeId", "userId", "openingAmount", status)
               VALUES ($1, $2, $3, $4, $5, 'OPEN'::"CashSessionStatus") RETURNING {SESSION_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .bind(input.opening_amount)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Ok(s))
    })
    .await?;
    result
}

/// `POST /cash-sessions/:id/close` — cierra con cuadre (TOCTOU serializado).
pub async fn close(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
    input: CloseCashSession,
) -> Result<CashSession, AppError> {
    input.validate()?;
    let result: Result<CashSession, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        lock_session(tx, id).await?;
        let Some(session) = load_session(tx, org, id).await? else {
            return Ok(Err(AppError::NotFound));
        };
        if !is_org_wide && !has_store_access(tx, user_id, session.store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        if session.status == CashSessionStatus::Closed {
            return Ok(Err(AppError::BadRequest));
        }

        // Auto-denegación de PENDING al cerrar (#146 D-6).
        sqlx::query(
            r#"UPDATE "CashMovement" SET status = 'DENIED'::"CashMovementStatus", "reviewedById" = $1, "reviewedAt" = now()
               WHERE "organizationId" = $2 AND "cashSessionId" = $3 AND status = 'PENDING'::"CashMovementStatus""#,
        )
        .bind(user_id)
        .bind(org)
        .bind(id)
        .execute(&mut **tx)
        .await?;

        let cash_sales: Decimal = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(total), 0) FROM "Sale"
               WHERE "organizationId" = $1 AND "storeId" = $2 AND status = 'COMPLETED'::"SaleStatus"
                 AND "paymentMethod" = 'CASH'::"PaymentMethod" AND "createdAt" >= $3"#,
        )
        .bind(org)
        .bind(session.store_id)
        .bind(session.opened_at)
        .fetch_one(&mut **tx)
        .await?;

        // Neto de movimientos APPROVED: IN suma, OUT/TRANSFER_OUT restan.
        let movement_net: Decimal = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(CASE WHEN type = 'IN'::"CashMovementType" THEN amount ELSE -amount END), 0)
               FROM "CashMovement"
               WHERE "organizationId" = $1 AND "cashSessionId" = $2 AND status = 'APPROVED'::"CashMovementStatus""#,
        )
        .bind(org)
        .bind(id)
        .fetch_one(&mut **tx)
        .await?;

        // Reembolsos en efectivo del turno (SEC-11): sin ticket o venta en efectivo.
        let cash_refunds: Decimal = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(r.total), 0) FROM "Return" r
               LEFT JOIN "Sale" s ON s.id = r."saleId"
               WHERE r."organizationId" = $1 AND r."storeId" = $2 AND r."createdAt" >= $3
                 AND (r."saleId" IS NULL OR s."paymentMethod" = 'CASH'::"PaymentMethod")"#,
        )
        .bind(org)
        .bind(session.store_id)
        .bind(session.opened_at)
        .fetch_one(&mut **tx)
        .await?;

        let expected = compute_expected(session.opening_amount, cash_sales, movement_net, cash_refunds);
        let difference = compute_difference(input.counted_amount, expected);

        let updated = sqlx::query(
            r#"UPDATE "CashSession" SET status = 'CLOSED'::"CashSessionStatus",
                 "closingAmount" = $3, "expectedAmount" = $4, difference = $5, "closedAt" = now()
               WHERE id = $1 AND "organizationId" = $2 AND status = 'OPEN'::"CashSessionStatus""#,
        )
        .bind(id)
        .bind(org)
        .bind(input.counted_amount)
        .bind(expected)
        .bind(difference)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if updated == 0 {
            return Ok(Err(AppError::BadRequest));
        }
        let closed = load_session(tx, org, id).await?.expect("cerrada");
        Ok(Ok(closed))
    })
    .await?;
    result
}

/// `GET /cash-sessions/current?storeId=` — sesión OPEN de una tienda (o null).
pub async fn current(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
) -> Result<Option<CashSession>, AppError> {
    let result: Result<Option<CashSession>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let s: Option<CashSession> = sqlx::query_as(&format!(
                r#"SELECT {SESSION_COLS} FROM "CashSession"
                   WHERE "storeId" = $1 AND "organizationId" = $2 AND status = 'OPEN'::"CashSessionStatus""#,
            ))
            .bind(store_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            Ok(Ok(s))
        })
        .await?;
    result
}

/// `GET /cash-sessions/closed?storeId=&limit=` — registro de cierres (#145).
pub async fn list_closed(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
    limit: i64,
) -> Result<Vec<CashSession>, AppError> {
    let limit = limit.clamp(1, 100);
    let result: Result<Vec<CashSession>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let rows: Vec<CashSession> = sqlx::query_as(&format!(
                r#"SELECT {SESSION_COLS} FROM "CashSession"
                   WHERE "storeId" = $1 AND "organizationId" = $2 AND status = 'CLOSED'::"CashSessionStatus"
                   ORDER BY "closedAt" DESC LIMIT $3"#,
            ))
            .bind(store_id)
            .bind(org)
            .bind(limit)
            .fetch_all(&mut **tx)
            .await?;
            Ok(Ok(rows))
        })
        .await?;
    result
}

/// `GET /cash-sessions/:id/movements` — movimientos de una sesión.
pub async fn movements(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
) -> Result<Vec<CashMovement>, AppError> {
    let result: Result<Vec<CashMovement>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(session) = load_session(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if !is_org_wide && !has_store_access(tx, user_id, session.store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let rows: Vec<CashMovement> = sqlx::query_as(&format!(
                r#"SELECT {MOVEMENT_COLS} FROM "CashMovement"
                   WHERE "cashSessionId" = $1 AND "organizationId" = $2 ORDER BY "createdAt" DESC"#,
            ))
            .bind(id)
            .bind(org)
            .fetch_all(&mut **tx)
            .await?;
            Ok(Ok(rows))
        })
        .await?;
    result
}

/// Alta de movimiento. `direct` = true: nace APPROVED (legacy ADMIN/MANAGER);
/// false: PENDING (solicitud, #146). Serializa con el cierre (FOR UPDATE).
async fn insert_movement(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
    input: CashMovementInput,
    direct: bool,
) -> Result<CashMovement, AppError> {
    let movement_type = input.validate()?;
    let result: Result<CashMovement, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            lock_session(tx, id).await?;
            let Some(session) = load_session(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if !is_org_wide && !has_store_access(tx, user_id, session.store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            if session.status != CashSessionStatus::Open {
                return Ok(Err(AppError::BadRequest)); // caja ya cerrada
            }
            let target_store_id = if movement_type == CashMovementType::TransferOut {
                match resolve_central(tx, org, session.store_id).await? {
                    Ok(c) => Some(c),
                    Err(e) => return Ok(Err(e)),
                }
            } else {
                None
            };
            let (status, reviewed_by, reviewed_at_now) = if direct {
                ("APPROVED", Some(user_id), true)
            } else {
                ("PENDING", None, false)
            };
            let mov: CashMovement = sqlx::query_as(&format!(
                r#"INSERT INTO "CashMovement"
                 (id, "organizationId", "cashSessionId", "storeId", "userId", type, amount, reason,
                  status, "requestedById", "reviewedById", "reviewedAt", "targetStoreId")
               VALUES ($1, $2, $3, $4, $5, $6::"CashMovementType", $7, $8,
                 $9::"CashMovementStatus", $5, $10, {}, $11)
               RETURNING {MOVEMENT_COLS}"#,
                if reviewed_at_now { "now()" } else { "NULL" }
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(id)
            .bind(session.store_id)
            .bind(user_id)
            .bind(movement_type)
            .bind(input.amount)
            .bind(input.reason.trim())
            .bind(status)
            .bind(reviewed_by)
            .bind(target_store_id)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(mov))
        })
        .await?;
    result
}

/// `POST /cash-sessions/:id/movements` — alta directa (APPROVED), ADMIN/MANAGER.
pub async fn create_movement(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
    input: CashMovementInput,
) -> Result<CashMovement, AppError> {
    insert_movement(pool, org, user_id, is_org_wide, id, input, true).await
}

/// `POST /cash-sessions/:id/movements/request` — solicitud (PENDING), cualquier rol.
pub async fn request_movement(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
    input: CashMovementInput,
) -> Result<CashMovement, AppError> {
    let mov = insert_movement(pool, org, user_id, is_org_wide, id, input, false).await?;
    Ok(mov)
}

/// `GET /cash-sessions/movements/pending` — solicitudes PENDING del tenant (#146).
pub async fn list_pending(pool: &PgPool, org: Uuid) -> Result<Vec<PendingMovement>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<PendingRow> = sqlx::query_as(
            r#"SELECT m.id, m."cashSessionId" AS cash_session_id, m."storeId" AS store_id,
                 st.name AS store_name, m.type::text AS movement_type, m.amount, m.reason,
                 m."requestedById" AS requested_by_id, u.name AS requested_by_name,
                 m."createdAt" AS created_at
               FROM "CashMovement" m
               JOIN "Store" st ON st.id = m."storeId"
               JOIN "User" u ON u.id = m."requestedById"
               WHERE m."organizationId" = $1 AND m.status = 'PENDING'::"CashMovementStatus"
               ORDER BY m."createdAt" DESC"#,
        )
        .bind(org)
        .fetch_all(&mut **tx)
        .await?;
        let result = rows
            .into_iter()
            .map(|r| PendingMovement {
                id: r.id,
                cash_session_id: r.cash_session_id,
                store_id: r.store_id,
                store: StoreRef { name: r.store_name },
                movement_type: r.movement_type,
                amount: r.amount,
                reason: r.reason,
                requested_by_id: r.requested_by_id,
                requested_by: UserRef {
                    name: r.requested_by_name,
                },
                created_at: r.created_at,
            })
            .collect();
        Ok(result)
    })
    .await
}

/// `POST /cash-sessions/movements/:movId/approve` — PENDING→APPROVED (sesión OPEN).
pub async fn approve_movement(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    mov_id: Uuid,
) -> Result<CashMovement, AppError> {
    let result: Result<CashMovement, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        let mov: Option<(Uuid, Uuid)> = sqlx::query_as(
            r#"SELECT "storeId", "cashSessionId" FROM "CashMovement" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(mov_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((store_id, session_id)) = mov else {
            return Ok(Err(AppError::NotFound));
        };
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        lock_session(tx, session_id).await?;
        let status: Option<String> = sqlx::query_scalar(
            r#"SELECT status::text FROM "CashSession" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(session_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        if status.as_deref() != Some("OPEN") {
            return Ok(Err(AppError::BadRequest));
        }
        let updated = sqlx::query(
            r#"UPDATE "CashMovement" SET status = 'APPROVED'::"CashMovementStatus", "reviewedById" = $3, "reviewedAt" = now()
               WHERE id = $1 AND "organizationId" = $2 AND status = 'PENDING'::"CashMovementStatus""#,
        )
        .bind(mov_id)
        .bind(org)
        .bind(user_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if updated == 0 {
            return Ok(Err(AppError::BadRequest));
        }
        let mov: CashMovement = sqlx::query_as(&format!(
            r#"SELECT {MOVEMENT_COLS} FROM "CashMovement" WHERE id = $1 AND "organizationId" = $2"#,
        ))
        .bind(mov_id)
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Ok(mov))
    })
    .await?;
    result
}

/// `POST /cash-sessions/movements/:movId/deny` — PENDING→DENIED (no toca cuadre).
pub async fn deny_movement(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    mov_id: Uuid,
) -> Result<CashMovement, AppError> {
    let result: Result<CashMovement, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        let mov: Option<(Uuid,)> = sqlx::query_as(
            r#"SELECT "storeId" FROM "CashMovement" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(mov_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((store_id,)) = mov else {
            return Ok(Err(AppError::NotFound));
        };
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }
        let updated = sqlx::query(
            r#"UPDATE "CashMovement" SET status = 'DENIED'::"CashMovementStatus", "reviewedById" = $3, "reviewedAt" = now()
               WHERE id = $1 AND "organizationId" = $2 AND status = 'PENDING'::"CashMovementStatus""#,
        )
        .bind(mov_id)
        .bind(org)
        .bind(user_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if updated == 0 {
            return Ok(Err(AppError::BadRequest));
        }
        let mov: CashMovement = sqlx::query_as(&format!(
            r#"SELECT {MOVEMENT_COLS} FROM "CashMovement" WHERE id = $1 AND "organizationId" = $2"#,
        ))
        .bind(mov_id)
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Ok(mov))
    })
    .await?;
    result
}
