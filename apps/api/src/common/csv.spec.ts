import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_ROWS, parseCsv, rowNumber } from './csv.js';

describe('parseCsv', () => {
  it('mapea filas por nombre de columna con trim', () => {
    const rows = parseCsv('sku, price\nA-1, 2.50\nB-2,3');
    expect(rows).toEqual([
      { sku: 'A-1', price: '2.50' },
      { sku: 'B-2', price: '3' },
    ]);
  });

  it('devuelve [] sin filas de datos', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('sku,price')).toEqual([]);
  });

  it('celdas ausentes quedan como cadena vacía', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('rechaza con 400 un CSV que supere MAX_IMPORT_ROWS (DoS por fila)', () => {
    const big = ['sku,price', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `S${i},1`)];
    expect(() => parseCsv(big.join('\n'))).toThrow(BadRequestException);
    // El límite exacto sí pasa.
    expect(parseCsv(big.slice(0, MAX_IMPORT_ROWS + 1).join('\n'))).toHaveLength(MAX_IMPORT_ROWS);
  });
});

describe('rowNumber', () => {
  it('cuenta desde 2 (cabecera + base 1 humana)', () => {
    expect(rowNumber(0)).toBe(2);
    expect(rowNumber(3)).toBe(5);
  });
});
