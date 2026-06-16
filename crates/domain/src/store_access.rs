//! Acceso por tienda (SEC-01) — port de `assertStoreAccess`. ADMIN/MANAGER operan
//! sobre toda la organización; el resto (CLERK) solo sobre tiendas asignadas en
//! `UserStore`. La consulta corre DENTRO de la tx de tenant (RLS), así que un
//! `storeId` ajeno no devuelve fila.

use sqlx::{Postgres, Transaction};
use uuid::Uuid;

/// ¿El usuario tiene asignada la tienda en `UserStore`?
pub async fn has_store_access(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    store_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let found: Option<(Uuid,)> = sqlx::query_as(
        r#"SELECT "storeId" FROM "UserStore" WHERE "userId" = $1 AND "storeId" = $2 LIMIT 1"#,
    )
    .bind(user_id)
    .bind(store_id)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(found.is_some())
}
