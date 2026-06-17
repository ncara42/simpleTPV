//! Servicio de control horario (#153) — port de `time-clock.service.ts`. Todo
//! bajo `with_tenant_tx` (RLS). El fichaje (create) serializa por (usuario,tienda)
//! con advisory lock (S-12), valida la secuencia (máquina de estados), exige
//! dispositivo oficial autorizado y respeta el flag `time_clock`.

use simpletpv_db::with_tenant_tx;
use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use time::macros::format_description;
use time::{Date, OffsetDateTime, PrimitiveDateTime, Time};
use uuid::Uuid;

use crate::feature_flags::assert_flag_enabled;
use crate::store_access::has_store_access;

use super::compute::{
    compute_worked, day_key, derive_status, end_of_day, minus_days, next_state_or_throw,
    start_of_day, status_from_last_type, total_worked_ms,
};
use super::input::CreateEntry;
use super::model::{EntryLog, JornadaRow, TimeClockEntry, TimeClockType, TodaySummary};

const ENTRY_COLS: &str = r#"id, "organizationId" AS organization_id, "storeId" AS store_id,
    "userId" AS user_id, "deviceId" AS device_id, type::text AS entry_type,
    "createdAt" AS created_at"#;

const MAX_RANGE_DAYS: i64 = 90;

fn now_utc() -> PrimitiveDateTime {
    let n = OffsetDateTime::now_utc();
    PrimitiveDateTime::new(n.date(), n.time())
}

fn parse_date(s: &str) -> Result<Date, AppError> {
    Date::parse(s, format_description!("[year]-[month]-[day]")).map_err(|_| AppError::BadRequest)
}

/// Resuelve [from, to] con la cota máxima de ventana (DOS-02/04).
fn resolve_range(
    from: Option<&str>,
    to: Option<&str>,
    default_days: i64,
    now: PrimitiveDateTime,
) -> Result<(PrimitiveDateTime, PrimitiveDateTime), AppError> {
    let to = match to {
        Some(s) => end_of_day(PrimitiveDateTime::new(parse_date(s)?, Time::MIDNIGHT)),
        None => end_of_day(now),
    };
    let requested_from = match from {
        Some(s) => start_of_day(PrimitiveDateTime::new(parse_date(s)?, Time::MIDNIGHT)),
        None => start_of_day(minus_days(now, default_days)),
    };
    let min_from = start_of_day(minus_days(to, MAX_RANGE_DAYS));
    let from = if requested_from < min_from {
        min_from
    } else {
        requested_from
    };
    Ok((from, to))
}

/// `GET /time-clock/current` — último fichaje del usuario en la tienda.
pub async fn current(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    user_id: Uuid,
) -> Result<Option<TimeClockEntry>, AppError> {
    with_tenant_tx(pool, org, async move |tx, _after| {
        let row: Option<TimeClockEntry> = sqlx::query_as(&format!(
            r#"SELECT {ENTRY_COLS} FROM "TimeClockEntry"
               WHERE "organizationId" = $1 AND "storeId" = $2 AND "userId" = $3
               ORDER BY "createdAt" DESC LIMIT 1"#,
        ))
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?;
        Ok(row)
    })
    .await
}

/// `GET /time-clock/today` — resumen de la jornada de hoy (estado + horas).
pub async fn today(
    pool: &PgPool,
    org: Uuid,
    store_id: Uuid,
    user_id: Uuid,
) -> Result<TodaySummary, AppError> {
    let now = now_utc();
    with_tenant_tx(pool, org, async move |tx, _after| {
        let entries: Vec<TimeClockEntry> = sqlx::query_as(&format!(
            r#"SELECT {ENTRY_COLS} FROM "TimeClockEntry"
               WHERE "organizationId" = $1 AND "storeId" = $2 AND "userId" = $3
                 AND "createdAt" >= $4
               ORDER BY "createdAt" ASC"#,
        ))
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .bind(start_of_day(now))
        .fetch_all(&mut **tx)
        .await?;
        let seq: Vec<TimeClockType> = entries.iter().map(|e| e.entry_type).collect();
        let pairs: Vec<(TimeClockType, PrimitiveDateTime)> = entries
            .iter()
            .map(|e| (e.entry_type, e.created_at))
            .collect();
        let totals = compute_worked(&pairs, now);
        Ok(TodaySummary {
            status: derive_status(&seq).as_str().to_owned(),
            worked_ms: totals.worked_ms,
            break_ms: totals.break_ms,
            running_since: totals.running_since,
            entries,
        })
    })
    .await
}

/// `POST /time-clock` — registra un fichaje validando la secuencia, el dispositivo
/// oficial y el flag `time_clock`. Serializa por (usuario, tienda) con advisory lock.
pub async fn create(
    pool: &PgPool,
    org: Uuid,
    user_id: Uuid,
    is_org_wide: bool,
    input: CreateEntry,
) -> Result<TimeClockEntry, AppError> {
    let entry_type = input.parse_type()?;
    let store_id = input.store_id;
    let device_id = input.device_id;
    // Flag (#127 B): control horario puede estar apagado en esta tienda/org → 403.
    assert_flag_enabled(pool, org, "time_clock", Some(store_id)).await?;

    let result: Result<TimeClockEntry, AppError> = with_tenant_tx(pool, org, async move |tx, _after| {
        // S-12: serializa (usuario, tienda) para que dos fichajes concurrentes no
        // lean el mismo "último" y dupliquen.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("{user_id}:{store_id}"))
            .execute(&mut **tx)
            .await?;

        if !is_org_wide && !has_store_access(tx, user_id, store_id).await? {
            return Ok(Err(AppError::Forbidden));
        }

        let last: Option<(String,)> = sqlx::query_as(
            r#"SELECT type::text FROM "TimeClockEntry"
               WHERE "organizationId" = $1 AND "storeId" = $2 AND "userId" = $3
               ORDER BY "createdAt" DESC LIMIT 1"#,
        )
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?;
        let last_type = last.and_then(|(s,)| match s.as_str() {
            "CLOCK_IN" => Some(TimeClockType::ClockIn),
            "CLOCK_OUT" => Some(TimeClockType::ClockOut),
            "BREAK_START" => Some(TimeClockType::BreakStart),
            "BREAK_END" => Some(TimeClockType::BreakEnd),
            _ => None,
        });
        if let Err(e) = next_state_or_throw(status_from_last_type(last_type), entry_type) {
            return Ok(Err(e));
        }

        // Dispositivo oficial obligatorio y autorizado para la tienda.
        let Some(device_id) = device_id else {
            return Ok(Err(AppError::Forbidden));
        };
        let device: Option<(Uuid,)> = sqlx::query_as(
            r#"SELECT id FROM "OfficialDevice"
               WHERE id = $1 AND "storeId" = $2 AND "organizationId" = $3 AND authorized = true"#,
        )
        .bind(device_id)
        .bind(store_id)
        .bind(org)
        .fetch_optional(&mut **tx)
        .await?;
        if device.is_none() {
            return Ok(Err(AppError::NotFound));
        }

        let entry: TimeClockEntry = sqlx::query_as(&format!(
            r#"INSERT INTO "TimeClockEntry" (id, "organizationId", "storeId", "userId", "deviceId", type)
               VALUES ($1, $2, $3, $4, $5, $6::"TimeClockType")
               RETURNING {ENTRY_COLS}"#,
        ))
        .bind(Uuid::new_v4())
        .bind(org)
        .bind(store_id)
        .bind(user_id)
        .bind(device_id)
        .bind(entry_type)
        .fetch_one(&mut **tx)
        .await?;
        Ok(Ok(entry))
    })
    .await?;
    result
}

/// Fila plana del historial (con nombres de usuario/tienda) para agregar.
#[derive(sqlx::FromRow)]
struct JornadaFlat {
    entry_type: String,
    created_at: PrimitiveDateTime,
    user_id: Uuid,
    store_id: Uuid,
    user_name: String,
    store_name: String,
}

fn parse_type(s: &str) -> TimeClockType {
    match s {
        "CLOCK_IN" => TimeClockType::ClockIn,
        "BREAK_START" => TimeClockType::BreakStart,
        "BREAK_END" => TimeClockType::BreakEnd,
        _ => TimeClockType::ClockOut,
    }
}

/// Agrupa fichajes en jornadas (usuario+tienda+día) y calcula horas.
fn aggregate(rows: Vec<JornadaFlat>, now: PrimitiveDateTime) -> Vec<JornadaRow> {
    struct Group {
        user_id: Uuid,
        user_name: String,
        store_id: Uuid,
        store_name: String,
        date: String,
        rows: Vec<(TimeClockType, PrimitiveDateTime)>,
    }
    let mut groups: Vec<Group> = Vec::new();
    for r in rows {
        let date = day_key(r.created_at);
        let t = parse_type(&r.entry_type);
        if let Some(g) = groups
            .iter_mut()
            .find(|g| g.user_id == r.user_id && g.store_id == r.store_id && g.date == date)
        {
            g.rows.push((t, r.created_at));
        } else {
            groups.push(Group {
                user_id: r.user_id,
                user_name: r.user_name,
                store_id: r.store_id,
                store_name: r.store_name,
                date,
                rows: vec![(t, r.created_at)],
            });
        }
    }
    groups
        .into_iter()
        .map(|g| {
            let totals = compute_worked(&g.rows, now);
            let first_in = g
                .rows
                .iter()
                .find(|(t, _)| *t == TimeClockType::ClockIn)
                .map(|(_, at)| *at);
            let last_out = g
                .rows
                .iter()
                .rev()
                .find(|(t, _)| *t == TimeClockType::ClockOut)
                .map(|(_, at)| *at);
            JornadaRow {
                user_id: g.user_id,
                user_name: g.user_name,
                store_id: g.store_id,
                store_name: g.store_name,
                date: g.date,
                first_in,
                last_out,
                worked_ms: total_worked_ms(&totals, now),
                break_ms: totals.break_ms,
            }
        })
        .collect()
}

/// `GET /time-clock/history` — jornadas de una tienda (acota por tienda salvo
/// org-wide). `default_days` = 7 (backoffice) o 30 (history/me).
#[allow(clippy::too_many_arguments)]
pub async fn history(
    pool: &PgPool,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
    user_id: Option<Uuid>,
    from: Option<String>,
    to: Option<String>,
    default_days: i64,
) -> Result<Vec<JornadaRow>, AppError> {
    let now = now_utc();
    let (from_dt, to_dt) = resolve_range(from.as_deref(), to.as_deref(), default_days, now)?;
    let result: Result<Vec<JornadaRow>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, requester, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let rows = load_jornadas(tx, org, Some(store_id), user_id, from_dt, to_dt).await?;
            Ok(Ok(aggregate(rows, now)))
        })
        .await?;
    result
}

/// `GET /time-clock/history-all` — jornadas cross-tienda (ADMIN/MANAGER, org-wide).
pub async fn history_all(
    pool: &PgPool,
    org: Uuid,
    store_id: Option<Uuid>,
    user_id: Option<Uuid>,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<JornadaRow>, AppError> {
    let now = now_utc();
    let (from_dt, to_dt) = resolve_range(from.as_deref(), to.as_deref(), 30, now)?;
    with_tenant_tx(pool, org, async move |tx, _after| {
        let rows = load_jornadas(tx, org, store_id, user_id, from_dt, to_dt).await?;
        Ok(aggregate(rows, now))
    })
    .await
}

/// `GET /time-clock/entries` — log en bruto de una tienda (acota por tienda).
#[allow(clippy::too_many_arguments)]
pub async fn entries(
    pool: &PgPool,
    org: Uuid,
    requester: Uuid,
    is_org_wide: bool,
    store_id: Uuid,
    user_id: Option<Uuid>,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<EntryLog>, AppError> {
    let now = now_utc();
    let (from_dt, to_dt) = resolve_range(from.as_deref(), to.as_deref(), 30, now)?;
    let result: Result<Vec<EntryLog>, AppError> =
        with_tenant_tx(pool, org, async move |tx, _after| {
            if !is_org_wide && !has_store_access(tx, requester, store_id).await? {
                return Ok(Err(AppError::Forbidden));
            }
            let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
                r#"SELECT e.id, e."userId" AS user_id, u.name AS user_name,
                     e.type::text AS entry_type, e."createdAt" AS created_at
                   FROM "TimeClockEntry" e JOIN "User" u ON u.id = e."userId"
                   WHERE e."organizationId" = "#,
            );
            qb.push_bind(org)
                .push(r#" AND e."storeId" = "#)
                .push_bind(store_id);
            if let Some(u) = user_id {
                qb.push(r#" AND e."userId" = "#).push_bind(u);
            }
            qb.push(r#" AND e."createdAt" >= "#)
                .push_bind(from_dt)
                .push(r#" AND e."createdAt" <= "#)
                .push_bind(to_dt)
                .push(r#" ORDER BY e."createdAt" DESC"#);
            let rows: Vec<EntryLog> = qb.build_query_as().fetch_all(&mut **tx).await?;
            Ok(Ok(rows))
        })
        .await?;
    result
}

async fn load_jornadas(
    tx: &mut Transaction<'_, Postgres>,
    org: Uuid,
    store_id: Option<Uuid>,
    user_id: Option<Uuid>,
    from: PrimitiveDateTime,
    to: PrimitiveDateTime,
) -> Result<Vec<JornadaFlat>, sqlx::Error> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT e.type::text AS entry_type, e."createdAt" AS created_at,
             e."userId" AS user_id, e."storeId" AS store_id,
             u.name AS user_name, s.name AS store_name
           FROM "TimeClockEntry" e
           JOIN "User" u ON u.id = e."userId"
           JOIN "Store" s ON s.id = e."storeId"
           WHERE e."organizationId" = "#,
    );
    qb.push_bind(org);
    if let Some(sid) = store_id {
        qb.push(r#" AND e."storeId" = "#).push_bind(sid);
    }
    if let Some(uid) = user_id {
        qb.push(r#" AND e."userId" = "#).push_bind(uid);
    }
    qb.push(r#" AND e."createdAt" >= "#)
        .push_bind(from)
        .push(r#" AND e."createdAt" <= "#)
        .push_bind(to)
        .push(r#" ORDER BY e."createdAt" ASC"#);
    qb.build_query_as().fetch_all(&mut **tx).await
}
