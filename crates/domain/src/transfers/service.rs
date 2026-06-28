//! Servicio de traspasos entre tiendas (#153) — port de `transfers.service.ts`.
//! Máquina de estados DRAFT→SENT→RECEIVED→CLOSED con transiciones atómicas y
//! condicionales (updateMany ⇒ dos transiciones concurrentes no tienen ambas
//! éxito). El envío decrementa el ORIGEN (FEFO si lleva lote) y la recepción
//! incrementa el DESTINO por lo RECIBIDO (recreando los lotes viajeros). RLS.

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::stock::model::MovementType;
use crate::stock::service::{
    apply_fefo_outflow, apply_movement, apply_transfer_receipt, ApplyMovementInput,
};
use crate::store_access::has_store_access;

use super::input::{CreateAttachment, CreateMessage, CreateTransfer, ReceiveTransfer};
use super::model::{
    Transfer, TransferAttachment, TransferAttachmentRow, TransferLine, TransferLineRow,
    TransferMessage, TransferMessageRow, TransferStatus, TransferWithLines,
};

const ATTACHMENT_COLS: &str = r#"id, "transferLineId" AS transfer_line_id,
    "mimeType" AS mime_type, "dataUrl" AS data_url, caption, "createdAt" AS created_at"#;

const MESSAGE_COLS: &str = r#"id, author, body, "mimeType" AS mime_type,
    "dataUrl" AS data_url, "createdAt" AS created_at"#;

const TRANSFER_COLS: &str = r#"id, "organizationId" AS organization_id,
    "originStoreId" AS origin_store_id, "destStoreId" AS dest_store_id, status::text AS status,
    notes, "createdBy" AS created_by, "createdAt" AS created_at, "sentAt" AS sent_at,
    "receivedAt" AS received_at, "closedAt" AS closed_at"#;

const LINE_SELECT: &str = r#"SELECT tl.id, tl."transferId" AS transfer_id, tl."productId" AS product_id,
    tl."quantitySent" AS quantity_sent, tl."quantityReceived" AS quantity_received,
    tl.discrepancy, tl."discrepancyNote" AS discrepancy_note, p.name AS product_name,
    p.barcode AS product_barcode, p."tracksBatch" AS product_tracks_batch
    FROM "TransferLine" tl JOIN "Product" p ON p.id = tl."productId"
    WHERE tl."transferId" = $1 ORDER BY tl.id"#;

/// Discrepancia de una línea recibida: `round3(recibido − enviado)`.
fn compute_discrepancy(sent: Decimal, received: Decimal) -> Decimal {
    (received - sent).round_dp(3)
}

async fn load_transfer(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<Transfer>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {TRANSFER_COLS} FROM "Transfer" WHERE id = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as(&sql)
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
}

async fn load_lines(
    tx: &mut Transaction<'_, Postgres>,
    transfer_id: Uuid,
) -> Result<Vec<TransferLineRow>, sqlx::Error> {
    sqlx::query_as(LINE_SELECT)
        .bind(transfer_id)
        .fetch_all(&mut **tx)
        .await
}

async fn with_lines(
    tx: &mut Transaction<'_, Postgres>,
    transfer: Transfer,
) -> Result<TransferWithLines, sqlx::Error> {
    let lines = load_lines(tx, transfer.id).await?;
    Ok(TransferWithLines {
        transfer,
        lines: lines.into_iter().map(TransferLine::from).collect(),
    })
}

/// `POST /transfers` — crea un traspaso en DRAFT con sus líneas.
pub async fn create(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    input: CreateTransfer,
) -> Result<TransferWithLines, AppError> {
    input.validate()?;
    let result: Result<TransferWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            // Ambas tiendas deben pertenecer al tenant.
            let store_ids = [input.origin_store_id, input.dest_store_id];
            let owned: i64 =
                sqlx::query_scalar(r#"SELECT count(*) FROM "Store" WHERE id = ANY($1)"#)
                    .bind(store_ids)
                    .fetch_one(&mut **tx)
                    .await?;
            if owned != 2 {
                return Ok(Err(AppError::BadRequest));
            }
            let id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO "Transfer" (id, "organizationId", "originStoreId", "destStoreId", "createdBy", notes)
                   VALUES ($1, $2, $3, $4, $5, $6)"#,
            )
            .bind(id)
            .bind(org)
            .bind(input.origin_store_id)
            .bind(input.dest_store_id)
            .bind(user_id)
            .bind(input.notes.as_deref())
            .execute(&mut **tx)
            .await?;
            for l in &input.lines {
                sqlx::query(
                    r#"INSERT INTO "TransferLine" (id, "organizationId", "transferId", "productId", "quantitySent")
                       VALUES ($1, $2, $3, $4, $5)"#,
                )
                .bind(Uuid::new_v4())
                .bind(org)
                .bind(id)
                .bind(l.product_id)
                .bind(l.quantity_sent)
                .execute(&mut **tx)
                .await?;
            }
            let t = load_transfer(tx, org, id).await?.expect("recién creado");
            Ok(Ok(with_lines(tx, t).await?))
        })
        .await?;
    result
}

/// `POST /transfers/:id/send` — DRAFT→SENT: decrementa el ORIGEN por línea.
pub async fn send(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    id: Uuid,
) -> Result<TransferWithLines, AppError> {
    let result: Result<TransferWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(t) = load_transfer(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if t.status != TransferStatus::Draft {
                return Ok(Err(AppError::Conflict));
            }
            let updated = sqlx::query(
                r#"UPDATE "Transfer" SET status = 'SENT'::"TransferStatus", "sentAt" = now()
                   WHERE id = $1 AND "organizationId" = $2 AND status = 'DRAFT'::"TransferStatus""#,
            )
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?
            .rows_affected();
            if updated == 0 {
                return Ok(Err(AppError::Conflict));
            }
            let lines = load_lines(tx, id).await?;
            for l in &lines {
                if l.product_tracks_batch {
                    apply_fefo_outflow(
                        tx,
                        org,
                        l.product_id,
                        t.origin_store_id,
                        MovementType::TransferOut,
                        l.quantity_sent,
                        Some(id),
                        Some(user_id),
                    )
                    .await?;
                } else {
                    apply_movement(
                        tx,
                        ApplyMovementInput {
                            organization_id: org,
                            product_id: l.product_id,
                            store_id: t.origin_store_id,
                            movement_type: MovementType::TransferOut,
                            quantity: -l.quantity_sent,
                            reference_id: Some(id),
                            reason: None,
                            user_id: Some(user_id),
                            batch: None,
                        },
                    )
                    .await?;
                }
            }
            let t2 = load_transfer(tx, org, id).await?.expect("enviado");
            Ok(Ok(with_lines(tx, t2).await?))
        })
        .await?;
    result
}

/// `POST /transfers/:id/receive` — SENT→RECEIVED: registra lo recibido por línea
/// (con discrepancia) e incrementa el DESTINO por lo RECIBIDO. Acota por tienda
/// destino (SEC-01) salvo org-wide.
pub async fn receive(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    id: Uuid,
    input: ReceiveTransfer,
) -> Result<TransferWithLines, AppError> {
    input.validate()?;
    let result: Result<TransferWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(t) = load_transfer(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if t.status != TransferStatus::Sent {
                return Ok(Err(AppError::Conflict));
            }
            if !is_org_wide && !has_store_access(tx, user_id, t.dest_store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let lines = load_lines(tx, id).await?;
            // Toda línea del dto debe pertenecer al traspaso.
            for r in &input.lines {
                if !lines.iter().any(|l| l.id == r.line_id) {
                    return Ok(Err(AppError::BadRequest));
                }
            }
            let updated = sqlx::query(
                r#"UPDATE "Transfer" SET status = 'RECEIVED'::"TransferStatus", "receivedAt" = now()
                   WHERE id = $1 AND "organizationId" = $2 AND status = 'SENT'::"TransferStatus""#,
            )
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?
            .rows_affected();
            if updated == 0 {
                return Ok(Err(AppError::Conflict));
            }
            for r in &input.lines {
                let line = lines
                    .iter()
                    .find(|l| l.id == r.line_id)
                    .expect("validada arriba");
                let discrepancy = compute_discrepancy(line.quantity_sent, r.quantity_received);
                sqlx::query(
                    r#"UPDATE "TransferLine" SET "quantityReceived" = $2, discrepancy = $3,
                         "discrepancyNote" = $4 WHERE id = $1"#,
                )
                .bind(r.line_id)
                .bind(r.quantity_received)
                .bind(discrepancy)
                .bind(r.discrepancy_note.as_deref())
                .execute(&mut **tx)
                .await?;
                if r.quantity_received > Decimal::ZERO {
                    if line.product_tracks_batch {
                        apply_transfer_receipt(
                            tx,
                            org,
                            line.product_id,
                            t.dest_store_id,
                            id,
                            r.quantity_received,
                            Some(id),
                            Some(user_id),
                        )
                        .await?;
                    } else {
                        apply_movement(
                            tx,
                            ApplyMovementInput {
                                organization_id: org,
                                product_id: line.product_id,
                                store_id: t.dest_store_id,
                                movement_type: MovementType::TransferIn,
                                quantity: r.quantity_received,
                                reference_id: Some(id),
                                reason: None,
                                user_id: Some(user_id),
                                batch: None,
                            },
                        )
                        .await?;
                    }
                }
            }
            let t2 = load_transfer(tx, org, id).await?.expect("recibido");
            Ok(Ok(with_lines(tx, t2).await?))
        })
        .await?;
    result
}

/// `POST /transfers/:id/close` — RECEIVED→CLOSED.
pub async fn close(pool: &PgPool, org: Uuid, id: Uuid) -> Result<TransferWithLines, AppError> {
    let result: Result<TransferWithLines, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(t) = load_transfer(tx, org, id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if t.status != TransferStatus::Received {
                return Ok(Err(AppError::Conflict));
            }
            let updated = sqlx::query(
                r#"UPDATE "Transfer" SET status = 'CLOSED'::"TransferStatus", "closedAt" = now()
                   WHERE id = $1 AND "organizationId" = $2 AND status = 'RECEIVED'::"TransferStatus""#,
            )
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?
            .rows_affected();
            if updated == 0 {
                return Ok(Err(AppError::Conflict));
            }
            let t2 = load_transfer(tx, org, id).await?.expect("cerrado");
            Ok(Ok(with_lines(tx, t2).await?))
        })
        .await?;
    result
}

/// `GET /transfers?status=` — listado del tenant (más recientes primero).
pub async fn list(
    pool: &PgPool,
    org: Uuid,
    status: Option<String>,
) -> Result<Vec<TransferWithLines>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let sql = if status.is_some() {
            format!(
                r#"SELECT {TRANSFER_COLS} FROM "Transfer"
                   WHERE "organizationId" = $1 AND status = $2::"TransferStatus"
                   ORDER BY "createdAt" DESC"#
            )
        } else {
            format!(
                r#"SELECT {TRANSFER_COLS} FROM "Transfer" WHERE "organizationId" = $1
                   ORDER BY "createdAt" DESC"#
            )
        };
        let mut q = sqlx::query_as::<_, Transfer>(&sql).bind(org);
        if let Some(s) = &status {
            q = q.bind(s);
        }
        let transfers = q.fetch_all(&mut **tx).await?;
        let mut out = Vec::with_capacity(transfers.len());
        for t in transfers {
            out.push(with_lines(tx, t).await?);
        }
        Ok(out)
    })
    .await
}

/// `POST /transfers/:id/attachments` — adjunta una foto a la recepción. Mismas reglas
/// que recibir (ADMIN/MANAGER/CLERK; CLERK acotado a su tienda destino, SEC-01). La
/// línea, si se indica, debe pertenecer al traspaso.
pub async fn add_attachment(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    transfer_id: Uuid,
    input: CreateAttachment,
) -> Result<TransferAttachment, AppError> {
    let mime = input.validate()?;
    let result: Result<TransferAttachment, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(t) = load_transfer(tx, org, transfer_id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if !is_org_wide && !has_store_access(tx, user_id, t.dest_store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            if let Some(line_id) = input.transfer_line_id {
                let belongs: bool = sqlx::query_scalar(
                    r#"SELECT EXISTS(SELECT 1 FROM "TransferLine"
                       WHERE id = $1 AND "transferId" = $2)"#,
                )
                .bind(line_id)
                .bind(transfer_id)
                .fetch_one(&mut **tx)
                .await?;
                if !belongs {
                    return Ok(Err(AppError::BadRequest));
                }
            }
            let id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO "TransferAttachment"
                   (id, "organizationId", "transferId", "transferLineId", "mimeType", "dataUrl", caption, "createdBy")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
            )
            .bind(id)
            .bind(org)
            .bind(transfer_id)
            .bind(input.transfer_line_id)
            .bind(mime)
            .bind(&input.data_url)
            .bind(input.caption.as_deref())
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
            let sql = format!(
                r#"SELECT {ATTACHMENT_COLS} FROM "TransferAttachment" WHERE id = $1"#
            );
            let row: TransferAttachmentRow =
                sqlx::query_as(&sql).bind(id).fetch_one(&mut **tx).await?;
            Ok(Ok(TransferAttachment::from(row)))
        })
        .await?;
    result
}

/// `GET /transfers/:id/attachments` — fotos del traspaso (más antiguas primero).
pub async fn list_attachments(
    pool: &PgPool,
    org: Uuid,
    transfer_id: Uuid,
) -> Result<Vec<TransferAttachment>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let sql = format!(
            r#"SELECT {ATTACHMENT_COLS} FROM "TransferAttachment"
               WHERE "transferId" = $1 ORDER BY "createdAt", id"#
        );
        let rows: Vec<TransferAttachmentRow> =
            sqlx::query_as(&sql).bind(transfer_id).fetch_all(&mut **tx).await?;
        Ok(rows.into_iter().map(TransferAttachment::from).collect())
    })
    .await
}

/// `POST /transfers/:id/messages` — añade un mensaje al chat. El autor lo decide el
/// rol: org-wide → 'central'; el resto (CLERK) → 'store' (acotado a su tienda destino,
/// SEC-01). Lleva texto y/o foto.
pub async fn add_message(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    transfer_id: Uuid,
    input: CreateMessage,
) -> Result<TransferMessage, AppError> {
    input.validate()?;
    let author = if is_org_wide { "central" } else { "store" };
    let body = input
        .body
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let data_url = input.data_url.as_deref().filter(|s| !s.is_empty());
    let mime = data_url.and_then(|u| super::input::validate_image_data_url(u).ok());
    let result: Result<TransferMessage, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let Some(t) = load_transfer(tx, org, transfer_id).await? else {
                return Ok(Err(AppError::NotFound));
            };
            if !is_org_wide && !has_store_access(tx, user_id, t.dest_store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO "TransferMessage"
                   (id, "organizationId", "transferId", author, body, "dataUrl", "mimeType", "createdBy")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
            )
            .bind(id)
            .bind(org)
            .bind(transfer_id)
            .bind(author)
            .bind(body)
            .bind(data_url)
            .bind(mime)
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
            let sql = format!(r#"SELECT {MESSAGE_COLS} FROM "TransferMessage" WHERE id = $1"#);
            let row: TransferMessageRow =
                sqlx::query_as(&sql).bind(id).fetch_one(&mut **tx).await?;
            Ok(Ok(TransferMessage::from(row)))
        })
        .await?;
    result
}

/// `GET /transfers/:id/messages` — hilo del chat (cronológico).
pub async fn list_messages(
    pool: &PgPool,
    org: Uuid,
    transfer_id: Uuid,
) -> Result<Vec<TransferMessage>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let sql = format!(
            r#"SELECT {MESSAGE_COLS} FROM "TransferMessage"
               WHERE "transferId" = $1 ORDER BY "createdAt", id"#
        );
        let rows: Vec<TransferMessageRow> =
            sqlx::query_as(&sql).bind(transfer_id).fetch_all(&mut **tx).await?;
        Ok(rows.into_iter().map(TransferMessage::from).collect())
    })
    .await
}

/// `GET /transfers/:id` — un traspaso del tenant con sus líneas (404 si no existe).
pub async fn get(pool: &PgPool, org: Uuid, id: Uuid) -> Result<TransferWithLines, AppError> {
    let found: Option<TransferWithLines> = with_tenant_tx(pool, org, async move |tx, _after| {
        match load_transfer(tx, org, id).await? {
            Some(t) => Ok(Some(with_lines(tx, t).await?)),
            None => Ok(None),
        }
    })
    .await?;
    found.ok_or(AppError::NotFound)
}
