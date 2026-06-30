import { Button, DataTable } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import type { Product } from '../lib/catalog.js';
import { getProductStock, type StockByProductRow } from '../lib/stock.js';

// Modal de consulta de stock de un producto en todas las tiendas (#34). Se abre
// desde la tarjeta de producto sin salir de la venta.
export function ProductStockModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['product-stock', product.id],
    queryFn: () => getProductStock(product.id),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="product-stock-modal">
        <div className="modal-head">
          <h3>Stock · {product.name}</h3>
        </div>
        <div className="modal-body">
          <DataTable<StockByProductRow>
            bare
            data-testid="product-stock-table"
            rowTestId="product-stock-row"
            rows={rows}
            rowKey={(r) => r.storeId}
            loading={isLoading}
            skeletonRows={3}
            emptyState={<span data-testid="product-stock-empty">Sin stock registrado.</span>}
            columns={[
              {
                key: 'store',
                header: 'Tienda',
                render: (r) => (
                  <span className="prod-stock-store">
                    <span className={`stock-dot stock-${r.level}`} aria-hidden="true" />
                    {r.storeName}
                  </span>
                ),
              },
              {
                key: 'qty',
                header: 'Disponible',
                align: 'right',
                render: (r) => <strong>{r.quantity}</strong>,
              },
              {
                key: 'min',
                header: 'Mínimo',
                align: 'right',
                render: (r) => <span className="muted">{r.minStock}</span>,
              },
            ]}
          />
        </div>
        <div className="modal-foot">
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="product-stock-close">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
