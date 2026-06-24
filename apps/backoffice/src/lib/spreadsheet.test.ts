import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { fileToCsv, isSpreadsheetFile } from './spreadsheet.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('isSpreadsheetFile', () => {
  it('detecta XLSX/XLS por extensión o MIME, y descarta CSV/texto', () => {
    expect(isSpreadsheetFile(new File([''], 'productos.xlsx'))).toBe(true);
    expect(isSpreadsheetFile(new File([''], 'productos.xls'))).toBe(true);
    expect(isSpreadsheetFile(new File([''], 'sin-ext', { type: XLSX_MIME }))).toBe(true);
    expect(isSpreadsheetFile(new File([''], 'productos.csv'))).toBe(false);
    expect(isSpreadsheetFile(new File([''], 'productos.txt', { type: 'text/plain' }))).toBe(false);
  });
});

describe('fileToCsv', () => {
  it('devuelve el texto tal cual para un fichero CSV', async () => {
    const file = new File(['name,salePrice\nCafé,2.50'], 'productos.csv', { type: 'text/csv' });
    expect(await fileToCsv(file)).toBe('name,salePrice\nCafé,2.50');
  });

  it('convierte un XLSX a CSV (cabecera + filas de la PRIMERA hoja)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'salePrice', 'sku'],
      ['Café molido', 2.5, 'SKU-1'],
      ['Té verde', 1.9, 'SKU-2'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    const file = new File([bytes], 'productos.xlsx', { type: XLSX_MIME });

    const csv = await fileToCsv(file);
    const lines = csv.split(/\r?\n/);
    expect(lines[0]).toBe('name,salePrice,sku');
    expect(lines).toContain('Café molido,2.5,SKU-1');
    expect(lines).toContain('Té verde,1.9,SKU-2');
  });
});
