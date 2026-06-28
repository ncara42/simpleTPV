//! Entradas y validación de traspasos (#153).

use rust_decimal::Decimal;
use serde::Deserialize;
use simpletpv_shared::limits::{max_quantity, MAX_ARRAY_SIZE, MAX_NOTES_LENGTH};
use simpletpv_shared::AppError;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransferLine {
    pub product_id: Uuid,
    pub quantity_sent: Decimal,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransfer {
    pub origin_store_id: Uuid,
    pub dest_store_id: Uuid,
    pub notes: Option<String>,
    pub lines: Vec<CreateTransferLine>,
}

impl CreateTransfer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.origin_store_id == self.dest_store_id {
            return Err(AppError::BadRequest); // origen y destino distintos
        }
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        if self
            .notes
            .as_ref()
            .is_some_and(|n| n.chars().count() > MAX_NOTES_LENGTH)
        {
            return Err(AppError::BadRequest);
        }
        let max = max_quantity();
        for l in &self.lines {
            if l.quantity_sent <= Decimal::ZERO || l.quantity_sent > max {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveTransferLine {
    pub line_id: Uuid,
    pub quantity_received: Decimal,
    pub discrepancy_note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveTransfer {
    pub lines: Vec<ReceiveTransferLine>,
}

impl ReceiveTransfer {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.lines.is_empty() || self.lines.len() > MAX_ARRAY_SIZE {
            return Err(AppError::BadRequest);
        }
        let max = max_quantity();
        for l in &self.lines {
            if l.quantity_received < Decimal::ZERO || l.quantity_received > max {
                return Err(AppError::BadRequest);
            }
        }
        Ok(())
    }
}

/// Tope del data-URL del adjunto (~1.1 MB binario en base64). El frontend comprime
/// la foto antes de subir; este límite mantiene el cuerpo bien por debajo del límite
/// de body de Axum (2 MB) y acota el peso en BD.
const MAX_ATTACHMENT_LEN: usize = 1_500_000;
/// data-URL base64 permitidos para fotos de recepción (sin SVG: solo rasterizadas).
const ATTACHMENT_PREFIXES: [&str; 3] = [
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
];

/// Alta de un adjunto (foto) de traspaso. La imagen viaja como data-URL base64.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAttachment {
    /// Línea concreta (producto) a la que se asocia la foto, u opcional al traspaso.
    pub transfer_line_id: Option<Uuid>,
    pub data_url: String,
    pub caption: Option<String>,
}

impl CreateAttachment {
    /// Valida el data-URL (prefijo permitido, no vacío, base64 puro, dentro de tope)
    /// y la longitud del pie. Devuelve el `mimeType` derivado del prefijo.
    pub fn validate(&self) -> Result<&'static str, AppError> {
        if self.data_url.len() > MAX_ATTACHMENT_LEN {
            return Err(AppError::BadRequest);
        }
        let Some(prefix) = ATTACHMENT_PREFIXES
            .iter()
            .find(|p| self.data_url.starts_with(**p))
        else {
            return Err(AppError::BadRequest);
        };
        let payload = &self.data_url[prefix.len()..];
        let base64_ok = !payload.is_empty()
            && payload
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='));
        if !base64_ok {
            return Err(AppError::BadRequest);
        }
        if self
            .caption
            .as_ref()
            .is_some_and(|c| c.chars().count() > MAX_NOTES_LENGTH)
        {
            return Err(AppError::BadRequest);
        }
        // mimeType = el trozo entre "data:" y ";base64," del prefijo emparejado.
        let mime = &prefix["data:".len()..prefix.len() - ";base64,".len()];
        Ok(match mime {
            "image/jpeg" => "image/jpeg",
            "image/png" => "image/png",
            _ => "image/webp",
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn att(data_url: &str) -> CreateAttachment {
        CreateAttachment {
            transfer_line_id: None,
            data_url: data_url.to_string(),
            caption: None,
        }
    }

    #[test]
    fn acepta_jpeg_png_webp_y_deriva_mime() {
        assert_eq!(att("data:image/jpeg;base64,AAAA").validate(), Ok("image/jpeg"));
        assert_eq!(att("data:image/png;base64,AAAA").validate(), Ok("image/png"));
        assert_eq!(att("data:image/webp;base64,AAAA").validate(), Ok("image/webp"));
    }

    #[test]
    fn rechaza_mime_no_permitido_vacio_y_no_base64() {
        // gif no está en la allowlist (sin SVG: solo rasterizadas seguras).
        assert_eq!(att("data:image/gif;base64,AAAA").validate(), Err(AppError::BadRequest));
        // payload vacío
        assert_eq!(att("data:image/png;base64,").validate(), Err(AppError::BadRequest));
        // caracteres fuera del alfabeto base64
        assert_eq!(att("data:image/png;base64,@@@@").validate(), Err(AppError::BadRequest));
    }

    #[test]
    fn rechaza_por_encima_del_tope() {
        let huge = format!("data:image/jpeg;base64,{}", "A".repeat(MAX_ATTACHMENT_LEN));
        assert_eq!(att(&huge).validate(), Err(AppError::BadRequest));
    }
}
