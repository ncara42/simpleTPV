//! Servicio de promociones (#154) — port de `promotions.service.ts`. Catálogo de
//! central (org-wide); el estado efectivo (activa/programada/expirada) lo deriva
//! el cliente con las fechas + `active`. Todo bajo `with_tenant_tx` (RLS) +
//! filtro `organizationId` explícito.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::input::{CreatePromotion, UpdatePromotion};
use super::model::Promotion;

const PROMO_COLS: &str = r#"id, "organizationId" AS organization_id, name,
    "conditionType"::text AS condition_type, threshold,
    "discountType"::text AS discount_type, "discountValue" AS discount_value,
    "startDate"::text AS start_date, "endDate"::text AS end_date, active,
    "createdAt" AS created_at, "updatedAt" AS updated_at"#;

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreatePromotion,
) -> Result<Promotion, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Promotion = sqlx::query_as(&format!(
            r#"INSERT INTO "Promotion"
                 (id, "organizationId", name, "conditionType", threshold, "discountType",
                  "discountValue", "startDate", "endDate", active, "updatedAt")
               VALUES ($1, $2, $3, $4::"PromoConditionType", $5, $6::"PromoDiscountType",
                  $7, $8::date, $9::date, COALESCE($10, true), now())
               RETURNING {PROMO_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.name.trim())
        .bind(input.condition_type)
        .bind(input.threshold)
        .bind(input.discount_type)
        .bind(input.discount_value)
        .bind(&input.start_date)
        .bind(&input.end_date)
        .bind(input.active)
        .fetch_one(&mut **tx)
        .await?;
        Ok(row)
    })
    .await
}

pub async fn find_all(pool: &PgPool, org: Uuid) -> Result<Vec<Promotion>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&format!(
            r#"SELECT {PROMO_COLS} FROM "Promotion"
               WHERE "organizationId" = $1 ORDER BY "createdAt" DESC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn find_one(pool: &PgPool, org: Uuid, id: Uuid) -> Result<Promotion, AppError> {
    let found: Option<Promotion> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&format!(
            r#"SELECT {PROMO_COLS} FROM "Promotion" WHERE id = $1 AND "organizationId" = $2"#,
        ))
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdatePromotion,
) -> Result<Promotion, AppError> {
    input.validate()?;
    let found: Option<Promotion> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&format!(
            r#"UPDATE "Promotion" SET
                 name = COALESCE($3, name),
                 "conditionType" = COALESCE($4::"PromoConditionType", "conditionType"),
                 threshold = COALESCE($5, threshold),
                 "discountType" = COALESCE($6::"PromoDiscountType", "discountType"),
                 "discountValue" = COALESCE($7, "discountValue"),
                 "startDate" = COALESCE($8::date, "startDate"),
                 "endDate" = COALESCE($9::date, "endDate"),
                 active = COALESCE($10, active),
                 "updatedAt" = now()
               WHERE id = $1 AND "organizationId" = $2
               RETURNING {PROMO_COLS}"#,
        ))
        .bind(id)
        .bind(org)
        .bind(input.name.map(|n| n.trim().to_owned()))
        .bind(input.condition_type)
        .bind(input.threshold)
        .bind(input.discount_type)
        .bind(input.discount_value)
        .bind(input.start_date)
        .bind(input.end_date)
        .bind(input.active)
        .fetch_optional(&mut **tx)
        .await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected =
            sqlx::query(r#"DELETE FROM "Promotion" WHERE id = $1 AND "organizationId" = $2"#)
                .bind(id)
                .bind(org)
                .execute(&mut **tx)
                .await?
                .rows_affected();
        Ok(if affected == 0 {
            Err(AppError::NotFound)
        } else {
            Ok(())
        })
    })
    .await?
}
