//! Perfil del usuario autenticado (#154) — port de `MeController.me`. Rol del JWT
//! + tiendas asignadas (UserStore) + identidad (name/email, bajo RLS de `User`).

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::MeProfile;

pub async fn profile(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    role: &str,
) -> Result<MeProfile, AppError> {
    let role = role.to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let store_ids: Vec<Uuid> =
            sqlx::query_scalar(r#"SELECT "storeId" FROM "UserStore" WHERE "userId" = $1"#)
                .bind(user_id)
                .fetch_all(&mut **tx)
                .await?;
        let identity: Option<(String, String)> = sqlx::query_as(
            r#"SELECT name, email FROM "User" WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(user_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        let (name, email) = identity.unwrap_or_default();
        Ok(MeProfile {
            role,
            store_ids,
            name,
            email,
        })
    })
    .await
}
