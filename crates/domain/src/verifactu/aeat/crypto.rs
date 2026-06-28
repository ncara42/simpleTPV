//! Cifrado en reposo del certificado de cliente VERI\*FACTU (#156, Fase 8). El PEM
//! (certificado + clave privada) se guarda en la BD **cifrado con AES-256-GCM**; la
//! clave de cifrado vive FUERA de la BD (variable de entorno `VERIFACTU_CERT_KEY`,
//! 64 hex = 32 bytes), nunca en el repo ni en la propia base. Formato del blob:
//! `nonce(12 bytes) || ciphertext+tag`.

use aes_gcm::aead::{Aead, Generate, KeyInit, Nonce};
use aes_gcm::Aes256Gcm;

const NONCE_LEN: usize = 12;

/// Decodifica la clave de 32 bytes desde 64 caracteres hex (`VERIFACTU_CERT_KEY`).
pub fn key_from_hex(s: &str) -> Result<[u8; 32], String> {
    let s = s.trim();
    if s.len() != 64 {
        return Err("VERIFACTU_CERT_KEY debe tener 64 caracteres hex (32 bytes)".to_owned());
    }
    let mut k = [0u8; 32];
    for (i, slot) in k.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&s[2 * i..2 * i + 2], 16)
            .map_err(|_| "VERIFACTU_CERT_KEY contiene caracteres no hex".to_owned())?;
    }
    Ok(k)
}

/// Cifra `plaintext` → `nonce || ciphertext`. Nonce aleatorio por operación (OS RNG).
pub fn seal(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| "clave AES-256 inválida".to_owned())?;
    let nonce = Nonce::<Aes256Gcm>::generate();
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "fallo al cifrar el certificado".to_owned())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(nonce.as_ref());
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Descifra un blob `nonce || ciphertext`. Falla si la clave es incorrecta o el blob
/// fue manipulado (GCM autentica).
pub fn open(blob: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if blob.len() < NONCE_LEN + 16 {
        return Err("blob de certificado demasiado corto".to_owned());
    }
    let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| "clave AES-256 inválida".to_owned())?;
    let nonce = Nonce::<Aes256Gcm>::try_from(nonce_bytes)
        .map_err(|_| "nonce inválido en el blob".to_owned())?;
    cipher
        .decrypt(&nonce, ct)
        .map_err(|_| "fallo al descifrar el certificado (clave incorrecta o datos alterados)".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; 32] {
        key_from_hex("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff").unwrap()
    }

    #[test]
    fn round_trip() {
        let k = key();
        let pem = b"-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n";
        let blob = seal(pem, &k).unwrap();
        assert_ne!(&blob[12..], &pem[..], "el ciphertext no es el texto plano");
        assert_eq!(open(&blob, &k).unwrap(), pem);
    }

    #[test]
    fn nonce_aleatorio_por_operacion() {
        let k = key();
        let a = seal(b"x", &k).unwrap();
        let b = seal(b"x", &k).unwrap();
        assert_ne!(a, b, "dos sellados del mismo dato difieren (nonce aleatorio)");
    }

    #[test]
    fn clave_incorrecta_falla() {
        let blob = seal(b"secreto", &key()).unwrap();
        let otra = key_from_hex("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
            .unwrap();
        assert!(open(&blob, &otra).is_err());
    }

    #[test]
    fn blob_manipulado_falla() {
        let k = key();
        let mut blob = seal(b"secreto", &k).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0x01; // altera el tag/ciphertext
        assert!(open(&blob, &k).is_err());
    }

    #[test]
    fn clave_hex_invalida() {
        assert!(key_from_hex("corta").is_err());
        assert!(key_from_hex("zz112233445566778899aabbccddeeff00112233445566778899aabbccddeeff").is_err());
    }
}
