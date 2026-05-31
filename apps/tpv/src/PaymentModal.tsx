import { useState } from 'react';

export interface PaymentData {
  paymentMethod: 'CASH' | 'CARD';
  cashGiven?: number;
}

interface PaymentModalProps {
  total: number;
  onConfirm: (payment: PaymentData) => void;
  onCancel: () => void;
  busy: boolean;
}

export function PaymentModal({ total, onConfirm, onCancel, busy }: PaymentModalProps) {
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [given, setGiven] = useState('');

  const givenNum = Number(given.replace(',', '.'));
  const givenValid = given !== '' && !Number.isNaN(givenNum) && givenNum >= total;
  const change = givenValid ? givenNum - total : 0;
  const canConfirm = !busy && (method === 'CARD' || givenValid);

  function handleConfirm() {
    if (!canConfirm) return;
    if (method === 'CASH') {
      onConfirm({ paymentMethod: 'CASH', cashGiven: givenNum });
    } else {
      onConfirm({ paymentMethod: 'CARD' });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      data-testid="payment-modal"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--ui-border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">Cobrar</h2>
          <div className="text-xl font-bold tabular-nums text-neutral-900" data-testid="pay-total">
            {total.toFixed(2)} €
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('CASH')}
              data-testid="pay-cash"
              className={[
                'h-11 rounded-lg border text-sm font-semibold transition-colors',
                method === 'CASH'
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-[var(--ui-border)] bg-white text-neutral-600 hover:bg-neutral-50',
              ].join(' ')}
            >
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => setMethod('CARD')}
              data-testid="pay-card"
              className={[
                'h-11 rounded-lg border text-sm font-semibold transition-colors',
                method === 'CARD'
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-[var(--ui-border)] bg-white text-neutral-600 hover:bg-neutral-50',
              ].join(' ')}
            >
              Tarjeta
            </button>
          </div>

          {method === 'CASH' && (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">Entregado</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={given}
                  onChange={(e) => setGiven(e.target.value)}
                  data-testid="cash-given"
                  autoFocus
                  className="h-12 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-lg tabular-nums outline-none transition-colors focus:border-neutral-400"
                />
              </label>
              <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-2.5 text-sm">
                <span className="font-medium text-neutral-500">Cambio</span>
                <span
                  className="text-base font-bold tabular-nums text-neutral-900"
                  data-testid="cash-change"
                >
                  {change.toFixed(2)} €
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              data-testid="pay-cancel"
              className="h-11 flex-1 rounded-lg border border-[var(--ui-border)] bg-white text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              data-testid="pay-confirm"
              className="h-11 flex-1 rounded-lg border border-neutral-900 bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Cobrando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
