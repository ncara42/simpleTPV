//! Preferencias por usuario (IT-16, #154) — port de `preferences.service.ts`.
//! Cada usuario solo lee/escribe las suyas (el handler pasa SIEMPRE el `sub` del
//! JWT); RLS aísla por tenant. Valor JSON arbitrario con cota de tamaño.
//!
//! El valor JSON se maneja con casts `::text`/`::jsonb` (sqlx sin feature `json`).
//! Divergencia: un valor que supera el límite responde 400 (AppError no modela
//! 413; NestJS devolvía PayloadTooLarge).

use std::collections::BTreeMap;

use serde_json::Value;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::SavedPreference;

const MAX_VALUE_BYTES: usize = 16 * 1024; // 16 KB por preferencia
const KEY_MAX: usize = 64;

/// Clave válida: `^[A-Za-z0-9._-]{1,64}$` (ámbito en kebab/dot acotado).
pub fn key_ok(key: &str) -> bool {
    let n = key.len();
    (1..=KEY_MAX).contains(&n)
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// Todas las preferencias del usuario como mapa key→value.
pub async fn get_all(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
) -> Result<BTreeMap<String, Value>, AppError> {
    let rows: Vec<(String, String)> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(
            r#"SELECT key, value::text FROM "UserPreference"
               WHERE "userId" = $1 AND "organizationId" = $2"#,
        )
        .bind(user_id)
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await?;
    let mut out = BTreeMap::new();
    for (k, v) in rows {
        out.insert(k, serde_json::from_str(&v).unwrap_or(Value::Null));
    }
    Ok(out)
}

/// Upsert de una preferencia del usuario (clave única por usuario).
pub async fn set(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    key: String,
    value: Value,
) -> Result<SavedPreference, AppError> {
    if !key_ok(&key) {
        return Err(AppError::BadRequest);
    }
    let serialized = serde_json::to_string(&value).map_err(|_| AppError::BadRequest)?;
    if serialized.len() > MAX_VALUE_BYTES {
        return Err(AppError::BadRequest); // 413 → 400 (ver módulo)
    }
    with_tenant_tx(pool, org, async move |tx, _after| {
        let saved: (String, String) = sqlx::query_as(
            r#"INSERT INTO "UserPreference" (id, "organizationId", "userId", key, value, "updatedAt")
               VALUES ($1, $2, $3, $4, $5::jsonb, now())
               ON CONFLICT ("userId", key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
               RETURNING key, value::text"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(user_id)
        .bind(&key)
        .bind(&serialized)
        .fetch_one(&mut **tx)
        .await?;
        Ok(SavedPreference {
            key: saved.0,
            value: serde_json::from_str(&saved.1).unwrap_or(Value::Null),
        })
    })
    .await
}
