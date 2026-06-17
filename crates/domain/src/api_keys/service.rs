//! Servicio de API keys (#154, IT-18) — port de `api-keys.service.ts` +
//! `api-key-lookup.service.ts`. Gestión (generate/list/revoke) bajo
//! `with_tenant_tx` (RLS, solo ADMIN). El lookup por hash y el `touchLastUsed`
//! corren sobre el pool **app_admin (BYPASSRLS)** porque ocurren ANTES de
//! conocer el tenant (igual que el login).

use sha2::{Digest, Sha256};
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::input::CreateApiKey;
use super::model::{ApiKeyListItem, ApiKeyRecord, GeneratedApiKey};

const LIST_COLS: &str = r#"id, name, prefix, "priceListId" AS price_list_id,
    "createdAt" AS created_at, "lastUsedAt" AS last_used_at,
    "revokedAt" AS revoked_at, "expiresAt" AS expires_at"#;

const RECORD_COLS: &str = r#"id, "organizationId" AS organization_id,
    "priceListId" AS price_list_id, "revokedAt" AS revoked_at, "expiresAt" AS expires_at"#;

/// SHA-256 (hex) de la key en claro. Idéntico a `ApiKeyLookupService.hashKey`.
pub fn hash_key(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
}

/// base64url SIN padding (alfabeto `-`/`_`), igual que `Buffer.toString('base64url')`.
fn b64url_encode(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(T[(n >> 6 & 63) as usize] as char);
        }
        if chunk.len() > 2 {
            out.push(T[(n & 63) as usize] as char);
        }
    }
    out
}

/// Genera `stpv_<prefix8>_<random43>` (32 bytes CSPRNG vía dos UUID v4) + su prefix.
fn generate_raw_key() -> (String, String) {
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(Uuid::new_v4().as_bytes());
    let rand = b64url_encode(&bytes[..32]);
    let prefix = rand[..8].to_owned();
    (format!("stpv_{prefix}_{rand}"), prefix)
}

/// `POST /api-keys` (ADMIN): crea la key y devuelve el plano una sola vez.
pub async fn generate(
    pool: &PgPool,
    org: Uuid,
    input: CreateApiKey,
) -> Result<GeneratedApiKey, AppError> {
    input.validate()?;
    let (raw, prefix) = generate_raw_key();
    let hashed = hash_key(&raw);
    let name = input.name.trim().to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let (id, name): (Uuid, String) = sqlx::query_as(
            r#"INSERT INTO "ApiKey"
                 (id, "organizationId", name, prefix, "hashedKey", "priceListId", "expiresAt")
               VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::int * interval '1 day'))
               RETURNING id, name"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(&name)
        .bind(&prefix)
        .bind(&hashed)
        .bind(input.price_list_id)
        .bind(input.ttl_days)
        .fetch_one(&mut **tx)
        .await?;
        Ok(GeneratedApiKey {
            id,
            name,
            prefix,
            key: raw,
        })
    })
    .await
}

/// `GET /api-keys` (ADMIN): listado del tenant (sin hash ni key en claro).
pub async fn list(pool: &PgPool, org: Uuid) -> Result<Vec<ApiKeyListItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&format!(
            r#"SELECT {LIST_COLS} FROM "ApiKey"
               WHERE "organizationId" = $1 ORDER BY "createdAt" DESC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await
    })
    .await
}

/// `DELETE /api-keys/:id` (ADMIN): revoca (la key deja de autenticar de inmediato).
pub async fn revoke(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(
            r#"UPDATE "ApiKey" SET "revokedAt" = now()
               WHERE id = $1 AND "organizationId" = $2"#,
        )
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

/// Lookup por hash sobre el pool **app_admin (BYPASSRLS)** — pre-tenant.
pub async fn find_by_hash(admin: &PgPool, hashed: &str) -> Result<Option<ApiKeyRecord>, AppError> {
    sqlx::query_as(&format!(
        r#"SELECT {RECORD_COLS} FROM "ApiKey" WHERE "hashedKey" = $1"#,
    ))
    .bind(hashed)
    .fetch_optional(admin)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "lookup de API key por hash falló");
        AppError::Internal
    })
}

/// Marca `lastUsedAt` (app_admin, BYPASSRLS). Best-effort: el llamador ignora el error.
pub async fn touch_last_used(admin: &PgPool, id: Uuid) -> Result<(), AppError> {
    sqlx::query(r#"UPDATE "ApiKey" SET "lastUsedAt" = now() WHERE id = $1"#)
        .bind(id)
        .execute(admin)
        .await
        .map(|_| ())
        .map_err(|e| {
            tracing::error!(error = %e, "touch lastUsedAt de API key falló");
            AppError::Internal
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formato_de_key_y_hash() {
        let (raw, prefix) = generate_raw_key();
        assert!(raw.starts_with("stpv_"));
        assert_eq!(prefix.len(), 8);
        assert!(raw.contains(&format!("_{prefix}_")));
        // 32 bytes en base64url sin padding → 43 chars.
        let rand = raw.strip_prefix(&format!("stpv_{prefix}_")).unwrap();
        assert_eq!(rand.len(), 43);
        assert_eq!(&rand[..8], prefix);
        // hash determinista de 64 hex; vector conocido de "abc".
        assert_eq!(
            hash_key("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_ne!(generate_raw_key().0, generate_raw_key().0);
    }
}
