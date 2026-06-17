//! Servicio de familias de producto (#154) — port de `product-families.service.ts`.
//! Árbol jerárquico con dos invariantes: (1) un arquetipo es hoja de
//! clasificación (solo productos, nunca subfamilias) y (2) reparentar no puede
//! crear un ciclo. Todo bajo `with_tenant_tx` (RLS) + filtro `organizationId`
//! explícito (defensa en profundidad).

use std::collections::HashSet;

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use super::input::{CreateFamily, UpdateFamily};
use super::model::{build_tree, FamilyNode, ProductFamily};

const FAMILY_COLS: &str = r#"id, "organizationId" AS organization_id, "parentId" AS parent_id,
    name, color, icon, "sortOrder" AS sort_order, "isArchetype" AS is_archetype,
    "createdAt" AS created_at, "updatedAt" AS updated_at"#;

async fn load_family(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
) -> Result<Option<ProductFamily>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {FAMILY_COLS} FROM "ProductFamily" WHERE id = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as(&sql)
        .bind(id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await
}

/// Sube por la cadena de ancestros de `new_parent`; si aparece `id`, reparentar
/// `id` bajo `new_parent` crearía un ciclo → `Err(BadRequest)`.
async fn check_no_cycle(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    id: Uuid,
    new_parent: Uuid,
) -> Result<Result<(), AppError>, sqlx::Error> {
    let mut cursor = Some(new_parent);
    let mut visited: HashSet<Uuid> = HashSet::new();
    while let Some(c) = cursor {
        if c == id {
            return Ok(Err(AppError::BadRequest)); // ciclo
        }
        if !visited.insert(c) {
            break; // ciclo preexistente ajeno a este movimiento; cortar
        }
        match load_family(tx, org, c).await? {
            Some(node) => cursor = node.parent_id,
            None => return Ok(Err(AppError::NotFound)), // ancestro inexistente
        }
    }
    Ok(Ok(()))
}

pub async fn create(
    pool: &PgPool,
    org: Uuid,
    input: CreateFamily,
) -> Result<ProductFamily, AppError> {
    input.validate()?;
    let result: Result<ProductFamily, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if let Some(parent_id) = input.parent_id {
                match load_family(tx, org, parent_id).await? {
                    None => return Ok(Err(AppError::NotFound)),
                    // Un arquetipo solo admite productos, no subfamilias.
                    Some(p) if p.is_archetype => return Ok(Err(AppError::BadRequest)),
                    Some(_) => {}
                }
            }
            let row: ProductFamily = sqlx::query_as(&format!(
                r#"INSERT INTO "ProductFamily"
                     (id, "organizationId", "parentId", name, color, icon, "sortOrder", "isArchetype", "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), COALESCE($8, false), now())
                   RETURNING {FAMILY_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(input.parent_id)
            .bind(input.name.trim())
            .bind(input.color.as_deref())
            .bind(input.icon.as_deref())
            .bind(input.sort_order)
            .bind(input.is_archetype)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(row))
        })
        .await?;
    result
}

pub async fn find_tree(pool: &PgPool, org: Uuid) -> Result<Vec<FamilyNode>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows: Vec<ProductFamily> = sqlx::query_as(&format!(
            r#"SELECT {FAMILY_COLS} FROM "ProductFamily" WHERE "organizationId" = $1
               ORDER BY "sortOrder" ASC, name ASC"#,
        ))
        .bind(org)
        .fetch_all(&mut **tx)
        .await?;
        Ok(build_tree(rows))
    })
    .await
}

pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    input: UpdateFamily,
) -> Result<ProductFamily, AppError> {
    input.validate()?;
    let result: Result<ProductFamily, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if load_family(tx, org, id).await?.is_none() {
                return Ok(Err(AppError::NotFound));
            }
            // Reparentado: Some(Some(p)) exige validar; Some(None) = mover a raíz.
            if let Some(Some(parent_id)) = input.parent_id {
                if parent_id == id {
                    return Ok(Err(AppError::BadRequest)); // padre de sí mismo
                }
                match load_family(tx, org, parent_id).await? {
                    None => return Ok(Err(AppError::NotFound)),
                    Some(p) if p.is_archetype => return Ok(Err(AppError::BadRequest)),
                    Some(_) => {}
                }
                match check_no_cycle(tx, org, id, parent_id).await? {
                    Ok(()) => {}
                    Err(e) => return Ok(Err(e)),
                }
            }
            // Marcar arquetipo exige que el nodo no tenga subfamilias.
            if input.is_archetype == Some(true) {
                let children: i64 = sqlx::query_scalar(
                    r#"SELECT COUNT(*) FROM "ProductFamily" WHERE "parentId" = $1 AND "organizationId" = $2"#,
                )
                .bind(id)
                .bind(org)
                .fetch_one(&mut **tx)
                .await?;
                if children > 0 {
                    return Ok(Err(AppError::BadRequest));
                }
            }
            let (set_parent, new_parent) = match input.parent_id {
                None => (false, None),
                Some(p) => (true, p),
            };
            let row: ProductFamily = sqlx::query_as(&format!(
                r#"UPDATE "ProductFamily" SET
                     name = COALESCE($2, name),
                     color = COALESCE($3, color),
                     icon = COALESCE($4, icon),
                     "sortOrder" = COALESCE($5, "sortOrder"),
                     "isArchetype" = COALESCE($6, "isArchetype"),
                     "parentId" = CASE WHEN $7 THEN $8 ELSE "parentId" END,
                     "updatedAt" = now()
                   WHERE id = $1 AND "organizationId" = $9
                   RETURNING {FAMILY_COLS}"#,
            ))
            .bind(id)
            .bind(input.name.map(|n| n.trim().to_owned()))
            .bind(input.color)
            .bind(input.icon)
            .bind(input.sort_order)
            .bind(input.is_archetype)
            .bind(set_parent)
            .bind(new_parent)
            .bind(org)
            .fetch_one(&mut **tx)
            .await?;
            Ok(Ok(row))
        })
        .await?;
    result
}

pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let affected =
            sqlx::query(r#"DELETE FROM "ProductFamily" WHERE id = $1 AND "organizationId" = $2"#)
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
