import type { Sale } from '@simpletpv/auth';
import { useState } from 'react';

import { useCart } from './lib/cart.js';
import { createSale } from './lib/sales.js';
import { type PaymentData, PaymentModal } from './PaymentModal.js';

export function CartPanel({ storeId }: { storeId: string | null }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart((s) => s.subtotal());
  const total = useCart((s) => s.total());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Sale | null>(null);

  function openCheckout() {
    if (!storeId || items.length === 0) return;
    setError(null);
    setModalOpen(true);
  }

  async function onConfirmPayment(payment: PaymentData) {
    if (!storeId || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const sale = await createSale({
        storeId,
        lines: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        paymentMethod: payment.paymentMethod,
        ...(payment.cashGiven !== undefined ? { cashGiven: payment.cashGiven } : {}),
      });
      setModalOpen(false);
      setConfirmed(sale);
    } catch {
      // Error → mensaje, sin limpiar el carrito ni cerrar (el operario reintenta).
      setError('Error al cobrar la venta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function newSale() {
    clear();
    setConfirmed(null);
    setError(null);
  }

  // Pantalla de confirmación post-venta: resumen + "Nueva venta".
  if (confirmed) {
    const isCash = confirmed.paymentMethod === 'CASH';
    return (
      <aside className="cart" data-testid="cart">
        <div className="sale-confirmation" data-testid="sale-confirmation">
          <h2 className="cart-title">Venta confirmada</h2>
          <div className="conf-row">
            <span>Ticket</span>
            <strong data-testid="conf-ticket">{confirmed.ticketNumber}</strong>
          </div>
          <div className="conf-row">
            <span>Total</span>
            <strong data-testid="conf-total">{Number(confirmed.total).toFixed(2)} €</strong>
          </div>
          <div className="conf-row">
            <span>Método</span>
            <strong data-testid="conf-method">{isCash ? 'Efectivo' : 'Tarjeta'}</strong>
          </div>
          {isCash && confirmed.cashChange !== null && (
            <div className="conf-row conf-change">
              <span>Cambio</span>
              <strong data-testid="conf-change">{Number(confirmed.cashChange).toFixed(2)} €</strong>
            </div>
          )}
          <button className="cart-create" onClick={newSale} data-testid="new-sale">
            Nueva venta
          </button>
        </div>
      </aside>
    );
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
          onClick={openCheckout}
          disabled={items.length === 0 || !storeId}
          data-testid="cart-checkout"
        >
          Cobrar
        </button>
        {error && (
          <p className="cart-msg" data-testid="cart-msg">
            {error}
          </p>
        )}
      </div>

      {modalOpen && (
        <PaymentModal
          total={total}
          onConfirm={onConfirmPayment}
          onCancel={() => setModalOpen(false)}
          busy={busy}
        />
      )}
    </aside>
  );
}
