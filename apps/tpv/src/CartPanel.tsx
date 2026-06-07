import { ApiError } from '@simpletpv/auth';
import { Percent, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CartLines } from './cart/CartLines.js';
import { CartSummary } from './cart/CartSummary.js';
import { DiscountModal } from './DiscountModal.js';
import { useCart } from './lib/cart.js';
import { enqueueSale, ticketsRemaining } from './lib/offline-sales.js';
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
    const input = {
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
    };
    try {
      // Sin conexión: encola la venta con un nº del bloque reservado y confirma en
      // el momento (offline slice 2c). Se sincroniza al reconectar (idempotente).
      if (!navigator.onLine) {
        const queued = enqueueSale(input, total.toFixed(2));
        if (!queued) {
          setError(
            'Sin conexión y sin bloque de tickets reservado. Conéctate un momento para reservar números.',
          );
          return;
        }
        setModalOpen(false);
        clear();
        onSaleConfirmed?.({ ticketNumber: queued.ticketNumber, total: queued.total });
        return;
      }

      const sale = await createSale(input);
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

  // Se puede cobrar si la API está sana (online) o, sin conexión, si hay un
  // bloque de tickets reservado para vender offline (offline slice 2c).
  const offlineCapable = !!storeId && ticketsRemaining(storeId) > 0;
  const canCheckout = items.length > 0 && !!storeId && cashOpen && (apiHealthy || offlineCapable);

  // Desglose de IVA (21%) desde el total, calculado en cliente para el mockup.
  const base = total > 0 ? total / 1.21 : 0;
  const iva = total - base;
  const unitCount = items.reduce((n, i) => n + i.qty, 0);

  return (
    <aside
      className="flex w-80 shrink-0 flex-col overflow-hidden rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-[var(--ui-surface)]"
      data-testid="cart"
    >
      {/* Cabecera: Ticket actual + recuento + Descuento + Vaciar */}
      <header className="flex items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--ui-text)]">
            Ticket actual
          </h2>
          {unitCount > 0 && (
            <span
              className="rounded-full bg-[var(--ui-surface-subtle)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--ui-text-muted)]"
              data-testid="cart-count"
            >
              {unitCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ui-text-muted)] transition hover:bg-[var(--ui-surface-subtle)] hover:text-[var(--ui-text)] disabled:pointer-events-none disabled:opacity-40"
            onClick={() => setDiscount({ mode: 'line' })}
            disabled={items.length === 0}
            data-testid="cart-discount"
            title="Descuento"
            aria-label="Aplicar descuento"
          >
            <Percent className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ui-text-muted)] transition hover:bg-[var(--ui-danger-soft)] hover:text-[var(--ui-danger)] disabled:pointer-events-none disabled:opacity-40"
            onClick={clear}
            disabled={items.length === 0}
            data-testid="cart-clear"
            title="Vaciar ticket"
            aria-label="Vaciar ticket"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

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
