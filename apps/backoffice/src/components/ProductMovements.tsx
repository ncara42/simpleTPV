import { DataTable } from '@simpletpv/ui';
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
      ) : (
        <DataTable
          data-testid="movements-table"
          rowTestId="movement-row"
          rows={data?.items ?? []}
          rowKey={(m) => m.id}
          loading={isLoading}
          emptyState={
            <span className="catalog-empty" data-testid="movements-empty">
              Sin movimientos.
            </span>
          }
          columns={[
            {
              key: 'createdAt',
              header: 'Fecha',
              render: (m) => <span className="muted">{dt.format(new Date(m.createdAt))}</span>,
            },
            { key: 'type', header: 'Tipo', render: (m) => MOVEMENT_LABEL[m.type] ?? m.type },
            { key: 'quantity', header: 'Cantidad', render: (m) => m.quantity },
            {
              key: 'reason',
              header: 'Motivo',
              render: (m) => <span className="muted">{m.reason ?? '—'}</span>,
            },
          ]}
        />
      )}
    </section>
  );
}
