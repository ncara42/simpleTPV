//! Transacción RLS por tenant — INVARIANTE CRÍTICO de la migración.
//!
//! Port fiel de `withTenantTx` (apps/api/src/prisma/with-tenant-tx.ts) sobre
//! SQLx (doc 04 §3, doc 09). Es el ÚNICO punto donde se fija el tenant para la
//! capa de datos: un solo sitio que auditar (doc 02 §3).
//!
//! Patrón (idéntico al de Prisma):
//!   1. `BEGIN` — transacción interactiva sobre una conexión fija del pool.
//!   2. `set_config('app.current_organization_id', $1, true)` como PRIMERA
//!      sentencia. `is_local = true` ⇒ el valor vive SOLO en esta transacción
//!      (por eso debe ir dentro del BEGIN, no antes: un `set_config` local en
//!      una sentencia suelta se perdería al cerrar su transacción implícita).
//!      Como `is_local = true`, al `COMMIT`/`ROLLBACK` el setting desaparece y
//!      la conexión vuelve limpia al pool (sin residuo de tenant).
//!   3. El callback ejecuta todas sus queries sobre el MISMO `&mut Transaction`
//!      ⇒ misma conexión ⇒ RLS activo. Admite `SELECT ... FOR UPDATE` (locks
//!      pesimistas, doc 09 §1) y varias tablas atómicamente.
//!   4. `COMMIT`. Si el callback devuelve `Err` (o la tx entra en `drop` sin
//!      commit), SQLx hace `ROLLBACK` automático ⇒ fail-safe.
//!   5. Tras el commit, se ejecutan los efectos `after_commit` (best-effort).
//!
//! Sin tenant ⇒ NO se llama a esta función ⇒ no hay `set_config` ⇒ las policies
//! RLS no encuentran `current_setting` ⇒ 0 filas (fail-safe). Igual que hoy.
//!
//! Devuelve `AppError` (no `sqlx::Error`): el detalle interno de la base de
//! datos NUNCA cruza esta frontera (invariante de seguridad doc 02 §5). La
//! clasificación se hace aquí, en un único sitio, vía [`crate::error::classify`].

use std::future::Future;
use std::ops::AsyncFnOnce;
use std::pin::Pin;

use simpletpv_shared::AppError;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::classify;

/// Efecto best-effort a ejecutar TRAS el commit (p. ej. publicar un evento SSE,
/// doc 09 §4). Devuelve `anyhow::Result` para registrar el fallo sin que un
/// efecto fallido revierta la operación ya confirmada. Debe ser `Send + 'static`
/// (se ejecuta en una task aparte para contener panics).
type AfterCommitFx =
    Box<dyn FnOnce() -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send>> + Send>;

/// Cola de efectos post-commit. El callback de `with_tenant_tx` la recibe por
/// `&mut` y registra efectos con [`AfterCommit::register`].
#[derive(Default)]
pub struct AfterCommit {
    effects: Vec<AfterCommitFx>,
}

impl AfterCommit {
    /// Registra un efecto a ejecutar tras el commit. Se ejecutan EN ORDEN; el
    /// fallo (o panic) de uno se registra y no aborta los demás ni la operación.
    ///
    /// El cierre y su futuro deben ser `Send + 'static` (capturan por `move`):
    /// el efecto se ejecuta en una task de Tokio para que un panic no propague
    /// al llamador, cuya transacción ya está confirmada.
    pub fn register<F, Fut>(&mut self, f: F)
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: Future<Output = anyhow::Result<()>> + Send + 'static,
    {
        self.effects.push(Box::new(move || Box::pin(f())));
    }

    /// Ejecuta los efectos en orden. Cada uno corre en una task de Tokio: así un
    /// `Err` se traga (se registra) y un `panic` queda CONTENIDO (paridad con el
    /// `try/catch` del `afterCommit` de NestJS) sin tumbar al llamador.
    async fn run(self) {
        for effect in self.effects {
            match tokio::spawn(effect()).await {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    tracing::warn!(error = %err, "efecto post-commit falló (best-effort, ignorado)")
                }
                Err(join_err) => {
                    tracing::warn!(error = %join_err, "efecto post-commit hizo panic (contenido)")
                }
            }
        }
    }
}

/// Ejecuta `f` dentro de una transacción con el `organization_id` fijado (RLS).
///
/// El cierre recibe la transacción (para sus queries) y la cola de efectos
/// post-commit. Devuelve el valor del cierre si la transacción confirma; en caso
/// de error, devuelve un [`AppError`] neutro (sin detalle interno de la BD).
///
/// ```ignore
/// let total = with_tenant_tx(&pool, org_id, async |tx, after| {
///     let n: i64 = sqlx::query_scalar("SELECT count(*) FROM \"Product\"")
///         .fetch_one(&mut **tx).await?;
///     after.register(|| async { publish_event().await });
///     Ok(n)
/// }).await?;
/// ```
pub async fn with_tenant_tx<F, T>(pool: &PgPool, organization_id: Uuid, f: F) -> Result<T, AppError>
where
    F: AsyncFnOnce(&mut Transaction<'_, Postgres>, &mut AfterCommit) -> Result<T, sqlx::Error>,
{
    let mut tx = pool.begin().await.map_err(|e| classify(&e))?;

    // El tenant se castea a text en SQL (`$1::text`); el bind viaja como `uuid`
    // nativo (sin asignación, sin interpolación — doc 04 §2, invariante 02 §5).
    // La policy lo recompone con `NULLIF(current_setting(...), '')::uuid`.
    sqlx::query("SELECT set_config('app.current_organization_id', $1::text, true)")
        .bind(organization_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| classify(&e))?;

    let mut after = AfterCommit::default();

    match f(&mut tx, &mut after).await {
        Ok(value) => {
            tx.commit().await.map_err(|e| classify(&e))?;
            after.run().await;
            Ok(value)
        }
        Err(err) => {
            // Rollback explícito (también ocurriría en `drop`); registramos su
            // fallo para no perder observabilidad. Los efectos post-commit NO se
            // ejecutan porque la operación no se confirmó.
            if let Err(rb) = tx.rollback().await {
                tracing::warn!(error = %rb, "rollback explícito falló (la tx caducará por drop)");
            }
            Err(classify(&err))
        }
    }
}
