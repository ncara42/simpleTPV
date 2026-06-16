//! `ApiError`: newtype sobre `AppError` que implementa `IntoResponse`.
//!
//! No se puede `impl IntoResponse for AppError` (regla de orfandad: ni `AppError`
//! —de `shared`— ni `IntoResponse` —de axum— son locales aquí). El newtype lo
//! resuelve y centraliza el mapeo categoría→status en un único sitio.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use simpletpv_shared::AppError;

pub struct ApiError(pub AppError);

impl From<AppError> for ApiError {
    fn from(err: AppError) -> Self {
        ApiError(err)
    }
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0 {
            AppError::BadRequest => StatusCode::BAD_REQUEST,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Conflict => StatusCode::CONFLICT,
            AppError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        // El mensaje es una categoría neutra (Display de thiserror), sin detalle
        // interno (invariante doc 02 §5).
        (
            status,
            Json(ErrorBody {
                error: self.0.to_string(),
            }),
        )
            .into_response()
    }
}
