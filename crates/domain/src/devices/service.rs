//! Servicio de dispositivos oficiales (#154) — port de `devices.service.ts`.
//! Token de emparejamiento: el plano (12 hex) se devuelve una vez al crear; en
//! BD solo vive su hash SHA-256 (KEY-01). El emparejamiento desde un CLERK se
//! acota a sus tiendas (BOLA intra-tenant, KEY-03). Todo bajo `with_tenant_tx`.

use sha2::{Digest, Sha256};
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use crate::store_access::has_store_access;

use super::input::{CreateDevice, PairDevice};
use super::model::{
    CreatedDevice, DeviceListItem, DeviceRow, DeviceStatus, PublicDevice, DEVICE_COLS,
};

/// Hash determinista (SHA-256 hex) del token; permite buscar/persistir sin el plano.
fn hash_token(plain: &str) -> String {
    let digest = Sha256::digest(plain.as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
}

/// Token de emparejamiento nuevo: 6 bytes CSPRNG (vía UUID v4) en 12 hex mayúsculas.
fn new_pairing_token() -> String {
    let bytes = *Uuid::new_v4().as_bytes();
    let mut hex = String::with_capacity(12);
    for b in &bytes[..6] {
        hex.push_str(&format!("{b:02X}"));
    }
    hex
}

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreateDevice,
) -> Result<CreatedDevice, AppError> {
    input.validate()?;
    let store_id = input.store_id;
    let name = input.name.trim().to_owned();
    let plain = new_pairing_token();
    let token_hash = hash_token(&plain);
    let result: Result<CreatedDevice, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let store: Option<(Uuid,)> =
                sqlx::query_as(r#"SELECT id FROM "Store" WHERE id = $1 AND "organizationId" = $2"#)
                    .bind(store_id)
                    .bind(org)
                    .fetch_optional(&mut **tx)
                    .await?;
            if store.is_none() {
                return Ok(Err(AppError::NotFound));
            }
            let row: DeviceRow = sqlx::query_as(&format!(
                r#"INSERT INTO "OfficialDevice"
                     (id, "organizationId", "storeId", name, "pairingToken", authorized)
                   VALUES ($1, $2, $3, $4, $5, false)
                   RETURNING {DEVICE_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(store_id)
            .bind(&name)
            .bind(&token_hash)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(CreatedDevice {
                device: PublicDevice::from(&row),
                pairing_token: plain.clone(),
                authorized: row.authorized,
            }))
        })
        .await?;
    result
}

pub async fn find_all(
    pool: &PgPool,
    org: Uuid,
    store_id: Option<Uuid>,
) -> Result<Vec<DeviceListItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<DeviceRow> = sqlx::query_as(&format!(
            r#"SELECT {DEVICE_COLS} FROM "OfficialDevice"
               WHERE "organizationId" = $1 AND ($2::uuid IS NULL OR "storeId" = $2)
               ORDER BY "createdAt" DESC"#,
        ))
        .bind(org)
        .bind(store_id)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .iter()
            .map(|d| DeviceListItem {
                device: PublicDevice::from(d),
                authorized: d.authorized,
            })
            .collect())
    })
    .await
}

pub async fn revoke(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected =
            sqlx::query(r#"DELETE FROM "OfficialDevice" WHERE id = $1 AND "organizationId" = $2"#)
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

/// `GET /devices/current?pairingToken=` — estado; refresca `lastSeenAt` si autorizado.
pub async fn status(
    pool: &PgPool,
    org: Uuid,
    pairing_token: Option<String>,
) -> Result<DeviceStatus, AppError> {
    let Some(plain) = pairing_token.filter(|t| !t.is_empty()) else {
        return Ok(DeviceStatus {
            authorized: false,
            device: None,
        });
    };
    let token_hash = hash_token(&plain);
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<DeviceRow> = sqlx::query_as(&format!(
            r#"SELECT {DEVICE_COLS} FROM "OfficialDevice"
               WHERE "pairingToken" = $1 AND "organizationId" = $2"#,
        ))
        .bind(&token_hash)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let Some(device) = row.filter(|d| d.authorized) else {
            return Ok(DeviceStatus {
                authorized: false,
                device: None,
            });
        };
        let updated: DeviceRow = sqlx::query_as(&format!(
            r#"UPDATE "OfficialDevice" SET "lastSeenAt" = now()
               WHERE id = $1 AND "organizationId" = $2 RETURNING {DEVICE_COLS}"#,
        ))
        .bind(device.id)
        .bind(org)
        .fetch_one(&mut **tx)
        .await?;
        Ok(DeviceStatus {
            authorized: true,
            device: Some(PublicDevice::from(&updated)),
        })
    })
    .await
}

/// `POST /devices/pair` — autoriza el dispositivo del token. CLERK solo sobre sus
/// tiendas (KEY-03); ADMIN/MANAGER org-wide.
pub async fn pair(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: PairDevice,
) -> Result<DeviceStatus, AppError> {
    input.validate()?;
    let token_hash = hash_token(&input.pairing_token);
    let result: Result<DeviceStatus, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let row: Option<DeviceRow> = sqlx::query_as(&format!(
                r#"SELECT {DEVICE_COLS} FROM "OfficialDevice"
                   WHERE "pairingToken" = $1 AND "organizationId" = $2"#,
            ))
            .bind(&token_hash)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
            let Some(device) = row else {
                return Ok(Err(AppError::NotFound));
            };
            if !is_org_wide && !has_store_access(tx, user_id, device.store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let updated: DeviceRow = sqlx::query_as(&format!(
                r#"UPDATE "OfficialDevice"
                     SET authorized = true, "pairedAt" = COALESCE("pairedAt", now()), "lastSeenAt" = now()
                   WHERE id = $1 AND "organizationId" = $2 RETURNING {DEVICE_COLS}"#,
            ))
            .bind(device.id)
            .bind(org)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(DeviceStatus {
                authorized: true,
                device: Some(PublicDevice::from(&updated)),
            }))
        })
        .await?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_token_es_sha256_hex_de_64() {
        // SHA-256 de "abc" (vector conocido).
        assert_eq!(
            hash_token("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(hash_token("ABC123").len(), 64);
        assert_eq!(hash_token("x"), hash_token("x")); // determinista
        assert_ne!(hash_token("x"), hash_token("y"));
    }

    #[test]
    fn new_pairing_token_formato_12_hex_mayusculas() {
        let t = new_pairing_token();
        assert_eq!(t.len(), 12);
        assert!(t
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b)));
        assert_ne!(new_pairing_token(), new_pairing_token()); // aleatorio
    }
}
