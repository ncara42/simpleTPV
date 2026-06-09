// Parser CSV mínimo del lado cliente (cabecera + filas, separador coma, sin
// comillas/escapes): espejo del parser del backend (apps/api/src/common/csv.ts)
// para los flujos que resuelven el CSV en el navegador (p. ej. añadir líneas de
// traspaso por SKU contra el catálogo ya cargado).
export function parseCsvRows(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}
