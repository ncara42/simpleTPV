import { ShoppingBag, X } from 'lucide-react';

import { type CartItem, lineDiscountOf } from '../lib/cart.js';
import { eur } from '../lib/format.js';

// Lista de líneas del ticket: nombre y neto (con tachado del bruto si hay
// descuento) en la fila superior; debajo el precio unitario —solo si la cantidad
// aporta info—, el badge de descuento editable/quitable y el stepper de cantidad
// anclado a la derecha. Presentacional: el estado del carrito vive en CartPanel.
export function CartLines({
  items,
  lineNet,
  onSetQty,
  onEditLineDiscount,
  onClearLineDiscount,
}: {
  items: CartItem[];
  lineNet: (item: CartItem) => number;
  onSetQty: (productId: string, qty: number) => void;
  onEditLineDiscount: (productId: string) => void;
  onClearLineDiscount: (productId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
        data-testid="cart-empty"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ui-surface-subtle)] text-[var(--ui-text-soft)]">
          <ShoppingBag className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <p className="max-w-[12rem] text-sm leading-snug text-[var(--ui-text-muted)]">
          El ticket está vacío. Pulsa un producto para añadirlo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4" data-testid="cart-scroll">
      <ul className="divide-y divide-[var(--ui-border)]" data-testid="cart-lines">
        {items.map((i) => {
          const net = lineNet(i);
          const disc = lineDiscountOf(i);
          const discLabel = i.discountAmt > 0 ? `−${eur(i.discountAmt)} €` : `−${i.discountPct}%`;
          return (
            <li
              key={i.productId}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2.5"
              data-testid="cart-line"
            >
              {/* Fila 1 izq: nombre */}
              <span className="truncate text-sm font-medium leading-tight text-[var(--ui-text)]">
                {i.name}
              </span>

              {/* Fila 1 der: total (con bruto tachado en línea si hay descuento) */}
              <span className="flex items-baseline justify-end gap-1.5">
                {disc > 0 && (
                  <span
                    className="text-xs tabular-nums text-[var(--ui-text-soft)] line-through"
                    data-testid="cart-line-gross"
                  >
                    {eur(i.unitPrice * i.qty)} €
                  </span>
                )}
                <span
                  className="text-sm font-semibold tabular-nums text-[var(--ui-text)]"
                  data-testid="cart-line-total"
                >
                  {eur(net)} €
                </span>
              </span>

              {/* Fila 2 izq: stepper + badge de descuento */}
              <span className="flex items-center gap-2">
                <div className="inline-flex items-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)]">
                  <button
                    onClick={() => onSetQty(i.productId, i.qty - 1)}
                    aria-label="Quitar uno"
                    className="flex h-7 w-7 items-center justify-center text-base leading-none text-[var(--ui-text-muted)] transition hover:bg-[var(--ui-brand-soft)] hover:text-[var(--ui-brand-ink)]"
                  >
                    −
                  </button>
                  <span className="w-8 border-x border-[var(--ui-border)] text-center text-sm font-medium leading-7 tabular-nums text-[var(--ui-text)]">
                    {i.qty}
                  </span>
                  <button
                    onClick={() => onSetQty(i.productId, i.qty + 1)}
                    aria-label="Añadir uno"
                    className="flex h-7 w-7 items-center justify-center text-base leading-none text-[var(--ui-text-muted)] transition hover:bg-[var(--ui-brand-soft)] hover:text-[var(--ui-brand-ink)]"
                  >
                    +
                  </button>
                </div>
                {disc > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditLineDiscount(i.productId)}
                      data-testid="cart-line-discount"
                      title="Editar descuento"
                      className="rounded-full bg-[var(--ui-success-soft)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--ui-success)] transition hover:brightness-95"
                    >
                      {discLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onClearLineDiscount(i.productId)}
                      aria-label="Quitar descuento de la línea"
                      data-testid="cart-line-discount-clear"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ui-text-soft)] transition hover:bg-[var(--ui-danger-soft)] hover:text-[var(--ui-danger)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </span>

              {/* Fila 2 der: precio/ud — h-7 iguala la altura del stepper */}
              <span className="flex h-7 items-center justify-end text-xs tabular-nums text-[var(--ui-text-soft)]">
                {eur(i.unitPrice)} €/ud
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
