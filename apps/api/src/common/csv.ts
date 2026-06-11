// Utilidades compartidas para importación CSV en lote (T1 del plan de UX).
// Parser mínimo + tipo de resultado común a todos los imports (catálogo, stock,
// usuarios, precios por tienda, líneas de traspaso): inserta las filas válidas y
// reporta los errores por fila sin abortar el lote.

import { BadRequestException } from '@nestjs/common';

export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

// Tope de filas por import: los imports hacen trabajo por fila (hash bcrypt en
// usuarios, lookups en tarifas), así que sin tope un CSV al límite del body
// (512kb) costaría minutos de CPU en una sola petición (DoS autenticado).
// Mismo orden de magnitud que @ArrayMaxSize(500) de los DTOs de líneas (SEC-10).
export const MAX_IMPORT_ROWS = 500;

// Primera línea = cabecera, resto = filas. Separador coma, sin soporte de
// comillas/escapes (los CSV de importación son de formato simple). Devuelve cada
// fila como objeto indexado por nombre de columna (cabecera normalizada a trim).
// Lanza 400 si el CSV supera MAX_IMPORT_ROWS filas de datos.
export function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return [];
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    throw new BadRequestException(
      `El CSV supera el máximo de ${MAX_IMPORT_ROWS} filas por importación; divídelo en lotes`,
    );
  }
  const header = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

// Nº de fila legible por humanos: +1 por la cabecera, +1 porque se cuenta desde 1.
export function rowNumber(index: number): number {
  return index + 2;
}
