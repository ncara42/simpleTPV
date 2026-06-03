import type { Product } from '../lib/catalog.js';
import { eur } from '../lib/format.js';
import type { StockRow } from '../lib/stock.js';

// Grid de productos de la venta: tarjeta con nombre, precio y stock vivo (#34).
// Click en la tarjeta añade al carrito; click en el badge de stock abre el detalle
// por tienda (sin añadir). Presentacional: recibe datos y callbacks.
export function ProductGrid({
  isLoading,
  products,
  stockByProduct,
  onAdd,
  onShowStock,
}: {
  isLoading: boolean;
  products: Product[];
  stockByProduct: Map<string, StockRow>;
  onAdd: (p: Product) => void;
  onShowStock: (p: Product) => void;
}) {
  if (isLoading) {
    return <p className="sale-empty">Cargando…</p>;
  }
  if (products.length === 0) {
    return (
      <p className="sale-empty" data-testid="sale-empty">
        Sin resultados.
      </p>
    );
  }
  return (
    <div className="sale-grid" data-testid="sale-grid">
      {products.map((p) => {
        const stock = stockByProduct.get(p.id);
        return (
          <button key={p.id} className="prod-card" data-testid="prod-card" onClick={() => onAdd(p)}>
            <span className="prod-name">{p.name}</span>
            <span className="prod-meta">
              <span className="prod-price">{eur(Number(p.salePrice))} €</span>
              {stock ? (
                stock.quantity === 0 ? (
                  <span className="prod-stock sold-out" data-testid="prod-stock">
                    Agotado
                  </span>
                ) : (
                  <span
                    className={`prod-stock stock-${stock.level}`}
                    data-testid="prod-stock"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowStock(p);
                    }}
                    title="Ver stock por tienda"
                  >
                    {stock.quantity}
                  </span>
                )
              ) : (
                <span className="prod-stock neutral" data-testid="prod-stock">
                  —
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
