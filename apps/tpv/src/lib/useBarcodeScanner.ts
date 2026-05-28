import { useEffect, useRef } from 'react';

// Un escáner USB se comporta como teclado: emite los dígitos del código muy
// rápido seguidos de Enter. Distinguimos del tecleo humano por la velocidad
// entre pulsaciones. Escuchamos a nivel de documento con un buffer temporal.
const MAX_INTER_KEY_MS = 50; // entre teclas de un escáner real < ~50ms
const MIN_LENGTH = 3;

export function useBarcodeScanner(onScan: (code: string) => void): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    function handler(e: KeyboardEvent): void {
      // Ignorar si el foco está en un input de texto (lo escribe el usuario),
      // salvo que sea claramente un escáner (ráfaga rápida): aquí simplificamos
      // y solo procesamos cuando el target NO es editable.
      const now = Date.now();
      const gap = now - lastTime;
      lastTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= MIN_LENGTH) {
          onScanRef.current(buffer);
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
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
