/**
 * Export contable a gestoría (#125): CSV del "libro de facturas expedidas / IVA
 * repercutido". Formato LARGO: una fila por (factura × tipo de IVA), con base y
 * cuota por tipo. Es lossless (admite cualquier tipo de IVA sin columnas fijas) y
 * lo importan la mayoría de programas de gestoría.
 *
 * Función pura (sin BD ni tenant): reutiliza `buildTaxBreakdown` para desglosar el
 * IVA de cada factura prorrateando su descuento de ticket → Σ(base+cuota) de la
 * factura cuadra con su total. Importes con punto decimal (machine-readable),
 * mismo criterio que el export de ventas (`generateExportCsv`).
 *
 * NOTA (#125): un formato específico de gestoría (Holded/Sage/A3, normalmente con
 * coma decimal y separador `;`) queda pendiente de confirmar QUÉ software usa la
 * gestoría del cliente; este CSV estándar es la base sobre la que añadirlo.
 */
import { round2 } from '../common/money.js';
import { buildTaxBreakdown } from './sales.domain.js';

export interface AccountingSale {
  ticketNumber: string;
  createdAt: Date;
  storeName: string;
  paymentMethod: string;
  subtotal: number;
  total: number;
  lines: Array<{ taxRate: number; lineTotal: number }>;
}

// Escapa comillas/comas/saltos (mismo criterio que generateExportCsv).
function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const HEADER = 'fecha,numero,tienda,metodo_pago,tipo_iva,base,cuota,total';

/**
 * Genera el CSV contable de un conjunto de facturas. `rowCount` es el nº de
 * FACTURAS exportadas (no de líneas IVA), coherente con SalesExport.rowCount.
 * Una factura con varios tipos de IVA produce varias filas (una por tipo); el
 * total de la factura se repite en cada fila → el consumidor debe AGRUPAR por
 * `numero` antes de sumar el total (no sumar la columna `total` directamente).
 *
 * Una factura con base imponible 0 (p.ej. 100% de descuento) no produce líneas de
 * IVA (buildTaxBreakdown devuelve [] con subtotal<=0); cuenta como factura
 * exportada en `rowCount` pero no añade filas al cuerpo. Caso de borde aceptado.
 */
export function buildAccountingCsv(sales: AccountingSale[]): { csv: string; rowCount: number } {
  const rows: string[] = [];
  for (const sale of sales) {
    const ticketDiscount = round2(sale.subtotal - sale.total);
    const breakdown = buildTaxBreakdown(sale.lines, ticketDiscount);
    const date = sale.createdAt.toISOString().slice(0, 10);
    for (const b of breakdown) {
      rows.push(
        [
          date,
          esc(sale.ticketNumber),
          esc(sale.storeName),
          esc(sale.paymentMethod),
          String(b.taxRate),
          String(b.base),
          String(b.cuota),
          String(sale.total),
        ].join(','),
      );
    }
  }
  return { csv: [HEADER, ...rows].join('\n'), rowCount: sales.length };
}
