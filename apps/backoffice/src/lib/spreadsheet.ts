import { exportRowsToCsv, neutralizeFormula } from './csv.js';

// Capa de hoja de cálculo (B-04): soporta los DOS formatos estándar de intercambio
// tabular — CSV y XLSX (Excel) — reutilizando al máximo lo que ya existe:
//   · IMPORT: cualquier fichero (CSV o XLSX) se NORMALIZA a un string CSV y se
//     entrega al flujo de import por-CSV actual (misma validación + backend).
//   · EXPORT: CSV reusa el helper seguro `exportRowsToCsv` (BOM + escape + fórmulas);
//     XLSX construye un libro con SheetJS neutralizando la inyección de fórmulas en
//     CADA celda (paridad de seguridad con el CSV, CWE-1236).
//
// SheetJS se carga de forma PEREZOSA (import dinámico): solo entra al bundle (chunk
// aparte) cuando el usuario realmente usa Excel, no en la carga inicial del app.
// Se instala desde el CDN del mantenedor (xlsx-0.20.3), que corrige CVE-2023-30533
// (prototype pollution) y CVE-2024-22363 (ReDoS) — sin parchear en la copia de npm.

export type SpreadsheetFormat = 'csv' | 'xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type XlsxModule = typeof import('xlsx');

// xlsx es CJS: según el interop, la API vive en el namespace o en `.default`.
async function loadXlsx(): Promise<XlsxModule> {
  const mod: unknown = await import('xlsx');
  const m = mod as XlsxModule & { default?: XlsxModule };
  return typeof m.read === 'function' ? m : (m.default as XlsxModule);
}

/** ¿El fichero es un Excel (XLSX/XLS) y no un CSV? (por extensión o MIME). */
export function isSpreadsheetFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name) || file.type === XLSX_MIME;
}

/**
 * Normaliza un fichero subido (CSV o XLSX/XLS) a un string CSV (cabecera + filas).
 * Para XLSX se toma la PRIMERA hoja. Así el flujo de import por-CSV (validación de
 * cabecera + onImport + backend) no cambia: solo se le antepone la conversión.
 */
export async function fileToCsv(file: File): Promise<string> {
  if (!isSpreadsheetFile(file)) return file.text();
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return '';
  const sheet = wb.Sheets[first];
  if (!sheet) return '';
  return XLSX.utils.sheet_to_csv(sheet, { FS: ',', blankrows: false });
}

/**
 * Exporta cabecera + filas en el formato elegido y dispara la descarga.
 * `rows` son strings ya formateados (el llamador decide formato de números/fechas).
 */
export async function exportRows(
  format: SpreadsheetFormat,
  filenameBase: string,
  headers: string[],
  rows: string[][],
): Promise<void> {
  if (format === 'csv') {
    exportRowsToCsv(`${filenameBase}.csv`, headers, rows);
    return;
  }
  const XLSX = await loadXlsx();
  // Paridad de seguridad con el CSV: neutralizar fórmulas en cada celda antes de escribir.
  const safe = [headers, ...rows].map((r) => r.map((c) => neutralizeFormula(String(c ?? ''))));
  const sheet = XLSX.utils.aoa_to_sheet(safe);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Datos');
  XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}

/** Genera y descarga una plantilla (cabecera + fila de ejemplo) en el formato elegido. */
export async function downloadTemplate(
  format: SpreadsheetFormat,
  filenameBase: string,
  columns: string[],
  example: string[],
): Promise<void> {
  await exportRows(format, filenameBase, columns, [example]);
}
