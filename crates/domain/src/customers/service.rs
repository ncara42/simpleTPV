//! Servicio de clientes B2B (#154, IT-17) — port de `customers.service.ts`.
//! Función de central (ADMIN/MANAGER en HTTP). El alta gatea el módulo B2B
//! (#127 B: `assert_flag_enabled("b2b")` → 403 si está apagado) y, como la FK
//! solo valida que el id exista, comprueba que la tarifa sea del propio tenant.
//! Todo bajo `with_tenant_tx` (RLS) + filtro `organizationId` explícito.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::feature_flags::assert_flag_enabled;

use super::input::{CreateCustomer, UpdateCustomer};
use super::model::{Customer, CustomerRow};

const CUSTOMER_SELECT: &str = r#"SELECT c.id, c."organizationId" AS organization_id, c.name,
    c.nif, c.email, c.phone, c.address, c."priceListId" AS price_list_id, c.active,
    c."createdAt" AS created_at, c."updatedAt" AS updated_at,
    pl.id AS pl_id, pl.name AS pl_name
    FROM "Customer" c LEFT JOIN "PriceList" pl ON pl.id = c."priceListId""#;

/// La tarifa referenciada debe pertenecer al tenant (requireOwned → 400).
async fn assert_price_list_in_org(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    price_list_id: Uuid,
) -> Result<Result<(), AppError>, sqlx::Error> {
    let found: Option<(Uuid,)> =
        sqlx::query_as(r#"SELECT id FROM "PriceList" WHERE id = $1 AND "organizationId" = $2"#)
            .bind(price_list_id)
            .bind(org)
            .fetch_optional(&mut **tx)
            .await?;
    Ok(if found.is_some() {
        Ok(())
    } else {
        Err(AppError::BadRequest)
    })
}

async fn load(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<Customer>, sqlx::Error> {
    let row: Option<CustomerRow> = sqlx::query_as(&format!(
        r#"{CUSTOMER_SELECT} WHERE c.id = $1 AND c."organizationId" = $2"#
    ))
    .bind(id)
    .bind(org)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(Customer::from))
}

pub async fn list(pool: &PgPool, org: Uuid) -> Result<Vec<Customer>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<CustomerRow> = sqlx::query_as(&format!(
            r#"{CUSTOMER_SELECT} WHERE c."organizationId" = $1 ORDER BY c.name ASC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows.into_iter().map(Customer::from).collect())
    })
    .await
}

pub async fn create(pool: &PgPool, org: Uuid, input: CreateCustomer) -> Result<Customer, AppError> {
    input.validate()?;
    // Gate del módulo B2B (#127 B), fuera de la tx (paridad con `assertEnabled`).
    assert_flag_enabled(pool, org, "b2b", None).await?;
    let result: Result<Customer, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if let Some(plid) = input.price_list_id {
            if let Err(e) = assert_price_list_in_org(tx, org, plid).await? {
                return Ok(Err(e));
            }
        }
        let id: Uuid = sqlx::query_scalar(
            r#"INSERT INTO "Customer"
                 (id, "organizationId", name, nif, email, phone, address, "priceListId", active, "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, true), now())
               RETURNING id"#,
        )
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(input.name.trim())
        .bind(input.nif.as_deref())
        .bind(input.email.as_deref())
        .bind(input.phone.as_deref())
        .bind(input.address.as_deref())
        .bind(input.price_list_id)
        .bind(input.active)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Ok(load(tx, org, id).await?.expect("recién creado")))
    })
    .await?;
    result
}

pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdateCustomer,
) -> Result<Customer, AppError> {
    input.validate()?;
    let result: Result<Customer, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        if let Some(Some(plid)) = input.price_list_id {
            if let Err(e) = assert_price_list_in_org(tx, org, plid).await? {
                return Ok(Err(e));
            }
        }
        let (set_pl, new_pl) = match input.price_list_id {
            None => (false, None),
            Some(p) => (true, p),
        };
        let touched = sqlx::query(
            r#"UPDATE "Customer" SET
                 name = COALESCE($3, name),
                 nif = COALESCE($4, nif),
                 email = COALESCE($5, email),
                 phone = COALESCE($6, phone),
                 address = COALESCE($7, address),
                 "priceListId" = CASE WHEN $8 THEN $9 ELSE "priceListId" END,
                 active = COALESCE($10, active),
                 "updatedAt" = now()
               WHERE id = $1 AND "organizationId" = $2"#,
        )
        .bind(id)
        .bind(org)
        .bind(input.name.map(|n| n.trim().to_owned()))
        .bind(input.nif)
        .bind(input.email)
        .bind(input.phone)
        .bind(input.address)
        .bind(set_pl)
        .bind(new_pl)
        .bind(input.active)
        .execute(&mut **tx)
        .await?
        .rows_affected();
        if touched == 0 {
            return Ok(Err(AppError::NotFound));
        }
        Ok(Ok(load(tx, org, id).await?.expect("actualizado")))
    })
    .await?;
    result
}

/// Borrado idempotente (paridad con `deleteMany`: 204 aunque no exista).
pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query(r#"DELETE FROM "Customer" WHERE id = $1 AND "organizationId" = $2"#)
            .bind(id)
            .bind(org)
            .execute(&mut **tx)
            .await?;
        Ok(())
    })
    .await
}
