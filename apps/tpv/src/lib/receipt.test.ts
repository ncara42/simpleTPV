import type { SaleTicket } from '@simpletpv/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadReceiptHtml, printReceiptHtml, renderReceiptHtml } from './receipt.js';

function makeTicket(overrides: Partial<SaleTicket> = {}): SaleTicket {
  return {
    organization: { name: 'Verde SL', nif: 'B12345678' },
    store: { name: 'Tienda Centro', code: '01' },
    ticketNumber: 'T01-000042',
    createdAt: '2026-06-02T12:05:00.000Z',
    lines: [
      {
        name: 'Aceite CBD 10%',
        qty: '1',
        unitPrice: '24.90',
        discountPct: '0',
        discountAmt: '0',
        lineTotal: '24.90',
      },
      {
        name: 'Flor Lemon Haze 2g',
        qty: '2',
        unitPrice: '14.50',
        discountPct: '0',
        discountAmt: '0',
        lineTotal: '29.00',
      },
    ],
    subtotal: '53.90',
    discountTotal: '0',
    total: '53.90',
    paymentMethod: 'CASH',
    cashGiven: '60.00',
    cashChange: '6.10',
    taxBreakdown: [{ taxRate: '21', base: '44.55', cuota: '9.35' }],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('renderReceiptHtml (demo mirror)', () => {
  it('genera un documento HTML completo con los datos fiscales', () => {
    const html = renderReceiptHtml(makeTicket());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Factura simplificada');
    expect(html).toContain('Verde SL');
    expect(html).toContain('NIF B12345678');
    expect(html).toContain('T01-000042');
    expect(html).toContain('Tienda Centro (01)');
    expect(html).toContain('Aceite CBD 10%');
    expect(html).toContain('IVA 21%');
    expect(html).toContain('53,90 €');
    expect(html).toContain('@media print');
  });

  it('en CASH muestra entregado y cambio; en CARD no', () => {
    expect(renderReceiptHtml(makeTicket())).toContain('Entregado');
    const card = renderReceiptHtml(
      makeTicket({ paymentMethod: 'CARD', cashGiven: null, cashChange: null }),
    );
    expect(card).toContain('Tarjeta');
    expect(card).not.toContain('Entregado');
  });

  it('omite el NIF cuando la organización no tiene', () => {
    const html = renderReceiptHtml(makeTicket({ organization: { name: 'Sin', nif: null } }));
    expect(html).not.toContain('>NIF ');
  });

  it('escapa el contenido controlado por el usuario (XSS)', () => {
    const html = renderReceiptHtml(
      makeTicket({
        organization: { name: '<script>alert(1)</script>', nif: 'B1' },
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('incluye el enlace de cotejo VeriFactu', () => {
    const html = renderReceiptHtml(makeTicket());
    expect(html).toContain('VeriFactu');
    expect(html).toContain('numserie=T01-000042');
  });

  it('renderiza el descuento de línea por porcentaje y por importe', () => {
    const html = renderReceiptHtml(
      makeTicket({
        lines: [
          {
            name: 'Pct',
            qty: '1',
            unitPrice: '10',
            discountPct: '10',
            discountAmt: '0',
            lineTotal: '9',
          },
          {
            name: 'Amt',
            qty: '1',
            unitPrice: '10',
            discountPct: '0',
            discountAmt: '2',
            lineTotal: '8',
          },
        ],
      }),
    );
    expect(html).toContain('−10%');
    expect(html).toContain('−2,00 €');
  });

  it('no rompe cuando el desglose de IVA viene vacío', () => {
    const html = renderReceiptHtml(makeTicket({ taxBreakdown: [] }));
    expect(html).toContain('Desglose de IVA');
    expect(html).not.toContain('IVA ');
  });
});

describe('downloadReceiptHtml', () => {
  it('crea un blob, dispara la descarga y revoca la URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn((_url: string) => {});
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadReceiptHtml('<html></html>', 'factura-T01-000042.html');

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob.type).toContain('text/html');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    // El anchor temporal no queda en el DOM.
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('printReceiptHtml', () => {
  it('monta un iframe oculto con el documento vía srcdoc', () => {
    printReceiptHtml('<html><body>factura</body></html>');

    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('aria-hidden')).toBe('true');
    // El contenido va por srcdoc (no document.write), aislado del DOM del TPV.
    expect(iframe?.getAttribute('srcdoc')).toContain('factura');
  });
});
