//! Servicio de marca corporativa (#154, U-08) — port de `branding.service.ts`.
//! Lectura/escritura acotadas a la organización del actor por RLS + filtro
//! explícito `id = $org` (el `organizationId` del JWT ES el id de la org).

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::input::UpdateBranding;
use super::model::Branding;

const BRANDING_COLS: &str = r#""brandColor" AS brand_color, "logoUrl" AS logo_url"#;

pub async fn get(pool: &PgPool, org: Uuid) -> Result<Branding, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<Branding> = sqlx::query_as(&format!(
            r#"SELECT {BRANDING_COLS} FROM "Organization" WHERE id = $1"#,
        ))
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row.unwrap_or(Branding {
            brand_color: None,
            logo_url: None,
        }))
    })
    .await
}

pub async fn update(pool: &PgPool, org: Uuid, input: UpdateBranding) -> Result<Branding, AppError> {
    input.validate()?;
    // (set, value): None = no tocar; Some(v) = fijar (v puede ser NULL = default).
    let (set_color, color) = match input.brand_color {
        None => (false, None),
        Some(c) => (true, c),
    };
    let (set_logo, logo) = match input.logo_url {
        None => (false, None),
        Some(l) => (true, l),
    };
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Branding = sqlx::query_as(&format!(
            r#"UPDATE "Organization" SET
                 "brandColor" = CASE WHEN $2 THEN $3 ELSE "brandColor" END,
                 "logoUrl" = CASE WHEN $4 THEN $5 ELSE "logoUrl" END
               WHERE id = $1
               RETURNING {BRANDING_COLS}"#,
        ))
        .bind(org)
        .bind(set_color)
        .bind(color)
        .bind(set_logo)
        .bind(logo)
        .fetch_one(&mut **tx)
        .await?;
        Ok(row)
    })
    .await
}
