/**
 * Dominio puro de compras: KPIs de proveedor y la sugerencia de reposición.
 * Funciones SIN efectos (no tocan DB ni contexto de tenant), separadas de la
 * orquestación de `PurchasesService` para poder probarlas de forma aislada.
 */

// Cobertura por defecto (días) que cubre la cantidad sugerida cuando el cliente
// no especifica otra. Constante de dominio del cálculo de reposición (#45).
export const DEFAULT_DAYS_COVERAGE = 14;

// Ventana (días) sobre la que se promedia la venta diaria para la sugerencia.
export const SALES_WINDOW_DAYS = 30;

// KPIs de proveedor (#46), funciones puras y testeables.
// fillRate = Σ recibido / Σ pedido (0..1). Sin nada pedido → null.
export function fillRate(ordered: number, received: number): number | null {
  if (ordered <= 0) {
    return null;
  }
  return Math.round((received / ordered) * 1000) / 1000;
}

// leadTimeDays = días entre confirmación y recepción. null si falta alguna fecha.
export function leadTimeDays(confirmedAt: Date | null, receivedAt: Date | null): number | null {
  if (!confirmedAt || !receivedAt) {
    return null;
  }
  const ms = receivedAt.getTime() - confirmedAt.getTime();
  return Math.round((ms / (24 * 60 * 60 * 1000)) * 100) / 100;
}

// Cantidad sugerida a pedir (#45). Cubre el mínimo más la demanda esperada
// durante el plazo de cobertura, descontando lo que ya hay. Nunca negativa.
// Función pura, testeable.
//   sugerida = max(0, minStock - stockActual + ventaMediaDiaria * diasCobertura)
export function suggestQuantity(
  minStock: number,
  stockActual: number,
  ventaMediaDiaria: number,
  diasCobertura: number,
): number {
  const raw = minStock - stockActual + ventaMediaDiaria * diasCobertura;
  return Math.max(0, Math.round(raw * 1000) / 1000);
}
