use std::collections::BTreeMap;

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use crate::store_access::has_store_access;

use super::catalog::{is_feature_key, FEATURE_FLAGS};
use super::model::{CatalogEntry, FeatureFlagList, FlagRow};

/// Default EN CÓDIGO de un flag = su conducta sin override (del catálogo). Una key
/// fuera del catálogo cae a `true` (conducta segura: nunca "apagado" por omisión).
pub fn default_for_key(key: &str) -> bool {
    FEATURE_FLAGS
        .iter()
        .find(|f| f.key == key)
        .map(|f| f.default)
        .unwrap_or(true)
}

/// ¿Está activa la `key`? `store_id` presente → override de tienda ?? default de
/// org ?? código; ausente → org ?? código. Un `enabled = false` explícito gana
/// sobre el default (solo la ausencia de fila cae al default).
pub async fn is_flag_enabled(
    pool: &PgPool,
    org: Uuid,
    key: &str,
    store_id: Option<Uuid>,
) -> Result<bool, AppError> {
    let key = key.to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        // OR (no `IN (x, NULL)`): a nivel SQL `IN` NO casa filas con NULL.
        let rows: Vec<(Option<Uuid>, bool)> = if let Some(sid) = store_id {
            sqlx::query_as(
                r#"SELECT "storeId", enabled FROM "FeatureFlag"
                   WHERE "organizationId" = $1 AND key = $2
                     AND ("storeId" = $3 OR "storeId" IS NULL)"#,
            )
            .bind(org)
            .bind(&key)
            .bind(sid)
            .fetch_all(&mut **tx)
            .await?
        } else {
            sqlx::query_as(
                r#"SELECT "storeId", enabled FROM "FeatureFlag"
                   WHERE "organizationId" = $1 AND key = $2 AND "storeId" IS NULL"#,
            )
            .bind(org)
            .bind(&key)
            .fetch_all(&mut **tx)
            .await?
        };
        let store_val =
            store_id.and_then(|sid| rows.iter().find(|(s, _)| *s == Some(sid)).map(|(_, e)| *e));
        let org_val = rows.iter().find(|(s, _)| s.is_none()).map(|(_, e)| *e);
        Ok(store_val
            .or(org_val)
            .unwrap_or_else(|| default_for_key(&key)))
    })
    .await
}

/// `Forbidden` si la `key` está apagada para esa org/tienda. Se llama FUERA de la
/// tx de escritura (paridad: `features.assertEnabled` antes de `withTenantTx`).
pub async fn assert_flag_enabled(
    pool: &PgPool,
    org: Uuid,
    key: &str,
    store_id: Option<Uuid>,
) -> Result<(), AppError> {
    if is_flag_enabled(pool, org, key, store_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

/// Estado efectivo de TODAS las keys del catálogo (para que el frontend oculte/
/// deshabilite UI). Misma precedencia que [`is_flag_enabled`]: override de tienda
/// ?? default de org ?? default del código. `GET /me/features`.
pub async fn resolve_all(
    pool: &PgPool,
    org: Uuid,
    store_id: Option<Uuid>,
) -> Result<BTreeMap<String, bool>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<(String, Option<Uuid>, bool)> = if let Some(sid) = store_id {
            sqlx::query_as(
                r#"SELECT key, "storeId", enabled FROM "FeatureFlag"
                   WHERE "organizationId" = $1 AND ("storeId" = $2 OR "storeId" IS NULL)"#,
            )
            .bind(org)
            .bind(sid)
            .fetch_all(&mut **tx)
            .await?
        } else {
            sqlx::query_as(
                r#"SELECT key, "storeId", enabled FROM "FeatureFlag"
                   WHERE "organizationId" = $1 AND "storeId" IS NULL"#,
            )
            .bind(org)
            .fetch_all(&mut **tx)
            .await?
        };
        let mut out = BTreeMap::new();
        for f in FEATURE_FLAGS.iter() {
            let store_val = store_id.and_then(|sid| {
                rows.iter()
                    .find(|(k, s, _)| k == f.key && *s == Some(sid))
                    .map(|(_, _, e)| *e)
            });
            let org_val = rows
                .iter()
                .find(|(k, s, _)| k == f.key && s.is_none())
                .map(|(_, _, e)| *e);
            out.insert(
                f.key.to_string(),
                store_val.or(org_val).unwrap_or(f.default),
            );
        }
        Ok(out)
    })
    .await
}

/// `GET /feature-flags` (ADMIN/MANAGER): catálogo + filas explícitas del tenant.
pub async fn list(pool: &PgPool, org: Uuid) -> Result<FeatureFlagList, AppError> {
    let flags: Vec<FlagRow> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(
            r#"SELECT key, "storeId" AS store_id, enabled FROM "FeatureFlag"
               WHERE "organizationId" = $1 ORDER BY key ASC"#,
        )
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await?;
    let catalog = FEATURE_FLAGS
        .iter()
        .map(|f| CatalogEntry {
            key: f.key.into(),
            label: f.label.into(),
            default: f.default,
        })
        .collect();
    Ok(FeatureFlagList { catalog, flags })
}

/// Verifica el permiso de gestión: un flag org-wide (sin tienda) solo ADMIN; uno
/// de tienda exige acceso a esa tienda (ADMIN/MANAGER org-wide pasan; SEC-01).
async fn assert_manage_allowed(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    is_admin: bool,
    is_org_wide: bool,
    store_id: Option<Uuid>,
) -> Result<Result<(), AppError>, sqlx::Error> {
    match store_id {
        Some(sid) => {
            if !is_org_wide && !has_store_access(tx, user_id, sid).await? {
                return Ok(Err(AppError::Forbidden));
            }
        }
        None if !is_admin => return Ok(Err(AppError::Forbidden)),
        None => {}
    }
    Ok(Ok(()))
}

/// `PUT /feature-flags` (ADMIN/MANAGER): upsert de un flag explícito. `store_id`
/// presente → override de tienda; ausente → default de la org (solo ADMIN).
#[allow(clippy::too_many_arguments)]
pub async fn set_flag(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_admin: bool,
    is_org_wide: bool,
    key: String,
    enabled: bool,
    store_id: Option<Uuid>,
) -> Result<FlagRow, AppError> {
    if !is_feature_key(&key) {
        return Err(AppError::BadRequest);
    }
    let result: Result<FlagRow, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if let Err(e) = assert_manage_allowed(tx, user_id, is_admin, is_org_wide, store_id).await? {
            return Ok(Err(e));
        }
        // upsert manual: el único compuesto incluye storeId nullable (NULL ≠ NULL en
        // un UNIQUE), así que se localiza con IS NOT DISTINCT FROM y se decide.
        let existing: Option<Uuid> = sqlx::query_scalar(
            r#"SELECT id FROM "FeatureFlag"
               WHERE "organizationId" = $1 AND key = $2 AND "storeId" IS NOT DISTINCT FROM $3"#,
        )
        .bind(org)
        .bind(&key)
        .bind(store_id)
        .fetch_optional(&mut **tx)
        .await?;
        let row: FlagRow = if let Some(id) = existing {
            sqlx::query_as(
                r#"UPDATE "FeatureFlag" SET enabled = $2, "updatedAt" = now()
                   WHERE id = $1 AND "organizationId" = $3
                   RETURNING key, "storeId" AS store_id, enabled"#,
            )
            .bind(id)
            .bind(enabled)
            .bind(org)
            .fetch_one(&mut **tx)
            .await?
        } else {
            sqlx::query_as(
                r#"INSERT INTO "FeatureFlag" (id, "organizationId", key, "storeId", enabled, "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, now())
                   RETURNING key, "storeId" AS store_id, enabled"#,
            )
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(&key)
            .bind(store_id)
            .bind(enabled)
            .fetch_one(&mut **tx)
            .await?
        };
        Ok(Ok(row))
    })
    .await?;
    result
}

/// `DELETE /feature-flags/:key` (ADMIN/MANAGER): quita el flag explícito → la key
/// vuelve al default de org (si era de tienda) o del código (si era de org).
pub async fn clear_flag(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_admin: bool,
    is_org_wide: bool,
    key: String,
    store_id: Option<Uuid>,
) -> Result<(), AppError> {
    if !is_feature_key(&key) {
        return Err(AppError::BadRequest);
    }
    let result: Result<(), AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if let Err(e) = assert_manage_allowed(tx, user_id, is_admin, is_org_wide, store_id).await? {
            return Ok(Err(e));
        }
        sqlx::query(
            r#"DELETE FROM "FeatureFlag"
               WHERE "organizationId" = $1 AND key = $2 AND "storeId" IS NOT DISTINCT FROM $3"#,
        )
        .bind(org)
        .bind(&key)
        .bind(store_id)
        .execute(&mut **tx)
        .await?;
        Ok(Ok(()))
    })
    .await?;
    result
}
