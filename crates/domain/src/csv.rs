//! Parser CSV mínimo para importación en lote — port de `apps/api/src/common/csv.ts`.
//!
//! Primera línea = cabecera, resto = filas. Separador coma, sin comillas/escapes
//! (los CSV de importación son de formato simple). Devuelve cada fila como mapa
//! `columna → valor` (cabecera normalizada con `trim`). Rechaza (`BadRequest`) si
//! supera `MAX_IMPORT_ROWS` filas de datos (trabajo por fila → DoS autenticado).

use std::collections::HashMap;

use simpletpv_shared::limits::MAX_IMPORT_ROWS;
use simpletpv_shared::AppError;

/// Resultado de una importación en lote: nº de filas insertadas y errores por
/// fila (no aborta el lote por una fila mala). Paridad con `ImportResult` de TS.
#[derive(Debug, serde::Serialize, PartialEq, Eq)]
pub struct ImportResult {
    pub inserted: u64,
    pub errors: Vec<RowError>,
}

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
pub struct RowError {
    pub row: usize,
    pub message: String,
}

/// Parsea el CSV a filas indexadas por nombre de columna.
pub fn parse_csv(csv: &str) -> Result<Vec<HashMap<String, String>>, AppError> {
    let lines: Vec<&str> = csv
        .split('\n')
        .map(|l| l.trim_end_matches('\r').trim())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() < 2 {
        return Ok(Vec::new());
    }
    if lines.len() - 1 > MAX_IMPORT_ROWS {
        // El CSV supera el máximo de filas por importación; divídelo en lotes.
        return Err(AppError::BadRequest);
    }
    let header: Vec<String> = lines[0].split(',').map(|h| h.trim().to_owned()).collect();
    let rows = lines[1..]
        .iter()
        .map(|line| {
            let cells: Vec<&str> = line.split(',').collect();
            header
                .iter()
                .enumerate()
                .map(|(i, h)| (h.clone(), cells.get(i).unwrap_or(&"").trim().to_owned()))
                .collect::<HashMap<String, String>>()
        })
        .collect();
    Ok(rows)
}

/// Nº de fila legible: +1 por la cabecera, +1 porque se cuenta desde 1.
pub fn row_number(index: usize) -> usize {
    index + 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_vacio_o_solo_cabecera_devuelve_vacio() {
        assert_eq!(parse_csv("").unwrap().len(), 0);
        assert_eq!(parse_csv("name,salePrice").unwrap().len(), 0);
    }

    #[test]
    fn parsea_filas_indexadas_por_cabecera_con_trim() {
        let rows = parse_csv("name, salePrice\n Café , 1.50 \nTé,2").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["name"], "Café");
        assert_eq!(rows[0]["salePrice"], "1.50");
        assert_eq!(rows[1]["name"], "Té");
    }

    #[test]
    fn celdas_faltantes_quedan_vacias() {
        let rows = parse_csv("name,salePrice,sku\nCafé,1.50").unwrap();
        assert_eq!(rows[0]["sku"], "");
    }

    #[test]
    fn rechaza_csv_que_supera_el_tope_de_filas() {
        let mut csv = String::from("name,salePrice\n");
        for i in 0..(MAX_IMPORT_ROWS + 1) {
            csv.push_str(&format!("p{i},1\n"));
        }
        assert_eq!(parse_csv(&csv), Err(AppError::BadRequest));
    }

    #[test]
    fn row_number_humano() {
        assert_eq!(row_number(0), 2);
        assert_eq!(row_number(3), 5);
    }
}
