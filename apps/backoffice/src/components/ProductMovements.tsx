import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { listMovements } from '../lib/stock.js';
import { dt, MOVEMENT_LABEL } from '../stock/labels.js';

/**
 * Histórico de movimientos de stock del producto (I-12 / D-05): vive en el
 * detalle del producto (modo edición), no como botón repetido en cada fila de
 * Stock. Carga LAZY: la query solo se dispara al desplegar la sección.
 */
export function ProductMovements({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', productId],
    queryFn: () => listMovements(productId),
    enabled: open,
  });

  return (
    <section className="form-section" data-testid="product-movements">
      <span className="form-section-title">Movimientos de stock</span>
      {!open ? (
        <button
          type="button"
          className="link-btn"
          onClick={() => setOpen(true)}
          data-testid="product-movements-open"
        >
          Ver movimientos
        </button>
      ) : isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="catalog-empty" data-testid="movements-empty">
          Sin movimientos.
        </p>
      ) : (
        <table className="catalog-table" data-testid="movements-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.id} data-testid="movement-row">
                <td className="muted">{dt.format(new Date(m.createdAt))}</td>
                <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                <td>{m.quantity}</td>
                <td className="muted">{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
