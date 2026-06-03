import { X } from 'lucide-react';

import { type CartItem, lineDiscountOf } from '../lib/cart.js';
import { eur } from '../lib/format.js';

// Lista de líneas del ticket: nombre, precio unitario, neto (con tachado del bruto
// si hay descuento), stepper de cantidad y badge de descuento editable/quitable.
// Presentacional: el estado del carrito vive en CartPanel.
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
  return (
    <div className="flex-1 overflow-y-auto px-4">
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400" data-testid="cart-empty">
          Vacío. Pulsa un producto para añadirlo.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--ui-border)]" data-testid="cart-lines">
          {items.map((i) => {
            const net = lineNet(i);
            const disc = lineDiscountOf(i);
            const discLabel = i.discountAmt > 0 ? `−${eur(i.discountAmt)} €` : `−${i.discountPct}%`;
            return (
              <li key={i.productId} className="py-3" data-testid="cart-line">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {i.name}
                    </span>
                    <span className="text-xs text-neutral-400">{eur(i.unitPrice)} € / ud</span>
                  </div>
                  <span className="shrink-0 text-right">
                    {disc > 0 && (
                      <span
                        className="block text-xs tabular-nums text-neutral-400 line-through"
                        data-testid="cart-line-gross"
                      >
                        {eur(i.unitPrice * i.qty)} €
                      </span>
                    )}
                    <span
                      className="text-sm font-semibold tabular-nums text-neutral-900"
                      data-testid="cart-line-total"
                    >
                      {eur(net)} €
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => onSetQty(i.productId, i.qty - 1)}
                    aria-label="Quitar uno"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{i.qty}</span>
                  <button
                    onClick={() => onSetQty(i.productId, i.qty + 1)}
                    aria-label="Añadir uno"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50"
                  >
                    +
                  </button>
                  {disc > 0 && (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditLineDiscount(i.productId)}
                        data-testid="cart-line-discount"
                        title="Editar descuento"
                        className="rounded-md bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                      >
                        {discLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => onClearLineDiscount(i.productId)}
                        aria-label="Quitar descuento de la línea"
                        data-testid="cart-line-discount-clear"
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ui-border)] text-neutral-400 hover:bg-neutral-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
