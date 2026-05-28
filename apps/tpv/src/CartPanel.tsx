import { useState } from 'react';

import { useCart } from './lib/cart.js';
import { createSale } from './lib/sales.js';

export function CartPanel({ storeId }: { storeId: string | null }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart((s) => s.subtotal());
  const total = useCart((s) => s.total());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!storeId || items.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const sale = await createSale({
        storeId,
        lines: items.map((i) => ({ productId: i.productId, qty: i.qty })),
      });
      clear();
      setMsg(`Venta creada: ${sale.ticketNumber}`);
    } catch {
      setMsg('Error al crear la venta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="cart" data-testid="cart">
      <h2 className="cart-title">Carrito</h2>
      {items.length === 0 ? (
        <p className="cart-empty" data-testid="cart-empty">
          Vacío. Pulsa un producto para añadirlo.
        </p>
      ) : (
        <ul className="cart-lines">
          {items.map((i) => (
            <li key={i.productId} className="cart-line" data-testid="cart-line">
              <span className="cart-line-name">{i.name}</span>
              <span className="cart-line-controls">
                <button onClick={() => setQty(i.productId, i.qty - 1)} aria-label="Quitar uno">
                  −
                </button>
                <span className="cart-line-qty">{i.qty}</span>
                <button onClick={() => setQty(i.productId, i.qty + 1)} aria-label="Añadir uno">
                  +
                </button>
              </span>
              <span className="cart-line-total">{(i.unitPrice * i.qty).toFixed(2)} €</span>
              <button
                className="cart-line-remove"
                onClick={() => removeItem(i.productId)}
                aria-label="Eliminar línea"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cart-foot">
        <div className="cart-totals">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{subtotal.toFixed(2)} €</span>
        </div>
        <div className="cart-totals cart-total">
          <span>Total</span>
          <span data-testid="cart-total">{total.toFixed(2)} €</span>
        </div>
        <button
          className="cart-create"
          onClick={onCreate}
          disabled={busy || items.length === 0 || !storeId}
          data-testid="cart-create"
        >
          {busy ? 'Creando…' : 'Crear venta'}
        </button>
        {msg && (
          <p className="cart-msg" data-testid="cart-msg">
            {msg}
          </p>
        )}
      </div>
    </aside>
  );
}
