/**
 * Dominio puro de devoluciones: funciones SIN efectos (no tocan la base de datos
 * ni el contexto de tenant) que calculan importes y cantidades devolubles,
 * separadas de la orquestación de `ReturnsService` para poder probarlas aisladas.
 */
import { round2 } from '../common/money.js';

/**
 * Importe a devolver por una línea: la parte proporcional del neto de la
 * SaleLine. unitario neto = saleLineTotal / saleLineQty (precio ya con
 * descuentos de línea/ticket congelados). Función pura, testeable.
 */
export function computeReturnLineTotal(
  saleLineTotal: number,
  saleLineQty: number,
  qty: number,
): number {
  if (saleLineQty <= 0) {
    return 0;
  }
  return round2((saleLineTotal / saleLineQty) * qty);
}

/**
 * Cantidad disponible para devolver de una SaleLine: lo vendido menos lo ya
 * devuelto en devoluciones anteriores. Nunca negativa. Función pura, testeable.
 */
export function computeReturnable(saleLineQty: number, alreadyReturned: number): number {
  return round2(Math.max(0, saleLineQty - alreadyReturned));
}
