import { ApiError, type SaleTicket } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { Printer, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { DiscountModal } from './DiscountModal.js';
import { useAuthStore } from './lib/auth.js';
import { useCart } from './lib/cart.js';
import { createSale, getTicket, voidSale } from './lib/sales.js';
import { type PaymentData, PaymentModal } from './PaymentModal.js';
import { TicketView } from './TicketView.js';

export function CartPanel({
  storeId,
  cashOpen,
  apiHealthy = true,
}: {
  storeId: string | null;
  cashOpen: boolean;
  apiHealthy?: boolean;
}) {
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
  const [confirmed, setConfirmed] = useState(false);
  const [ticket, setTicket] = useState<SaleTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [voided, setVoided] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const accessToken = useAuthStore((s) => s.accessToken);
  const getRole = useAuthStore((s) => s.getRole);
  void accessToken;
  const role = getRole();
  const canVoid = role === 'ADMIN' || role === 'MANAGER';

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
      setSaleId(sale.id);
      try {
        const t = await getTicket(sale.id);
        setTicket(t);
      } catch {
        setTicketError('No se pudo cargar el ticket. La venta se registró correctamente.');
      }
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

  function newSale() {
    clear();
    setConfirmed(false);
    setTicket(null);
    setTicketError(null);
    setError(null);
    setSaleId(null);
    setVoided(false);
    setVoiding(false);
    setVoidError(null);
  }

  async function onVoid() {
    if (!saleId) return;
    setVoiding(true);
    setVoidError(null);
    try {
      await voidSale(saleId);
      setVoided(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 400)) {
        setVoidError(e.body ?? 'No se pudo anular la venta.');
      } else {
        setVoidError('Error al anular la venta. Inténtalo de nuevo.');
      }
    } finally {
      setVoiding(false);
    }
  }

  const canCheckout = items.length > 0 && !!storeId && cashOpen && apiHealthy;

  // Pantalla de confirmación post-venta
  if (confirmed) {
    return (
      <aside
        className="w-80 shrink-0 rounded-xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
        data-testid="cart"
      >
        <div className="space-y-3" data-testid="sale-confirmation">
          <div className="flex items-center gap-2 pb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
              ✓
            </span>
            <h2 className="text-sm font-semibold text-neutral-900">Venta confirmada</h2>
          </div>

          {ticket ? (
            <TicketView ticket={ticket} />
          ) : ticketError ? (
            <p className="text-sm text-neutral-500" data-testid="ticket-error">
              {ticketError}
            </p>
          ) : (
            <p className="text-sm text-neutral-400" data-testid="ticket-loading">
              Cargando ticket…
            </p>
          )}

          {voided ? (
            <p className="text-sm font-semibold text-red-600" data-testid="sale-voided">
              Venta anulada
            </p>
          ) : (
            canVoid &&
            saleId && (
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={onVoid}
                disabled={voiding}
                data-testid="void-sale"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {voiding ? 'Anulando…' : 'Anular venta'}
              </Button>
            )
          )}

          {voidError && (
            <p className="text-xs text-red-600" data-testid="void-error">
              {voidError}
            </p>
          )}

          {ticket && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => window.print()}
              data-testid="print-ticket"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir ticket
            </Button>
          )}

          <Button className="w-full" size="md" onClick={newSale} data-testid="new-sale">
            <RotateCcw className="h-4 w-4" />
            Nueva venta
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-80 shrink-0 flex-col rounded-xl border border-[var(--ui-border)] bg-white shadow-sm"
      data-testid="cart"
    >
      {/* Cabecera carrito */}
      <div className="border-b border-[var(--ui-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Carrito</h2>
      </div>

      {/* Líneas */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400" data-testid="cart-empty">
            Vacío. Pulsa un producto para añadirlo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--ui-border)]" data-testid="cart-lines">
            {items.map((i) => {
              const net = lineNet(i);
              return (
                <li
                  key={i.productId}
                  className="flex items-center gap-2 py-2.5"
                  data-testid="cart-line"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {i.name}
                    </span>
                    {i.discountPct > 0 && (
                      <span
                        className="text-xs font-semibold text-red-600"
                        data-testid="cart-line-disc"
                      >
                        −{i.discountPct}%
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(i.productId, i.qty - 1)}
                      aria-label="Quitar uno"
                      className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm tabular-nums">{i.qty}</span>
                    <button
                      onClick={() => setQty(i.productId, i.qty + 1)}
                      aria-label="Añadir uno"
                      className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                    >
                      +
                    </button>
                  </span>
                  <span
                    className="w-14 text-right text-sm font-semibold tabular-nums text-neutral-900"
                    data-testid="cart-line-total"
                  >
                    {net.toFixed(2)} €
                  </span>
                  <button
                    onClick={() => removeItem(i.productId)}
                    aria-label="Eliminar línea"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600"
                    data-testid="cart-line-remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pie */}
      <div className="space-y-2 border-t border-[var(--ui-border)] p-4">
        <div className="flex justify-between text-sm text-neutral-500">
          <span>Subtotal</span>
          <span className="tabular-nums" data-testid="cart-subtotal">
            {subtotal.toFixed(2)} €
          </span>
        </div>
        {ticketDiscount > 0 && (
          <div className="flex justify-between text-sm font-semibold text-red-600">
            <span>Descuento</span>
            <span className="tabular-nums" data-testid="cart-ticket-discount">
              −{ticketDiscount.toFixed(2)} €
            </span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-neutral-900">
          <span>Total</span>
          <span className="tabular-nums" data-testid="cart-total">
            {total.toFixed(2)} €
          </span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => setDiscountOpen(true)}
          disabled={items.length === 0}
          data-testid="cart-discount"
        >
          Aplicar descuento
        </Button>

        <Button
          size="lg"
          className="w-full text-base"
          onClick={openCheckout}
          disabled={!canCheckout}
          data-testid="cart-checkout"
        >
          {items.length > 0 ? `Cobrar · ${total.toFixed(2)} €` : 'Cobrar'}
        </Button>

        {!cashOpen && items.length > 0 && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
            data-testid="cart-cash-warning"
          >
            Abre la caja para poder cobrar
          </p>
        )}
        {!apiHealthy && items.length > 0 && (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            data-testid="cart-api-warning"
          >
            Servidor no disponible
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600" data-testid="cart-msg">
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
