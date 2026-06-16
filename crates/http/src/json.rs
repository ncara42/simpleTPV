//! `ValidatedJson<T>`: extractor de body JSON que NO filtra el detalle de serde
//! (nombres de campo, posición del parser) en el rechazo — cualquier fallo de
//! deserialización (incluido un campo desconocido por `deny_unknown_fields`) se
//! convierte en un `400` genérico (invariante de seguridad doc 02 §5).
//!
//! La validación de negocio (rangos, longitudes) la hace el propio DTO de
//! `domain` en su `validate()`, ya dentro del handler.

use axum::extract::{FromRequest, Request};
use serde::de::DeserializeOwned;
use simpletpv_shared::AppError;

use crate::error::ApiError;

pub struct ValidatedJson<T>(pub T);

impl<T, S> FromRequest<S> for ValidatedJson<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let axum::Json(value) = axum::Json::<T>::from_request(req, state)
            .await
            .map_err(|_| AppError::BadRequest)?;
        Ok(ValidatedJson(value))
    }
}
