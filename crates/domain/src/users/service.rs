//! Servicio de usuarios (#153) — port de `users.service.ts`. Todo bajo
//! `with_tenant_tx` (RLS). Las contraseñas/PIN se hashean con bcrypt cost 10 vía
//! `simpletpv_auth` (no se duplica el hashing). NUNCA devuelve hashes.

use simpletpv_auth::password::hash_password;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::PgPool;
use uuid::Uuid;

use crate::csv::{parse_csv, row_number, ImportResult, RowError};

use super::input::{parse_role, valid_email, valid_password, CreateUser, UpdateUser};
use super::model::{PublicUser, UserListItem};

/// Columnas públicas (jamás `passwordHash`/`pinHash`).
const PUBLIC_COLS: &str =
    r#"id, email, name, role::text AS role, active, "createdAt" AS created_at"#;

/// `POST /users` — alta de usuario (hashea la contraseña).
pub async fn create(pool: &PgPool, org: Uuid, input: CreateUser) -> Result<PublicUser, AppError> {
    let role = input.validate()?;
    let password_hash = hash_password(input.password.clone()).await;
    let email = input.email.trim().to_owned();
    let name = input.name.trim().to_owned();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let user: PublicUser = sqlx::query_as(&format!(
            r#"INSERT INTO "User" (id, "organizationId", email, name, "passwordHash", role, active)
               VALUES ($1, $2, $3, $4, $5, $6::"UserRole", true)
               RETURNING {PUBLIC_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(email)
        .bind(name)
        .bind(password_hash)
        .bind(role)
        .fetch_one(&mut **tx)
        .await?;
        Ok(user)
    })
    .await
}

/// `GET /users` — lista con las tiendas asignadas (storeIds) por usuario.
pub async fn find_all(pool: &PgPool, org: Uuid) -> Result<Vec<UserListItem>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let users: Vec<UserListItem> = sqlx::query_as(
            r#"SELECT u.id, u.email, u.name, u.role::text AS role, u.active,
                 u."createdAt" AS created_at,
                 COALESCE(array_agg(us."storeId") FILTER (WHERE us."storeId" IS NOT NULL), '{}')
                   AS store_ids
               FROM "User" u
               LEFT JOIN "UserStore" us ON us."userId" = u.id
               GROUP BY u.id
               ORDER BY u.name ASC"#,
        )
        .fetch_all(&mut **tx)
        .await?;
        Ok(users)
    })
    .await
}

/// `PATCH /users/:id` — actualiza campos (rehashea la contraseña si viene). 404
/// si no existe en el tenant.
pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdateUser,
) -> Result<PublicUser, AppError> {
    let role = input.validate()?;
    let password_hash = match &input.password {
        Some(p) => Some(hash_password(p.clone()).await),
        None => None,
    };
    let name = input.name.map(|n| n.trim().to_owned());
    let email = input.email.map(|e| e.trim().to_owned());
    let active = input.active;
    let found: Option<PublicUser> = with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<PublicUser> = sqlx::query_as(&format!(
            r#"UPDATE "User" SET
                 name = COALESCE($2, name),
                 email = COALESCE($3, email),
                 role = COALESCE($4::"UserRole", role),
                 active = COALESCE($5, active),
                 "passwordHash" = COALESCE($6, "passwordHash")
               WHERE id = $1
               RETURNING {PUBLIC_COLS}"#,
        ))
        .bind(id)
        .bind(name)
        .bind(email)
        .bind(role)
        .bind(active)
        .bind(password_hash)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `DELETE /users/:id` — borra el usuario. 404 si no existe.
pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
            .bind(id)
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

/// `PUT /users/:id/pin` — fija el PIN (hash bcrypt). 404 si no existe.
pub async fn set_pin(pool: &PgPool, org: Uuid, id: Uuid, pin: String) -> Result<(), AppError> {
    let pin_hash = hash_password(pin).await;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected = sqlx::query(r#"UPDATE "User" SET "pinHash" = $2 WHERE id = $1"#)
            .bind(id)
            .bind(pin_hash)
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

/// `PUT /users/:id/stores` — reemplaza las tiendas asignadas. Valida que cada
/// tienda pertenezca al tenant (vía `Store`, protegido por RLS) — sin esto un
/// ADMIN podría enlazar tiendas de otra organización. 404 si el usuario no existe.
pub async fn assign_stores(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    store_ids: Vec<Uuid>,
) -> Result<(), AppError> {
    // Dedup preservando unicidad (como el Set de NestJS).
    let mut unique: Vec<Uuid> = Vec::new();
    for s in store_ids {
        if !unique.contains(&s) {
            unique.push(s);
        }
    }
    with_tenant_tx(pool, org, async move |tx, _after| {
        let exists: Option<(Uuid,)> = sqlx::query_as(r#"SELECT id FROM "User" WHERE id = $1"#)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?;
        if exists.is_none() {
            return Ok(Err(AppError::NotFound));
        }
        if !unique.is_empty() {
            let owned: i64 =
                sqlx::query_scalar(r#"SELECT count(*) FROM "Store" WHERE id = ANY($1)"#)
                    .bind(&unique)
                    .fetch_one(&mut **tx)
                    .await?;
            if owned != unique.len() as i64 {
                return Ok(Err(AppError::BadRequest)); // tienda ajena o inexistente
            }
        }
        sqlx::query(r#"DELETE FROM "UserStore" WHERE "userId" = $1"#)
            .bind(id)
            .execute(&mut **tx)
            .await?;
        for store_id in &unique {
            sqlx::query(r#"INSERT INTO "UserStore" ("userId", "storeId") VALUES ($1, $2)"#)
                .bind(id)
                .bind(store_id)
                .execute(&mut **tx)
                .await?;
        }
        Ok(Ok(()))
    })
    .await?
}

/// `POST /users/import` — alta en lote desde CSV (`email,name,password,role`).
/// Valida cada fila como el alta manual; las válidas se crean (emails duplicados
/// se ignoran), las inválidas se reportan por nº de fila sin abortar el lote.
pub async fn import_csv(pool: &PgPool, org: Uuid, csv: &str) -> Result<ImportResult, AppError> {
    let rows = parse_csv(csv)?;
    let mut errors: Vec<RowError> = Vec::new();
    let mut prepared: Vec<(String, String, String, super::model::UserRole)> = Vec::new();

    for (idx, cells) in rows.iter().enumerate() {
        let row = row_number(idx);
        let email = cells
            .get("email")
            .map(|s| s.trim().to_lowercase())
            .unwrap_or_default();
        let name = cells
            .get("name")
            .map(|s| s.trim().to_owned())
            .unwrap_or_default();
        let password = cells.get("password").cloned().unwrap_or_default();
        let role_raw = cells.get("role").cloned().unwrap_or_default();

        if !valid_email(&email) {
            errors.push(RowError {
                row,
                message: "Email inválido".into(),
            });
            continue;
        }
        if name.is_empty() {
            errors.push(RowError {
                row,
                message: "Falta el nombre".into(),
            });
            continue;
        }
        if password.len() < 8 {
            errors.push(RowError {
                row,
                message: "La contraseña debe tener al menos 8 caracteres".into(),
            });
            continue;
        }
        if !valid_password(&password) {
            errors.push(RowError {
                row,
                message: "La contraseña no puede superar los 72 caracteres".into(),
            });
            continue;
        }
        let Ok(role) = parse_role(&role_raw) else {
            errors.push(RowError {
                row,
                message: "Rol inválido (ADMIN, MANAGER o CLERK)".into(),
            });
            continue;
        };
        prepared.push((email, name, password, role));
    }

    let mut inserted: u64 = 0;
    if !prepared.is_empty() {
        // Hash de las contraseñas (secuencial; la ruta va con rate-limit aparte).
        let mut hashed: Vec<(String, String, String, super::model::UserRole)> = Vec::new();
        for (email, name, password, role) in prepared {
            let h = hash_password(password).await;
            hashed.push((email, name, h, role));
        }
        inserted = with_tenant_tx(pool, org, async move |tx, _after| {
            let mut count: u64 = 0;
            for (email, name, password_hash, role) in &hashed {
                let affected = sqlx::query(
                    r#"INSERT INTO "User" (id, "organizationId", email, name, "passwordHash", role, active)
                       VALUES ($1, $2, $3, $4, $5, $6::"UserRole", true)
                       ON CONFLICT (email) DO NOTHING"#,
                )
                .bind(Uuid::new_v4())
                .bind(org)
                .bind(email)
                .bind(name)
                .bind(password_hash)
                .bind(*role)
                .execute(&mut **tx)
                .await?
                .rows_affected();
                count += affected;
            }
            Ok(count)
        })
        .await?;
    }

    Ok(ImportResult { inserted, errors })
}
