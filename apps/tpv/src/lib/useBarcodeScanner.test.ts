import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBarcodeBuffer } from './useBarcodeScanner.js';

// Teclea una ráfaga de teclas (gap rápido por defecto) sobre el manejador,
// avanzando el reloj `t` entre pulsaciones.
function burst(
  handle: (e: { key: string; target: EventTarget | null }, now: number) => void,
  keys: string[],
  opts: { target?: EventTarget | null; start?: number; gap?: number } = {},
): number {
  const target = opts.target ?? document.body;
  let t = opts.start ?? 1000;
  const gap = opts.gap ?? 10; // < 50ms → ráfaga de escáner
  for (const key of keys) {
    handle({ key, target }, t);
    t += gap;
  }
  return t;
}

describe('createBarcodeBuffer', () => {
  let onScan: ReturnType<typeof vi.fn<(code: string) => void>>;

  beforeEach(() => {
    onScan = vi.fn<(code: string) => void>();
  });

  it('dispara onScan con el código de una ráfaga + Enter (foco fuera de un campo)', () => {
    const handle = createBarcodeBuffer(onScan);
    const t = burst(handle, ['8', '4', '0', '0', '1', '7']);
    handle({ key: 'Enter', target: document.body }, t);
    expect(onScan).toHaveBeenCalledOnce();
    expect(onScan).toHaveBeenCalledWith('840017');
  });

  it('NO dispara cuando el foco está en un input editable (evita el doble manejo)', () => {
    const input = document.createElement('input');
    const handle = createBarcodeBuffer(onScan);
    const t = burst(handle, ['8', '4', '0', '0', '1', '7'], { target: input });
    handle({ key: 'Enter', target: input }, t);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignora códigos por debajo de la longitud mínima', () => {
    const handle = createBarcodeBuffer(onScan);
    const t = burst(handle, ['1', '2']); // 2 < BARCODE_MIN_LENGTH (3)
    handle({ key: 'Enter', target: document.body }, t);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('reinicia el buffer si el tecleo es lento (humano, no escáner)', () => {
    const handle = createBarcodeBuffer(onScan);
    // Tres teclas con gaps grandes (>50ms): cada una reinicia el buffer, así que
    // al pulsar Enter solo queda la última y no llega a la longitud mínima.
    handle({ key: '1', target: document.body }, 1000);
    handle({ key: '2', target: document.body }, 1200);
    handle({ key: '3', target: document.body }, 1400);
    handle({ key: 'Enter', target: document.body }, 1600);
    expect(onScan).not.toHaveBeenCalled();
  });
});
