//! Servicio de devoluciones — port (con ticket) de `returns.service.ts`. Todo bajo
//! `with_tenant_tx` (RLS). Repone stock al lote original vía
//! `stock::apply_batched_return`. La devolución ciega (con PIN) y el registro
//! VeriFactu llegan en slices posteriores.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use rust_decimal::Decimal;
use simpletpv_auth::password::verify_password;
use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::stock::service::apply_batched_return;
use crate::store_access::has_store_access;

use super::domain::{compute_return_line_total, compute_returnable};
use super::input::{CreateBlindReturn, CreateReturn};
use super::model::{Return, ReturnLine, ReturnWithLines};

const RETURN_COLS: &str = r#"id, "organizationId" AS organization_id, "storeId" AS store_id,
    "userId" AS user_id, "saleId" AS sale_id, "authorizedBy" AS authorized_by, reason, total,
    "createdAt" AS created_at"#;

const RETURN_LINE_COLS: &str = r#"id, "organizationId" AS organization_id, "returnId" AS return_id,
    "saleLineId" AS sale_line_id, "productId" AS product_id, qty, "lineTotal" AS line_total"#;

#[derive(sqlx::FromRow)]
struct SaleLineRow {
    id: Uuid,
    qty: Decimal,
    line_total: Decimal,
    product_id: Uuid,
}

/// `POST /returns` — devolución parcial/total contra un ticket de venta.
pub async fn create(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: CreateReturn,
) -> Result<ReturnWithLines, AppError> {
    input.validate()?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Lock pesimista sobre la venta (serializa devoluciones concurrentes).
        sqlx::query(r#"SELECT id FROM "Sale" WHERE id = $1 FOR UPDATE"#)
            .bind(input.sale_id)
            .execute(&mut **tx)
            .await?;

        // Venta + estado + tienda (para el acceso por tienda y el storeId del Return).
        let sale: Option<(Uuid, String)> = sqlx::query_as(
            r#"SELECT "storeId", status::text FROM "Sale" WHERE id = $1"#,
        )
        .bind(input.sale_id)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((store_id, status)) = sale else {
            return Ok(Err(AppError::NotFound));
        };
        if status == "VOIDED" {
            return Ok(Err(AppError::BadRequest)); // no se devuelve una venta anulada
        }
        // Acceso por tienda (SEC-01): el CLERK solo devuelve de sus tiendas.
        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }

        // Líneas de la venta (por id) y lo ya devuelto por línea.
        let sale_lines: Vec<SaleLineRow> = sqlx::query_as(
            r#"SELECT id, qty, "lineTotal" AS line_total, "productId" AS product_id
               FROM "SaleLine" WHERE "saleId" = $1"#,
        )
        .bind(input.sale_id)
        .fetch_all(&mut **tx)
        .await?;
        let line_by_id: std::collections::HashMap<Uuid, &SaleLineRow> =
            sale_lines.iter().map(|l| (l.id, l)).collect();

        let sale_line_ids: Vec<Uuid> = sale_lines.iter().map(|l| l.id).collect();
        let returned: Vec<(Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT "saleLineId", COALESCE(SUM(qty), 0) FROM "ReturnLine"
               WHERE "saleLineId" = ANY($1) GROUP BY "saleLineId""#,
        )
        .bind(&sale_line_ids)
        .fetch_all(&mut **tx)
        .await?;
        let returned_by_line: std::collections::HashMap<Uuid, Decimal> =
            returned.into_iter().collect();

        // Valida cada línea y calcula su importe proporcional.
        struct Resolved {
            sale_line_id: Uuid,
            product_id: Uuid,
            qty: Decimal,
            line_total: Decimal,
        }
        let mut resolved = Vec::with_capacity(input.lines.len());
        for l in &input.lines {
            let Some(sale_line) = line_by_id.get(&l.sale_line_id) else {
                return Ok(Err(AppError::BadRequest)); // línea ajena a la venta
            };
            let already = returned_by_line
                .get(&l.sale_line_id)
                .copied()
                .unwrap_or(Decimal::ZERO);
            let available = compute_returnable(sale_line.qty, already);
            if l.qty > available {
                return Ok(Err(AppError::BadRequest)); // más de lo devolvible
            }
            let line_total = compute_return_line_total(sale_line.line_total, sale_line.qty, l.qty);
            resolved.push(Resolved {
                sale_line_id: l.sale_line_id,
                product_id: sale_line.product_id,
                qty: l.qty,
                line_total,
            });
        }
        let total: Decimal = resolved
            .iter()
            .map(|r| r.line_total)
            .sum::<Decimal>()
            .round_dp(2);

        // INSERT del Return (authorizedBy null: devolución con ticket).
        let return_id = Uuid::new_v4();
        let return_row: Return = sqlx::query_as(&format!(
            r#"INSERT INTO "Return" (id, "organizationId", "storeId", "userId", "saleId", reason, total, "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, now())
               RETURNING {RETURN_COLS}"#,
        ))
        .bind(return_id)
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .bind(input.sale_id)
        .bind(&input.reason)
        .bind(total)
        .fetch_one(&mut **tx)
        .await?;

        // INSERT de las líneas + reposición de stock al lote original.
        let mut lines = Vec::with_capacity(resolved.len());
        for r in &resolved {
            let line: ReturnLine = sqlx::query_as(&format!(
                r#"INSERT INTO "ReturnLine" (id, "organizationId", "returnId", "saleLineId", "productId", qty, "lineTotal")
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   RETURNING {RETURN_LINE_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(return_id)
            .bind(r.sale_line_id)
            .bind(r.product_id)
            .bind(r.qty)
            .bind(r.line_total)
            .fetch_one(&mut **tx)
            .await?;
            lines.push(line);

            apply_batched_return(
                tx,
                org,
                r.product_id,
                store_id,
                Some(input.sale_id),
                r.qty,
                Some(return_id),
                Some(user_id),
            )
            .await?;
        }

        Ok(Ok(ReturnWithLines { return_: return_row, lines }))
    })
    .await?
}

/// `GET /returns?saleId=` — devoluciones de una venta (más recientes primero).
pub async fn list(
    pool: &PgPool,
    org: Uuid,
    sale_id: Uuid,
) -> Result<Vec<ReturnWithLines>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let returns: Vec<Return> = sqlx::query_as(&format!(
            r#"SELECT {RETURN_COLS} FROM "Return" WHERE "saleId" = $1 ORDER BY "createdAt" DESC"#,
        ))
        .bind(sale_id)
        .fetch_all(&mut **tx)
        .await?;

        let mut out = Vec::with_capacity(returns.len());
        for r in returns {
            let lines = load_return_lines(tx, r.id).await?;
            out.push(ReturnWithLines { return_: r, lines });
        }
        Ok(out)
    })
    .await
}

async fn load_return_lines(
    tx: &mut Transaction<'_, Postgres>,
    return_id: Uuid,
) -> Result<Vec<ReturnLine>, sqlx::Error> {
    let sql =
        format!(r#"SELECT {RETURN_LINE_COLS} FROM "ReturnLine" WHERE "returnId" = $1 ORDER BY id"#);
    sqlx::query_as(&sql)
        .bind(return_id)
        .fetch_all(&mut **tx)
        .await
}

// --- Devolución ciega (sin ticket) con PIN/4-ojos (#59, SEC-19) ---

const PIN_MAX_ATTEMPTS: u32 = 5;
const PIN_LOCKOUT: Duration = Duration::from_secs(5 * 60);

/// Contador de intentos de PIN por `org:userId` (anti-fuerza-bruta). En memoria
/// por proceso (S-09: correcto con réplica única; al escalar, mover a Redis).
static PIN_ATTEMPTS: LazyLock<Mutex<HashMap<String, (u32, Instant)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn pin_locked(key: &str) -> bool {
    let map = PIN_ATTEMPTS.lock().unwrap_or_else(|e| e.into_inner());
    map.get(key)
        .is_some_and(|(_, locked_until)| *locked_until > Instant::now())
}

fn register_pin_failure(key: &str) {
    let mut map = PIN_ATTEMPTS.lock().unwrap_or_else(|e| e.into_inner());
    let entry = map.entry(key.to_owned()).or_insert((0, Instant::now()));
    entry.0 += 1;
    if entry.0 >= PIN_MAX_ATTEMPTS {
        *entry = (0, Instant::now() + PIN_LOCKOUT);
    }
}

fn clear_pin_failures(key: &str) {
    PIN_ATTEMPTS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(key);
}

/// Busca el primer MANAGER/ADMIN cuyo PIN (bcrypt) coincide. Devuelve su id.
async fn match_authorizer(manager_pin: &str, authorizers: &[(Uuid, String)]) -> Option<Uuid> {
    for (id, hash) in authorizers {
        if verify_password(manager_pin.to_owned(), Some(hash.clone())).await {
            return Some(*id);
        }
    }
    None
}

/// `POST /returns/blind` — devolución SIN ticket. Requiere el PIN de un
/// MANAGER/ADMIN del tenant DISTINTO del iniciador (control 4-ojos, SEC IDOR-02);
/// el importe sale del precio de venta ACTUAL del producto; repone stock SIN lote.
pub async fn create_blind(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: CreateBlindReturn,
) -> Result<ReturnWithLines, AppError> {
    input.validate()?;

    // Acceso a la tienda (SEC-01) + autorizadores candidatos, en una lectura.
    // Autorizadores = MANAGER/ADMIN del tenant, activos, con PIN, EXCLUIDO el
    // iniciador (sin la exclusión, un MANAGER se autoaprobaría — anula los 4-ojos).
    let (store_ok, authorizers): (bool, Vec<(Uuid, String)>) =
        with_tenant_tx(pool, org, async move |tx, _after| {
            let store_ok = is_org_wide || has_store_access(tx, user_id, input.store_id).await?;
            let authorizers: Vec<(Uuid, String)> = if store_ok {
                sqlx::query_as(
                    r#"SELECT id, "pinHash" FROM "User"
                       WHERE id <> $1 AND role::text IN ('MANAGER', 'ADMIN')
                         AND active = true AND "pinHash" IS NOT NULL"#,
                )
                .bind(user_id)
                .fetch_all(&mut **tx)
                .await?
            } else {
                Vec::new()
            };
            Ok((store_ok, authorizers))
        })
        .await?;
    if !store_ok {
        return Err(AppError::Forbidden);
    }

    // Lockout + validación del PIN (fuera de la tx de escritura).
    let pin_key = format!("{org}:{user_id}");
    if pin_locked(&pin_key) {
        return Err(AppError::Forbidden);
    }
    let authorized_by = match match_authorizer(&input.manager_pin, &authorizers).await {
        Some(id) => {
            clear_pin_failures(&pin_key);
            id
        }
        None => {
            register_pin_failure(&pin_key);
            return Err(AppError::Forbidden); // PIN inválido
        }
    };

    // Creación atómica.
    with_tenant_tx(pool, org, async move |tx, _after| {
        // Precios actuales (fuente del importe en devoluciones ciegas).
        let product_ids: Vec<Uuid> = input.lines.iter().map(|l| l.product_id).collect();
        let prices: Vec<(Uuid, Decimal)> = sqlx::query_as(
            r#"SELECT id, "salePrice" FROM "Product" WHERE id = ANY($1)"#,
        )
        .bind(&product_ids)
        .fetch_all(&mut **tx)
        .await?;
        let price_by: HashMap<Uuid, Decimal> = prices.into_iter().collect();

        struct Resolved {
            product_id: Uuid,
            qty: Decimal,
            line_total: Decimal,
        }
        let mut resolved = Vec::with_capacity(input.lines.len());
        for l in &input.lines {
            let Some(price) = price_by.get(&l.product_id) else {
                return Ok(Err(AppError::BadRequest)); // producto inexistente
            };
            resolved.push(Resolved {
                product_id: l.product_id,
                qty: l.qty,
                line_total: (price * l.qty).round_dp(2),
            });
        }
        let total: Decimal = resolved.iter().map(|r| r.line_total).sum::<Decimal>().round_dp(2);

        let return_id = Uuid::new_v4();
        let return_row: Return = sqlx::query_as(&format!(
            r#"INSERT INTO "Return" (id, "organizationId", "storeId", "userId", "authorizedBy", reason, total, "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, now())
               RETURNING {RETURN_COLS}"#,
        ))
        .bind(return_id)
        .bind(org)
        .bind(input.store_id)
        .bind(user_id)
        .bind(authorized_by)
        .bind(&input.reason)
        .bind(total)
        .fetch_one(&mut **tx)
        .await?;

        let mut lines = Vec::with_capacity(resolved.len());
        for r in &resolved {
            let line: ReturnLine = sqlx::query_as(&format!(
                r#"INSERT INTO "ReturnLine" (id, "organizationId", "returnId", "productId", qty, "lineTotal")
                   VALUES ($1, $2, $3, $4, $5, $6)
                   RETURNING {RETURN_LINE_COLS}"#,
            ))
            .bind(Uuid::new_v4())
            .bind(org)
            .bind(return_id)
            .bind(r.product_id)
            .bind(r.qty)
            .bind(r.line_total)
            .fetch_one(&mut **tx)
            .await?;
            lines.push(line);

            // Devolución ciega: reingreso SIN lote (originSaleId None).
            apply_batched_return(
                tx,
                org,
                r.product_id,
                input.store_id,
                None,
                r.qty,
                Some(return_id),
                Some(user_id),
            )
            .await?;
        }

        Ok(Ok(ReturnWithLines { return_: return_row, lines }))
    })
    .await?
}
