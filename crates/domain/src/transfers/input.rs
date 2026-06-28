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

/// Tope del data-URL de imagen (~1.1 MB binario en base64). El frontend comprime la
/// foto antes de subir; mantiene el cuerpo por debajo del límite de body de Axum (2 MB)
/// y acota el peso en BD.
const MAX_IMAGE_DATA_URL_LEN: usize = 1_500_000;
/// data-URL base64 permitidos para fotos (sin SVG: solo rasterizadas seguras).
const IMAGE_DATA_URL_PREFIXES: [&str; 3] = [
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
];

/// Valida un data-URL de imagen (prefijo jpeg/png/webp, base64 puro, no vacío, dentro
/// del tope) y devuelve el `mimeType` derivado. Compartido por adjuntos y mensajes.
pub fn validate_image_data_url(data_url: &str) -> Result<&'static str, AppError> {
    if data_url.len() > MAX_IMAGE_DATA_URL_LEN {
        return Err(AppError::BadRequest);
    }
    let Some(prefix) = IMAGE_DATA_URL_PREFIXES
        .iter()
        .find(|p| data_url.starts_with(**p))
    else {
        return Err(AppError::BadRequest);
    };
    let payload = &data_url[prefix.len()..];
    let base64_ok = !payload.is_empty()
        && payload
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='));
    if !base64_ok {
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
    /// Valida el data-URL y la longitud del pie. Devuelve el `mimeType` derivado.
    pub fn validate(&self) -> Result<&'static str, AppError> {
        let mime = validate_image_data_url(&self.data_url)?;
        if self
            .caption
            .as_ref()
            .is_some_and(|c| c.chars().count() > MAX_NOTES_LENGTH)
        {
            return Err(AppError::BadRequest);
        }
        Ok(mime)
    }
}

/// Alta de un mensaje del chat de traspaso. Lleva texto y/o foto (data-URL). El autor
/// ('store' / 'central') lo decide el servicio según el rol, no el cliente.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessage {
    pub body: Option<String>,
    pub data_url: Option<String>,
}

impl CreateMessage {
    /// Valida que haya contenido (texto y/o foto), el tope del texto y, si hay foto, el
    /// data-URL. Devuelve el `mimeType` de la foto (None si solo texto).
    pub fn validate(&self) -> Result<Option<&'static str>, AppError> {
        let body = self.body.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let has_photo = self.data_url.as_ref().is_some_and(|s| !s.is_empty());
        if body.is_none() && !has_photo {
            return Err(AppError::BadRequest);
        }
        if body.is_some_and(|b| b.chars().count() > MAX_NOTES_LENGTH) {
            return Err(AppError::BadRequest);
        }
        match self.data_url.as_deref().filter(|s| !s.is_empty()) {
            Some(url) => Ok(Some(validate_image_data_url(url)?)),
            None => Ok(None),
        }
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
        let huge = format!("data:image/jpeg;base64,{}", "A".repeat(MAX_IMAGE_DATA_URL_LEN));
        assert_eq!(att(&huge).validate(), Err(AppError::BadRequest));
    }

    fn msg(body: Option<&str>, data_url: Option<&str>) -> CreateMessage {
        CreateMessage {
            body: body.map(str::to_string),
            data_url: data_url.map(str::to_string),
        }
    }

    #[test]
    fn mensaje_acepta_texto_foto_o_ambos() {
        assert_eq!(msg(Some("hola"), None).validate(), Ok(None));
        assert_eq!(
            msg(None, Some("data:image/jpeg;base64,AAAA")).validate(),
            Ok(Some("image/jpeg"))
        );
        assert_eq!(
            msg(Some("mira"), Some("data:image/png;base64,AAAA")).validate(),
            Ok(Some("image/png"))
        );
    }

    #[test]
    fn mensaje_rechaza_vacio_y_foto_invalida() {
        // ni texto ni foto
        assert_eq!(msg(None, None).validate(), Err(AppError::BadRequest));
        // texto en blanco cuenta como vacío
        assert_eq!(msg(Some("   "), None).validate(), Err(AppError::BadRequest));
        // foto con mime no permitido
        assert_eq!(
            msg(None, Some("data:image/gif;base64,AAAA")).validate(),
            Err(AppError::BadRequest)
        );
    }
}
