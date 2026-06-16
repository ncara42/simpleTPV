import { type KeyboardEvent as ReactKeyboardEvent, useMemo } from 'react';

import type { Product } from '../lib/catalog.js';
import { eur } from '../lib/format.js';
import type { StockRow } from '../lib/stock.js';

// Badge de stock de la tienda activa: clicable en CUALQUIER estado (sano, bajo,
// agotado o sin fila) para consultar el stock del producto en el resto de tiendas
// (#1, consulta entre tiendas). Detiene la propagación para no añadir al carrito.
// Accesible por teclado (Enter/Espacio). El color solo destaca el stock bajo; el
// agotado/neutro quedan neutros porque la tarjeta entera ya se atenúa (.is-out).
function StockBadge({
  stock,
  out,
  onConsult,
}: {
  stock: StockRow | null;
  out: boolean;
  onConsult: () => void;
}) {
  const variant = stock ? (out ? 'out-of-stock' : `stock-${stock.level}`) : 'neutral';

  function onKeyDown(e: ReactKeyboardEvent<HTMLSpanElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onConsult();
    }
  }

  return (
    <span
      className={`prod-stock ${variant}`}
      data-testid="prod-stock"
      role="button"
      tabIndex={0}
      title="Ver stock en otras tiendas"
      onClick={(e) => {
        e.stopPropagation();
        onConsult();
      }}
      onKeyDown={onKeyDown}
    >
      {stock ? stock.quantity : '—'}
    </span>
  );
}

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
  // Clasifica (agotado = hay fila de stock con quantity ≤ 0) y ordena con partición
  // estable: los agotados al final, conservando el orden de la API dentro de cada grupo
  // (desempate por índice original). Los productos sin fila de stock NO son agotados:
  // "sin fila" significa que nunca se dio de alta stock en esa tienda, no un 0 confirmado.
  const ordered = useMemo(() => {
    return products
      .map((p, i) => {
        const stock = stockByProduct.get(p.id) ?? null;
        const out = stock != null && stock.quantity <= 0;
        return { p, stock, out, i };
      })
      .sort((a, b) => (a.out === b.out ? a.i - b.i : a.out ? 1 : -1));
  }, [products, stockByProduct]);

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
      {ordered.map(({ p, stock, out }) => {
        return (
          <button
            key={p.id}
            className={`prod-card${out ? ' is-out' : ''}`}
            data-testid="prod-card"
            onClick={() => onAdd(p)}
          >
            <span className="prod-name">{p.name}</span>
            <span className="prod-meta">
              <span className="prod-price">{eur(Number(p.salePrice))} €</span>
              <StockBadge stock={stock} out={out} onConsult={() => onShowStock(p)} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
