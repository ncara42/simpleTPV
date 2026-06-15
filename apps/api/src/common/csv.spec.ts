import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { escapeCsvField, MAX_IMPORT_ROWS, parseCsv, rowNumber } from './csv.js';

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

describe('escapeCsvField', () => {
  it('deja intacto un texto plano sin caracteres especiales', () => {
    expect(escapeCsvField('Café con leche')).toBe('Café con leche');
  });

  it('entrecomilla y duplica comillas en campos con comas/comillas/saltos', () => {
    expect(escapeCsvField('Centro, Sur')).toBe('"Centro, Sur"');
    expect(escapeCsvField('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(escapeCsvField('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });

  it('neutraliza inyección de fórmulas prefijando con comilla simple', () => {
    // El campo se trata como texto literal en la hoja de cálculo, no como fórmula.
    expect(escapeCsvField("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(escapeCsvField('+1+1')).toBe("'+1+1");
    expect(escapeCsvField('-2+3')).toBe("'-2+3");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvField('\tTab')).toBe("'\tTab");
    expect(escapeCsvField('\rCR')).toBe("'\rCR");
  });

  it('combina prefijo de fórmula con entrecomillado cuando además hay comas', () => {
    // Primero prefija (anti-fórmula), luego entrecomilla por la coma.
    expect(escapeCsvField('=A1,B2')).toBe('"\'=A1,B2"');
  });

  it('no prefija si el carácter peligroso no es el primero', () => {
    expect(escapeCsvField('a=b')).toBe('a=b');
    expect(escapeCsvField('2-3')).toBe('2-3');
  });
});
