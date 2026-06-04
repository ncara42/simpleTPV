import { Button } from '@simpletpv/ui';

import { eur } from '../lib/format.js';

// Pie del ticket: descuento total, base imponible, IVA, total y botón de cobro,
// más los avisos de caja cerrada / servidor caído / error. Presentacional.
export function CartSummary({
  discountTotal,
  base,
  iva,
  total,
  itemCount,
  canCheckout,
  cashOpen,
  apiHealthy,
  error,
  onCheckout,
  onClearDiscounts,
}: {
  discountTotal: number;
  base: number;
  iva: number;
  total: number;
  itemCount: number;
  canCheckout: boolean;
  cashOpen: boolean;
  apiHealthy: boolean;
  error: string | null;
  onCheckout: () => void;
  onClearDiscounts: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-[var(--ui-border)] p-4">
      {discountTotal > 0 && (
        <div className="flex items-center justify-between text-sm text-green-700">
          <span className="flex items-center gap-2">
            Descuento
            <button
              type="button"
              onClick={onClearDiscounts}
              data-testid="cart-discount-clear"
              className="text-xs font-medium text-neutral-400 underline hover:text-neutral-700"
            >
              Quitar
            </button>
          </span>
          <span className="tabular-nums" data-testid="cart-discount-total">
            −{eur(discountTotal)} €
          </span>
        </div>
      )}
      <div className="flex justify-between text-sm text-neutral-500">
        <span>Base imponible</span>
        <span className="tabular-nums" data-testid="cart-base">
          {eur(base)} €
        </span>
      </div>
      <div className="flex justify-between text-sm text-neutral-500">
        <span>IVA (21%)</span>
        <span className="tabular-nums" data-testid="cart-iva">
          {eur(iva)} €
        </span>
      </div>
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-base font-bold text-neutral-900">Total</span>
        <span
          className="text-2xl font-bold tracking-tight tabular-nums text-neutral-900"
          data-testid="cart-total"
        >
          {eur(total)} €
        </span>
      </div>

      <Button
        size="lg"
        className="w-full text-base"
        onClick={onCheckout}
        disabled={!canCheckout}
        data-testid="cart-checkout"
      >
        {itemCount > 0 ? `Cobrar · ${eur(total)} €` : 'Cobrar'}
      </Button>

      {!cashOpen && itemCount > 0 && (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          data-testid="cart-cash-warning"
        >
          Abre la caja para poder cobrar
        </p>
      )}
      {!apiHealthy && itemCount > 0 && (
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
  );
}
