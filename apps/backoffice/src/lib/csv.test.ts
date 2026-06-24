import { afterEach, describe, expect, it, vi } from 'vitest';

import { escapeCsvField, exportRowsToCsv, neutralizeFormula, parseCsvRows } from './csv.js';

describe('neutralizeFormula', () => {
  it('prefija con comilla simple solo si empieza por un disparador de fórmula', () => {
    expect(neutralizeFormula('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(neutralizeFormula('+1')).toBe("'+1");
    expect(neutralizeFormula('-1')).toBe("'-1");
    expect(neutralizeFormula('@cmd')).toBe("'@cmd");
  });
  it('deja intacto el texto normal (sin entrecomillar, a diferencia de escapeCsvField)', () => {
    expect(neutralizeFormula('Distribuciones Norte')).toBe('Distribuciones Norte');
    expect(neutralizeFormula('Juan, S.L.')).toBe('Juan, S.L.');
    expect(neutralizeFormula('2.50')).toBe('2.50');
  });
});

describe('escapeCsvField', () => {
  it('deja intactos los campos simples', () => {
    expect(escapeCsvField('Distribuciones Norte')).toBe('Distribuciones Norte');
    expect(escapeCsvField('7')).toBe('7');
  });

  it('neutraliza la inyección de fórmulas prefijando con comilla simple', () => {
    // Sin coma/comilla/salto → solo el prefijo, sin entrecomillar.
    expect(escapeCsvField('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('-1')).toBe("'-1");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
    // Fórmula CON coma → prefijo + entrecomillado RFC 4180.
    expect(escapeCsvField('=SUM(A1,A2)')).toBe('"\'=SUM(A1,A2)"');
  });

  it('entrecomilla (RFC 4180) cuando hay comas, comillas o saltos de línea', () => {
    expect(escapeCsvField('Juan, S.L.')).toBe('"Juan, S.L."');
    expect(escapeCsvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(escapeCsvField('línea1\nlínea2')).toBe('"línea1\nlínea2"');
  });
});

describe('exportRowsToCsv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dispara la descarga con el nombre dado y libera el object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    exportRowsToCsv(
      'proveedores.csv',
      ['Nombre', 'Lead time'],
      [
        ['Juan, S.L.', '7'],
        ['=mal', '3'],
      ],
    );

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('proveedores.csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('añade la extensión .csv si falta', () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    exportRowsToCsv('clientes', ['A'], [['1']]);
    expect(anchor.download).toBe('clientes.csv');
  });
});

describe('parseCsvRows', () => {
  it('parsea cabecera (lowercase) + filas', () => {
    const rows = parseCsvRows('Nombre,Leadtimedias\nDistribuciones Norte,7');
    expect(rows).toEqual([{ nombre: 'Distribuciones Norte', leadtimedias: '7' }]);
  });

  it('devuelve [] si no hay filas de datos', () => {
    expect(parseCsvRows('Nombre,Email')).toEqual([]);
  });
});
