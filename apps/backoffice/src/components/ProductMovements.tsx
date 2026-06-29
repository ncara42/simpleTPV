import { useQuery } from '@tanstack/react-query';

import { listMovements } from '../lib/stock.js';
import { dt } from '../stock/labels.js';

// Metadatos de cada tipo: etiqueta, clase CSS del badge y signo de la cantidad.
const MOVEMENT_META: Record<string, { label: string; cls: string; sign: '+' | '-' | '±' }> = {
  SALE: { label: 'Venta', cls: 'pmv-badge--sale', sign: '-' },
  RETURN: { label: 'Devolución', cls: 'pmv-badge--return', sign: '+' },
  TRANSFER_IN: { label: 'Entrada', cls: 'pmv-badge--transfer-in', sign: '+' },
  TRANSFER_OUT: { label: 'Salida', cls: 'pmv-badge--transfer-out', sign: '-' },
  PURCHASE_RECEIPT: { label: 'Compra', cls: 'pmv-badge--purchase', sign: '+' },
  ADJUSTMENT: { label: 'Ajuste', cls: 'pmv-badge--adjustment', sign: '±' },
};

/**
 * Histórico de movimientos de stock del producto (I-12 / D-05): vive en el
 * detalle del producto (modo edición). Carga LAZY: la query se dispara solo
 * cuando el panel externo (pfm-extra) está abierto, no al montar.
 */
export function ProductMovements({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', productId],
    queryFn: () => listMovements(productId),
  });

  if (isLoading) {
    return (
      <section className="form-section" data-testid="product-movements">
        <span className="form-section-title">Movimientos de stock</span>
        <p className="pmv-loading">Cargando…</p>
      </section>
    );
  }

  const items = data?.items ?? [];

  return (
    <section className="form-section" data-testid="product-movements">
      <span className="form-section-title">Movimientos de stock</span>
      {items.length === 0 ? (
        <p className="pmv-empty" data-testid="movements-empty">
          Sin movimientos registrados.
        </p>
      ) : (
        <ul className="pmv-list" data-testid="movements-table">
          {items.map((m) => {
            const meta = MOVEMENT_META[m.type] ?? {
              label: m.type,
              cls: 'pmv-badge--adjustment',
              sign: '±' as const,
            };
            const qty = Number(m.quantity);
            const isPos = meta.sign === '+' || (meta.sign === '±' && qty > 0);
            const isNeg = meta.sign === '-' || (meta.sign === '±' && qty < 0);
            const qtyCls = isPos
              ? 'pmv-qty pmv-qty--pos'
              : isNeg
                ? 'pmv-qty pmv-qty--neg'
                : 'pmv-qty pmv-qty--neu';
            const prefix = isPos ? '+' : '';
            return (
              <li key={m.id} className="pmv-row" data-testid="movement-row">
                <span className={`pmv-badge ${meta.cls}`}>{meta.label}</span>
                <span className="pmv-meta">
                  <span className="pmv-date">{dt.format(new Date(m.createdAt))}</span>
                  {m.reason && <span className="pmv-reason">{m.reason}</span>}
                </span>
                <span className={qtyCls}>
                  {prefix}
                  {m.quantity}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
