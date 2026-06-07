import { describe, expect, it } from 'vitest';

import { type AccountingSale, buildAccountingCsv } from './accounting-export.js';

function sale(over: Partial<AccountingSale> = {}): AccountingSale {
  return {
    ticketNumber: 'T01-000001',
    createdAt: new Date('2026-06-02T10:30:00.000Z'),
    storeName: 'Centro',
    paymentMethod: 'CASH',
    subtotal: 121,
    total: 121,
    lines: [{ taxRate: 21, lineTotal: 121 }],
    ...over,
  };
}

describe('buildAccountingCsv', () => {
  it('cabecera contable y una fila por factura de un solo tipo de IVA', () => {
    const { csv, rowCount } = buildAccountingCsv([sale()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total');
    // 121 IVA incl. al 21% → base 100, cuota 21.
    expect(lines[1]).toBe('2026-06-02,T01-000001,Centro,CASH,21,100,21,121');
    expect(rowCount).toBe(1);
  });

  it('una factura con dos tipos de IVA produce dos filas con el total repetido', () => {
    const { csv, rowCount } = buildAccountingCsv([
      sale({
        ticketNumber: 'T01-000002',
        subtotal: 231,
        total: 231,
        lines: [
          { taxRate: 21, lineTotal: 121 },
          { taxRate: 10, lineTotal: 110 },
        ],
      }),
    ]);
    const lines = csv.split('\n').slice(1);
    expect(lines).toHaveLength(2);
    // Orden ascendente por tipo (10 antes que 21). Total 231 repetido en ambas.
    expect(lines[0]).toBe('2026-06-02,T01-000002,Centro,CASH,10,100,10,231');
    expect(lines[1]).toBe('2026-06-02,T01-000002,Centro,CASH,21,100,21,231');
    // rowCount = nº de facturas (1), no de líneas IVA (2).
    expect(rowCount).toBe(1);
  });

  it('prorratea el descuento de ticket: Σ(base+cuota) cuadra con el total', () => {
    // subtotal 231 → total 207.9 (descuento de ticket 23.1).
    const { csv } = buildAccountingCsv([
      sale({
        subtotal: 231,
        total: 207.9,
        lines: [
          { taxRate: 21, lineTotal: 121 },
          { taxRate: 10, lineTotal: 110 },
        ],
      }),
    ]);
    const dataRows = csv.split('\n').slice(1);
    const sumBaseCuota = dataRows.reduce((acc, row) => {
      const cols = row.split(',');
      return acc + Number(cols[5]) + Number(cols[6]);
    }, 0);
    expect(sumBaseCuota).toBeCloseTo(207.9, 2);
  });

  it('escapa comas y comillas en tienda y nº de ticket', () => {
    const { csv } = buildAccountingCsv([sale({ storeName: 'Centro, Sur' })]);
    expect(csv).toContain('"Centro, Sur"');
  });

  it('varias facturas en orden; rowCount cuenta facturas', () => {
    const { csv, rowCount } = buildAccountingCsv([
      sale({ ticketNumber: 'T01-000001' }),
      sale({ ticketNumber: 'T01-000002' }),
    ]);
    expect(rowCount).toBe(2);
    expect(csv.split('\n')).toHaveLength(3); // cabecera + 2 filas
  });

  it('sin facturas: solo la cabecera', () => {
    const { csv, rowCount } = buildAccountingCsv([]);
    expect(csv).toBe('fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total');
    expect(rowCount).toBe(0);
  });
});
