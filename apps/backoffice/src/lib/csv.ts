import type { ImportResult } from '@simpletpv/auth';

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

// Caracteres con los que una hoja de cálculo interpreta el campo como FÓRMULA al
// abrir el CSV (CSV/formula injection, CWE-1236). Espejo EXACTO del backend
// (apps/api/src/common/csv.ts) para que el export del navegador sea igual de
// seguro que el de la API.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// Escapa un campo de texto para CSV de EXPORTACIÓN: (1) neutraliza la inyección de
// fórmulas prefijando con comilla simple, (2) entrecomillado RFC 4180 si el campo
// contiene comas, comillas o saltos de línea.
export function escapeCsvField(value: string): string {
  const prefixed = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\n]/.test(prefixed) ? `"${prefixed.replace(/"/g, '""')}"` : prefixed;
}

// Serializa cabecera + filas a CSV seguro y dispara la descarga en el navegador.
// `rows` son strings ya formateados (el llamador decide formato de números/fechas).
// Prefija BOM UTF-8 para que Excel respete los acentos.
export function exportRowsToCsv(filename: string, headers: string[], rows: string[][]): void {
  const body = [headers, ...rows]
    .map((cells) => cells.map((c) => escapeCsvField(String(c ?? ''))).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import por-fila para tablas SIN endpoint de bulk en la API: parsea el CSV y llama
// al `create` de la entidad una vez por fila, acumulando el mismo ImportResult que
// los imports de backend (inserted + errors por fila). `mapRow` convierte la fila
// CSV en el input del create (debe LANZAR si la fila es inválida). NO es atómico
// (un fallo a mitad deja filas ya creadas): adecuado para lotes pequeños de altas
// simples (proveedores, clientes), no para volumen alto.
export async function importRowsViaCreate<T>(
  csv: string,
  mapRow: (row: Record<string, string>) => T,
  createFn: (input: T) => Promise<unknown>,
): Promise<ImportResult> {
  const rows = parseCsvRows(csv);
  let inserted = 0;
  const errors: Array<{ row: number; message: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      await createFn(mapRow(rows[i]!));
      inserted += 1;
    } catch (e) {
      // +2: la fila 1 del CSV es la cabecera y se cuenta desde 1.
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}
