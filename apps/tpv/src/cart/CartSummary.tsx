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
    <div className="border-t border-[var(--ui-border)] px-4 py-4">
      <div className="space-y-1.5">
        {discountTotal > 0 && (
          <div className="flex items-center justify-between text-sm text-[var(--ui-success)]">
            <span className="flex items-center gap-2">
              Descuento
              <button
                type="button"
                onClick={onClearDiscounts}
                data-testid="cart-discount-clear"
                className="text-xs font-medium text-[var(--ui-text-soft)] underline-offset-2 hover:text-[var(--ui-text)] hover:underline"
              >
                Quitar
              </button>
            </span>
            <span className="font-medium tabular-nums" data-testid="cart-discount-total">
              −{eur(discountTotal)} €
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm text-[var(--ui-text-muted)]">
          <span>Base imponible</span>
          <span className="tabular-nums" data-testid="cart-base">
            {eur(base)} €
          </span>
        </div>
        <div className="flex justify-between text-sm text-[var(--ui-text-muted)]">
          <span>IVA (21%)</span>
          <span className="tabular-nums" data-testid="cart-iva">
            {eur(iva)} €
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--ui-border)] pt-3">
        <span className="text-sm font-semibold text-[var(--ui-text)]">Total</span>
        <span
          className="text-2xl font-bold tracking-tight tabular-nums text-[var(--ui-text)]"
          data-testid="cart-total"
        >
          {eur(total)} €
        </span>
      </div>

      <button
        type="button"
        className="cart-checkout mt-4"
        onClick={onCheckout}
        disabled={!canCheckout}
        data-testid="cart-checkout"
      >
        {itemCount > 0 ? `Cobrar · ${eur(total)} €` : 'Cobrar'}
      </button>

      {!cashOpen && itemCount > 0 && (
        <p
          className="mt-3 rounded-[var(--ui-radius-sm)] bg-[var(--ui-warning-soft)] px-3 py-2 text-xs font-medium text-[var(--ui-warning)]"
          data-testid="cart-cash-warning"
        >
          Abre la caja para poder cobrar
        </p>
      )}
      {!apiHealthy && itemCount > 0 && (
        <p
          className="mt-3 rounded-[var(--ui-radius-sm)] bg-[var(--ui-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--ui-danger)]"
          data-testid="cart-api-warning"
        >
          Servidor no disponible
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs text-[var(--ui-danger)]" data-testid="cart-msg">
          {error}
        </p>
      )}
    </div>
  );
}
