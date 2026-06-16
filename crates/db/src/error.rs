//! Mapeo de `sqlx::Error` a `AppError` (sustituye `PrismaExceptionFilter`,
//! doc 04 §6). Función libre (no `impl From`) para no violar la regla de
//! orfandad: ni `AppError` ni `sqlx::Error` son locales a este crate.

use simpletpv_shared::AppError;
use sqlx::error::ErrorKind;

/// SQLSTATE `42501` (insufficient_privilege). PostgreSQL lo lanza cuando una
/// fila viola una policy RLS — tanto en lectura (USING) como en escritura
/// (WITH CHECK): "new row violates row-level security policy for table".
const SQLSTATE_INSUFFICIENT_PRIVILEGE: &str = "42501";

/// Clasifica un error de SQLx en una categoría neutra para el cliente.
///
/// - RLS (`42501`) → `Forbidden` (intento de cruzar tenant: USING/WITH CHECK).
/// - `UniqueViolation` / `ForeignKeyViolation` / `CheckViolation` → `Conflict`
///   (eran P2002/P2003 y constraints de dominio).
/// - `RowNotFound` → `NotFound` (era P2025).
/// - `PoolTimedOut` → `Unavailable`.
/// - resto → `Internal` (sin filtrar detalle).
pub fn classify(err: &sqlx::Error) -> AppError {
    match err {
        sqlx::Error::Database(db) => {
            if db.code().as_deref() == Some(SQLSTATE_INSUFFICIENT_PRIVILEGE) {
                AppError::Forbidden
            } else {
                match db.kind() {
                    ErrorKind::UniqueViolation
                    | ErrorKind::ForeignKeyViolation
                    | ErrorKind::CheckViolation => AppError::Conflict,
                    _ => AppError::Internal,
                }
            }
        }
        sqlx::Error::RowNotFound => AppError::NotFound,
        sqlx::Error::PoolTimedOut => AppError::Unavailable,
        _ => AppError::Internal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_not_found_maps_to_not_found() {
        assert_eq!(classify(&sqlx::Error::RowNotFound), AppError::NotFound);
    }

    #[test]
    fn pool_timeout_maps_to_unavailable() {
        assert_eq!(classify(&sqlx::Error::PoolTimedOut), AppError::Unavailable);
    }
}
