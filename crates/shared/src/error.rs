//! Error de aplicación con mensajes neutros de cara al cliente.
//!
//! Invariante de seguridad (doc 02 §5): nunca filtrar detalle interno al
//! cliente. El detalle se registra con `tracing` en la capa correspondiente;
//! `AppError` solo expone una categoría estable que la capa HTTP mapea a un
//! status (la conversión desde `sqlx::Error` vive en `simpletpv-db`, doc 04 §6).

use thiserror::Error;

/// Categorías de error que la capa HTTP traduce a status code.
///
/// `Copy` es válido SOLO mientras las variantes sean unit (sin payload heap). Si
/// se añade una variante con `String`/contexto, hay que retirar `Copy`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum AppError {
    /// Credenciales ausentes/inválidas o token no verificable → 401.
    #[error("no autenticado")]
    Unauthorized,
    /// Conflicto con el estado actual (unique/foreign key/check) → 409.
    #[error("conflicto con el estado actual del recurso")]
    Conflict,
    /// Acción no permitida; incluye violaciones de RLS (USING/WITH CHECK) → 403.
    #[error("acción no permitida")]
    Forbidden,
    /// Recurso inexistente → 404.
    #[error("recurso no encontrado")]
    NotFound,
    /// Dependencia no disponible (p. ej. pool saturado) → 503.
    #[error("servicio no disponible temporalmente")]
    Unavailable,
    /// Cualquier otro fallo → 500 (sin detalle al cliente).
    #[error("error interno")]
    Internal,
}
