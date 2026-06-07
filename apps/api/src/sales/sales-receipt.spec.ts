import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  eur,
  formatDateEs,
  type ReceiptData,
  renderReceiptHtml,
} from './sales-receipt.js';

function makeData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    organization: { name: 'Verde SL', nif: 'B12345678' },
    store: { name: 'Tienda Centro', code: '01' },
    ticketNumber: 'T01-000042',
    createdAt: new Date('2026-06-02T12:05:00.000Z'),
    lines: [
      {
        name: 'Aceite CBD 10%',
        qty: 1,
        unitPrice: 24.9,
        discountPct: 0,
        discountAmt: 0,
        lineTotal: 24.9,
      },
      {
        name: 'Flor Lemon Haze 2g',
        qty: 2,
        unitPrice: 14.5,
        discountPct: 0,
        discountAmt: 0,
        lineTotal: 29,
      },
    ],
    subtotal: 53.9,
    discountTotal: 0,
    total: 53.9,
    paymentMethod: 'CASH',
    cashGiven: 60,
    cashChange: 6.1,
    taxBreakdown: [{ taxRate: 21, base: 44.55, cuota: 9.35 }],
    ...overrides,
  };
}

describe('eur', () => {
  it('formatea con coma decimal y 2 decimales', () => {
    expect(eur(24.9)).toBe('24,90 €');
    expect(eur('14.5')).toBe('14,50 €');
    expect(eur(0)).toBe('0,00 €');
  });

  it('cae a 0,00 € con valores no numéricos o nulos', () => {
    expect(eur(null)).toBe('0,00 €');
    expect(eur(undefined)).toBe('0,00 €');
  });
});

describe('escapeHtml', () => {
  it('escapa los caracteres peligrosos en contexto HTML', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("O'Brien & co")).toBe('O&#39;Brien &amp; co');
  });
});

describe('formatDateEs', () => {
  it('formatea dd/mm/aaaa hh:mm anclado a Europe/Madrid', () => {
    // 12:05 UTC el 2 de junio (CEST, +2) → 14:05 hora local de Madrid.
    expect(formatDateEs(new Date('2026-06-02T12:05:00.000Z'))).toBe('02/06/2026, 14:05');
  });
});

describe('renderReceiptHtml', () => {
  it('genera un documento HTML completo con los datos fiscales', () => {
    const html = renderReceiptHtml(makeData());

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Factura simplificada');
    expect(html).toContain('Verde SL');
    expect(html).toContain('NIF B12345678');
    expect(html).toContain('T01-000042');
    expect(html).toContain('Tienda Centro (01)');
    expect(html).toContain('Aceite CBD 10%');
    expect(html).toContain('Flor Lemon Haze 2g');
  });

  it('incluye el desglose de IVA con base y cuota', () => {
    const html = renderReceiptHtml(makeData());
    expect(html).toContain('IVA 21%');
    expect(html).toContain('44,55 €');
    expect(html).toContain('9,35 €');
  });

  it('muestra total, subtotal y método de pago', () => {
    const html = renderReceiptHtml(makeData());
    expect(html).toContain('Subtotal');
    expect(html).toContain('53,90 €');
    expect(html).toContain('Efectivo');
  });

  it('en CASH muestra entregado y cambio', () => {
    const html = renderReceiptHtml(makeData());
    expect(html).toContain('Entregado');
    expect(html).toContain('60,00 €');
    expect(html).toContain('Cambio');
    expect(html).toContain('6,10 €');
  });

  it('en CARD no muestra entregado ni cambio', () => {
    const html = renderReceiptHtml(
      makeData({ paymentMethod: 'CARD', cashGiven: null, cashChange: null }),
    );
    expect(html).toContain('Tarjeta');
    expect(html).not.toContain('Entregado');
    expect(html).not.toContain('Cambio');
  });

  it('omite la línea de NIF cuando la organización no tiene', () => {
    const html = renderReceiptHtml(
      makeData({ organization: { name: 'Herbolario Verde', nif: null } }),
    );
    expect(html).toContain('Herbolario Verde');
    // Sin NIF no se pinta el nodo de texto "NIF ..." (la clase CSS .org-nif sigue
    // en el <style>, así que comprobamos el texto, no el selector).
    expect(html).not.toContain('>NIF ');
  });

  it('muestra la fila de descuento solo cuando hay descuento', () => {
    const sin = renderReceiptHtml(makeData({ discountTotal: 0 }));
    expect(sin).not.toContain('Descuento');

    const con = renderReceiptHtml(makeData({ discountTotal: 5.4, total: 48.5 }));
    expect(con).toContain('Descuento');
    expect(con).toContain('−5,40 €');
  });

  it('renderiza el descuento de línea por porcentaje y por importe', () => {
    const html = renderReceiptHtml(
      makeData({
        lines: [
          { name: 'Pct', qty: 1, unitPrice: 10, discountPct: 10, discountAmt: 0, lineTotal: 9 },
          { name: 'Amt', qty: 1, unitPrice: 10, discountPct: 0, discountAmt: 2, lineTotal: 8 },
        ],
      }),
    );
    expect(html).toContain('−10%');
    expect(html).toContain('−2,00 €');
  });

  it('escapa el contenido controlado por el usuario (XSS)', () => {
    const html = renderReceiptHtml(
      makeData({
        organization: { name: '<script>alert(1)</script>', nif: 'B1' },
        lines: [
          {
            name: '<img src=x onerror=alert(1)>',
            qty: 1,
            unitPrice: 1,
            discountPct: 0,
            discountAmt: 0,
            lineTotal: 1,
          },
        ],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
  });

  it('incluye el enlace de cotejo VeriFactu con nif, numserie e importe', () => {
    const html = renderReceiptHtml(makeData());
    expect(html).toContain('VeriFactu');
    expect(html).toContain('prewww2.aeat.es');
    expect(html).toContain('nif=B12345678');
    expect(html).toContain('numserie=T01-000042');
    expect(html).toContain('importe=53.90');
  });

  it('incluye estilos de impresión embebidos', () => {
    const html = renderReceiptHtml(makeData());
    expect(html).toContain('@media print');
  });

  it('no rompe cuando el desglose de IVA viene vacío (venta sin base imponible)', () => {
    const html = renderReceiptHtml(makeData({ taxBreakdown: [] }));
    expect(html).toContain('Desglose de IVA');
    expect(html).not.toContain('IVA ');
  });
});
