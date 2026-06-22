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

use crate::feature_flags::assert_flag_enabled;
use crate::sales::{build_tax_breakdown, TaxLine};
use crate::stock::service::apply_batched_return;
use crate::store_access::has_store_access;
use crate::verifactu::record_rectification;

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
    /// IVA congelado de la línea original (para la cuota del rectificativo).
    tax_rate: Decimal,
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

        // Venta + estado + tienda + nº ticket (acceso por tienda, storeId del
        // Return y referencia del rectificativo VeriFactu).
        let sale: Option<(Uuid, String, String)> = sqlx::query_as(
            r#"SELECT "storeId", status::text, "ticketNumber" FROM "Sale" WHERE id = $1"#,
        )
        .bind(input.sale_id)
        .fetch_optional(&mut **tx)
        .await?;
        let Some((store_id, status, ticket_number)) = sale else {
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
            r#"SELECT id, qty, "lineTotal" AS line_total, "productId" AS product_id,
                      "taxRate" AS tax_rate
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
            tax_rate: Decimal,
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
                tax_rate: sale_line.tax_rate,
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

        // Desglose de IVA de lo devuelto (sin descuento de ticket: el `line_total`
        // ya es el neto proporcional) → cuota del abono que entra en la huella.
        let tax_lines: Vec<TaxLine> = resolved
            .iter()
            .map(|r| TaxLine {
                tax_rate: r.tax_rate,
                line_total: r.line_total,
            })
            .collect();
        let tax_breakdown = build_tax_breakdown(&tax_lines, Decimal::ZERO);
        // Registro VeriFactu rectificativo (SEC-07): referencia el ticket de la
        // venta original. En la misma tx → atómico con la devolución.
        record_rectification(tx, org, return_id, &ticket_number, total, &tax_breakdown).await?;

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
    pin_locked_at(key, Instant::now())
}

fn register_pin_failure(key: &str) {
    register_pin_failure_at(key, Instant::now());
}

// Variantes con `now` inyectable (seam de tiempo): permiten testear el umbral, la
// ventana de lockout, su expiración y el reset sin dormir 5 minutos (#161).
fn pin_locked_at(key: &str, now: Instant) -> bool {
    let map = PIN_ATTEMPTS.lock().unwrap_or_else(|e| e.into_inner());
    map.get(key)
        .is_some_and(|(_, locked_until)| *locked_until > now)
}

fn register_pin_failure_at(key: &str, now: Instant) {
    let mut map = PIN_ATTEMPTS.lock().unwrap_or_else(|e| e.into_inner());
    let entry = map.entry(key.to_owned()).or_insert((0, now));
    entry.0 += 1;
    if entry.0 >= PIN_MAX_ATTEMPTS {
        *entry = (0, now + PIN_LOCKOUT);
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

    // Feature flag `blind_returns` (#152): gatea la devolución ciega por org/tienda
    // (FUERA de la tx de escritura, paridad NestJS). Apagada → Forbidden.
    assert_flag_enabled(pool, org, "blind_returns", Some(input.store_id)).await?;

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
        let prices: Vec<(Uuid, Decimal, Decimal)> = sqlx::query_as(
            r#"SELECT id, "salePrice", "taxRate" FROM "Product" WHERE id = ANY($1)"#,
        )
        .bind(&product_ids)
        .fetch_all(&mut **tx)
        .await?;
        let price_by: HashMap<Uuid, (Decimal, Decimal)> = prices
            .into_iter()
            .map(|(id, price, tax)| (id, (price, tax)))
            .collect();

        struct Resolved {
            product_id: Uuid,
            qty: Decimal,
            line_total: Decimal,
            tax_rate: Decimal,
        }
        let mut resolved = Vec::with_capacity(input.lines.len());
        for l in &input.lines {
            let Some(&(price, tax_rate)) = price_by.get(&l.product_id) else {
                return Ok(Err(AppError::BadRequest)); // producto inexistente
            };
            resolved.push(Resolved {
                product_id: l.product_id,
                qty: l.qty,
                line_total: (price * l.qty).round_dp(2),
                tax_rate,
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

        // Desglose de IVA de lo devuelto (tipos de los productos) → cuota del abono.
        let tax_lines: Vec<TaxLine> = resolved
            .iter()
            .map(|r| TaxLine {
                tax_rate: r.tax_rate,
                line_total: r.line_total,
            })
            .collect();
        let tax_breakdown = build_tax_breakdown(&tax_lines, Decimal::ZERO);
        // Registro VeriFactu rectificativo (SEC-07): sin factura original (ciega),
        // referencia el id de la devolución. Atómico con la devolución.
        let invoice = format!("BLIND-{return_id}");
        record_rectification(tx, org, return_id, &invoice, total, &tax_breakdown).await?;

        Ok(Ok(ReturnWithLines { return_: return_row, lines }))
    })
    .await?
}

#[cfg(test)]
mod tests {
    //! Lockout de PIN de devolución ciega (#161, criterio 3 / SEC-19). Usa el
    //! seam de tiempo (`*_at`) para verificar umbral, ventana, expiración y reset
    //! de forma determinista, sin dormir. Cada test usa una clave única → no
    //! colisiona con otros tests en paralelo sobre el global `PIN_ATTEMPTS`.
    use super::*;

    fn unique_key() -> String {
        format!("pin-test:{}", Uuid::new_v4())
    }

    #[test]
    fn bloquea_al_quinto_intento_y_expira_tras_la_ventana() {
        let key = unique_key();
        let t0 = Instant::now();

        // 4 fallos: aún NO bloqueado.
        for _ in 0..PIN_MAX_ATTEMPTS - 1 {
            register_pin_failure_at(&key, t0);
        }
        assert!(!pin_locked_at(&key, t0), "4 fallos no deben bloquear");

        // 5º fallo → bloqueado durante PIN_LOCKOUT.
        register_pin_failure_at(&key, t0);
        assert!(pin_locked_at(&key, t0), "el 5º fallo bloquea");
        assert!(
            pin_locked_at(&key, t0 + PIN_LOCKOUT - Duration::from_secs(1)),
            "sigue bloqueado dentro de la ventana"
        );

        // Pasada la ventana → desbloqueado.
        assert!(
            !pin_locked_at(&key, t0 + PIN_LOCKOUT + Duration::from_secs(1)),
            "expira pasada la ventana de lockout"
        );

        clear_pin_failures(&key);
    }

    #[test]
    fn el_exito_resetea_el_contador() {
        let key = unique_key();
        let t0 = Instant::now();

        // 3 fallos y luego un PIN correcto (clear) → contador a cero.
        for _ in 0..3 {
            register_pin_failure_at(&key, t0);
        }
        clear_pin_failures(&key);
        assert!(!pin_locked_at(&key, t0), "tras el éxito no hay lockout");

        // Tras el reset hacen falta de nuevo 5 fallos para bloquear (no quedan 2).
        for _ in 0..PIN_MAX_ATTEMPTS - 1 {
            register_pin_failure_at(&key, t0);
        }
        assert!(
            !pin_locked_at(&key, t0),
            "tras el reset, 4 fallos no bloquean"
        );
        register_pin_failure_at(&key, t0);
        assert!(
            pin_locked_at(&key, t0),
            "el 5º tras el reset vuelve a bloquear"
        );

        clear_pin_failures(&key);
    }

    #[test]
    fn clave_desconocida_no_esta_bloqueada() {
        assert!(!pin_locked_at(&unique_key(), Instant::now()));
    }
}
