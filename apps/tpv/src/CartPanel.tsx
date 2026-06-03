import { ApiError } from '@simpletpv/auth';
import { Percent } from 'lucide-react';
import { useState } from 'react';

import { CartLines } from './cart/CartLines.js';
import { CartSummary } from './cart/CartSummary.js';
import { DiscountModal } from './DiscountModal.js';
import { useCart } from './lib/cart.js';
import { createSale } from './lib/sales.js';
import { type PaymentData, PaymentModal } from './PaymentModal.js';

export function CartPanel({
  storeId,
  cashOpen,
  apiHealthy = true,
  onSaleConfirmed,
}: {
  storeId: string | null;
  cashOpen: boolean;
  apiHealthy?: boolean;
  onSaleConfirmed?: (sale: { ticketNumber: string; total: string }) => void;
}) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const ticketDiscountPct = useCart((s) => s.ticketDiscountPct);
  const ticketDiscountAmt = useCart((s) => s.ticketDiscountAmt);
  const setLineDiscount = useCart((s) => s.setLineDiscount);
  const setTicketDiscount = useCart((s) => s.setTicketDiscount);
  const clearDiscounts = useCart((s) => s.clearDiscounts);
  const clear = useCart((s) => s.clear);
  const lineNet = useCart((s) => s.lineNet);
  const discountTotal = useCart((s) => s.discountTotal());
  const total = useCart((s) => s.total());

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Descuento manual abierto: null = cerrado. Lleva el modo y, opcionalmente, la
  // línea concreta a editar (al pulsar el badge de descuento de una línea).
  const [discount, setDiscount] = useState<{ mode: 'line' | 'ticket'; productId?: string } | null>(
    null,
  );

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
          // El importe fijo tiene precedencia sobre el % (igual que el servidor).
          ...(i.discountAmt > 0
            ? { discountAmt: i.discountAmt }
            : i.discountPct > 0
              ? { discountPct: i.discountPct }
              : {}),
        })),
        paymentMethod: payment.paymentMethod,
        ...(payment.cashGiven !== undefined ? { cashGiven: payment.cashGiven } : {}),
        ...(ticketDiscountAmt > 0 ? { ticketDiscountAmt } : {}),
        ...(ticketDiscountAmt === 0 && ticketDiscountPct > 0 ? { ticketDiscountPct } : {}),
      });
      setModalOpen(false);
      clear();
      onSaleConfirmed?.({ ticketNumber: sale.ticketNumber, total: sale.total });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setModalOpen(false);
        setError(e.body ?? 'No tienes permiso para aplicar este descuento.');
      } else if (e instanceof ApiError && e.status === 409) {
        setModalOpen(false);
        setError(e.body ?? 'No hay caja abierta en esta tienda.');
      } else {
        setError('Error al cobrar la venta. Inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  const canCheckout = items.length > 0 && !!storeId && cashOpen && apiHealthy;

  // Desglose de IVA (21%) desde el total, calculado en cliente para el mockup.
  const base = total > 0 ? total / 1.21 : 0;
  const iva = total - base;

  return (
    <aside
      className="flex w-80 shrink-0 flex-col rounded-xl border border-[var(--ui-border)] bg-white shadow-sm"
      data-testid="cart"
    >
      {/* Cabecera: Ticket actual + Descuento + Vaciar */}
      <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Ticket actual</h2>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1 text-sm font-medium text-neutral-400 hover:text-neutral-700 disabled:opacity-40"
            onClick={() => setDiscount({ mode: 'line' })}
            disabled={items.length === 0}
            data-testid="cart-discount"
          >
            <Percent className="h-3.5 w-3.5" />
            Descuento
          </button>
          <button
            className="text-sm font-medium text-neutral-400 hover:text-neutral-700"
            onClick={clear}
            disabled={items.length === 0}
            data-testid="cart-clear"
          >
            Vaciar
          </button>
        </div>
      </div>

      <CartLines
        items={items}
        lineNet={lineNet}
        onSetQty={setQty}
        onEditLineDiscount={(productId) => setDiscount({ mode: 'line', productId })}
        onClearLineDiscount={(productId) => setLineDiscount(productId, { pct: 0 })}
      />

      <CartSummary
        discountTotal={discountTotal}
        base={base}
        iva={iva}
        total={total}
        itemCount={items.length}
        canCheckout={canCheckout}
        cashOpen={cashOpen}
        apiHealthy={apiHealthy}
        error={error}
        onCheckout={openCheckout}
        onClearDiscounts={clearDiscounts}
      />

      {modalOpen && (
        <PaymentModal
          total={total}
          onConfirm={onConfirmPayment}
          onCancel={() => setModalOpen(false)}
          busy={busy}
        />
      )}

      {discount && (
        <DiscountModal
          items={items}
          ticketDiscountPct={ticketDiscountPct}
          ticketDiscountAmt={ticketDiscountAmt}
          initialMode={discount.mode}
          {...(discount.productId ? { initialProductId: discount.productId } : {})}
          onApplyLine={(productId, d) => {
            setLineDiscount(productId, d);
            setDiscount(null);
          }}
          onApplyTicket={(d) => {
            setTicketDiscount(d);
            setDiscount(null);
          }}
          onCancel={() => setDiscount(null)}
        />
      )}
    </aside>
  );
}
