import { Button } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import type { Product } from '../lib/catalog.js';
import { getProductStock } from '../lib/stock.js';

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
          {isLoading ? (
            <p className="sale-empty">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="sale-empty" data-testid="product-stock-empty">
              Sin stock registrado.
            </p>
          ) : (
            <ul className="prod-stock-list">
              {rows.map((r) => (
                <li key={r.storeId} data-testid="product-stock-row">
                  <span className={`stock-dot stock-${r.level}`} /> {r.storeName}:{' '}
                  <strong>{r.quantity}</strong> <span className="muted">(mín {r.minStock})</span>
                </li>
              ))}
            </ul>
          )}
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
