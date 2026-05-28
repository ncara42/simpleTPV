import { ApiError, type SaleTicket } from '@simpletpv/auth';
import { useState } from 'react';

import { DiscountModal } from './DiscountModal.js';
import { useCart } from './lib/cart.js';
import { createSale, getTicket } from './lib/sales.js';
import { type PaymentData, PaymentModal } from './PaymentModal.js';
import { TicketView } from './TicketView.js';

export function CartPanel({ storeId }: { storeId: string | null }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const removeItem = useCart((s) => s.removeItem);
  const setLineDiscount = useCart((s) => s.setLineDiscount);
  const setTicketDiscount = useCart((s) => s.setTicketDiscount);
  const ticketDiscountPct = useCart((s) => s.ticketDiscountPct);
  const ticketDiscountAmt = useCart((s) => s.ticketDiscountAmt);
  const clear = useCart((s) => s.clear);
  const lineNet = useCart((s) => s.lineNet);
  const subtotal = useCart((s) => s.subtotal());
  const ticketDiscount = useCart((s) => s.ticketDiscount());
  const total = useCart((s) => s.total());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  // Tras cobrar pasamos a la pantalla de confirmación; mientras pedimos el
  // ticket al servidor mostramos un estado de carga, y luego el ticket-resumen.
  const [confirmed, setConfirmed] = useState(false);
  const [ticket, setTicket] = useState<SaleTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

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
        lines: items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          ...(i.discountPct > 0 ? { discountPct: i.discountPct } : {}),
        })),
        paymentMethod: payment.paymentMethod,
        ...(payment.cashGiven !== undefined ? { cashGiven: payment.cashGiven } : {}),
        ...(ticketDiscountAmt > 0 ? { ticketDiscountAmt } : {}),
        ...(ticketDiscountAmt === 0 && ticketDiscountPct > 0 ? { ticketDiscountPct } : {}),
      });
      setModalOpen(false);
      setConfirmed(true);
      // Pedimos el ticket-resumen completo (con IVA desglosado) por su id.
      try {
        const t = await getTicket(sale.id);
        setTicket(t);
      } catch {
        setTicketError('No se pudo cargar el ticket. La venta se registró correctamente.');
      }
    } catch (e) {
      // Error → mensaje, sin limpiar el carrito ni cerrar (el operario reintenta).
      // Un 403 es el límite de descuento por rol: mostramos el mensaje del servidor.
      if (e instanceof ApiError && e.status === 403) {
        setModalOpen(false);
        setError(e.body ?? 'No tienes permiso para aplicar este descuento.');
      } else {
        setError('Error al cobrar la venta. Inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  function newSale() {
    clear();
    setConfirmed(false);
    setTicket(null);
    setTicketError(null);
    setError(null);
  }

  // Pantalla de confirmación post-venta: ticket-resumen + "Nueva venta".
  if (confirmed) {
    return (
      <aside className="cart" data-testid="cart">
        <div className="sale-confirmation" data-testid="sale-confirmation">
          <h2 className="cart-title">Venta confirmada</h2>
          {ticket ? (
            <TicketView ticket={ticket} />
          ) : ticketError ? (
            <p className="cart-msg" data-testid="ticket-error">
              {ticketError}
            </p>
          ) : (
            <p className="cart-msg" data-testid="ticket-loading">
              Cargando ticket…
            </p>
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
          {items.map((i) => {
            const net = lineNet(i);
            return (
              <li key={i.productId} className="cart-line" data-testid="cart-line">
                <span className="cart-line-name">
                  {i.name}
                  {i.discountPct > 0 && (
                    <span className="cart-line-disc" data-testid="cart-line-disc">
                      −{i.discountPct}%
                    </span>
                  )}
                </span>
                <span className="cart-line-controls">
                  <button onClick={() => setQty(i.productId, i.qty - 1)} aria-label="Quitar uno">
                    −
                  </button>
                  <span className="cart-line-qty">{i.qty}</span>
                  <button onClick={() => setQty(i.productId, i.qty + 1)} aria-label="Añadir uno">
                    +
                  </button>
                </span>
                <span className="cart-line-total">{net.toFixed(2)} €</span>
                <button
                  className="cart-line-remove"
                  onClick={() => removeItem(i.productId)}
                  aria-label="Eliminar línea"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="cart-foot">
        <div className="cart-totals">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{subtotal.toFixed(2)} €</span>
        </div>
        {ticketDiscount > 0 && (
          <div className="cart-totals cart-discount-row">
            <span>Descuento</span>
            <span data-testid="cart-ticket-discount">−{ticketDiscount.toFixed(2)} €</span>
          </div>
        )}
        <div className="cart-totals cart-total">
          <span>Total</span>
          <span data-testid="cart-total">{total.toFixed(2)} €</span>
        </div>
        <button
          className="cart-discount"
          onClick={() => setDiscountOpen(true)}
          disabled={items.length === 0}
          data-testid="cart-discount"
        >
          Descuento
        </button>
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

      {discountOpen && (
        <DiscountModal
          items={items}
          onApplyLine={(productId, pct) => {
            setLineDiscount(productId, pct);
            setDiscountOpen(false);
          }}
          onApplyTicket={(d) => {
            setTicketDiscount(d);
            setDiscountOpen(false);
          }}
          onCancel={() => setDiscountOpen(false)}
        />
      )}
    </aside>
  );
}
