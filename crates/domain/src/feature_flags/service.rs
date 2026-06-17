use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

/// Default EN CÓDIGO de un flag = su conducta sin override. En el catálogo actual
/// TODAS las features arrancan ACTIVAS (un flag solo sirve para APAGARLAS), así
/// que el default es `true`. Sin contexto/fila → este default (nunca "apagado").
pub fn default_for_key(_key: &str) -> bool {
    true
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
