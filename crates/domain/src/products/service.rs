//! Servicio de catálogo — port de `products.service.ts`.
//!
//! Toda lectura/escritura pasa por [`with_tenant_tx`] ⇒ RLS por tenant activo (un
//! producto de otra organización ni se ve ni se toca: sin filas → `NotFound`).
//! Funciones libres que reciben el pool RLS (`app`) + `organization_id` del token.

use std::str::FromStr;

use rust_decimal::Decimal;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::limits::{max_price, MAX_BARCODE_LENGTH, MAX_NAME_LENGTH};
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

use super::input::{NewProduct, ProductPatch};
use super::model::{Product, SaleUnit};
use crate::csv::{parse_csv, row_number, ImportResult, RowError};

/// Columnas de `Product` con alias snake_case para `FromRow`. El enum `saleUnit`
/// se decodifica directo (sqlx `Type` sobre el tipo Postgres `"SaleUnit"`).
const COLS: &str = r#"id, "organizationId" AS organization_id, "familyId" AS family_id,
    name, description, barcode, sku, "saleUnit"::text AS sale_unit, "unitSymbol" AS unit_symbol,
    "salePrice" AS sale_price, "costPrice" AS cost_price, "taxRate" AS tax_rate,
    "imageUrl" AS image_url, active, "tracksBatch" AS tracks_batch,
    "createdAt" AS created_at, "updatedAt" AS updated_at"#;

/// Valores resueltos para un INSERT (con los defaults del esquema ya aplicados en
/// Rust: Prisma genera los `@default(uuid()/now())` en el cliente, no en la BD).
#[derive(Debug)]
struct InsertValues {
    family_id: Option<Uuid>,
    name: String,
    description: Option<String>,
    barcode: Option<String>,
    sku: Option<String>,
    sale_unit: SaleUnit,
    unit_symbol: String,
    sale_price: Decimal,
    cost_price: Decimal,
    tax_rate: Decimal,
}

impl InsertValues {
    /// Valores con los defaults del esquema (saleUnit UNIT, unitSymbol "ud",
    /// costPrice 0, taxRate 21, active true, tracksBatch false).
    fn with_defaults(name: String, sale_price: Decimal) -> Self {
        Self {
            family_id: None,
            name,
            description: None,
            barcode: None,
            sku: None,
            sale_unit: SaleUnit::Unit,
            unit_symbol: "ud".to_owned(),
            sale_price,
            cost_price: Decimal::ZERO,
            tax_rate: Decimal::new(21, 0),
        }
    }
}

/// INSERT de un producto dentro de la transacción de tenant. `organizationId` se
/// fija explícito (el RLS filtra, pero el INSERT lo necesita); `id` y timestamps
/// se generan aquí.
async fn insert(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    v: InsertValues,
) -> Result<Product, sqlx::Error> {
    let sql = format!(
        r#"INSERT INTO "Product"
            (id, "organizationId", "familyId", name, description, barcode, sku,
             "saleUnit", "unitSymbol", "salePrice", "costPrice", "taxRate",
             active, "tracksBatch", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"SaleUnit", $9, $10, $11, $12, true, false, now(), now())
           RETURNING {COLS}"#
    );
    sqlx::query_as(&sql)
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(v.family_id)
        .bind(v.name)
        .bind(v.description)
        .bind(v.barcode)
        .bind(v.sku)
        .bind(v.sale_unit)
        .bind(v.unit_symbol)
        .bind(v.sale_price)
        .bind(v.cost_price)
        .bind(v.tax_rate)
        .fetch_one(&mut **tx)
        .await
}

/// `POST /products` — crea un producto en el tenant del token.
pub async fn create(pool: &PgPool, org: Uuid, input: NewProduct) -> Result<Product, AppError> {
    input.validate()?;
    let values = InsertValues {
        family_id: input.family_id,
        name: input.name,
        description: input.description,
        barcode: input.barcode,
        sku: input.sku,
        sale_unit: input.sale_unit.unwrap_or(SaleUnit::Unit),
        unit_symbol: input.unit_symbol.unwrap_or_else(|| "ud".to_owned()),
        sale_price: input.sale_price,
        cost_price: input.cost_price.unwrap_or(Decimal::ZERO),
        tax_rate: input.tax_rate.unwrap_or_else(|| Decimal::new(21, 0)),
    };
    with_tenant_tx(pool, org, async move |tx, _after| {
        insert(tx, org, values).await
    })
    .await
}

/// `GET /products` — búsqueda ILIKE por name/sku/barcode + filtro por familia,
/// orden alfabético. Sin filtros, lista todo el catálogo del tenant.
pub async fn find_all(
    pool: &PgPool,
    org: Uuid,
    search: Option<&str>,
    family_id: Option<Uuid>,
) -> Result<Vec<Product>, AppError> {
    // Patrón ILIKE con los comodines del usuario neutralizados (`ESCAPE '\'`).
    let term_pattern = search
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|t| format!("%{}%", escape_like(t)));
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("SELECT ");
        qb.push(COLS).push(" FROM \"Product\"");
        let has_where = term_pattern.is_some();
        if let Some(p) = term_pattern.as_deref() {
            qb.push(" WHERE (name ILIKE ")
                .push_bind(p)
                .push(" ESCAPE '\\' OR sku ILIKE ")
                .push_bind(p)
                .push(" ESCAPE '\\' OR barcode ILIKE ")
                .push_bind(p)
                .push(" ESCAPE '\\')");
        }
        if let Some(fid) = family_id {
            qb.push(if has_where { " AND " } else { " WHERE " })
                .push("\"familyId\" = ")
                .push_bind(fid);
        }
        qb.push(" ORDER BY name ASC");
        qb.build_query_as::<Product>().fetch_all(&mut **tx).await
    })
    .await
}

/// `GET /products/:id` — 404 si no existe (o pertenece a otro tenant: RLS).
pub async fn find_one(pool: &PgPool, org: Uuid, id: Uuid) -> Result<Product, AppError> {
    let sql = format!("SELECT {COLS} FROM \"Product\" WHERE id = $1");
    let found: Option<Product> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&sql)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `GET /products/barcode/:code` — búsqueda exacta por código de barras.
pub async fn find_by_barcode(pool: &PgPool, org: Uuid, code: &str) -> Result<Product, AppError> {
    let sql = format!("SELECT {COLS} FROM \"Product\" WHERE barcode = $1");
    let code = code.to_owned();
    let found: Option<Product> = with_tenant_tx(pool, org, async move |tx, _after| {
        sqlx::query_as(&sql)
            .bind(code)
            .fetch_optional(&mut **tx)
            .await
    })
    .await?;
    found.ok_or(AppError::NotFound)
}

/// `PATCH /products/:id` — actualización parcial. Carga la fila (404 si no
/// existe), funde el patch sobre los valores actuales y reescribe en la MISMA
/// transacción (consistencia + RLS WITH CHECK).
pub async fn update(
    pool: &PgPool,
    org: Uuid,
    id: Uuid,
    patch: ProductPatch,
) -> Result<Product, AppError> {
    patch.validate()?;
    let select = format!("SELECT {COLS} FROM \"Product\" WHERE id = $1");
    let update = format!(
        r#"UPDATE "Product" SET
            "familyId" = $2, name = $3, description = $4, barcode = $5, sku = $6,
            "saleUnit" = $7::"SaleUnit", "unitSymbol" = $8, "salePrice" = $9, "costPrice" = $10,
            "taxRate" = $11, active = $12, "updatedAt" = now()
           WHERE id = $1
           RETURNING {COLS}"#
    );
    let updated: Option<Product> = with_tenant_tx(pool, org, async move |tx, _after| {
        let current: Option<Product> = sqlx::query_as(&select)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?;
        let Some(current) = current else {
            return Ok(None);
        };
        // Funde: campo ausente → conserva; en anulables, `Some(None)` → borra.
        let family_id = patch.family_id.unwrap_or(current.family_id);
        let name = patch.name.unwrap_or(current.name);
        let description = patch.description.unwrap_or(current.description);
        let barcode = patch.barcode.unwrap_or(current.barcode);
        let sku = patch.sku.unwrap_or(current.sku);
        let sale_unit = patch.sale_unit.unwrap_or(current.sale_unit);
        let unit_symbol = patch.unit_symbol.unwrap_or(current.unit_symbol);
        let sale_price = patch.sale_price.unwrap_or(current.sale_price);
        let cost_price = patch.cost_price.unwrap_or(current.cost_price);
        let tax_rate = patch.tax_rate.unwrap_or(current.tax_rate);
        let active = patch.active.unwrap_or(current.active);

        let row: Product = sqlx::query_as(&update)
            .bind(id)
            .bind(family_id)
            .bind(name)
            .bind(description)
            .bind(barcode)
            .bind(sku)
            .bind(sale_unit)
            .bind(unit_symbol)
            .bind(sale_price)
            .bind(cost_price)
            .bind(tax_rate)
            .bind(active)
            .fetch_one(&mut **tx)
            .await?;
        Ok(Some(row))
    })
    .await?;
    updated.ok_or(AppError::NotFound)
}

/// `DELETE /products/:id` — borrado físico (paridad NestJS). 404 si no existe;
/// una FK que lo referencie (ventas, stock...) la clasifica `with_tenant_tx`
/// como `Conflict` (409).
pub async fn remove(pool: &PgPool, org: Uuid, id: Uuid) -> Result<(), AppError> {
    let existed: bool = with_tenant_tx(pool, org, async move |tx, _after| {
        let found: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM \"Product\" WHERE id = $1")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?;
        if found.is_none() {
            return Ok(false);
        }
        sqlx::query("DELETE FROM \"Product\" WHERE id = $1")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        Ok(true)
    })
    .await?;
    if existed {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

/// `POST /products/import` — importación masiva CSV. Parsea, valida fila a fila e
/// inserta las válidas en la MISMA transacción; reporta los errores por fila sin
/// abortar el lote (port de `importCsv`).
pub async fn import_csv(pool: &PgPool, org: Uuid, csv: &str) -> Result<ImportResult, AppError> {
    let rows = parse_csv(csv)?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let mut inserted = 0u64;
        let mut errors: Vec<RowError> = Vec::new();
        for (idx, cells) in rows.iter().enumerate() {
            let row = row_number(idx);
            let name = cells.get("name").map(|s| s.trim()).unwrap_or("");
            let price_raw = cells.get("salePrice").map(|s| s.trim()).unwrap_or("");
            if name.is_empty() {
                errors.push(RowError {
                    row,
                    message: "Falta el nombre".to_owned(),
                });
                continue;
            }
            let Ok(price) = Decimal::from_str(price_raw) else {
                errors.push(RowError {
                    row,
                    message: "Precio inválido".to_owned(),
                });
                continue;
            };
            if price < Decimal::ZERO || price > max_price() {
                errors.push(RowError {
                    row,
                    message: "Precio fuera de rango (0–999999.9999)".to_owned(),
                });
                continue;
            }
            let sku = cells.get("sku").map(|s| s.trim()).filter(|s| !s.is_empty());
            let barcode = cells
                .get("barcode")
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());
            // Mismas cotas de longitud que `CreateProductDto` (el body global ya
            // está acotado a 64kb por `RequestBodyLimitLayer`; esto cierra el
            // hueco por campo, que el import a mano no validaba).
            let too_long = name.chars().count() > MAX_NAME_LENGTH
                || sku.is_some_and(|s| s.chars().count() > MAX_BARCODE_LENGTH)
                || barcode.is_some_and(|s| s.chars().count() > MAX_BARCODE_LENGTH);
            if too_long {
                errors.push(RowError {
                    row,
                    message: "Campo demasiado largo".to_owned(),
                });
                continue;
            }
            let mut values = InsertValues::with_defaults(name.to_owned(), price);
            values.sku = sku.map(str::to_owned);
            values.barcode = barcode.map(str::to_owned);
            // El INSERT es atómico para todo el lote (paridad con `createMany` de
            // Prisma): si una fila VÁLIDA viola un constraint de BD (p. ej. barcode
            // duplicado), `?` propaga y `with_tenant_tx` revierte toda la importación.
            insert(tx, org, values).await?;
            inserted += 1;
        }
        Ok(ImportResult { inserted, errors })
    })
    .await
}

/// Escapa los metacaracteres de `LIKE`/`ILIKE` (`\`, `%`, `_`) en el término de
/// búsqueda para que el usuario no inyecte comodines (se usa con `ESCAPE '\'`).
fn escape_like(term: &str) -> String {
    let mut out = String::with_capacity(term.len());
    for ch in term.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_like_neutraliza_comodines() {
        assert_eq!(escape_like("a%b_c\\d"), "a\\%b\\_c\\\\d");
        assert_eq!(escape_like("normal"), "normal");
    }
}
