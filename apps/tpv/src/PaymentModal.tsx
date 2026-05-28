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

  // En efectivo hace falta cubrir el total; en tarjeta el confirmar es directo.
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
    <div className="pay-overlay" role="dialog" aria-modal="true" data-testid="payment-modal">
      <div className="pay-modal">
        <h2 className="pay-title">Cobrar</h2>
        <div className="pay-total">
          <span>Total</span>
          <span data-testid="pay-total">{total.toFixed(2)} €</span>
        </div>

        <div className="pay-methods">
          <button
            type="button"
            className={`pay-method ${method === 'CASH' ? 'active' : ''}`}
            onClick={() => setMethod('CASH')}
            data-testid="pay-cash"
          >
            Efectivo
          </button>
          <button
            type="button"
            className={`pay-method ${method === 'CARD' ? 'active' : ''}`}
            onClick={() => setMethod('CARD')}
            data-testid="pay-card"
          >
            Tarjeta
          </button>
        </div>

        {method === 'CASH' && (
          <div className="pay-cash-fields">
            <label className="pay-field">
              Entregado
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                data-testid="cash-given"
                autoFocus
              />
            </label>
            <div className="pay-change">
              <span>Cambio</span>
              <span data-testid="cash-change">{change.toFixed(2)} €</span>
            </div>
          </div>
        )}

        <div className="pay-actions">
          <button
            type="button"
            className="pay-cancel"
            onClick={onCancel}
            disabled={busy}
            data-testid="pay-cancel"
          >
            Cancelar
          </button>
          <button
            type="button"
            className="pay-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="pay-confirm"
          >
            {busy ? 'Cobrando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
