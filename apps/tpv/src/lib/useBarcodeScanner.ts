import { useEffect, useRef } from 'react';

// Un escáner USB se comporta como teclado: emite los dígitos del código muy
// rápido seguidos de Enter. Distinguimos del tecleo humano por la velocidad
// entre pulsaciones. Escuchamos a nivel de documento con un buffer temporal.
const MAX_INTER_KEY_MS = 50; // entre teclas de un escáner real < ~50ms
export const BARCODE_MIN_LENGTH = 3;

// ¿El evento procede de un campo editable (input/textarea/select/contenteditable)?
// Cuando el foco está en el buscador (autoFocus por defecto), es ÉL quien gestiona
// el escaneo al pulsar Enter; este listener global se inhibe para no duplicar el
// manejo (la pistola escribiría el código en el input Y dispararía aquí onScan).
// Queda como respaldo para cuando el foco NO está en un campo (p.ej. tras pulsar
// una tarjeta de producto).
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// Lógica pura del buffer de escáner, aislada del DOM/React para poder testearla:
// recibe el `target`, la `key` y el `now` (timestamp) explícito → determinista.
// Devuelve un manejador con estado encapsulado (buffer + última pulsación).
export function createBarcodeBuffer(
  onScan: (code: string) => void,
): (e: { key: string; target: EventTarget | null }, now: number) => void {
  let buffer = '';
  let lastTime = 0;

  return function handle(e, now): void {
    if (isEditableTarget(e.target)) {
      buffer = '';
      return;
    }

    const gap = now - lastTime;
    lastTime = now;

    if (e.key === 'Enter') {
      if (buffer.length >= BARCODE_MIN_LENGTH) {
        onScan(buffer);
      }
      buffer = '';
      return;
    }

    // Solo caracteres imprimibles de longitud 1 (dígitos/letras del código).
    if (e.key.length === 1) {
      // Si pasó demasiado tiempo desde la última tecla, reiniciamos el buffer
      // (era tecleo humano, no una ráfaga de escáner).
      if (gap > MAX_INTER_KEY_MS) {
        buffer = '';
      }
      buffer += e.key;
    }
  };
}

export function useBarcodeScanner(onScan: (code: string) => void): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const handle = createBarcodeBuffer((code) => onScanRef.current(code));
    function listener(e: KeyboardEvent): void {
      handle(e, Date.now());
    }
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}
