import type { Return } from '@simpletpv/auth';

// Suma, por línea de venta (saleLineId), la cantidad ya devuelta en devoluciones
// anteriores. Sirve para calcular cuánto queda disponible para devolver de cada
// línea. Función pura, testeable.
export function returnedBySaleLine(returns: Return[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of returns) {
    for (const l of r.lines) {
      map.set(l.saleLineId, (map.get(l.saleLineId) ?? 0) + Number(l.qty));
    }
  }
  return map;
}
