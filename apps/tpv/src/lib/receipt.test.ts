import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadReceiptHtml, printReceiptHtml } from './receipt.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
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
