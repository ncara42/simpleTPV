//! Servicio de promociones (#154 base + #275 S-22). Catálogo de central
//! (org-wide); el estado efectivo (activa/programada/expirada) lo deriva el
//! cliente con las fechas + `active`. Todo bajo `with_tenant_tx` (RLS) + filtro
//! `organizationId` explícito.
//!
//! S-22: la promo lleva campos avanzados (appliesTo/amountScope/franja/2x1) y
//! scopes N:M (productos/familias/tiendas) que se cargan agregados con
//! `array_agg` en la misma query y se reescriben en bloque al crear/actualizar.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{Postgres, Transaction};
use sqlx::PgPool;
use uuid::Uuid;

use super::input::{CreatePromotion, UpdatePromotion};
use super::model::Promotion;

/// Columnas de `Promotion` (con los avanzados S-22) + scopes N:M agregados como
/// arrays (COALESCE a array vacío → siempre presentes para `FromRow`). El
/// `array_agg` se filtra con `WHERE ... IS NOT NULL` vía subconsulta para no
/// inflar filas con un JOIN; cada scope es una subconsulta correlacionada.
const PROMO_COLS: &str = r#"p.id, p."organizationId" AS organization_id, p.name,
    p."conditionType"::text AS condition_type, p.threshold,
    p."discountType"::text AS discount_type, p."discountValue" AS discount_value,
    p."startDate"::text AS start_date, p."endDate"::text AS end_date, p.active,
    p."appliesTo"::text AS applies_to, p."amountScope"::text AS amount_scope,
    p."startTime" AS start_time, p."endTime" AS end_time,
    COALESCE(p.weekdays, ARRAY[]::smallint[]) AS weekdays,
    p.stackable, p."clerkCanSkip" AS clerk_can_skip,
    p."buyQty" AS buy_qty, p."payQty" AS pay_qty, p.priority,
    COALESCE((SELECT array_agg(pp."productId") FROM "PromotionProduct" pp WHERE pp."promotionId" = p.id), ARRAY[]::uuid[]) AS product_ids,
    COALESCE((SELECT array_agg(pf."familyId") FROM "PromotionFamily" pf WHERE pf."promotionId" = p.id), ARRAY[]::uuid[]) AS family_ids,
    COALESCE((SELECT array_agg(ps."storeId") FROM "PromotionStore" ps WHERE ps."promotionId" = p.id), ARRAY[]::uuid[]) AS store_ids,
    p."createdAt" AS created_at, p."updatedAt" AS updated_at"#;

/// Reescribe los scopes N:M de una promo (borra y reinserta). Idempotente y
/// atómico dentro de la tx. Las filas llevan `organizationId` explícito (RLS
/// with_check). `None` = no tocar; `Some(vec)` = sustituir por ese conjunto.
async fn replace_scopes(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    promo_id: Uuid,
    product_ids: Option<&[Uuid]>,
    family_ids: Option<&[Uuid]>,
    store_ids: Option<&[Uuid]>,
) -> Result<(), sqlx::Error> {
    if let Some(ids) = product_ids {
        sqlx::query(r#"DELETE FROM "PromotionProduct" WHERE "promotionId" = $1"#)
            .bind(promo_id)
            .execute(&mut **tx)
            .await?;
        if !ids.is_empty() {
            sqlx::query(
                r#"INSERT INTO "PromotionProduct" ("promotionId", "productId", "organizationId")
                   SELECT $1, x, $2 FROM UNNEST($3::uuid[]) AS x
                   ON CONFLICT DO NOTHING"#,
            )
            .bind(promo_id)
            .bind(org)
            .bind(ids)
            .execute(&mut **tx)
            .await?;
        }
    }
    if let Some(ids) = family_ids {
        sqlx::query(r#"DELETE FROM "PromotionFamily" WHERE "promotionId" = $1"#)
            .bind(promo_id)
            .execute(&mut **tx)
            .await?;
        if !ids.is_empty() {
            sqlx::query(
                r#"INSERT INTO "PromotionFamily" ("promotionId", "familyId", "organizationId")
                   SELECT $1, x, $2 FROM UNNEST($3::uuid[]) AS x
                   ON CONFLICT DO NOTHING"#,
            )
            .bind(promo_id)
            .bind(org)
            .bind(ids)
            .execute(&mut **tx)
            .await?;
        }
    }
    if let Some(ids) = store_ids {
        sqlx::query(r#"DELETE FROM "PromotionStore" WHERE "promotionId" = $1"#)
            .bind(promo_id)
            .execute(&mut **tx)
            .await?;
        if !ids.is_empty() {
            sqlx::query(
                r#"INSERT INTO "PromotionStore" ("promotionId", "storeId", "organizationId")
                   SELECT $1, x, $2 FROM UNNEST($3::uuid[]) AS x
                   ON CONFLICT DO NOTHING"#,
            )
            .bind(promo_id)
            .bind(org)
            .bind(ids)
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(())
}

/// Carga una promo por id (con scopes agregados). `None` si no existe en el tenant.
async fn load_one(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<Promotion>, sqlx::Error> {
    sqlx::query_as(&format!(
        r#"SELECT {PROMO_COLS} FROM "Promotion" p WHERE p.id = $1 AND p."organizationId" = $2"#,
    ))
    .bind(id)
    .bind(org)
    .fetch_optional(&mut **tx)
    .await
}

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreatePromotion,
) -> Result<Promotion, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO "Promotion"
                 (id, "organizationId", name, "conditionType", threshold, "discountType",
                  "discountValue", "startDate", "endDate", active, "appliesTo", "amountScope",
                  "startTime", "endTime", weekdays, stackable, "clerkCanSkip", "buyQty",
                  "payQty", priority, "updatedAt")
               VALUES ($1, $2, $3, $4::"PromoConditionType", $5, $6::"PromoDiscountType",
                  $7, $8::date, $9::date, COALESCE($10, true), $11::"PromoAppliesTo",
                  $12::"PromoAmountScope", $13::time, $14::time, $15::smallint[],
                  COALESCE($16, false), COALESCE($17, false), $18, $19, COALESCE($20, 0), now())"#,
        )
        .bind(id)
        .bind(org)
        .bind(input.name.trim())
        .bind(input.condition_type)
        .bind(input.threshold)
        .bind(input.discount_type)
        .bind(input.discount_value)
        .bind(&input.start_date)
        .bind(&input.end_date)
        .bind(input.active)
        .bind(input.applies_to)
        .bind(input.amount_scope)
        .bind(input.start_time.as_deref())
        .bind(input.end_time.as_deref())
        .bind(input.weekdays_smallint())
        .bind(input.stackable)
        .bind(input.clerk_can_skip)
        .bind(input.buy_qty)
        .bind(input.pay_qty)
        .bind(input.priority)
        .execute(&mut **tx)
        .await?;

        replace_scopes(
            tx,
            org,
            id,
            Some(&input.product_ids),
            Some(&input.family_ids),
            Some(&input.store_ids),
        )
        .await?;

        let row = load_one(tx, org, id)
            .await?
            .expect("la promo existe; se acaba de crear en esta tx");
        Ok(row)
    })
    .await
}

pub async fn find_all(pool: &PgPool, org: Uuid) -> Result<Vec<Promotion>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&format!(
            r#"SELECT {PROMO_COLS} FROM "Promotion" p
               WHERE p."organizationId" = $1 ORDER BY p."createdAt" DESC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

pub async fn find_one(pool: &PgPool, org: Uuid, id: Uuid) -> Result<Promotion, AppError> {
    let found: Option<Promotion> =
        with_tenant_tx(pool, org, async move |tx, _after| load_one(tx, org, id).await).await?;
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
        // PATCH parcial de los campos escalares (COALESCE conserva lo no enviado).
        // `weekdays`/`startTime`/`endTime` son nullable: solo se tocan si vienen.
        let affected = sqlx::query(
            r#"UPDATE "Promotion" SET
                 name = COALESCE($3, name),
                 "conditionType" = COALESCE($4::"PromoConditionType", "conditionType"),
                 threshold = COALESCE($5, threshold),
                 "discountType" = COALESCE($6::"PromoDiscountType", "discountType"),
                 "discountValue" = COALESCE($7, "discountValue"),
                 "startDate" = COALESCE($8::date, "startDate"),
                 "endDate" = COALESCE($9::date, "endDate"),
                 active = COALESCE($10, active),
                 "appliesTo" = COALESCE($11::"PromoAppliesTo", "appliesTo"),
                 "amountScope" = COALESCE($12::"PromoAmountScope", "amountScope"),
                 "startTime" = CASE WHEN $13 THEN $14::time ELSE "startTime" END,
                 "endTime" = CASE WHEN $15 THEN $16::time ELSE "endTime" END,
                 weekdays = CASE WHEN $17 THEN $18::smallint[] ELSE weekdays END,
                 stackable = COALESCE($19, stackable),
                 "clerkCanSkip" = COALESCE($20, "clerkCanSkip"),
                 "buyQty" = CASE WHEN $21 THEN $22 ELSE "buyQty" END,
                 "payQty" = CASE WHEN $23 THEN $24 ELSE "payQty" END,
                 priority = COALESCE($25, priority),
                 "updatedAt" = now()
               WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(id)
        .bind(org)
        .bind(input.name.as_ref().map(|n| n.trim().to_owned()))
        .bind(input.condition_type)
        .bind(input.threshold)
        .bind(input.discount_type)
        .bind(input.discount_value)
        .bind(input.start_date.as_ref())
        .bind(input.end_date.as_ref())
        .bind(input.active)
        .bind(input.applies_to)
        .bind(input.amount_scope)
        .bind(input.start_time.is_some())
        .bind(input.start_time.as_ref().and_then(|o| o.as_deref()))
        .bind(input.end_time.is_some())
        .bind(input.end_time.as_ref().and_then(|o| o.as_deref()))
        .bind(input.weekdays.is_some())
        .bind(input.weekdays_smallint())
        .bind(input.stackable)
        .bind(input.clerk_can_skip)
        .bind(input.buy_qty.is_some())
        .bind(input.buy_qty.flatten())
        .bind(input.pay_qty.is_some())
        .bind(input.pay_qty.flatten())
        .bind(input.priority)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if affected == 0 {
            return Ok(None);
        }

        replace_scopes(
            tx,
            org,
            id,
            input.product_ids.as_deref(),
            input.family_ids.as_deref(),
            input.store_ids.as_deref(),
        )
        .await?;

        load_one(tx, org, id).await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Los scopes N:M caen por ON DELETE CASCADE de las FKs.
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

/// Carga TODAS las promos `active = true` de la org cuya vigencia de fechas cubre
/// `today` (`startDate <= today <= endDate`) — candidatas para el matching del
/// cobro. El resto del filtrado (franja horaria, weekday, tienda, scope) lo hace
/// el dominio puro `apply` con los scopes ya cargados aquí. Se ejecuta dentro de
/// la tx de la venta (RLS ya abierta).
pub async fn load_active_for_matching(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    today: &str,
) -> Result<Vec<Promotion>, sqlx::Error> {
    sqlx::query_as(&format!(
        r#"SELECT {PROMO_COLS} FROM "Promotion" p
           WHERE p."organizationId" = $1 AND p.active = true
             AND p."startDate" <= $2::date AND p."endDate" >= $2::date
           ORDER BY p.priority DESC, p."createdAt" DESC"#,
    ))
    .bind(org)
    .bind(today)
    .fetch_all(&mut **tx)
    .await
}
