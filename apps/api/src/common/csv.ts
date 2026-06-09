// Utilidades compartidas para importación CSV en lote (T1 del plan de UX).
// Parser mínimo + tipo de resultado común a todos los imports (catálogo, stock,
// usuarios, precios por tienda, líneas de traspaso): inserta las filas válidas y
// reporta los errores por fila sin abortar el lote.

export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

// Primera línea = cabecera, resto = filas. Separador coma, sin soporte de
// comillas/escapes (los CSV de importación son de formato simple). Devuelve cada
// fila como objeto indexado por nombre de columna (cabecera normalizada a trim).
export function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return [];
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
